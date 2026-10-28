function repairAssistantDollarMarkers(value) {
  const tick = String.fromCharCode(96);
  const fencePattern = new RegExp(`(${tick}{3}[\\s\\S]*?${tick}{3}|~~~[\\s\\S]*?~~~)`, "g");
  const repairText = (source) => {
    const tokens = [];
    const displayPattern = /(?<!\\)\$\$+/g;
    let match;
    while ((match = displayPattern.exec(source))) tokens.push({ start: match.index, end: match.index + match[0].length });
    const edits = [];
    for (let index = 0; index + 1 < tokens.length; index += 2) {
      const left = tokens[index];
      const right = tokens[index + 1];
      const inside = source.slice(left.end, right.start);
      const proseProbe = inside
        .replace(/\\text\s*\{[^{}]*\}/gi, " ")
        .replace(/\\[A-Za-z]+\*?/g, " ")
        .replace(/[{}\[\]^_=<>|$]/g, " ");
      const proseWords = proseProbe.match(/\b[A-Za-z]{3,}\b/g) || [];
      const hasEquationSyntax = /\\(?:begin|frac|d?frac|tfrac|sqrt|sum|prod|int|lim|sin|cos|tan|log|ln|theta|alpha|pi|infty)\b|[=<>^_]/i.test(inside);
      const containsMarkdown = /(?:^|\n)\s*(?:#{1,6}\s|\|)|\*\*/.test(inside);
      // Some replies put display dollars around an entire paragraph. They are
      // not valid nested math delimiters; remove just that outer pair so its
      // proper inline formulas and Markdown remain parseable.
      if (containsMarkdown || proseWords.length > 8 || (proseWords.length > 4 && !hasEquationSyntax)) {
        edits.push({ start: left.start, end: left.end }, { start: right.start, end: right.end });
      }
    }
    if (tokens.length % 2) {
      const dangling = tokens[tokens.length - 1];
      // An unmatched $$ in prose breaks every following inline expression.
      // Treat it as a stray delimiter and leave the equation wrapper pass to
      // recover any actual unmarked math on that line.
      if (!/^\s*\$+\s*$/.test(source)) edits.push({ start: dangling.start, end: dangling.end });
    }
    for (const edit of edits.reverse()) source = `${source.slice(0, edit.start)}${source.slice(edit.end)}`;
    return source;
  };
  return String(value || "").split(fencePattern).map((part) => /^(```|~~~)/.test(part) ? part : repairText(part)).join("");
}

function demoteInlineDisplayMath(value) {
  const tick = String.fromCharCode(96);
  const fencePattern = new RegExp(`(${tick}{3}[\\s\\S]*?(?:${tick}{3}|$)|~~~[\\s\\S]*?(?:~~~|$))`, "g");
  return String(value || "").split(fencePattern).map((part) => {
    if (/^(?:```|~~~)/.test(part)) return part;
    return part.replace(/\$\$([^$\n]{1,180})\$\$/g, (whole, formula, offset, source) => {
      const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
      const lineEnd = source.indexOf("\n", offset + whole.length);
      const before = source.slice(lineStart, offset).trim();
      const after = source.slice(offset + whole.length, lineEnd < 0 ? source.length : lineEnd).trim();
      const expression = formula.trim();
      const isEnvironment = /\\+(?:begin\s*\{|(?:displaystyle|textstyle)\b)/.test(expression);
      if ((!before && !after) || !expression || isEnvironment) return whole;
      return `$${expression}$`;
    });
  }).join("");
}

function repairCollapsedAssistantMarkdown(value) {
  const tick = String.fromCharCode(96);
  const fencePattern = new RegExp(`(${tick}{3}[\\s\\S]*?(?:${tick}{3}|$)|~~~[\\s\\S]*?(?:~~~|$))`, "g");
  const mathPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;
  return String(value || "").split(fencePattern).map((part) => {
    if (/^(?:```|~~~)/.test(part)) return part;
    return part.split(mathPattern).map((segment, index) => {
      if (index % 2) return segment;
      return segment
        .replace(/[ \t]+---[ \t]+(?=#{1,6}[ \t]+\S)/g, "\n\n---\n\n")
        .replace(/[ \t]+(?=\d{1,2}\.[ \t]+(?:\*\*|[A-Z]))/g, "\n\n")
        .replace(/[ \t]+(?<!\*)\*[ \t]+(?=[A-Z])/g, "\n- ")
        .split("\n").map((line) => {
          // Numbered explanations often keep the heading and unwrapped
          // equation on one line. Preserve the prefix and promote only the
          // TeX equation suffix below; ordinary headings and table rows stay
          // untouched.
          if (line.includes("|") || /^\s*#{1,6}\s/.test(line)) return line;
          const equation = /[A-Za-z](?:_\{[^{}\n]+\}|_[A-Za-z0-9]+|\^\{[^{}\n]+\}|\^[A-Za-z0-9]+)?(?:\([^()\n]{1,16}\))?\s*=\s*(?=\\|[A-Za-z0-9])/.exec(line);
          if (!equation) return line;
          const formulaStart = equation.index;
          const formula = line.slice(formulaStart).trim();
          if (!formula || !/[\\{}_^]/.test(formula)) return line;
          const prefix = line.slice(0, formulaStart).trimEnd();
          return `${prefix ? `${prefix}\n\n` : ""}$$\n${formula}\n$$`;
        }).join("\n");
    }).join("");
  }).join("");
}

function stripNestedMathDollars(value) {
  // Preserve a token boundary when an inner dollar sits between a TeX
  // command and its argument (for example, `\\Delta$G`).
  return String(value || "")
    .replace(/(?<!\\)\$(?=[A-Za-z0-9])/g, " ")
    .replace(/(?<!\\)\$/g, "");
}

function splitCollapsedMarkdownTables(value) {
  let inFence = false;
  return String(value || "").split("\n").map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence || (line.match(/\|/g) || []).length < 5 || !/\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?/.test(line)) return line;
    let heading = "";
    let body = line;
    const headingMatch = line.match(/^(\s*#{1,6}\s+[^|]+?)\s*(?=\|)/);
    if (headingMatch) {
      heading = headingMatch[1].trimEnd();
      body = line.slice(headingMatch[0].length);
    }
    // In a collapsed GFM table, the end pipe of one row and the start pipe
    // of the next appear as `| |` (or `||`). Split only lines that contain a
    // genuine Markdown separator row, so ordinary prose and code stay intact.
    body = body.replace(/\|[ \t]*\|/g, "|\n|");
    return heading ? `${heading}\n\n${body}` : body;
  }).join("\n");
}

export function protectGfmTableBlocks(value) {
  const lines = String(value || "").split("\n");
  const tables = [];
  const output = [];
  const isTableLine = (line) => /(?<!\\)\|/.test(line);
  const isSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  let inFence = false;
  for (let index = 0; index < lines.length;) {
    if (/^\s*(?:```|~~~)/.test(lines[index])) {
      inFence = !inFence;
      output.push(lines[index++]);
      continue;
    }
    if (!inFence && isTableLine(lines[index]) && isSeparator(lines[index + 1] || "")) {
      const rows = [lines[index++], lines[index++]];
      while (index < lines.length && lines[index].trim() && isTableLine(lines[index])) rows.push(lines[index++]);
      const token = `\uE300TABLE${tables.length}\uE301`;
      tables.push({ token, value: rows.join("\n") });
      output.push(token);
      continue;
    }
    output.push(lines[index++]);
  }
  return {
    source: output.join("\n"),
    restore(source) {
      return tables.reduce((restored, table) => restored.replaceAll(table.token, table.value), String(source || ""));
    }
  };
}

function protectMarkdownTables(source, protectedChunks) {
  const lines = String(source || "").split("\n");
  const output = [];
  const isSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  for (let index = 0; index < lines.length;) {
    if (!/^\s*\|/.test(lines[index]) || index + 1 >= lines.length || !isSeparator(lines[index + 1])) {
      output.push(lines[index++]);
      continue;
    }
    const rows = [lines[index].trim(), lines[index + 1].trim()];
    index += 2;
    while (index < lines.length) {
      const current = lines[index];
      if (/^\s*\|/.test(current)) {
        rows.push(current.trim());
        index += 1;
        continue;
      }
      const lastRow = rows[rows.length - 1];
      const unmatchedDisplay = ((lastRow.match(/(?<!\\)\$\$/g) || []).length % 2) === 1;
      if (unmatchedDisplay && current.trim()) {
        rows[rows.length - 1] += ` ${current.trim()}`;
        index += 1;
        continue;
      }
      if (!current.trim() && /^\s*\|/.test(lines[index + 1] || "")) {
        index += 1;
        continue;
      }
      break;
    }
    const table = rows.map((row) => row.split(/(\|)/).map((cell) => {
      const normalizedCell = cell
        // Table cells are protected from the document-wide TeX cleanup, so
        // normalize JSON-escaped commands here before Markdown sees them.
        .replace(/\\{2,}(?=[A-Za-z])/g, "\\")
        .replace(/\\displaystyle\b/g, "")
        .replace(/\$\$+/g, "$");
      const trimmed = normalizedCell.trim();
      const proseWords = trimmed.replace(/\\[A-Za-z]+\*?/g, " ").replace(/[{}_^=()[\],]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
      if (trimmed && /\\[A-Za-z]+/.test(trimmed) && /[{}_^=]/.test(trimmed) && proseWords.length <= 3) {
        const math = trimmed.replace(/(?<!\\)\$/g, "").replace(/\\textstyle\s*/g, "").replace(/\\quad\s*\($/, "\\quad");
        const leading = normalizedCell.match(/^\s*/)?.[0] || "";
        const trailing = normalizedCell.match(/\s*$/)?.[0] || "";
        return `${leading}$${math}$${trailing}`;
      }
      return normalizedCell;
    }).join("")
      .replace(/\$\$([\s\S]*?)\$\$/g, (_whole, formula) => `$\\displaystyle ${stripNestedMathDollars(formula).replace(/\s+/g, " ").trim()}$`)
      .replace(/\\\[([\s\S]*?)\\\]/g, (_whole, formula) => `$\\displaystyle ${stripNestedMathDollars(formula).replace(/\s+/g, " ").trim()}$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_whole, formula) => `$${stripNestedMathDollars(formula).replace(/\s+/g, " ").trim()}$`)
      .replace(/(?<!\\)\$([^$\n]+)\$(?!\$)/g, (whole, formula) => /\\(?:sum|prod|int|frac|dfrac|tfrac)\b/.test(formula) && !/\\displaystyle\b/.test(formula) ? `$\\displaystyle ${formula.trim()}$` : whole)
    ).join("\n");
    const token = `\uE000T${protectedChunks.length}\uE001`;
    protectedChunks.push({ token, value: table });
    if (output.length && output[output.length - 1] !== "") output.push("");
    output.push(token);
    if (lines[index]?.trim()) output.push("");
  }
  return output.join("\n");
}

function repairUnpairedInlineDollars(source) {
  let inFence = false;
  return String(source || "").split("\n").map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    const singles = [...line.matchAll(/(?<!\\)(?<!\$)\$(?!\$)/g)];
    if (singles.length % 2 !== 1) return line;
    const last = singles[singles.length - 1];
    return `${line.slice(0, last.index)}${line.slice(last.index + 1)}`;
  }).join("\n");
}

function repairEscapedMathDelimiters(value) {
  const tick = String.fromCharCode(96);
  const fencePattern = new RegExp(`(${tick}{3}[\\s\\S]*?${tick}{3}|~~~[\\s\\S]*?~~~)`, "g");
  const repairText = (text) => String(text || "").split("\n").map((line) => {
    // Some models escape every dollar delimiter, which makes remark-math
    // correctly treat the whole equation as ordinary prose. Restore escaped
    // display delimiters first, then restore escaped inline pairs only when
    // the enclosed text is unmistakably mathematical (so currency stays safe).
    line = line.replace(/\\+\$\\+\$/g, "$$");
    line = line.replace(/\\+\$([^$\n]*?)\\+\$/g, (whole, formula) => {
      const candidate = formula.trim();
      const looksMathematical = /\\[A-Za-z]+|[=<>_^{}]|^[A-Za-z](?:[_^].+)?$/.test(candidate);
      return looksMathematical ? `$${formula}$` : whole;
    });
    return line;
  }).join("\n");
  return String(value || "").split(fencePattern).map((part) => /^(```|~~~)/.test(part) ? part : repairText(part)).join("");
}

export function normalizeAssistantMathInput(value) {
  let source = String(value ?? "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g, "")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/\r\n?/g, "\n");
  source = splitCollapsedMarkdownTables(source);
  // Isolated variables should stay on the text baseline even when a model
  // incorrectly encloses them in display delimiters.
  source = source.replace(/\$\$\s*((?:[A-Za-z]|\d+(?:\.\d+)?|\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|Delta|Sigma|Omega))(?:(?:\^|_)(?:\{[A-Za-z0-9]+\}|[A-Za-z0-9])){0,2})\s*\$\$/g, (_match, scalar) => `$${scalar}$`);
  // Delimiter recovery belongs before the larger TeX normalizer. Running the
  // legacy plain-text cleanup here inserted empty display blocks into valid
  // Markdown paragraphs and tables.
  const tables = protectGfmTableBlocks(source);
  source = tables.source;
  source = repairEscapedMathDelimiters(source);
  source = repairAssistantDollarMarkers(source);
  source = repairUnpairedInlineDollars(source);
  return demoteInlineDisplayMath(tables.restore(source));
}

export function sanitizeLatexOutput(text) {
  if (!text) return "";
  // Strip invisible characters that can split commands or confuse Markdown's
  // delimiter matching. Keep ordinary Unicode math symbols and line breaks.
  let clean = String(text)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g, "")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/\r\n?/g, "\n");
  clean = splitCollapsedMarkdownTables(clean);

  // Fenced source blocks must stay byte-for-byte intact. Global math repair
  // used to collapse JSON-escaped backslashes inside chart strings, making
  // otherwise valid graph payloads unparsable.
  const codeChunks = [];
  clean = clean.replace(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/g, (block) => {
    const token = `\uE100C${codeChunks.length}\uE101`;
    codeChunks.push({ token, value: block });
    return token;
  });

  const protectedChunks = [];
  clean = clean.replace(/(?:\\+)?\[\s*\$?(WIKI(?:\\?_|\s+)IMAGE|IMAGE(?:\\?_|\s+)SEARCH|DIAGRAM|FIGURE)\$?\s*:\s*([^\]\n]*?)(?:\\+)?\]/gi, (_whole, tag, query) => {
    const token = `\uE000V${protectedChunks.length}\uE001`;
    protectedChunks.push({ token, value: `[${tag.replace(/\\_/g, "_").replace(/\s+/g, "_").toUpperCase()}: ${query.trim()}]` });
    return token;
  });
  clean = clean
    .replace(/\|\s*(?=\|\s*[-+]?\d+(?:\.\d+)?\s*\|)/g, "|\n")
    .replace(/(\|[^\n]*\|)[ \t]+(#{2,6}[ \t]+\S)/g, "$1\n\n$2")
    .replace(/(\|[^\n]*\|)[ \t]+(-[ \t]+\$)/g, "$1\n\n$2");
  // Models sometimes wrap Markdown labels in display delimiters, then start
  // inline math in the same paragraph: `$$**Domain:**$...$`. Remove those
  // invalid label wrappers before the display-math pass can eat the inline
  // delimiters nested inside them.
  clean = clean.replace(/\$\$[ \t]*(?=\*\*[^*\n]{1,80}:\*\*)/g, "\n\n");
  clean = protectMarkdownTables(clean, protectedChunks);
  clean = clean
    .replace(/\$\$[ \t]*(?=\|)/g, "\n\n")
    .replace(/(\|)[ \t]*\$\$/g, "$1\n\n$$");

  // Some model responses mistakenly escape visual tags as `\[TAG\]`.
  // Restore these before the generic escaped-display-math repair below so
  // the message renderer can dispatch the tag (and fetch its image).
  clean = clean.replace(/(?:\\+)?\[\s*\$?(WIKI(?:\\?_|\s+)IMAGE|IMAGE(?:\\?_|\s+)SEARCH|DIAGRAM|FIGURE)\$?\s*:\s*([^\]\n]*?)(?:\\+)?\]/gi, (_whole, tag, query) => `[${tag.replace(/\\_/g, "_").replace(/\s+/g, "_").toUpperCase()}: ${query.trim()}]`);

  // Normalize JSON-escaped LaTeX before repairing delimiters. Model responses
  // can contain either `\[...\]` or the JSON-preserved `\\[...\\]` form.
  clean = clean
    .replace(/\\{1,}\[([\s\S]*?)\\{1,}\]/g, (_whole, formula) => `\n$$\n${formula.trim()}\n$$\n`)
    .replace(/\\{2,}(?=[A-Za-z])/g, "\\")
    .replace(/\\{2,}(?=[{}%_&#$;:!<>()\[\]])/g, "\\");

  // A few models put valid inline math markers around only the numerator or
  // denominator inside a TeX fraction. Those markers split the fraction into
  // unrelated Markdown nodes; remove them from the fraction arguments so the
  // math pass can typeset the complete expression together.
  clean = clean.replace(/(\\(?:d?frac|tfrac)\s*)\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/gi, (_whole, command, numerator, denominator) => {
    if (!/(?<!\\)\$/.test(numerator + denominator)) return _whole;
    return `${command}{${numerator.replace(/(?<!\\)\$/g, "")}}{${denominator.replace(/(?<!\\)\$/g, "")}}`;
  });
  clean = clean.replace(/(\\(?:d?frac|tfrac)[^\n]*?=[ \t]*[+-]?\d+(?:\.\d+)?)(?=[A-Z][a-z])/g, "$1\n\n");

  // Repair complete piecewise cases blocks as a unit. A single trailing
  // backslash is a common model substitute for a LaTeX row break; preserve
  // command backslashes, normalize row separators, and discard blank rows.
  clean = clean.replace(/\\begin\s*\{\s*cases\s*\}([\s\S]*?)\\end\s*\{\s*cases\s*\}/gi, (_whole, body, offset, source) => {
    const rows = body
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => row.replace(/(?<!\\)\\(?=\s*(?:$|&))/g, "\\\\"));
    return `\\begin{cases}\n${rows.join("\n")}\n\\end{cases}`;
  });

  clean = clean
    // Collapse malformed runs such as $$$$, $$$ and `$ $$` before the
    // delimiter-pair repair pass can mistake them for separate formulas.
    .replace(/\${4,}/g, () => "$$")
    .replace(/\${3}(?!\$)/g, () => "$$")
  // A display opener occasionally lands between a scripted variable and its
  // equals sign (`P_{m}$$=...`). It is a misplaced marker, not a separate block.
  clean = clean.replace(/([A-Za-z](?:_\{[^{}\n]+\}|_[A-Za-z0-9]+)?)\$\$\s*(?==)/g, "$1");
  // A second malformed form places a display opener in the middle of an
  // equation before a TeX layout command (for example `R_N$$\\left(`).
  // In that position it is equation punctuation, not a Markdown boundary.
  clean = clean.replace(/([A-Za-z0-9}])\$\$(?=\\(?:left\b|right\b|[,;:!]|quad\b|qquad\b|displaystyle\b|frac\b|dfrac\b|sqrt\b|mathrm\b|mathbf\b))/g, "$1");
  // Remove accidental inline-dollar delimiters nested inside a display block
  // (e.g. $$\Delta$G^{\\circ}$ = ...$$) while retaining the outer pair.
  clean = clean.replace(/\$\$([\s\S]*?)\$\$/g, (_whole, formula) => `$$${stripNestedMathDollars(formula)}$$`);
  clean = repairEscapedMathDelimiters(clean);
  clean = repairAssistantDollarMarkers(clean);
  clean = demoteInlineDisplayMath(clean);
  // Repair inline math where a model accidentally reopens a dollar delimiter
  // immediately before a TeX command, e.g. `$(-$\\infty,\\infty)$`.
  clean = clean.replace(/(?<!\\)\$([^$\n]*?)(?<!\\)\$(?=\\[A-Za-z]+)([^$\n]*?)(?<!\\)\$(?!\$)/g, (_whole, prefix, formulaTail) => `$${prefix}${formulaTail}$`);
  clean = clean
    .replace(/^(#{1,6})\s+(?:#{1,6}\s+)+/gm, "$1 ")
    .replace(/^#\s+#\s+#\s+/gm, "### ")
    .replace(/^#\s+##\s+/gm, "### ")
    // Close a single unbalanced prose math opener when it is followed by a
    // simple alphabetic variable (never rewrite currency like `$5`).
    .replace(/(^|\n)([^\n]*?)\$([A-Za-z][A-Za-z0-9_]*(?:(?:\^|_)\{[^{}\n]*\}|(?:\^|_)[A-Za-z0-9]+)*)(?=\s*(?:[.,;:!?)]\s*)?$)([^\n]*)/g, (whole, lineStart, before, variable, after) => {
      const line = `${before}$${variable}${after}`;
      const dollarCount = (line.match(/(?<!\\)\$/g) || []).length;
      return dollarCount === 1 ? `${lineStart}${before}$${variable}$${after}` : whole;
    })
    // A lone symbol or scalar is inline notation even when the model wraps
    // it in display delimiters. Keep real expressions and environments in
    // display mode.
    .replace(/\$\$\s*((?:[A-Za-z]|\d+(?:\.\d+)?|\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|Delta|Sigma|Omega))(?:(?:\^|_)(?:\{[A-Za-z0-9]+\}|[A-Za-z0-9])){0,2})\s*\$\$/g, (_match, scalar) => `$${scalar}$`)
    // KaTeX has no mhchem extension in this app. Keep common chemistry
    // notation renderable by converting mhchem wrappers to supported roman
    // math, and close a truncated wrapper at the end of its line.
    .replace(/\\(?:ce|pu)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/gi, "\\mathrm{$1}")
    .replace(/\\(?:ce|pu)\s*\{([^{}\n]*)$/gim, "\\mathrm{$1}");

  // A display opener occasionally lands between a scripted variable and its
  // equals sign (`P_{m}$$=...`). Treat that marker as misplaced punctuation.
  clean = clean.replace(/([A-Za-z](?:_\{[^{}\n]+\}|_[A-Za-z0-9]+)?)\$\$\s*(?==)/g, "$1");

  clean = repairUnpairedInlineDollars(clean);
  clean = clean
    .replace(/\|\s*(?=\|\s*[-+]?\d+(?:\.\d+)?\s*\|)/g, "|\n")
    .replace(/([^\n])\s+(#{2,6})\s+(?=\S)/g, "$1\n\n$2 ")
    .replace(/([^\n])\s+-\s+(?=\$[A-Za-z][^$]*\$\s*-)/g, "$1\n- ");

  // Models sometimes put punctuation between a closing math delimiter and
  // the next part of an equation (for example, `$...$!dA`).
  clean = clean.replace(/(^|[^$])\$([^$]+)\$!(?!\$)/g, (_match, prefix, formula) => `${prefix}$${formula}$`);

  // Keep block math, headings, and GFM tables on separate Markdown blocks
  // even when the model jams them together on one line.
  clean = clean.replace(/\$\$[ \t]*(#{1,6})/g, (_match, heading) => `$$\n\n${heading}`);
  // Keep prose words separate from an immediately following inline math
  // opener (for example, `Graph of$y = ...$`).
  clean = clean.replace(/([A-Za-z])\$(?=[\\A-Za-z])/g, "$1 $");

  // Display-wrap any unmarked LaTeX environment, including uncommon ones.
  // Work from the original source offsets so code fences and existing math
  // delimiters remain intact.
  const environmentPattern = /\\+begin\s*\{\s*([A-Za-z*]+)\s*\}[\s\S]*?\\+end\s*\{\s*\1\s*\}/gi;
  const replacements = [];
  let match;
  while ((match = environmentPattern.exec(clean))) {
    const before = clean.slice(0, match.index);
    if ((before.match(/```|~~~/g) || []).length % 2) continue;
    if ((before.match(/\$/g) || []).length % 2) continue;
    const afterEnvironment = clean.slice(match.index + match[0].length);
    if (/\$\$\s*$/.test(before) && /^\s*\$\$/.test(afterEnvironment)) {
      environmentPattern.lastIndex = match.index + match[0].length;
      continue;
    }
    const lineStart = before.lastIndexOf("\n") + 1;
    const leftSide = clean.slice(lineStart, match.index);
    const leftWords = leftSide.replace(/\\[A-Za-z]+\*?/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
    const start = /^[A-Za-z][\w\\{}()[\].^,*+\-/\s&|]*=\s*$/.test(leftSide) && leftWords.length <= 2 ? lineStart : match.index;
    replacements.push({ start, end: match.index + match[0].length });
    environmentPattern.lastIndex = match.index + match[0].length;
  }
  for (const range of replacements.reverse()) {
    const formula = clean.slice(range.start, range.end).trim().replace(/\$/g, "");
    const before = range.start > 0 && clean[range.start - 1] !== "\n" ? "\n" : "";
    const after = range.end < clean.length && clean[range.end] !== "\n" ? "\n" : "";
    clean = `${clean.slice(0, range.start)}${before}$$\n${formula}\n$$${after}${clean.slice(range.end)}`;
  }

  // Separate a table header and its delimiter row even when the model put
  // both directly after prose on one physical line.
  clean = clean.replace(/(^|[^\n])([ \t]*)(\|[^|\n]+(?:\|[^|\n]+)+\|)[ \t]*(\|[ \t:|-]*-{3,}[ \t:|-]*\|[^\n]*)/gm, (_whole, prefix, _space, header, separator) => `${prefix}\n\n${header}\n${separator}`);

  // Wrap command-bearing lines that have no math delimiter yet. This covers
  // common operators and raw commands such as \\displaystyle, \\sum,
  // \\int, and \\frac without changing fenced examples or existing formulas.
  const lines = clean.split("\n");
  const output = [];
  let inFence = false;
  let inMath = false;
  let inDisplayMath = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }
    if (!inFence && /^\s*\$\$\s*$/.test(line)) {
      inDisplayMath = !inDisplayMath;
      output.push(line);
      continue;
    }
    if (!inFence && (inDisplayMath || /(?<!\\)\$\$/.test(line))) {
      output.push(line);
      continue;
    }
    if (!inFence && /^\s*\|/.test(line)) {
      // Keep table structure intact here; MathMarkdown wraps math within
      // individual cells after remark-gfm has recognized the table.
      output.push(line);
      continue;
    }
    const dollars = (line.match(/\$\$?/g) || []).length;
    const insideMathBeforeLine = inMath;
    if (dollars % 2) inMath = !inMath;
    const formulaLine = trimmed.replace(/^(?:>\s*)?(?:[-*+]\s+)?/, "");
    if (!inFence && !insideMathBeforeLine && !dollars && /^\\+(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|Delta|Sigma|Omega)$/.test(formulaLine)) {
      output.push(`$${formulaLine.replace(/^\\{2,}/, "\\")}$`);
      continue;
    }
    const hasRawCommand = /\\+[A-Za-z]{2,}/.test(formulaLine);
    const labeledFormula = formulaLine.match(/^((?:\*\*[^*\n]+:\*\*|[^:$]{2,70}:)\s*)(.*)$/);
    if (!inFence && !insideMathBeforeLine && !dollars && labeledFormula && hasRawCommand) {
      const formula = labeledFormula[2].trim();
      const commandCount = (formula.match(/\\+(?:text|rightarrow|Rightarrow|frac|dfrac|sqrt|sin|cos|tan|int|sum|lim|mathrm|mathbf)\b/gi) || []).length;
      const formulaHasStructure = /[=<>_^{}]/.test(formula);
      if (commandCount >= 2) {
        output.push(labeledFormula[1].trimEnd(), "$$", formula, "$$");
        continue;
      }
      if (formulaHasStructure) {
        output.push(`${labeledFormula[1]}$${formula.replace(/\\0\b/g, "0")}$`);
        continue;
      }
    }
    const firstCommand = formulaLine.search(/\\+/);
    const prefix = firstCommand > 0 ? formulaLine.slice(0, firstCommand).trim() : "";
    const equationLike = /[=<>_^{}]/.test(formulaLine);
    const proseWords = formulaLine.replace(/\\[A-Za-z]+\*?/g, " ").replace(/[{}_^=<>()[\],.*+\-/&|]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
    if (!inFence && !insideMathBeforeLine && !dollars && hasRawCommand && (!prefix || (equationLike && proseWords.length <= 2))) {
      output.push("$$", formulaLine, "$$");
      continue;
    }
    // Recover scripted variables embedded in otherwise ordinary prose, such
    // as `H_2O` or `x^2`, without turning the entire sentence into math.
    const protectedFractions = [];
    const scriptSafeLine = line.replace(/\\(?:d?frac|tfrac)\s*\{((?:[^{}\n]|\{[^{}\n]*\})*)\}\s*\{((?:[^{}\n]|\{[^{}\n]*\})*)\}/gi, (fraction) => {
      const token = `\uE100${protectedFractions.length}\uE101`;
      protectedFractions.push(fraction);
      return token;
    });
    const scripted = scriptSafeLine.includes("$") ? scriptSafeLine : scriptSafeLine.replace(/(?<![\\$\w])([A-Za-z][A-Za-z0-9]*)(\s*(?:\^|_)(?:\{[^{}\n]+\}|[A-Za-z0-9]+))/g, (whole, variable, script, offset, source) => {
      if (source[offset - 1] === "$" || source[offset + whole.length] === "$") return whole;
      return `$${variable}${script.replace(/\s+/g, "")}$`;
    });
    output.push(scripted.replace(/\uE100(\d+)\uE101/g, (_token, index) => protectedFractions[Number(index)] || ""));
  }
  let formatted = output.join("\n");

  // Recover TeX spans embedded in otherwise ordinary prose (for example,
  // “The standard form is \frac{x^2}{9} - ...”). Earlier line-level wrapping
  // intentionally avoids swallowing prose; this final pass boxes only the
  // command-bearing suffix and leaves labels and surrounding Markdown alone.
  let inFinalFence = false;
  let inFinalMath = false;
  formatted = formatted.split("\n").map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFinalFence = !inFinalFence;
      return line;
    }
    if (!inFinalFence && /^\s*\$\$\s*$/.test(line)) {
      inFinalMath = !inFinalMath;
      return line;
    }
    if (inFinalFence || inFinalMath || /(?<!\\)\$\$/.test(line) || /^\s*\|/.test(line)) return line;
    const parts = line.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
    if (parts.length > 1) return line;
    const first = line.search(/\\[A-Za-z]{2,}/);
    if (first < 0) return line;
    // A command inside an unmarked script group belongs to the variable (for
    // example, `y_{\\text{vertex}}`). Leave the complete expression for the
    // rendering layer's balanced-brace math wrapper.
    let braceDepth = 0;
    for (let index = 0; index < first; index += 1) {
      if (line[index] === "\\") { index += 1; continue; }
      if (line[index] === "{") braceDepth += 1;
      else if (line[index] === "}") braceDepth = Math.max(0, braceDepth - 1);
    }
    if (braceDepth > 0) return line;
    const prefix = line.slice(0, first);
    let formula = line.slice(first).trim();
    if (!formula || /^\\(?:begin|end)\s*\{(?:plot|scientific-plot)\}/i.test(formula)) return line;
    formula = formula.replace(/\\0\b/g, "0");
    const label = prefix.match(/^(.*?(?::\s*|\*\*:\s*|\u00a0+))$/);
    if (label) return `${prefix}$${formula}$`;
    return `${prefix}$${formula}$`;
  }).join("\n");

  // Give GFM an unmistakable blank-line boundary around pipe tables. Some
  // model responses concatenate table rows directly onto surrounding prose.
  formatted = formatted.replace(/(^|\n)([ \t]*\|[^\n]*(?:\n[ \t]*\|[^\n]*)*)(?=\n|$)/g, (_whole, before, table) => {
    return `${before.endsWith("\n") ? "\n" : before}\n${table.trimEnd()}\n\n`;
  });

  // Markdown requires display math to occupy its own block. The model often
  // places `$$...$$` in the middle of prose, which remark-math otherwise
  // treats inconsistently. Preserve fenced examples and inline `$...$` math.
  const fencePattern = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/g;
  formatted = formatted.split(fencePattern).map((segment) => {
    if (/^(?:```|~~~)/.test(segment)) return segment;

    let blockReady = segment.replace(/\$\$([\s\S]*?)\$\$/g, (whole, formula, offset, source) => {
      const before = source.slice(0, offset);
      const after = source.slice(offset + whole.length);
      const leading = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const trailing = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
      return `${leading}$$\n${formula.trim()}\n$$${trailing}`;
    });

    // Keep headings out of prose lines, and keep display/inline math source
    // untouched while normalizing Markdown around it.
    return blockReady.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part, index) => {
      if (index % 2) return part;
      let prose = part.replace(/([^\n])[\t ]+(#{1,6})[\t ]+(?=\S)/g, "$1\n\n$2 ");
      const lines = prose.split("\n");
      const normalizedLines = [];
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const heading = line.match(/^[\t ]{0,3}(#{1,6})[\t ]*(\S.*)$/);
        if (!heading) {
          normalizedLines.push(line);
          continue;
        }
        if (normalizedLines.length && normalizedLines[normalizedLines.length - 1] !== "") normalizedLines.push("");
        normalizedLines.push(`${heading[1]} ${heading[2].trim()}`);
        const nextLine = lines[lineIndex + 1];
        if (nextLine && nextLine.trim()) normalizedLines.push("");
      }
      return normalizedLines.join("\n");
    }).join("");
  }).join("");

  formatted = demoteInlineDisplayMath(repairCollapsedAssistantMarkdown(formatted));
  // Recover a common model failure where a display opener is inserted in the
  // middle of a sentence or repeated after an otherwise complete equation
  // (for example `...^{n} $$$. 5. **Next step**`). The ordinary delimiter
  // repair intentionally leaves these ambiguous lines alone; doing so lets
  // raw `\displaystyle` / `\frac` text leak into the page. Isolate the
  // TeX expression and restore the following Markdown as prose.
  formatted = formatted.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/g).map((chunk) => {
    if (/^(?:```|~~~)/.test(chunk)) return chunk;
    return chunk.split("\n").map((line) => {
      if (!/\\(?:displaystyle|d?frac|tfrac|sqrt|sum|prod|int|lim|left|right|text|mathrm|mathbf)\b/.test(line)) return line;
      const commandAt = line.search(/\\(?:displaystyle|d?frac|tfrac|sqrt|sum|prod|int|lim|left|right|text|mathrm|mathbf)\b/);
      const inlineOpenersBeforeCommand = line.slice(0, commandAt).match(/(?<!\\)(?<!\$)\$(?!\$)/g) || [];
      if (inlineOpenersBeforeCommand.length % 2) return line;
      const markerMatch = /\$+/.exec(line.slice(commandAt));
      const markerAt = markerMatch ? commandAt + markerMatch.index : -1;
      if (markerAt < 0) return line;
      const afterMarker = line.slice(markerAt + markerMatch[0].length);
      const boundaryLooksBroken = markerMatch[0].length > 1 || !afterMarker.trim()
        || /^\s*(?:\.?\s*(?:\d{1,2}[.)]\s+|#{1,6}\s+|\*\*[^*]+\*\*|[-*+]\s+))/.test(afterMarker);
      if (!boundaryLooksBroken) return line;
      const formula = line.slice(commandAt, markerAt).replace(/\$/g, "").trim();
      const proseWords = formula.replace(/\\[A-Za-z]+\*?/g, " ").replace(/[{}_^=<>()[\],.*+\-/&|]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
      if (!formula || !/[{}_^=<>]/.test(formula) || proseWords.length > 3) return line;
      const prefix = line.slice(0, commandAt).replace(/\$+\s*$/, "").trimEnd();
      let suffix = line.slice(markerAt + markerMatch[0].length).replace(/^\s*\.\s*/, " ").trim();
      // A new numbered step or heading was often glued to the broken math
      // marker. Put it back on its own Markdown block.
      suffix = suffix.replace(/\s+(?=(?:\d{1,2}[.)]\s+|#{1,6}\s+|[-*+]\s+))/g, "\n\n");
      const display = `$$\n${formula}\n$$`;
      return `${prefix ? `${prefix}\n\n` : ""}${display}${suffix ? `\n\n${suffix}` : ""}`;
    }).join("\n");
  }).join("");
  for (const chunk of protectedChunks) formatted = formatted.replaceAll(chunk.token, chunk.value);
  // The line-level transformations above can join prose to an inline math
  // opener while repairing malformed display wrappers.
  formatted = formatted.replace(/([A-Za-z])\$(?=[\\A-Za-z])/g, "$1 $");
  for (const chunk of codeChunks) formatted = formatted.replaceAll(chunk.token, chunk.value);
  return formatted;
}

export function sanitizeLatexForDisplay(value) {
  let text = String(value ?? "");
  // Resolve ordinary and nested fractions/roots before removing commands.
  for (let pass = 0; pass < 6; pass += 1) {
    const previous = text;
    text = text
      .replace(/\\+d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
      .replace(/\\+sqrt\s*\{([^{}]*)\}/g, "√($1)")
      .replace(/\\+text\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\+mathrm\s*\{([^{}]*)\}/g, "$1");
    if (text === previous) break;
  }
  const greek = { alpha:"α", beta:"β", gamma:"γ", delta:"δ", epsilon:"ε", varepsilon:"ε", theta:"θ", lambda:"λ", mu:"μ", pi:"π", rho:"ρ", sigma:"σ", tau:"τ", phi:"φ", varphi:"φ", omega:"ω", Delta:"Δ", Sigma:"Σ", Omega:"Ω", infty:"∞", times:"×", cdot:"·", pm:"±", neq:"≠", leq:"≤", geq:"≥", approx:"≈",rightarrow:"→",to:"→" };
  const superscript = { "0":"⁰", "1":"¹", "2":"²", "3":"³", "4":"⁴", "5":"⁵", "6":"⁶", "7":"⁷", "8":"⁸", "9":"⁹", "+":"⁺", "-":"⁻" };
  const subscript = { "0":"₀", "1":"₁", "2":"₂", "3":"₃", "4":"₄", "5":"₅", "6":"₆", "7":"₇", "8":"₈", "9":"₉" };
  const translateDigits = (value, table) => Array.from(value, (char) => table[char] || char).join("");
  text = text
    .replace(/\\+begin\s*\{cases\}/gi, "⎧  ")
    .replace(/\\+end\s*\{cases\}/gi, "")
    .replace(/\\\\/g, "\n  ")
    .replace(/\\+(left|right|displaystyle|textstyle|quad|qquad)\b\s*/gi, "")
    .replace(/\\[,;:!]/g, " ")
    .replace(/\\+([A-Za-z]+)/g, (match, name) => greek[name] ?? greek[name.toLowerCase()] ?? "")
    .replace(/\\+[%_{}&]/g, (match) => match.slice(-1))
    .replace(/\$+/g, "")
    .replace(/\^\{([^{}]+)\}/g, "^$1")
    .replace(/_\{([^{}]+)\}/g, "_$1")
    .replace(/\^([0-9+-]+)/g, (_match, value) => translateDigits(value, superscript))
    .replace(/_([0-9]+)/g, (_match, value) => translateDigits(value, subscript))
    .replace(/[{}]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
  return text;
}

export function prepareAssistantMath(value) {
  // Normalize JSON-escaped LaTeX before looking for environments. Model output
  // commonly contains a `cases` block without math delimiters, and a doubled
  // backslash here otherwise prevents Markdown from ever handing it to KaTeX.
  const tableGuard = protectGfmTableBlocks(normalizeMathMarkup(String(value || "")));
  let source = tableGuard.source;
  const tick = String.fromCharCode(96);
  const fence = tick.repeat(3);

  // Long display equations are occasionally returned as a single-dollar
  // `\displaystyle` span. remark-math treats that as inline math, and a line
  // break inside the span makes the TeX leak into the chat as plain text.
  // Promote only these explicit displaystyle spans to block delimiters.
  // Markdown table cells are protected: display delimiters cannot span rows.
  source = source.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/g).map((part) => {
    if (/^(?:```|~~~)/.test(part)) return part;
    return part.replace(/(?<!\\)\$\\displaystyle\s*([\s\S]*?)(?<!\\)\$(?!\$)/g, (_whole, formula) => `$$\n\\displaystyle ${formula.trim()}\n$$`);
  }).join("");

  // Recover raw display equations whose opening `$$` was lost. Keep labels
  // as prose and wrap only a TeX suffix with equation syntax.
  source = source.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g).map((part) => {
    if (part.startsWith(fence) || part.startsWith("~~~")) return part;
    return part.split(/(\n[ \t]*\n)/).map((paragraph) => {
      if (!paragraph || /^\n[ \t]*\n$/.test(paragraph) || paragraph.includes("$") || !/\\(?:[,;:!]\s*)?\\?(?:displaystyle|d?frac|tfrac|int|lim|sum|sqrt|mathbf|hat)\b/.test(paragraph)) return paragraph;
      const start = paragraph.search(/\\(?:[,;:!]\s*)?\\?(?:displaystyle|d?frac|tfrac|int|lim|sum|sqrt|mathbf|hat)\b/);
      if (start < 0) return paragraph;
      const prefix = paragraph.slice(0, start);
      const formula = paragraph.slice(start).trim().replace(/^\\[,;:!]\s*/, "").replace(/^\\displaystyle\s*/, "");
      const words = formula.replace(/\\[A-Za-z]+\*?/g, " ").replace(/[{}_^=<>()[\],.*+\-/&|]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
      if (!/[=<>]/.test(formula) || words.length > 3) return paragraph;
      return `${prefix}$$\n${formula}\n$$`;
    }).join("");
  }).join("");

  // Wrap complete raw math environments before Markdown parses paragraphs.
  // Include an equation's left-hand side when it appears immediately before
  // `\\begin`, so expressions such as E\\left(r\\right)=\\begin{cases}...
  // stay together as one display equation.
  const environmentPattern = /\\begin\s*\{(cases|aligned|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}/gi;
  const replacements = [];
  let environmentMatch;
  while ((environmentMatch = environmentPattern.exec(source))) {
    const beforeMatch = source.slice(0, environmentMatch.index);
    if ((beforeMatch.match(/```/g) || []).length % 2) continue;
    if ((beforeMatch.match(/(?<!\\)\$/g) || []).length % 2) continue;
    const environmentName = environmentMatch[1];
    const endPattern = new RegExp(`\\\\end\\s*\\{\\s*${environmentName}\\s*\\}`, "gi");
    endPattern.lastIndex = environmentPattern.lastIndex;
    const endMatch = endPattern.exec(source);
    if (!endMatch) continue;
    let start = environmentMatch.index;
    const lineStart = source.lastIndexOf("\n", start - 1) + 1;
    const leftSide = source.slice(lineStart, start);
    const leftWords = leftSide.replace(/\\[A-Za-z]+\*?/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
    if (/^[A-Za-z][\w\\{}()[\].^,*+\-/\s&|]*=\s*$/.test(leftSide) && leftWords.length <= 2) start = lineStart;
    const preceding = source.slice(0, start);
    const following = source.slice(endMatch.index + endMatch[0].length);
    if (/\$\$\s*$/.test(preceding) && /^\s*\$\$/.test(following)) {
      environmentPattern.lastIndex = endMatch.index + endMatch[0].length;
      continue;
    }
    replacements.push({ start, end: endMatch.index + endMatch[0].length });
    environmentPattern.lastIndex = endMatch.index + endMatch[0].length;
  }
  for (const range of replacements.reverse()) {
    const block = source.slice(range.start, range.end).trim();
    const before = range.start > 0 && source[range.start - 1] !== "\n" ? "\n" : "";
    const after = range.end < source.length && source[range.end] !== "\n" ? "\n" : "";
    source = `${source.slice(0, range.start)}${before}$$\n${block}\n$$${after}${source.slice(range.end)}`;
  }

  const lines = source.split("\n");
  let inCodeFence = false;
  let insideExistingDisplay = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trimStart().startsWith(fence)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (!inCodeFence && /^\s*\$\$\s*$/.test(lines[index])) {
      insideExistingDisplay = !insideExistingDisplay;
      continue;
    }
    if (inCodeFence || insideExistingDisplay || lines[index].includes("$")) continue;
    const environment = lines[index].match(/\\begin\s*\{([a-zA-Z*]+)\}/);
    if (!environment) continue;
    const endPattern = new RegExp(`\\\\end\\s*\\{\\s*${environment[1]}\\s*\\}`);
    let endIndex = index;
    while (endIndex < lines.length && !endPattern.test(lines[endIndex])) endIndex += 1;
    if (endIndex >= lines.length) continue;
    const block = lines.slice(index, endIndex + 1).join("\n");
    lines[index] = `$$\n${block}\n$$`;
    for (let cursor = index + 1; cursor <= endIndex; cursor += 1) lines[cursor] = "";
  }
  let inFence = false;
  let inDisplayMath = false;
  source = lines.map((line) => {
    if (line.trimStart().startsWith(fence)) {
      inFence = !inFence;
      return line;
    }
    const trimmed = line.trim();
    const displayDelimiters = (line.match(/\$\$/g) || []).length;
    const inlineDelimiters = /(?<!\\)(?<!\$)\$(?!\$)/.test(line);
    const insideDisplayMath = inDisplayMath;
    if (displayDelimiters % 2) inDisplayMath = !inDisplayMath;
    // Model responses can contain JSON-escaped commands (\\boxed) even
    // after the response has been decoded. Treat any run of backslashes as
    // the same command so those equations are repaired before Markdown sees
    // them. Keep quoted/list-prefixed equations valid as well.
    const equationLine = trimmed.replace(/^(?:>\s*)?(?:[-*+]\s+)?/, "");
    const hasLatexCommand = /\\+(?:boxed|displaystyle|mathbf|mathrm|hat|d?frac|ldfrac|tfrac|sqrt|sum|prod|int|lim|left|right|begin|end|overline|underline|cdot|times|quad|leq|geq|approx|equiv|theta|mu|pi)\b/.test(equationLine);
    const equationWords = equationLine
      .replace(/\\[A-Za-z]+\*?/g, " ")
      .replace(/[{}_^=<>()[\],.*+\-/&|]/g, " ")
      .match(/\b[A-Za-z]{3,}\b/g) || [];
    const standaloneEquation = /^(?:[A-Za-z][\w\\{}()[\].^,*+\-/\s&|]*|\\+[^\s]+.*)\s*(?:=|\\approx|\\equiv|\\sim)/.test(equationLine)
      && equationWords.length <= 2;
    if (!inFence && !insideDisplayMath && !displayDelimiters && !inlineDelimiters && hasLatexCommand && standaloneEquation) {
      return `$$\n${equationLine.replace(/^\\{2,}/, "\\")}\n$$`;
    }
    if (inFence || insideDisplayMath || displayDelimiters || inlineDelimiters || !trimmed || trimmed.includes("$") || !/^\\+(?:boxed|displaystyle|mathbf|mathrm|hat|d?frac|tfrac|sqrt|sum|prod|int|lim|left|begin|overline|underline)\b/.test(equationLine)) {
      return line;
    }
    return `$$\n${equationLine.replace(/^\\{2,}/, "\\")}\n$$`;
  }).join("\n");
  return repairUnpairedInlineDollars(repairAssistantDollarMarkers(tableGuard.restore(source)));
}

export function normalizeMathMarkup(value) {
  let source = splitCollapsedMarkdownTables(String(value ?? "")).replace(/\\+n(?!(?:eq|e(?![A-Za-z])|abla|eg|i|ot|mid|u|exists|parallel|rightarrow|Rightarrow|subset|supset|vdash|triangleleft|triangleright))/g, "\n");
  // Recall JSON and some model responses retain JSON-escaped delimiters
  // after parsing. Accept any slash run so Markdown gets proper math syntax.
  source = source.replace(/\\+\(([\s\S]*?)\\+\)/g, "$$$1$");
  source = source.replace(/\\+\[([\s\S]*?)\\+\]/g, "$$$$\n$1\n$$$$");
  const protectedTableRows = [];
  let fenceOpen = false;
  source = source.split("\n").map((line) => {
    if (/^\s*(?:\x60{3}|~~~)/.test(line)) { fenceOpen = !fenceOpen; return line; }
    if (fenceOpen || (line.match(/\|/g) || []).length < 2) return line;
    const token = `\uE200R${protectedTableRows.length}\uE201`;
    const row = line
      .replace(/\$\$([\s\S]*?)\$\$/g, (_whole, formula) => `$\\displaystyle ${stripNestedMathDollars(formula).replace(/\s+/g, " ").trim()}$`)
      .replace(/\\\[([\s\S]*?)\\\]/g, (_whole, formula) => `$\\displaystyle ${stripNestedMathDollars(formula).replace(/\s+/g, " ").trim()}$`);
    protectedTableRows.push({ token, row });
    return token;
  }).join("\n");
  // Normalize malformed display delimiter runs once before any other math pass.
  source = source.replace(/\${3,}/g, () => "$$");
  source = source.replace(/\$\$([\s\S]*?)\$\$/g, (_whole, formula) => "$$" + stripNestedMathDollars(formula) + "$$");
  source = source.replace(/\$\$([^\n]*?)\$\$(\s*[=<>]\s*[^$\n]+)\$(?!\$)/g, (_whole, formula, suffix) => "$$\n" + (formula + suffix).trim() + "\n$$");
  // Split standalone LaTeX from list labels so remark-math sees an actual
  // display block even when the model puts both on one bullet line.
  source = source.split("\n").map((line) => {
    const labeled = line.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+)(?:\*\*[^*\n]+\*\*|[^:\n]{1,80}:)\s*)(.*)$/);
    const tail = labeled?.[2] ?? "";
    // Keep an already-delimited formula inline with its prose. Wrapping the
    // entire tail in display delimiters creates a large equation box around
    // labels such as "Number of functions = $\\frac{...}{...}$".
    const proseWords = tail
      .replace(/\\[A-Za-z]+\*?/g, " ")
      .replace(/[{}_^=<>()[\],.*+\-/&|$]/g, " ")
      .match(/\b[A-Za-z]{3,}\b/g) || [];
    if (!labeled || tail.includes("$") || proseWords.length > 2 || !/\\+(?:lim|frac|sum|int|sqrt|begin)\b/.test(tail)) return line;
    return labeled[1].trimEnd() + "\n\n$$\n" + labeled[2].trim() + "\n$$";
  }).join("\n");
  source = source
    .replace(/([^\n\s])\$\$/g, (_match, before) => `${before}\n\n$$`)
    .replace(/\$\$([^\n\s])/g, (_match, after) => `$$\n\n${after}`);
  // Protect Markdown tables before any display-math formatting. Display math
  // is not valid inside a GFM table cell: make it one-line inline math first.
  const tableTokens = [];
  let inFence = false;
  const lines = source.split("\n");
  const normalizedLines = [];
  const flattenCellMath = (row) => row
    .replace(/\\\[([\s\S]*?)\\\]/g, (_whole, formula) => `$\\displaystyle ${stripNestedMathDollars(formula).replace(/\s+/g, " ").trim()}$`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_whole, formula) => `$\\displaystyle ${stripNestedMathDollars(formula).replace(/\s+/g, " ").trim()}$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_whole, formula) => `$${stripNestedMathDollars(formula).replace(/\s+/g, " ").trim()}$`)
    .replace(/\$\\\(([^\n]*?)\\\)\$/g, (_whole, formula) => `$${stripNestedMathDollars(formula).trim()}$`)
    .replace(/\$\$+/g, "$")
    // Malformed display math may leave its delimiter in a neighboring cell.
    // Remove only cells containing a lone marker; preserve currency and math.
    .replace(/(^|\|)([ \t]*)\$(?=[ \t]*\||[ \t]*$)/g, "$1$2");
  for (let index = 0; index < lines.length;) {
    if (/^\s*(?:```|~~~)/.test(lines[index])) { inFence = !inFence; normalizedLines.push(lines[index++]); continue; }
    if (!inFence && (lines[index].match(/\|/g) || []).length >= 2) {
      const table = [];
      while (index < lines.length && (lines[index].match(/\|/g) || []).length >= 2) table.push(flattenCellMath(lines[index++]));
      const token = `\uE200${tableTokens.length}\uE201`;
      tableTokens.push({ token, value: table.join("\n") });
      normalizedLines.push(token);
      continue;
    }
    normalizedLines.push(lines[index++]);
  }
  source = normalizedLines.join("\n");
  const rowSpacingEscapes = [];
  source = source.replace(/(\\{2,})(?=\[\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*(?:pt|em|ex|mu|mm|cm|in|bp|pc|dd|cc|nd|nc|sp)\])/gi, (_, slashes) => {
    const marker = `\uE000${rowSpacingEscapes.length}\uE001`;
    rowSpacingEscapes.push(slashes);
    return marker;
  });
  source = source.replace(/\\{4,}(?=\s)/g, "\\\\");
  source = source.replace(/\\{2,}(?=[A-Za-z])/g, "\\");
  source = source.replace(/\\{2,}(?=[,{}%_&#$;:!<>()\[\]])/g, "\\");
  source = source
    .replace(/\\{1,}\[([\s\S]*?)\\{1,}\]/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\{1,}\(([\s\S]*?)\\{1,}\)/g, (_, math) => `$${math.trim()}$`)
    .replace(/\n*\$\$([\s\S]*?)\$\$\n*/g, (_whole, math) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\(?:big|Big|bigg|Bigg)[lrm]?\\(left|right)\b/g, "\\$1")
    .replace(/\\left\s*\\left\b/g, "\\left")
    .replace(/\\right\s*\\right\b/g, "\\right");
  // Remove inline-math delimiters accidentally nested inside a larger
  // formula. They are valid Markdown delimiters but invalid TeX tokens once
  // the surrounding expression is already being parsed by KaTeX.
  source = source
    .replace(/\$\$([\s\S]*?)\$\$/g, (_whole, formula) => `$$${formula.replace(/\\\([ \t]*/g, "(").replace(/\\\)/g, ")")}$$`)
    .replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (_whole, formula) => `$${formula.replace(/\\\([ \t]*/g, "(").replace(/\\\)/g, ")")}$`);
  // Repair common collapsed Markdown boundaries while math/table blocks are
  // protected from the substitutions.
  source = source
    .replace(/\$\$[ \t]*(#{1,6})[ \t]+/g, (_match, heading) => `$$\n\n${heading} `)
    .replace(/([^\n])([ \t]+)(#{2,6})[ \t]+(?=\S)/g, "$1\n\n$3 ")
    .replace(/([^\n])\s+-\s+(?=\$[A-Za-z][^$]*\$\s*(?:-|$))/g, "$1\n- ")
    .replace(/\|\s*(?=\|\s*[-+]?\d+(?:\.\d+)?\s*\|)/g, "|\n");
  tableTokens.forEach(({ token, value: table }) => { source = source.replace(token, table); });
  rowSpacingEscapes.forEach((slashes, index) => {
    source = source.replace(`\uE000${index}\uE001`, slashes);
  });
  // Keep prose separate from inline math without putting whitespace inside
  // delimiters. Whitespace right after `$` or before the closing `$` makes
  // remark-math treat common expressions such as `$x$` as literal text.
  source = source.replace(/(?<!\\)(?<!\$)\$([^$\n]+)\$(?!\$)/g, (math, formula, offset, whole) => {
    const before = whole.slice(0, offset);
    const after = whole.slice(offset + math.length);
    const needsSpaceBefore = /[A-Za-z0-9]$/.test(before);
    const needsSpaceAfter = /^[A-Za-z0-9]/.test(after);
    return `${needsSpaceBefore ? " " : ""}$${formula.trim()}$${needsSpaceAfter ? " " : ""}`;
  });
  protectedTableRows.forEach(({ token, row }) => { source = source.replace(token, row); });
  return source;
}

export function runRecallMathSelfTest() {
  const encoded = String.raw`{"items":[{"front":"\\\\frac{a}{b} and \\\\sin x","back":"\\\\theta, v_{rms}, x^{2}"}]}`;
  const parsed = JSON.parse(encoded);
  const formula = normalizeMathMarkup(`${parsed.items[0].front} ${parsed.items[0].back}`);
  const checks = {
    doubleEscapedFraction: formula.includes("\\frac{a}{b}"),
    verticalFractionMarkup: formula.includes("\\frac{a}{b}"),
    trigCommand: formula.includes("\\sin x"),
    symbolCommand: formula.includes("\\theta"),
    subscript: formula.includes("v_{rms}"),
    superscript: formula.includes("x^{2}")
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) throw new Error(`Recall KaTeX self-test failed: ${failed.join(", ")}`);
  return checks;
}
