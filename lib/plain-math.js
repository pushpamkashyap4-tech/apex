const unicodeSubscript = Object.freeze({
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ",
  l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ",
  s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ"
});
const unicodeSuperscript = Object.freeze({
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ",
  g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ",
  m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ",
  t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ"
});
const symbols = Object.freeze({
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", sigma: "σ",
  tau: "τ", upsilon: "υ", phi: "φ", varphi: "ϕ", chi: "χ",
  psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ",
  Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ",
  Psi: "Ψ", Omega: "Ω", times: "×", cdot: "·", div: "÷",
  pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥",
  neq: "≠", approx: "≈", equiv: "≡", propto: "∝", infty: "∞",
  partial: "∂", nabla: "∇", sum: "Σ", prod: "Π", int: "∫",
  oint: "∮", sqrt: "√", degree: "°", prime: "′", ast: "∗",
  rightarrow: "→", Rightarrow: "⇒",
  leftarrow: "←", Leftarrow: "⇐", leftrightarrow: "↔",
  Leftrightarrow: "⇔", to: "→", mapsto: "↦", in: "∈",
  notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃",
  supseteq: "⊇", cup: "∪", cap: "∩", forall: "∀",
  exists: "∃", therefore: "∴", because: "∵", angle: "∠",
  perpendicular: "⊥", parallel: "∥", ell: "ℓ", Re: "ℜ",
  Im: "ℑ", sin: "sin", cos: "cos", tan: "tan", cot: "cot",
  sec: "sec", csc: "csc", arcsin: "arcsin", arccos: "arccos",
  arctan: "arctan", log: "log", ln: "ln", exp: "exp",
  lim: "lim", max: "max", min: "min", det: "det", mod: "mod"
});

function readGroup(source, start) {
  if (source[start] !== "{") return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{" && source[index - 1] !== "\\") depth += 1;
    if (source[index] === "}" && source[index - 1] !== "\\" && --depth === 0) {
      return { value: source.slice(start + 1, index), end: index + 1 };
    }
  }
  return null;
}

function scriptText(value, map, fallback) {
  const characters = [...value];
  if (characters.length && characters.every((character) => map[character])) {
    return characters.map((character) => map[character]).join("");
  }
  return fallback + "(" + value + ")";
}

function removeLatex(source) {
  const text = String(source || "");
  let result = "";
  for (let index = 0; index < text.length;) {
    if (text[index] === "$") {
      const displayMath = text[index + 1] === "$";
      const delimiter = displayMath ? "$$" : "$";
      const closing = text.indexOf(delimiter, index + delimiter.length);
      const sameLine = displayMath || closing < 0 || !text.slice(index, closing).includes("\n");
      if (closing >= 0 && sameLine) {
        index += delimiter.length;
      } else {
        const tail = text.slice(index + delimiter.length).split("\n", 1)[0];
        if (!displayMath && /^\s*\d/.test(tail)) result += "$";
        index += delimiter.length;
      }
      continue;
    }
    if (text[index] === "\\" && text[index + 1] === "\\") {
      result += "\n";
      index += 2;
      continue;
    }
    if (text[index] === "\\") {
      const commandMatch = text.slice(index + 1).match(/^[A-Za-z]+|^./);
      if (!commandMatch) {
        index += 1;
        continue;
      }
      const command = commandMatch[0];
      let cursor = index + 1 + command.length;
      while (/\s/.test(text[cursor] || "") && text[cursor] !== "\n") cursor += 1;
      if (["frac", "dfrac", "tfrac", "cfrac"].includes(command)) {
        const numerator = readGroup(text, cursor);
        const denominator = numerator && readGroup(text, numerator.end);
        if (numerator && denominator) {
          result += `(${removeLatex(numerator.value)}) / (${removeLatex(denominator.value)})`;
          index = denominator.end;
          continue;
        }
      }
      if (command === "sqrt") {
        let degree = "";
        if (text[cursor] === "[") {
          const close = text.indexOf("]", cursor + 1);
          if (close >= 0) {
            degree = text.slice(cursor + 1, close);
            cursor = close + 1;
          }
        }
        const radicand = readGroup(text, cursor);
        if (radicand) {
          result += degree ? `${degree}th root of (${removeLatex(radicand.value)})` : `√(${removeLatex(radicand.value)})`;
          index = radicand.end;
          continue;
        }
      }
      if (["text", "textrm", "textnormal", "mbox", "mathrm", "mathit", "mathbf", "boldsymbol", "operatorname", "boxed", "overline", "underline", "vec", "hat", "bar"].includes(command)) {
        const group = readGroup(text, cursor);
        if (group) {
          result += removeLatex(group.value);
          index = group.end;
          continue;
        }
      }
      if (["begin", "end"].includes(command)) {
        const environment = readGroup(text, cursor);
        index = environment?.end || cursor;
        continue;
      }
      if (["left", "right", "displaystyle", "textstyle", "scriptstyle", "limits", "nolimits"].includes(command)) {
        index = cursor;
        continue;
      }
      if ([",", ";", ":", "!", " ", "quad", "qquad", "thinspace", "enspace"].includes(command)) {
        result += " ";
        index = cursor;
        continue;
      }
      result += symbols[command] ?? "";
      index += 1 + command.length;
      continue;
    }
    if (text[index] === "^" || text[index] === "_") {
      const isSuperscript = text[index] === "^";
      const group = text[index + 1] === "{" ? readGroup(text, index + 1) : null;
      let value = "";
      if (group) {
        value = group.value;
        index = group.end;
      } else {
        const match = text.slice(index + 1).match(/^[A-Za-z0-9+-]+/);
        if (match) {
          value = match[0];
          index += 1 + value.length;
        } else {
          result += text[index];
          index += 1;
          continue;
        }
      }
      result += scriptText(removeLatex(value), isSuperscript ? unicodeSuperscript : unicodeSubscript, isSuperscript ? "^" : "_");
      continue;
    }
    if (text[index] === "{") {
      const group = readGroup(text, index);
      if (group) {
        result += removeLatex(group.value);
        index = group.end;
        continue;
      }
    }
    if (text[index] === "&") {
      index += 1;
      continue;
    }
    result += text[index];
    index += 1;
  }
  return result.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function plainMathText(value) {
  const links = [];
  const codeBlocks = [];
  const protectedCode = String(value || "").replace(/```([^\n]*)\n([\s\S]*?)```/g, (match, language, body) => {
    const code = /^(?:plot|svg|xml)\b/i.test(String(language || "").trim()) ? `\`\`\`${language}\n${removeLatex(body)}\`\`\`` : match;
    const token = `PLAINMATHCODE${codeBlocks.length}TOKEN`;
    codeBlocks.push(code);
    return token;
  }).replace(/`[^`\n]+`/g, (match) => {
    const token = `PLAINMATHCODE${codeBlocks.length}TOKEN`;
    codeBlocks.push(match);
    return token;
  });
  const protectedLinks = protectedCode.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (match) => {
    const token = `PLAINMATHLINK${links.length}TOKEN`;
    links.push(match);
    return token;
  });
  return removeLatex(protectedLinks)
    .replace(/\\[()[\]]/g, "")
    .replace(/\$\$/g, "")
    .replace(/PLAINMATHLINK(\d+)TOKEN/g, (_, index) => links[Number(index)] || "")
    .replace(/PLAINMATHCODE(\d+)TOKEN/g, (_, index) => codeBlocks[Number(index)] || "")
    .trim();
}
