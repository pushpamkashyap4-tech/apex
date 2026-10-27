#!/usr/bin/env python3
"""Normalize legacy math and chemistry radical notation in recall databases.

Run with --write to update the eight production master JSON files. Without
--write, reports what would change and leaves the database untouched.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATABASES = {
    "Physics": [ROOT / "public" / "data" / "physics-11.json", ROOT / "public" / "data" / "physics-12.json"],
    "Chemistry": [ROOT / "public" / "data" / "chemistry-11.json", ROOT / "public" / "data" / "chemistry-12.json"],
    "Mathematics": [ROOT / "public" / "data" / "maths-11.json", ROOT / "public" / "data" / "maths-12.json"],
    "Biology": [ROOT / "public" / "data" / "biology-11.json", ROOT / "public" / "data" / "biology-12.json"],
}

# A single math operand: a number/variable (with optional subscript or
# superscript), a LaTeX command, or a parenthesized/braced expression.
# Permit adjacent TeX command products (e.g. 4\pi\epsilon_0) without a
# repeated ambiguous group, which can backtrack badly on long explanations.
OPERAND = r"(?:√(?:\([^()]*\)|\[[^\[\]]*\]|[A-Za-zΑ-Ωα-ω0-9₀-₉]+)|\\[A-Za-z]+(?:\{[^{}]*\}|_[A-Za-z0-9]+)?|[A-Za-zΑ-Ωα-ω0-9₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+(?:_[A-Za-z0-9{}]+|\^[A-Za-z0-9{}]+)?(?:\([^()]{1,30}\))?)(?:\\[A-Za-z]+(?:\{[^{}]*\}|_[A-Za-z0-9]+)?)*|\([^()]{1,100}\)|\[[^\[\]]{1,100}\](?:[₀-₉]+)?[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]*|\{[^{}]{1,100}\}|\|[^|]{1,100}\|"
FRACTION = re.compile(rf"(?<![A-Za-z0-9_^}}/\\])({OPERAND})\s*/\s*({OPERAND})(?![A-Za-z0-9_(])")
MATH_SEGMENTS = re.compile(r"(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])")
INLINE_MATH = re.compile(r"(?<!\\)\$(?!\$)(.+?)(?<!\\)\$(?!\$)", re.S)
PAREN_MATH = re.compile(r"\\\((.+?)\\\)|\\\[(.+?)\\\]", re.S)

# Long prose inside math delimiters is not a formula. Keep it readable as
# ordinary text; already-correct \text{...} spans are left alone.
PROSE_WORDS = re.compile(r"[A-Za-z]{3,}(?:\s+[A-Za-z]{3,}){2,}")
MATH_MARKERS = re.compile(r"\\[A-Za-z]+|[=<>+*^_{}]|\\(?:leq|geq|implies|times|cdot)")
SUBSCRIPT = re.compile(r"(?<!\\)_([A-Za-z][A-Za-z0-9]+)")
FUNCTION_OPERATOR = re.compile(r"(?<!\\)\b(ln|log|sin|cos|tan)(?![A-Za-z])(?=\s*(?:\(|\{|_|\^|[A-Za-zΑ-Ωα-ω0-9]))")
TEXT_COMMAND = re.compile(r"(\\text\{[^{}]*\})")
BARE_FUNCTION = re.compile(r"\\(?:ln|log|sin|cos|tan)(?:\s*(?:\([^()]*\)|\{[^{}]*\}|[A-Za-zΑ-Ωα-ω0-9₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+(?:_\{[^{}]*\}|_[A-Za-z0-9]+)?))")
UNICODE_SUBSCRIPT = re.compile(r"[₀-₉]+")
UNICODE_SUPERSCRIPT = re.compile(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+")
FRACTIONAL_POWER = re.compile(r"\^\{([^{}]+?)\s*/\s*([^{}]+)\}")
FRACTION_ARGUMENT_SLASH = re.compile(r"(\\(?:d?frac)\{[^{}]*\}\{)([^{}]*?)\s*/\s*([^{}]*?)(\})")
DECIMAL_FRACTION_BOTH = re.compile(r"(?<![A-Za-z0-9.])(\d+)\.\$\\frac\{(\d+)\}\{(\d+)\}\$\.(\d+)")
DECIMAL_FRACTION_LEFT = re.compile(r"(?<![A-Za-z0-9.])(\d+)\.\$\\frac\{([^{}]+)\}\{([^{}]+)\}\$")
DECIMAL_FRACTION_RIGHT = re.compile(r"\$\\frac\{([^{}]+)\}\{(\d+)\}\$\.(\d+)")
DERIVATIVE_FRACTION_POWER = re.compile(r"d([²³])\$\\frac\{([^{}]+)\}\{d([A-Za-z]+)\}\$([²³])")
EXTERNAL_FRACTION_POWER = re.compile(r"\$\\frac\{([^{}]+)\}\{([^{}]+)\}\$([²³⁴⁵])")


def repair_split_decimals(text: str) -> tuple[str, int]:
    count = 0

    def both(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return rf"$\frac{{{match.group(1)}.{match.group(2)}}}{{{match.group(3)}.{match.group(4)}}}$"

    def left(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return rf"$\frac{{{match.group(1)}.{match.group(2)}}}{{{match.group(3)}}}$"

    def right(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return rf"$\frac{{{match.group(1)}}}{{{match.group(2)}.{match.group(3)}}}$"

    text = DECIMAL_FRACTION_BOTH.sub(both, text)
    text = DECIMAL_FRACTION_LEFT.sub(left, text)
    text = DECIMAL_FRACTION_RIGHT.sub(right, text)
    return text, count


def repair_fraction_powers(text: str) -> tuple[str, int]:
    """Move powers stranded outside a fraction back to its denominator.

    The prior slash conversion left expressions such as ``GM/R$²`` as
    ``$\\frac{GM}{R}$²``. These are inverse-power forms, including common
    units (m/s², g/cm³), so the exponent belongs on the denominator.
    """
    count = 0

    def derivative(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return rf"$\frac{{d{match.group(1)}{match.group(2)}}}{{d{match.group(3)}{match.group(4)}}}$"

    def fraction(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return rf"$\frac{{{match.group(1)}}}{{{match.group(2)}{match.group(3)}}}$"

    text = DERIVATIVE_FRACTION_POWER.sub(derivative, text)
    text = EXTERNAL_FRACTION_POWER.sub(fraction, text)
    return text, count


def repair_broken_fraction_artifacts(text: str) -> tuple[str, int]:
    """Restore common balanced-group damage from legacy slash conversion."""
    fixes = 0
    replacements = (
        (re.compile(r"\\frac\{([^{}]+)\}\{\\sqrt\}\{([^{}]+)\}"), r"\\frac{\1}{\\sqrt{\2}}"),
        (re.compile(r"\\frac\{([^{}]+)\}\{\\bar\}\{([^{}]+)\}"), r"\\frac{\1}{\\bar{\2}}"),
        (re.compile(r"\\frac\{([A-Za-z0-9])\^\{([^{}]+)\}\{([^{}]+)\}\}"), r"\1^{\2/\3}"),
        (re.compile(r"\\frac\{e\^\{i\\pi\}\{(\d+)\}"), r"e^{\\frac{i\\pi}{\1}}"),
        (re.compile(r"\\frac\{e\^\{x\}\{a\}"), r"e^{\\frac{x}{a}}"),
        (re.compile(r"\\frac\{n\^\{2\}\{3\}V"), r"n^{2/3}V"),
        (re.compile(r"\\text\{\s*\\frac\{m\}\{min\}\}"), r"\\text{m/min}"),
        (re.compile(r"_\{([^{}]+)\}_\{([0-9]+)\}"), r"_{\1\2}"),
        (re.compile(r"_([A-Za-z]+)_\{([0-9]+)\}"), r"_{\1\2}"),
        (re.compile(r"\}\{\\sqrt\}\{([^{}]+)\}"), r"}{\\sqrt{\1}}"),
    )
    for pattern, replacement in replacements:
        text, n = pattern.subn(replacement, text)
        fixes += n

    malformed_derivative = r"\frac{\frac{d^2y}{dt^2}{d}^2x/dt^2}"
    corrected_derivative = r"\frac{\frac{d^2y}{dt^2}}{\frac{d^2x}{dt^2}}"
    n = text.count(malformed_derivative)
    if n:
        text = text.replace(malformed_derivative, corrected_derivative)
        fixes += n

    polymer_original = (
        r"\frac{Σ(NiMi$^{\bullet}$)}{ΣNi}",
        r"\frac{Σ(NiMi^{2}$^{\bullet}$)}{Σ(NiMi$^{\bullet}$)}",
    )
    polymer_fixed = (
        r"\frac{\sum_i N_i M_i}{\sum_i N_i}",
        r"\frac{\sum_i N_i M_i^2}{\sum_i N_i M_i}",
    )
    for old, new in zip(polymer_original, polymer_fixed):
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            fixes += n

    # Half-life symbols are subscripts (t_{1/2}, t_{3/4}), not quotients.
    for digits in (("₁", "₂", "1", "2"), ("₃", "₄", "3", "4")):
        old = rf"\frac{{t{digits[0]}}}{{{digits[1]}}}"
        new = rf"t_{{{digits[2]}/{digits[3]}}}"
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            fixes += n
        # Earlier cleanup passes had already split those indices into braces.
        broken = rf"\frac{{t_{{{digits[2]}}}{{{digits[3]}}}}}"
        n = text.count(broken)
        if n:
            text = text.replace(broken, new)
            fixes += n
        broken_fraction = rf"\frac{{t_{{{digits[2]}}}}}{{{digits[3]}}}"
        n = text.count(broken_fraction)
        if n:
            text = text.replace(broken_fraction, new)
            fixes += n

    # Legacy first-order kinetics split the initial-concentration subscript
    # away from its leading [A] when converting [A]₀ / denominator.
    pattern = re.compile(r"\[A\]\$\\frac\{_?\{?0\}?\}\{([^{}]+)\}\$")
    text, n = pattern.subn(lambda m: rf"$\frac{{[A]_0}}{{{m.group(1)}}}$", text)
    fixes += n
    return text, fixes


def repair_trig_quotients(text: str) -> tuple[str, int]:
    """Repair trig ratios damaged when a slash parser split at the angle."""
    fixes = {
        r"g(sin $\frac{θ}{cos}$ θ)": r"g($\tan θ$)",
        r"tan $\frac{θ}{cos}$ α": r"$\frac{\tan θ}{\cos α}$",
        r"sin $\frac{θ}{(1.22λ)}$": r"$\frac{\sin θ}{1.22λ}$",
        r"sin $\frac{θ_p}{sin}$ r": r"$\frac{\sin θ_p}{\sin r}$",
        r"sin $\frac{θ_p}{cos}$ θ_p": r"$\frac{\sin θ_p}{\cos θ_p}$",
    }
    count = 0
    for old, new in fixes.items():
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            count += n
    redundant = r"a = g($\tan θ$) = g $\tan θ$"
    n = text.count(redundant)
    if n:
        text = text.replace(redundant, r"a = g $\tan θ$")
        count += n
    return text, count


def normalize_math_notation(text: str) -> tuple[str, int, int]:
    subscripts = operators = fraction_structure = 0

    def transform(segment: str, in_math: bool) -> str:
        nonlocal subscripts, operators, fraction_structure

        def subscript(match: re.Match[str]) -> str:
            nonlocal subscripts
            subscripts += 1
            return "_{" + match.group(1) + "}"

        # Restrict bare prose to equation-like strings. Explicitly delimited
        # math always receives the notation fixes.
        if in_math:
            def fractional_power(match: re.Match[str]) -> str:
                nonlocal fraction_structure
                fraction_structure += 1
                return rf"^{{\frac{{{match.group(1)}}}{{{match.group(2)}}}}}"

            def fraction_argument(match: re.Match[str]) -> str:
                nonlocal fraction_structure
                fraction_structure += 1
                return match.group(1) + rf"\frac{{{match.group(2)}}}{{{match.group(3)}}}" + match.group(4)

            segment = FRACTIONAL_POWER.sub(fractional_power, segment)
            segment = FRACTION_ARGUMENT_SLASH.sub(fraction_argument, segment)
            # Preserve Unicode digits inside an explicit TeX subscript group;
            # only ungrouped Unicode digits need a new underscore.
            segment = re.sub(r"(_\{[^{}]*\})", lambda m: m.group(0).translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")), segment)
            segment = re.sub(r"\\frac\{t([₀-₉]+)\}\{([₀-₉]+)\}", lambda m: "t_{" + m.group(1).translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")) + "/" + m.group(2).translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")) + "}", segment)
            segment = UNICODE_SUBSCRIPT.sub(lambda m: "_{" + m.group(0).translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")) + "}", segment)
            segment = UNICODE_SUPERSCRIPT.sub(lambda m: "^{" + m.group(0).translate(str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻", "0123456789+-")) + "}", segment)
            segment = SUBSCRIPT.sub(subscript, segment)
            pattern = FUNCTION_OPERATOR
        else:
            if not MATH_MARKERS.search(segment) and not re.search(r"(?:sin|cos|tan|log|ln)\s*(?:\(|\s+[A-Za-zΑ-Ωα-ω0-9])", segment):
                return segment
            segment = SUBSCRIPT.sub(subscript, segment)
            pattern = FUNCTION_OPERATOR

        def operator(match: re.Match[str]) -> str:
            nonlocal operators
            operators += 1
            return "\\" + match.group(1)

        # Preserve prose explicitly placed inside KaTeX \text{...}.
        chunks = TEXT_COMMAND.split(segment)
        for index in range(0, len(chunks), 2):
            chunks[index] = pattern.sub(operator, chunks[index])
            if not in_math:
                chunks[index] = BARE_FUNCTION.sub(lambda match: "$" + match.group(0) + "$", chunks[index])
        return "".join(chunks)

    parts = MATH_SEGMENTS.split(text)
    normalized = []
    for part in parts:
        if not part:
            continue
        is_math = bool(MATH_SEGMENTS.fullmatch(part))
        if is_math:
            delimiter = part[:2] if part.startswith("$$") else part[:2] if part.startswith(r"\(") or part.startswith(r"\[") else part[:1]
            closing = part[-2:] if delimiter in ("$$", r"\(", r"\[") else part[-1:]
            body = part[len(delimiter):len(part) - len(closing)]
            normalized.append(delimiter + transform(body, True) + closing)
        else:
            normalized.append(transform(part, False))
    return "".join(normalized), subscripts, operators, fraction_structure


def normalize_fraction_slashes(text: str) -> tuple[str, int]:
    count = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal count
        numerator, denominator = match.group(1).strip(), match.group(2).strip()
        # Leave lexical fractions, common units, and URLs alone.
        if numerator.isalpha() and denominator.isalpha():
            lexical_pair = {numerator.casefold(), denominator.casefold()}
            if len(numerator) > 1 and len(denominator) > 1 or lexical_pair in (
                {"a", "an"}, {"he", "she"}, {"him", "her"}, {"his", "her"},
                {"s", "he"}, {"yes", "no"}, {"true", "false"}, {"and", "or"},
                {"light", "dark"}, {"male", "female"}, {"input", "output"},
                {"pass", "fail"}, {"increase", "decrease"}, {"before", "after"},
            ):
                return match.group(0)
        if (numerator, denominator) in {("m", "s"), ("km", "h"), ("cm", "s"), ("kg", "m")}:
            return match.group(0)

        def normalize_root(operand: str) -> str:
            if not operand.startswith("√"):
                return operand
            radicand = operand[1:].strip()
            if len(radicand) >= 2 and radicand[0] in "([" and radicand[-1] in ")]":
                radicand = radicand[1:-1]
            return rf"\sqrt{{{radicand}}}"

        numerator, denominator = normalize_root(numerator), normalize_root(denominator)
        count += 1
        fraction = rf"\frac{{{numerator}}}{{{denominator}}}"
        return fraction if in_math else f"${fraction}$"

    # Leave existing math delimiters in place and wrap newly created KaTeX
    # fractions in bare prose/equations so KaTeX actually typesets them.
    pieces = MATH_SEGMENTS.split(text)
    output = []
    for piece in pieces:
        if not piece:
            continue
        in_math = bool(MATH_SEGMENTS.fullmatch(piece))
        # A slash inside a TeX group is part of an exponent or subscript in
        # many valid expressions (notably t_{1/2}); leave those groups intact.
        protected = []
        masked = []
        depth = 0
        for char in piece:
            if char == "{":
                depth += 1
            elif char == "}" and depth:
                depth -= 1
            if char == "/" and depth:
                marker = f"\uE100{len(protected)}\uE101"
                protected.append(marker)
                masked.append(marker)
            else:
                masked.append(char)
        converted = FRACTION.sub(replace, "".join(masked))
        for index, marker in enumerate(protected):
            converted = converted.replace(marker, "/")
        output.append(converted)
    return "".join(output), count


def normalize_prose_math(text: str) -> tuple[str, int]:
    count = 0

    def replace_span(match: re.Match[str]) -> str:
        nonlocal count
        source = match.group(0)
        payload = match.group(1) if match.group(1) is not None else match.group(2)
        if "\\text{" in payload or not PROSE_WORDS.search(payload) or MATH_MARKERS.search(payload):
            return source
        count += 1
        return payload

    return PAREN_MATH.sub(replace_span, INLINE_MATH.sub(replace_span, text)), count


def normalize_radicals(text: str) -> tuple[str, int]:
    count = 0

    # Radical dot written after its chemical species: Cl•, NO₃•, (OO•).
    # Avoid converting the polymer-average multiplication notation Ni•Mi.
    def postfix(match: re.Match[str]) -> str:
        nonlocal count
        species = match.group(1)
        tail = text[match.end():match.end() + 2]
        if text[match.start() - 1:match.start()] == "•" or tail.startswith("•"):
            return match.group(0)
        if species.endswith("Ni") and tail.startswith("M"):
            return match.group(0)
        count += 1
        return species + r"$^{\bullet}$"

    text = re.sub(r"([A-Za-z][A-Za-z0-9₀-₉]*)\s*•(?!•)", postfix, text)

    # Radical dots occasionally precede a species. Move them to superscript
    # position after its element-symbol sequence: •CF₂Cl -> CF₂Cl^{bullet}.
    def prefix(match: re.Match[str]) -> str:
        nonlocal count
        if match.start() > 0 and text[match.start() - 1] == "•":
            return match.group(0)
        species = match.group(1)
        count += 1
        return species + r"$^{\bullet}$"

    text = re.sub(r"•([A-Z][a-z]?(?:[₀-₉0-9]*[A-Z][a-z]?)?[₀-₉0-₉0-9]*)", prefix, text)
    return text, count


def visit(value, subject: str, counts: dict[str, int]):
    if isinstance(value, str):
        # Some older fields store TeX commands double escaped. Reduce only
        # repeated slashes immediately before a command name; preserve \\
        # for display-math row breaks.
        value, escape_count = re.subn(r"\\{2,}(?=[A-Za-z])", lambda match: "\\", value)
        counts["legacy_repairs"] += escape_count
        value, malformed_count = repair_broken_fraction_artifacts(value)
        counts["legacy_repairs"] += malformed_count
        value, artifact_count = repair_split_decimals(value)
        counts["decimal_artifacts"] += artifact_count
        value, power_count = repair_fraction_powers(value)
        counts["fraction_powers"] += power_count
        value, trig_count = repair_trig_quotients(value)
        counts["trig_quotients"] += trig_count
        value, subscript_count, operator_count, structure_count = normalize_math_notation(value)
        counts["subscripts"] += subscript_count
        counts["operators"] += operator_count
        counts["fraction_structure"] += structure_count
        value, n = normalize_fraction_slashes(value)
        counts["fractions"] += n
        value, n = normalize_prose_math(value)
        counts["prose_math"] += n
        if subject == "Chemistry":
            value, n = normalize_radicals(value)
            counts["radicals"] += n
        return value
    if isinstance(value, list):
        return [visit(item, subject, counts) for item in value]
    if isinstance(value, dict):
        return {key: visit(item, subject, counts) for key, item in value.items()}
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write normalized JSON back to the database files")
    args = parser.parse_args()

    totals = {"fractions": 0, "prose_math": 0, "radicals": 0, "subscripts": 0, "operators": 0, "decimal_artifacts": 0, "fraction_powers": 0, "fraction_structure": 0, "trig_quotients": 0, "legacy_repairs": 0}
    for subject, paths in DATABASES.items():
        for path in paths:
            data = json.loads(path.read_text(encoding="utf-8"))
            counts = {"fractions": 0, "prose_math": 0, "radicals": 0, "subscripts": 0, "operators": 0, "decimal_artifacts": 0, "fraction_powers": 0, "fraction_structure": 0, "trig_quotients": 0, "legacy_repairs": 0}
            normalized = visit(data, subject, counts)
            for key, value in counts.items():
                totals[key] += value
            if args.write and any(counts.values()):
                path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{path.name} ({subject}): {counts['subscripts']} subscripts, {counts['operators']} operators, {counts['fractions']} fractions, {counts['fraction_powers']} fraction powers, {counts['fraction_structure']} nested fractions, {counts['trig_quotients']} trig repairs, {counts['legacy_repairs']} legacy repairs, {counts['decimal_artifacts']} decimal repairs, {counts['radicals']} radical dots, {counts['prose_math']} prose spans")
    action = "Updated" if args.write else "Would update"
    print(f"{action}: {totals['subscripts']} subscripts, {totals['operators']} operators, {totals['fractions']} fractions, {totals['fraction_powers']} fraction powers, {totals['fraction_structure']} nested fractions, {totals['trig_quotients']} trig repairs, {totals['legacy_repairs']} legacy repairs, {totals['decimal_artifacts']} decimal repairs, {totals['radicals']} radical dots, {totals['prose_math']} prose spans")


if __name__ == "__main__":
    main()
