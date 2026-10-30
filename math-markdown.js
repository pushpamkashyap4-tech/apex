import { jsx } from "react/jsx-runtime";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { containsUnrenderedLatex, normalizeMathMarkup, prepareAssistantMath, protectGfmTableBlocks, sanitizeLatexForDisplay, sanitizeLatexOutput } from "./recall-math.js";
const GRAPH_COLORS = ["#4f46e5", "#0891b2", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#475569"];
function piTicks(domain) {
  const unit = Math.PI / 2;
  const first = Math.ceil(domain[0] / unit - 1e-8);
  const last = Math.floor(domain[1] / unit + 1e-8);
  const stride = Math.max(1, Math.ceil((last - first + 1) / 16));
  const ticks = [];
  for (let multiple = first; multiple <= last; multiple += stride) ticks.push(multiple * unit);
  return ticks;
}
function formatPiTick(value) {
  const multiple = Math.round(value / (Math.PI / 2));
  if (Math.abs(value - multiple * Math.PI / 2) > 1e-5) return Number(value.toPrecision(3)).toString();
  if (multiple === 0) return "0";
  const sign = multiple < 0 ? "-" : "";
  const magnitude = Math.abs(multiple);
  if (magnitude % 2 === 0) {
    const coefficient = magnitude / 2;
    return `${sign}${coefficient === 1 ? "" : coefficient}π`;
  }
  return `${sign}${magnitude === 1 ? "" : magnitude}π/2`;
}
function setRadianTicks(axis, domain) {
  const values = piTicks(domain);
  axis?.tickValues?.(values);
  axis?.tickFormat?.(formatPiTick);
}
let rdkitModulePromise;
function getRDKitModule() {
  if (!rdkitModulePromise) {
    rdkitModulePromise = Promise.resolve().then(() => {
      if (typeof window.initRDKitModule !== "function") throw new Error("RDKit.js did not load");
      return window.initRDKitModule({ locateFile: () => "https://unpkg.com/@rdkit/rdkit@2026.9.1/dist/RDKit_minimal.wasm" });
    });
  }
  return rdkitModulePromise;
}

const safeSvgSchema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, img: [...new Set([...(defaultSchema.protocols?.img || []), "data"])] },
  tagNames: [...new Set([...(defaultSchema.tagNames || []), "svg", "g", "defs", "marker", "clipPath", "linearGradient", "radialGradient", "stop", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc"])],
  attributes: {
    ...defaultSchema.attributes,
    svg: ["xmlns", "viewBox", "x", "y", "width", "height", "preserveAspectRatio", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "strokeDasharray", "strokeDashoffset", "fillRule", "clipRule", "opacity", "transform", "fontSize", "fontFamily", "textAnchor", "dominantBaseline", "style"],
    g: ["id", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "strokeDasharray", "strokeDashoffset", "fillRule", "clipRule", "opacity", "transform"],
    defs: [],
    marker: ["id", "markerWidth", "markerHeight", "refX", "refY", "orient", "viewBox", "fill", "stroke", "strokeWidth"],
    clipPath: ["id", "clipPathUnits"],
    linearGradient: ["id", "x1", "y1", "x2", "y2", "gradientUnits"],
    radialGradient: ["id", "cx", "cy", "r", "fx", "fy", "gradientUnits"],
    stop: ["offset", "stopColor", "stopOpacity"],
    path: ["d", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "strokeDasharray", "strokeDashoffset", "fillRule", "clipRule", "opacity", "transform", "markerEnd", "markerStart", "markerMid", "clipPath"],
    rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity", "transform"],
    circle: ["cx", "cy", "r", "fill", "stroke", "strokeWidth", "opacity", "transform"],
    ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity", "transform"],
    line: ["x1", "y1", "x2", "y2", "stroke", "strokeWidth", "strokeDasharray", "opacity", "transform"],
    polyline: ["points", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "opacity", "transform"],
    polygon: ["points", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "opacity", "transform"],
    text: ["x", "y", "fill", "stroke", "strokeWidth", "fontSize", "fontFamily", "textAnchor", "dominantBaseline", "opacity", "transform"],
    tspan: ["x", "y", "dx", "dy", "baselineShift", "fill", "fontSize", "fontFamily", "textAnchor"]
  },
  styles: { svg: { backgroundColor: [/^white$/i] } }
};

function repairLegacyMath(value) {
  // Legacy content is no longer guessed into math: guessing can consume
  // ordinary prose. Only explicit LaTeX delimiters create KaTeX expressions.
  return normalizeMathMarkup(value);
}
function promoteLongInlineEquations(source) {
  return String(source || "").split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part) => {
    if (!part.startsWith("$") || part.startsWith("$$")) return part;
    const formula = part.slice(1, -1).trim();
    const fractionCount = (formula.match(/\\(?:d?frac|tfrac)\b/g) || []).length;
    const isLong = formula.length >= 64
      || (formula.length >= 42 && fractionCount >= 2)
      || (formula.length >= 48 && /\\(?:int|sum|prod|lim)\b/.test(formula));
    return isLong ? `\n\n$$\n${formula}\n$$\n\n` : part;
  }).join("");
}
function repairMalformedLatex(value) {
  let repaired = String(value || "")
    // KaTeX uses \csc for cosecant; common JEE notation often writes
    // \cosec, which KaTeX otherwise renders as an unknown command.
    .replace(/\\(?:cosec|cosecant)\b/gi, "\\csc")
    // `ldfrac` is common in older reference text but is not a KaTeX command.
    // Convert it to the supported display-style fraction before parsing.
    .replace(/\\+ldfrac\b/g, "\\dfrac")
    // Correct escaped one-letter variables such as `\\f\\left(x\\right)`.
    // Only remove the slash when a script, equality, or sizing command
    // immediately follows, so valid TeX commands remain untouched.
    .replace(/\\([A-Za-z])(?=\\(?:left|right)\b|[_^=])/g, "$1")
    .replace(/\\sqrt\\left\s*\{\s*(\d+)\s*\\right\s*\}\s*\{([^{}]+)\}/g, (match, degree, radicand) => "\\sqrt[" + degree + "]{" + radicand + "}")
    .replace(/\\(d?frac)\s*([0-9])\s*([0-9])/g, (match, command, numerator, denominator) => "\\" + command + "{" + numerator + "}{" + denominator + "}")
    // LLMs sometimes close a boxed fraction numerator twice, which moves its
    // denominator outside the fraction and closes the box before the formula ends.
    .replace(/\\boxed\s*\{\s*,\s*/g, "\\boxed{")
    .replace(/\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\}\{/g, "\\frac{$1}{")
    .replace(/\^\{([^{}]*),\}/g, "^{$1}")
    .replace(/(?<=})\\\}(?=\s*(?:$|[.,;:!?]))/g, "")
    // A common malformed boxed equation has inline dollar delimiters inside
    // the box and omits the backslash before `sum` (for example `$sum_...$`).
    .replace(/\$sum\b/g, "\\sum");

  // Boxed content is already math. Remove accidental inline delimiters and
  // punctuation the model sometimes inserts around terms, while respecting
  // nested braces in fractions, scripts, and function arguments.
  const boxedPattern = /\\boxed\s*\{/g;
  const boxedMatches = [];
  let boxedMatch;
  while ((boxedMatch = boxedPattern.exec(repaired))) {
    const open = repaired.indexOf("{", boxedMatch.index);
    let depth = 0;
    for (let index = open; index < repaired.length; index += 1) {
      if (repaired[index] === "\\") { index += 1; continue; }
      if (repaired[index] === "{") depth += 1;
      else if (repaired[index] === "}" && --depth === 0) {
        boxedMatches.push({ start: open + 1, end: index });
        boxedPattern.lastIndex = index + 1;
        break;
      }
    }
  }
  for (const range of boxedMatches.reverse()) {
    const content = repaired.slice(range.start, range.end)
      .replace(/\$/g, "")
      .replace(/^\s*,+\s*/, "")
      .replace(/,\s*(?=\()/g, "")
      .replace(/,\s*$/, "");
    repaired = `${repaired.slice(0, range.start)}${content}${repaired.slice(range.end)}`;
  }

  // Restore the outer box when the malformed fraction above consumed its
  // closing brace too early. Ignore escaped literal braces such as \{.
  const boxedStart = repaired.search(/\\boxed\s*\{/);
  if (boxedStart !== -1) {
    const openingBrace = repaired.indexOf("{", boxedStart);
    let depth = 0;
    for (let index = openingBrace; index < repaired.length; index += 1) {
      if (repaired[index] !== "{" && repaired[index] !== "}") continue;
      let backslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && repaired[cursor] === "\\"; cursor -= 1) backslashes += 1;
      if (backslashes % 2) continue;
      depth += repaired[index] === "{" ? 1 : -1;
    }
    if (depth > 0) repaired += "}".repeat(depth);
  }
  // Chat answers often use \boxed as decoration around every equation.
  // Keep the mathematics, but let the surrounding typography provide the
  // emphasis so formulas do not acquire an extra framed box.
  let unboxSearchFrom = 0;
  while (true) {
    const start = repaired.indexOf("\\boxed", unboxSearchFrom);
    if (start === -1) break;
    const open = repaired.indexOf("{", start + "\\boxed".length);
    if (open === -1) break;
    let depth = 0;
    let close = -1;
    for (let index = open; index < repaired.length; index += 1) {
      if (repaired[index] === "\\") { index += 1; continue; }
      if (repaired[index] === "{") depth += 1;
      else if (repaired[index] === "}" && --depth === 0) { close = index; break; }
    }
    if (close === -1) { unboxSearchFrom = open + 1; continue; }
    repaired = repaired.slice(0, start) + repaired.slice(open + 1, close) + repaired.slice(close + 1);
    unboxSearchFrom = start;
  }
  return repaired;
}
function isGraphEquationText(value) {
  const symbols = "+-*/^=|(){}[]., \t" + String.fromCharCode(92);
  return [...value].every((character) => /[A-Za-z0-9_]/.test(character) || symbols.includes(character));
}
function isBareLatexEquation(line) {
  const value = String(line || "").trim();
  const hasLatex = /\\(?:sqrt|d?frac|sin|cos|tan|arcsin|arccos|arctan|pi|theta|Delta|sum|int|left|right|bigl|bigr|text|cdot|times)\b/i.test(value);
  const hasRelation = /(?:=|\\approx|\\equiv|\\sim)/.test(value);
  const proseWords = value.replace(/\\[A-Za-z]+/g, " ").replace(/[{}_^]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
  return Boolean(value && !value.includes("$") && hasLatex && hasRelation
    && proseWords.length <= 2 && isGraphEquationText(value));
}
function isStandaloneLatexExpression(value) {
  const line = String(value || "").trim();
  if (!line || line.startsWith("|") || !/[=^_{}]/.test(line)) return false;
  const hasCommands = /\\(?:boxed|sum|prod|int|lim(?:sup|inf)?|sqrt|d?frac|tfrac|displaystyle|left|right|theta|alpha|beta|infty|partial)\b/.test(line);
  if (!hasCommands) return false;
  const words = line.replace(/\\[A-Za-z]+/g, " ").replace(/[{}_^]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
  return words.length <= 3 && (/^[\\\d]/.test(line) || /\s*=/.test(line));
}
function normalizePlotCodeSections(value) {
  const lines = String(value || "").split("\n");
  const tick = String.fromCharCode(96);
  const fence = tick.repeat(3);
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trimStart().startsWith(fence)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const hasHeading = /^\s*Plot code(?:\s*\(\s*PATH\s*1\s*\))?\s*:?\s*$/i.test(lines[index]);
    const equationLine = (line) => /^(?:y|[a-z]\s*\(\s*x\s*\))\s*=\s*.+$/i.test(String(line || "").trim());
    const metadataLine = (line) => /^(?:title|x-axis|y-axis|x-range|y-range|series|caption)\s*:/i.test(String(line || "").trim());
    const directiveLine = (line) => /^(?:title|x-axis|y-axis|x-range|y-range|series|caption)\s*:/i.test(String(line || "").trim());
    const beginsLoosePlot = !hasHeading && equationLine(lines[index])
      && (metadataLine(lines[index + 1]) || metadataLine(lines[index + 2]));
    const beginsDirectivePlot = !hasHeading && directiveLine(lines[index])
      && lines.slice(index, index + 12).some((line) => /^\s*series\s*:/i.test(line));
    if (!hasHeading && !beginsLoosePlot && !beginsDirectivePlot) continue;
    const collected = [];
    let next = index + (hasHeading ? 1 : 0);
    let title = "";
    for (; next < lines.length; next += 1) {
      const item = lines[next].trim().replace(new RegExp("^" + tick + "+|" + tick + "+$", "g"), "");
      if (!item) break;
      if (metadataLine(item)) {
        if (/^title\s*:/i.test(item)) title ||= item.replace(/^title\s*:\s*/i, "").split("|").at(-1).trim();
        collected.push(item);
        continue;
      }
      if (equationLine(item) && item.includes("=") && isGraphEquationText(item)) {
        collected.push(item);
        continue;
      }
      break;
    }
    const equations = collected.filter((item) => equationLine(item));
    if (!equations.length && !collected.some((item) => /^series\s*:/i.test(item))) continue;
    if (title && equations.length) {
      const firstEquation = equations[0];
      collected[collected.indexOf(firstEquation)] = `${firstEquation} | ${title}`;
    }
    lines.splice(index, next - index, fence + "plot", ...collected, fence);
    index += collected.length + 1;
  }
  return lines.join("\n");
}
function normalizeBareSvgBlocks(value) {
  const tick = String.fromCharCode(96);
  const fence = tick.repeat(3);
  const fenced = new RegExp(`(${fence}[\\s\\S]*?${fence})`, "g");
  return String(value || "").split(fenced).map((part) => {
    if (part.startsWith(fence)) return part;
    const complete = part.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, (svg) => `${fence}svg\n${svg}\n${fence}`);
    if (complete !== part || !/<svg\b/i.test(part)) return complete;
    const start = part.search(/<svg\b/i);
    const tail = part.slice(start);
    if ((tail.match(/<(?:circle|ellipse|line|path|polygon|polyline|rect|text|g)\b/gi) || []).length < 2) return part;
    const prefix = part.slice(0, start);
    const closed = /<\/svg\s*>/i.test(tail) ? tail : `${tail}\n</svg>`;
    return `${prefix}${fence}svg\n${closed}\n${fence}`;
  }).join("");
}
function normalizeUnfencedMermaid(value) {
  const tick = String.fromCharCode(96);
  const fence = tick.repeat(3);
  const fenced = new RegExp(`(${fence}[\\s\\S]*?${fence}|~~~[\\s\\S]*?~~~)`, "g");
  const isHeader = (line) => /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|mindmap|timeline|pie|quadrantChart|gitGraph|xychart(?:-beta)?)\b/i.test(line.trim());
  const isDiagramLine = (line) => {
    const text = line.trim();
    return !text || /^%%/.test(text)
      || /^(?:subgraph\b|end\s*$|direction\b|classDef\b|class\b|style\b|linkStyle\b|click\b|accTitle\b|accDescr\b)/i.test(text)
      || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*(?:-->|---|-.->|==>|--o|--x|<--|<-->|-\.-)\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(text)
      || (/^[A-Za-z_][\w.-]*\b/.test(text)
        && (/(?:-->|---|-.->|==>|--o|--x|<--|<-->|-\.-|\|[^|]*\|)/.test(text)
          || /\[[^\]]*\]|\([^()\n]*\)|\{[^{}\n]*\}/.test(text)));
  };
  const normalizeNumericEdge = (line) => line.replace(/^([ \t]*)([+-]?(?:\d+(?:\.\d*)?|\.\d+))([ \t]*(?:-->|---|-.->|==>|--o|--x|<--|<-->|-\.-)[ \t]*)([+-]?(?:\d+(?:\.\d*)?|\.\d+))([ \t]*)$/, (_match, leading, from, edge, to, trailing) => {
    const id = (value) => `n_${value.replace(/^\+/, "").replace(/-/g, "m").replace(/\./g, "_")}`;
    return `${leading}${id(from)}["${from}"]${edge}${id(to)}["${to}"]${trailing}`;
  });
  return String(value || "").split(fenced).map((segment) => {
    if (segment.startsWith(fence) || segment.startsWith("~~~")) return segment;
    const lines = segment.split("\n");
    const output = [];
    for (let index = 0; index < lines.length;) {
      const marker = /^\s*mermaid\s*$/i.test(lines[index]);
      const headerIndex = marker ? index + 1 : index;
      if (!isHeader(lines[headerIndex] || "")) {
        output.push(lines[index]);
        index += 1;
        continue;
      }
      const body = [lines[headerIndex].trim()];
      let cursor = headerIndex + 1;
      while (cursor < lines.length) {
        if (isDiagramLine(lines[cursor])) {
          body.push(normalizeNumericEdge(lines[cursor]).trim());
          cursor += 1;
          continue;
        }
        if (!lines[cursor].trim()) {
          let lookahead = cursor + 1;
          while (lookahead < lines.length && !lines[lookahead].trim()) lookahead += 1;
          if (lookahead < lines.length && isDiagramLine(lines[lookahead])) {
            body.push("");
            cursor += 1;
            continue;
          }
        }
        break;
      }
      const hasDiagramContent = body.slice(1).some((line) => line.trim() && !/^%%/.test(line));
      if (!hasDiagramContent) {
        output.push(lines[index]);
        index += 1;
        continue;
      }
      output.push(`${fence}mermaid`, ...body, fence);
      index = cursor;
    }
    return output.join("\n");
  }).join("");
}
function wrapUnmarkedLatex(line) {
  const input = String(line || "");
  const mathParts = input.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  if (mathParts.length > 1) {
    return mathParts.map((part, index) => index % 2 ? part : wrapUnmarkedLatex(part)).join("");
  }
  const visualTokens = [];
  let output = input
    .replace(/\\\[((?:WIKI\\?_IMAGE|IMAGE\\?_SEARCH|DIAGRAM|FIGURE|SMILES)\s*:[^\]]*?)\\\]/gi, "[$1]")
    .replace(/\[\s*\$?(WIKI\\?_IMAGE|IMAGE\\?_SEARCH)\$?\s*:/gi, "[$1:")
    .replace(/\[(?:WIKI(?:\\?_|\s+)IMAGE|IMAGE(?:\\?_|\s+)SEARCH|DIAGRAM|FIGURE|SMILES)\s*:[^\]]*\]/gi, (tag) => {
      const token = `\uE300${visualTokens.length}\uE301`;
      visualTokens.push({ token, tag: tag.replace(/\\_/g, "_") });
      return token;
    })
    // \displaystyle and \textstyle modify the following formula; they are
    // not useful as standalone math spans when the model omits delimiters.
    .replace(/\\(?:displaystyle|textstyle)\s*/g, "")
    // Spacing commands sometimes escape from a formula as visible TeX. In a
    // prose span they are whitespace, so preserve the sentence spacing.
    .replace(/\\(?:qquad|quad)\b\s*/g, " ")
    .replace(/\\[,;:!]\s*/g, " ");
  // Normalize escaped underscores and protect routing tags from script
  // detection (WIKI_IMAGE otherwise resembles the TeX variable WIKI_IMAGE).
  // Matched math spans have already been split and recursively preserved
  // above. A remaining dollar is usually a malformed opener; do not let it
  // disable recovery for raw TeX elsewhere in the same prose span.
  const sizedLeft = /\\(?:big|Big|bigg|Bigg)?\\left\s*(?:\\\{|[\[({])/g;
  let match;
  while ((match = sizedLeft.exec(output))) {
    const rightPattern = /\\(?:big|Big|bigg|Bigg)?\\right\s*(?:\\\}|[\])}])/;
    const right = rightPattern.exec(output.slice(match.index + match[0].length));
    if (!right) continue;
    const end = match.index + match[0].length + right.index + right[0].length;
    let start = match.index;
    const prefix = output.slice(0, match.index);
    const equation = prefix.match(/[A-Za-z0-9_.]+(?:\s*\/\s*[A-Za-z0-9_.]+)?\s*=\s*[^|;:]*$/);
    if (equation) start = prefix.length - equation[0].length;
    output = `${output.slice(0, start)}$${output.slice(start, end)}$${output.slice(end)}`;
    sizedLeft.lastIndex = end + 2;
  }
  // Older assistant replies sometimes contain raw TeX inside prose. Wrap
  // command expressions (fractions, roots, sums, symbols) and scripted
  // variables so remark-math can typeset them with KaTeX.
  const groupEnd = (source, start) => {
    if (source[start] !== "{") return start;
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
      if (source[index] === "\\") { index += 1; continue; }
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}" && --depth === 0) return index + 1;
    }
    return start;
  };
  const commandPattern = /\\(?:displaystyle|textstyle|dfrac|tfrac|frac|sqrt|sum|prod|int|oint|lim|left|right|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|theta|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|infty|cdot|times|pm|mp|circ|degree|Delta|Sigma|partial|nabla|text|mathbb|mathrm|mathbf|mathcal|operatorname|overline|underline|overrightarrow|overleftarrow|overbrace|underbrace|vec|widehat|widetilde|lvert|rvert|langle|rangle|leq|geq|neq|approx|equiv|rightarrow|Rightarrow)(?![A-Za-z])/g;
  const insertions = [];
  let command;
  while ((command = commandPattern.exec(output))) {
    const start = command.index;
    if (output[start - 1] === "$" || output.slice(0, start).endsWith("\\")) continue;
    // Commands nested inside a script group (for example, the `\\text` in
    // `y_{\\text{vertex}}`) are part of that variable. Wrapping the command
    // alone would create invalid nested dollars; the scripted-variable pass
    // below boxes the entire balanced expression instead.
    let braceDepth = 0;
    for (let index = 0; index < start; index += 1) {
      if (output[index] === "\\") { index += 1; continue; }
      if (output[index] === "{") braceDepth += 1;
      else if (output[index] === "}") braceDepth = Math.max(0, braceDepth - 1);
    }
    if (braceDepth > 0) continue;
    let end = commandPattern.lastIndex;
    let cursor = end;
    const consumeGroup = () => {
      while (/[ \t]/.test(output[cursor] || "")) cursor += 1;
      const next = groupEnd(output, cursor);
      if (next === cursor) return false;
      cursor = next;
      return true;
    };
    if (/\\(?:dfrac|tfrac|frac)\b/.test(command[0])) {
      if (!consumeGroup() || !consumeGroup()) continue;
    } else if (/\\sqrt\b/.test(command[0])) {
      while (/[ \t]/.test(output[cursor] || "")) cursor += 1;
      if (output[cursor] === "[") {
        const close = output.indexOf("]", cursor + 1);
        if (close !== -1) cursor = close + 1;
      }
      consumeGroup();
    } else if (/\\(?:text|mathbb|mathrm|mathbf|mathcal|operatorname|overline|underline|overrightarrow|overleftarrow|overbrace|underbrace|vec|widehat|widetilde)\b/.test(command[0])) {
      consumeGroup();
    }
    while (true) {
      while (/[ \t]/.test(output[cursor] || "")) cursor += 1;
      if (output[cursor] !== "_" && output[cursor] !== "^") break;
      cursor += 1;
      while (/[ \t]/.test(output[cursor] || "")) cursor += 1;
      const next = output[cursor] === "{" ? groupEnd(output, cursor) : cursor + (/^[A-Za-z0-9]/.test(output[cursor] || "") ? 1 : 0);
      if (next === cursor) break;
      cursor = next;
    }
    end = Math.max(end, cursor);
    const functionCommand = /\\(?:sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp)\b/i.test(command[0]);
    if (output[end] === "(" && (/\\(?:sum|prod|int)\b/.test(command[0]) || functionCommand)) {
      let depth = 0;
      for (let index = end; index < output.length; index += 1) {
        if (output[index] === "(") depth += 1;
        else if (output[index] === ")" && --depth === 0) { end = index + 1; break; }
      }
    } else if (functionCommand && /^\\left\s*\(/.test(output.slice(end))) {
      const opening = output.slice(end).match(/^\\left\s*\(/)?.[0] || "";
      let depth = 0;
      for (let index = end + opening.length - 1; index < output.length; index += 1) {
        if (output[index] === "(") depth += 1;
        else if (output[index] === ")" && --depth === 0) {
          const right = /^\\right\s*\)/.exec(output.slice(index + 1));
          end = index + 1 + (right?.[0].length || 0);
          break;
        }
      }
    } else if (functionCommand && /\\(?:arcsin|arccos|arctan|csc)\b/i.test(command[0]) && /^[_^]\{?-?1\}?/.test(output.slice(end))) {
      const script = output.slice(end).match(/^[_^]\{?-?1\}?/);
      end += script?.[0].length || 0;
      if (/^[A-Za-z]/.test(output[end] || "")) end += 1;
    } else if (functionCommand && /\\(?:arcsin|arccos|arctan|csc)\b/i.test(command[0])
      && /[_^]\{?-?1\}?/.test(output.slice(start, end)) && /^[A-Za-z]/.test(output[end] || "")) {
      end += 1;
    } else if (functionCommand && /^\s+[A-Za-z](?![A-Za-z])/.test(output.slice(end))) {
      end += output.slice(end).match(/^\s+[A-Za-z]/)?.[0].length || 0;
    }
    // Keep an integral's integrand and differential together with its limits.
    // Without this, `\int_{0}^{1} \ln(x)\,dx` becomes three unrelated spans.
    if (/\\(?:int|oint)\b/.test(command[0])) {
      let cursor = end;
      while (/[ \t]/.test(output[cursor] || "")) cursor += 1;
      const integrandCommand = /\\(?:ln|log|sin|cos|tan|cot|sec|csc|exp|sqrt|frac|dfrac|tfrac)\b/.exec(output.slice(cursor));
      if (integrandCommand?.index === 0) {
        cursor += integrandCommand[0].length;
        while (/[ \t]/.test(output[cursor] || "")) cursor += 1;
        if (output[cursor] === "(") {
          let depth = 0;
          for (let index = cursor; index < output.length; index += 1) {
            if (output[index] === "(") depth += 1;
            else if (output[index] === ")" && --depth === 0) { cursor = index + 1; break; }
          }
        } else if (output[cursor] === "{") {
          cursor = groupEnd(output, cursor);
        } else if (/^[A-Za-z0-9]/.test(output[cursor] || "")) {
          cursor += 1;
        }
        const differential = /^[ \t]*(?:\\,)?d\s*[A-Za-z]/.exec(output.slice(cursor));
        if (differential) cursor += differential[0].length;
        end = cursor;
      }
    }
    const equationTail = /^[ \t]*(?:=|<|>)[ \t]*/.exec(output.slice(end));
    if (equationTail) {
      const tailStart = end + equationTail[0].length;
      const punctuation = output.slice(tailStart).search(/[;,!?]/);
      const tailEnd = punctuation < 0 ? output.length : tailStart + punctuation;
      const tail = output.slice(end, tailEnd);
      if (!/\b(?:and|as|because|from|if|is|are|or|since|so|the|then|therefore|when|where|which|with)\b/i.test(tail)) end = tailEnd;
    }
    insertions.push({ start, end });
    commandPattern.lastIndex = end;
  }
  for (const range of insertions.reverse()) {
    let end = range.end;
    while (end > range.start && /\s/.test(output[end - 1])) end -= 1;
    if (output[range.start - 1] === "$") continue;
    const separator = output[end] === "$" ? " " : "";
    output = `${output.slice(0, range.start)}$${output.slice(range.start, end)}$${separator}${output.slice(end)}`;
  }
  output = output.replace(/\b([A-Za-z][A-Za-z0-9]*)\s*([_^])\s*(\{(?:[^{}]|\{[^{}]*\})*\}|[A-Za-z0-9]+)/g, (match, variable, script, value, offset, source) => {
    const precedingDollars = (source.slice(0, offset).match(/(?<!\\)\$/g) || []).length;
    if (precedingDollars % 2 === 1) return match;
    if (source[offset - 1] === "$" || source[offset - 1] === "\\" || source[offset + match.length] === "$") return match;
    return `$${match.replace(/\s+/g, "")}$`;
  });
  if ((output.match(/\|/g) || []).length >= 2 && /\\[A-Za-z]+/.test(output)) {
    output = output.split("|").map((cell) => {
      const trimmed = cell.trim();
      if (!trimmed || trimmed.includes("$") || !/\\[A-Za-z]+/.test(trimmed)) return cell;
      const proseWords = trimmed.replace(/\\[A-Za-z]+/g, " ").replace(/[*_`]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
      if (proseWords.length > 2) return cell;
      const leading = cell.match(/^\s*/)?.[0] || "";
      const trailing = cell.match(/\s*$/)?.[0] || "";
      return `${leading}$${trimmed}$${trailing}`;
    }).join("|");
  }
  for (const item of visualTokens) output = output.replace(item.token, item.tag);
  return output;
}
function repairUnclosedMathDelimiters(value) {
  const tick = String.fromCharCode(96);
  const fence = tick.repeat(3);
  const fenced = new RegExp(`(${fence}[\\s\\S]*?${fence})`, "g");
  const hasTex = (text) => /\\(?:displaystyle|sum|prod|int|lim(?:sup|inf)?|sqrt|d?frac|tfrac|left|right|bigl|bigr|theta|alpha|beta|infty|to|cdot|times|pm|partial|boxed)\b/.test(text);
  const mathWords = (text) => text.replace(/\\[A-Za-z]+/g, " ").replace(/[{}_^]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
  const singleDollarCount = (text) => (text.match(/(?<!\\)(?<!\$)\$(?!\$)/g) || []).length;
  return String(value || "").split(fenced).map((block) => {
    if (block.startsWith(fence)) return block;
    return block.split("\n").map((line) => {
      if (!hasTex(line) || line.includes("$$") || line.includes(tick)) return line;
      if (/^\s*\|/.test(line)) {
        return line.split("|").map((cell) => {
          const trimmed = cell.trim();
          if (!trimmed || /^:?-{3,}:?$/.test(trimmed) || !hasTex(trimmed)) return cell;
          const dollars = singleDollarCount(trimmed);
          const unmarkedFormula = dollars === 0 && mathWords(trimmed).length <= 2 && /[=^_{}]/.test(trimmed);
          if (dollars % 2 !== 1 && !unmarkedFormula) return cell;
          const math = trimmed.replace(/(?<!\\)\$/g, "").trim();
          const leading = cell.match(/^\s*/)?.[0] || "";
          const trailing = cell.match(/\s*$/)?.[0] || "";
          return `${leading}$${math}$${trailing}`;
        }).join("|");
      }
      const dollars = singleDollarCount(line);
      if (dollars % 2 === 1) {
        const marker = line.search(/(?<!\\)\$(?!\$)/);
        const prefix = line.slice(0, marker);
        const expression = line.slice(marker + 1).replace(/(?<!\\)\$/g, "").trim();
        if (mathWords(expression).length <= 3) {
          return prefix.trim()
            ? `${prefix}$${expression}$`
            : `$$\n${expression}\n$$`;
        }
      }
      const trimmed = line.trim();
      const unmarkedFormula = dollars === 0 && /[=^_{}]/.test(trimmed)
        && mathWords(trimmed).length <= 2
        && (/^\\/.test(trimmed) || /^[A-Za-z0-9].*=/.test(trimmed));
      return unmarkedFormula ? `$$\n${trimmed}\n$$` : line;
    }).join("\n");
  }).join("");
}
function normalizeAssistantMarkup(value) {
  let source = repairUnclosedMathDelimiters(repairMalformedLatex(normalizePlotCodeSections(normalizeBareSvgBlocks(normalizeUnfencedMermaid(value)))))
    .replace(/\$\$\s*\$\$/g, "");
  // Stray delimiters inside piecewise/aligned blocks confuse remark-math and
  // can leave a raw environment in the page. The whole environment is wrapped
  // below; its internal dollar signs are never meaningful here.
  source = source.replace(/\\begin\s*\{\s*(cases|aligned)\s*\}[\s\S]*?\\end\s*\{\s*\1\s*\}/gi, (block) => block.replace(/\$/g, ""));
  const tick = String.fromCharCode(96);
  const codeFencePattern = new RegExp("(" + tick + "{3}[\\s\\S]*?" + tick + "{3})", "g");
  return source.split(codeFencePattern).map((block) => {
    if (block.startsWith(tick.repeat(3))) return block;
    return block.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part) => {
      if (part.startsWith("$")) return part;
      return part.split("\n").map((line) => {
        if (line.includes(tick)) return line;
        const repaired = repairMalformedLatex(line);
        const bareExpression = repaired.trim();
        const scriptWords = bareExpression.replace(/\\[A-Za-z]+/g, " ").replace(/[{}_^]/g, " ").match(/\b[A-Za-z]{3,}\b/g) || [];
        if (!bareExpression.includes("$") && /[_^]/.test(bareExpression) && isGraphEquationText(bareExpression)
          && scriptWords.length <= 3 && (/[=<>]/.test(bareExpression) || /^[A-Za-z0-9]+(?:[_^]\{?[^\s{}]+\}?)+$/.test(bareExpression))) {
          return bareExpression.length > 72 ? `$$\n${bareExpression}\n$$` : `$${bareExpression}$`;
        }
        if (isStandaloneLatexExpression(repaired)) return `$$\n${repaired.trim()}\n$$`;
        const wrappedLatex = wrapUnmarkedLatex(repaired);
        if (wrappedLatex !== repaired) return wrappedLatex;
        const standaloneLatex = /^\\+(?:boxed|d?frac|tfrac|sqrt|sum|prod|int|lim|left|begin|overline|underline|displaystyle)\b/.test(repaired.trim())
          && /[{}_^]/.test(repaired);
        if (standaloneLatex) return `$$\n${repaired.trim()}\n$$`;
        return isBareLatexEquation(repaired) ? "\$" + repaired + "\$" : escapeUnpairedMathDollar(repaired);
      }).join("\n");
    }).join("");
  }).join("");
}
function escapeUnpairedMathDollar(line) {
  const dollars = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "$") continue;
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) slashes += 1;
    if (slashes % 2) continue;
    if (line[index + 1] === "$") { index += 1; continue; }
    dollars.push(index);
  }
  if (dollars.length % 2 !== 1) return line;
  const index = dollars[dollars.length - 1];
  return line.slice(0, index) + "\\$" + line.slice(index + 1);
}
function parseMathFunction(source) {
  const raw = String(source || "").trim().replace(/^\$+|\$+$/g, "").trim();
  let title = "";
  let caption = "";
  const axisDomains = {};
  const points = [];
  const display = raw.split(/\r?\n/).map((line) => {
    const metadata = line.match(/^\s*(title|caption)\s*:\s*(.+)$/i);
    if (metadata) {
      if (metadata[1].toLowerCase() === "title") title ||= metadata[2].trim();
      else caption = metadata[2].trim();
      return "";
    }
    if (/^\s*(?:(?:open|hollow|excluded|closed|filled)[ -]point|hole|point)\s*:/i.test(line)) {
      const coordinates = line.match(/([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/i);
      if (coordinates) {
        const kind = line.match(/^\s*(open|hollow|excluded|closed|filled)[ -]point/i)?.[1]?.toLowerCase();
        points.push({ x: Number(coordinates[1]), y: Number(coordinates[2]), open: ["open", "hollow", "excluded"].includes(kind) || /^\s*hole\s*:/i.test(line) });
      }
      return "";
    }
    const titled = line.match(/^(.+?)\s*\|\s*(.+)$/);
    if (!titled) return line;
    title ||= titled[2].trim();
    return titled[1].trim();
  }).join("\n").trim();
  const axisLabels = { x: "x", y: "y" };
  const equationLines = display.split(/\r?\n/).map((line) => {
    const series = line.match(/^\s*series\s*:\s*(.+?)\s*=\s*(.+)$/i);
    if (series) {
      return { line: `y = ${series[2].trim()}`, label: series[1].trim() };
    }
    const axis = line.match(/^([xy])(?:-axis)?\s*:\s*(.+)$/i);
    if (axis) {
      axisLabels[axis[1].toLowerCase()] = axis[2].trim();
      return null;
    }
    const range = line.match(/^([xy])-range\s*:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d*)?|\.\d+))$/i);
    if (range) {
      axisDomains[range[1].toLowerCase()] = [Number(range[2]), Number(range[3])];
      return null;
    }
    return line.trim() ? { line, label: "" } : null;
  }).filter(Boolean);
  const allowedNames = new Set(["x", "y", "pi", "e", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "acot", "asec", "acsc", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "abs", "exp", "log", "ln", "sign", "floor", "ceil", "round", "min", "max", "mod", "cot", "sec", "csc"]);
  const functions = equationLines.map((row) => row.line.trim()).filter(Boolean).map((line, index) => {
    let expression = line;
    let outputLabel = "y";
    let fnType = "linear";
    const assignment = expression.match(/^(.+?)\s*=\s*(.+)$/);
    if (assignment) {
      const left = assignment[1].trim();
      const right = assignment[2].trim();
      if (/^y$/i.test(left) || /^[a-zA-Z][a-zA-Z0-9_]*\s*\(\s*x\s*\)$/i.test(left)) expression = right;
      else {
        expression = "(" + left + ")-(" + right + ")";
        fnType = "implicit";
      }
    }
    expression = expression
      .replace(/\basec\s*\(\s*sec\s*\(\s*x\s*\)\s*\)/gi, "acos(cos(x))")
      .replace(/\bacsc\s*\(\s*csc\s*\(\s*x\s*\)\s*\)/gi, "asin(sin(x))")
      .replace(/\\(?:left|right)\s*/g, "")
      .replace(/\bsgn\b/gi, "sign")
      .replace(/\b(?:arccosec(?:ant)?|acosec(?:ant)?)\b/gi, "acsc")
      .replace(/\b(?:cosecant|cosec)\s*\(/gi, "csc(")
      .replace(/\\cdot\b/g, "*")
      .replace(/\\pi\b/g, "pi")
      .replace(/\\(?:arcsin|arccos|arctan|arccot|arcsec|arccsc)\b/gi, (name) => ({ arcsin: "asin", arccos: "acos", arctan: "atan", arccot: "acot", arcsec: "asec", arccsc: "acsc" }[name.slice(1).toLowerCase()] || name))
      .replace(/\\(?:cdot|times)\b/g, "*")
      .replace(/\\div\b/g, "/")
      .replace(/\\(?:operatorname|mathrm)\s*\{([^{}]+)\}/g, "$1")
      .replace(/\\(?:d?frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "(($1)/($2))")
      .replace(/\\(lfloor|lceil)\s*([^\\]+?)\s*\\(rfloor|rceil)/g, (match, left, value) => (left === "lceil" ? "ceil(" : "floor(") + value + ")")
      .replace(/⌊([^⌋]+)⌋/g, "floor($1)")
      .replace(/⌈([^⌉]+)⌉/g, "ceil($1)")
      .replace(/\b(?:fractionalpart|fractional_part|fracpart|fract)\s*\(\s*x\s*\)/gi, "(x-floor(x))")
      .replace(/\bnthRoot\s*\(\s*x\s*,\s*3\s*\)/gi, "sign(x)*abs(x)^(1/3)")
      .replace(/\b(?:cbrt|cubeRoot)\s*\(\s*x\s*\)/gi, "sign(x)*abs(x)^(1/3)")
      .replace(/\bx\s*\^\s*\(\s*1\s*\/\s*3\s*\)/gi, "sign(x)*abs(x)^(1/3)")
      .replace(/\b(?:asin|arcsin)\b/gi, "asin")
      .replace(/\b(?:acos|arccos)\b/gi, "acos")
      .replace(/\b(?:atan|arctan)\b/gi, "atan")
      .replace(/\b(?:acot|arccot)\b/gi, "acot")
      .replace(/\b(?:asec|arcsec)\b/gi, "asec")
      .replace(/\b(?:acsc|arccsc)\b/gi, "acsc")
      .replace(/\\?(sin|cos|tan|cot|sec|csc|cosec)\s*\^\s*\{?-1\}?/gi, (_match, name) => ({ sin: "asin", cos: "acos", tan: "atan", cot: "acot", sec: "asec", csc: "acsc", cosec: "acsc" }[name.toLowerCase()]))
      .replace(/\bln\b/g, "log")
      .replace(/\|([^|]+)\|/g, "abs($1)")
      .replace(/π/g, "pi")
      .replace(/^\\?\{\s*x\s*\\?\}$/i, "(x-floor(x))")
      .replace(/²/g, "^2")
      .replace(/³/g, "^3")
      .replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)")
      .replace(/\b(cot|sec|csc)\s*\(\s*x\s*\)/gi, (_match, name) => ({ cot: "1/tan(x)", sec: "1/cos(x)", csc: "1/sin(x)" }[name.toLowerCase()]))
      .replace(/√\s*(\([^()]*\)|[a-zA-Z0-9.]+)/g, "sqrt($1)")
      .replace(/[×·]/g, "*")
      .replace(/[−–]/g, "-")
      .trim();
    const inverseFunction = expression.match(/^(asin|acos|atan|acot|asec|acsc)\s*\(\s*x\s*\)$/i)?.[1]?.toLowerCase() || "";
    expression = expression
      .replace(/\basec\s*\(\s*sec\s*\(\s*x\s*\)\s*\)/gi, "acos(cos(x))")
      .replace(/\bacsc\s*\(\s*csc\s*\(\s*x\s*\)\s*\)/gi, "asin(sin(x))")
      .replace(/\bacot\s*\(([^()]*)\)/gi, "(pi/2-atan($1))")
      // function-plot does not implement inverse secant/cosecant. Express
      // them using its supported inverse trig functions; invalid domains
      // naturally become gaps in the sampled curve.
      .replace(/\basec\s*\(([^()]*)\)/gi, "acos(1/($1))")
      .replace(/\bacsc\s*\(([^()]*)\)/gi, "asin(1/($1))");
    if (fnType !== "implicit") {
      const canonical = expression.replace(/\s+/g, "").toLowerCase();
      if (/^(?:floor\(x\))$/.test(canonical)) fnType = "step";
      else if (/^(?:ceil\(x\))$/.test(canonical)) fnType = "step-ceil";
      else if (/^(?:round\(x\))$/.test(canonical)) fnType = "step-round";
      else if (/^(?:sign\(x\))$/.test(canonical)) fnType = "sign";
      else if (/^(?:x-\(?floor\(x\)\)?)$/.test(canonical)) fnType = "fractional";
      expression = expression.replace(/\babs\s*\(([^()]*)\)/g, "sqrt(($1)^2)");
    }
    if (!expression || !/^[\w+\-*/^().,\s]+$/.test(expression)) throw new Error("Unsupported graph expression");
    const names = expression.match(/[a-zA-Z_][a-zA-Z_0-9]*/g) || [];
    const inputLabel = names.find((name) => !allowedNames.has(name.toLowerCase())) || "x";
    if (inputLabel !== "x") expression = expression.replace(new RegExp(`\\b${inputLabel}\\b`, "g"), "x");
    for (const name of expression.match(/[a-zA-Z_][a-zA-Z_0-9]*/g) || []) {
      if (!allowedNames.has(name.toLowerCase())) throw new Error("Unsupported graph function");
    }
    return { expression, inputLabel, outputLabel, display: equationLines[index]?.label || line, fnType, inverseFunction };
  });
  if (!functions.length && !points.length) throw new Error("Unsupported graph expression");
  const graphDisplay = title || equationLines.map((row) => row.line).join("\n") || points.map((point) => `(${point.x}, ${point.y})`).join(", ");
  return { ...(functions[0] || {}), expression: functions[0]?.expression || "", functions, points, display: graphDisplay, title, caption, axisLabels, axisDomains };
}
function normalizeMathGraphEquation(source) { return parseMathFunction(source); }
function extendGraphDomain(domain, points, pointsOnly = false) {
  if (!points.length) return domain;
  if (!pointsOnly && points.every((point) => point >= domain[0] && point <= domain[1])) return domain;
  let low = pointsOnly ? Math.min(0, ...points) : Math.min(domain[0], ...points);
  let high = pointsOnly ? Math.max(0, ...points) : Math.max(domain[1], ...points);
  if (pointsOnly && low === high) { low -= 1; high += 1; }
  const span = high - low;
  const padding = pointsOnly ? Math.max(span * 0.12, 0.2) : span * 0.08;
  low -= padding;
  high += padding;
  return pointsOnly ? [low, high] : [Math.min(domain[0], low), Math.max(domain[1], high)];
}
function textbookSquareDomains(xDomain, yDomain) {
  const span = Math.max(xDomain[1] - xDomain[0], yDomain[1] - yDomain[0]);
  const xCenter = (xDomain[0] + xDomain[1]) / 2;
  const yCenter = (yDomain[0] + yDomain[1]) / 2;
  return {
    x: [xCenter - span / 2, xCenter + span / 2],
    y: [yCenter - span / 2, yCenter + span / 2]
  };
}
function normalizeRaoultNotation(source) {
  return String(source || "")
    .replace(/P\s*_\s*A\s*\^\s*(?:\{\s*(?:\\(?:ast|star|last)|\*)\s*\}|\\(?:ast|star|last)|\*)/gi, "P_A^{\\circ}")
    .replace(/P\s*\*\s*_\s*A/gi, "P_A^{\\circ}");
}
function normalizeRaoultSvgNotation(source) {
  const purePressureTspans = `P<tspan baseline-shift="sub" font-size="12">A</tspan><tspan baseline-shift="super" font-size="12">°</tspan>`;
  return String(source || "")
    .replace(/\$?P\s*\/\s*P\s*_\s*A\s*\^\s*(?:\{\s*(?:\\(?:ast|star|last)|\*)\s*\}|\\(?:ast|star|last)|\*)\$?/gi, `P/P<tspan baseline-shift="sub" font-size="12">A</tspan><tspan baseline-shift="super" font-size="12">°</tspan>`)
    .replace(/\$?P\s*_\s*A\s*\^\s*(?:\{\s*(?:\\(?:ast|star|last)|\*)\s*\}|\\(?:ast|star|last)|\*)\$?/gi, purePressureTspans)
    .replace(/\$?P\s*\*\s*_\s*A\$?/gi, purePressureTspans);
}
const safeSvgElements = new Set(["svg", "g", "defs", "marker", "clippath", "lineargradient", "radialgradient", "stop", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc"]);
const safeSvgAttributes = {
  svg: ["xmlns", "viewbox", "x", "y", "width", "height", "preserveaspectratio", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule", "opacity", "transform", "font-size", "font-family", "text-anchor", "dominant-baseline", "style"],
  g: ["id", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule", "opacity", "transform"],
  defs: [],
  marker: ["id", "markerwidth", "markerheight", "refx", "refy", "orient", "viewbox", "fill", "stroke", "stroke-width"],
  clippath: ["id", "clippathunits"],
  lineargradient: ["id", "x1", "y1", "x2", "y2", "gradientunits"],
  radialgradient: ["id", "cx", "cy", "r", "fx", "fy", "gradientunits"],
  stop: ["offset", "stop-color", "stop-opacity"],
  path: ["id", "d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule", "opacity", "transform", "marker-end", "marker-start", "marker-mid", "clip-path"],
  rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width", "opacity", "transform"],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width", "opacity", "transform"],
  ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width", "opacity", "transform"],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width", "stroke-dasharray", "opacity", "transform"],
  polyline: ["points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "transform"],
  polygon: ["points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "transform"],
  text: ["x", "y", "fill", "stroke", "stroke-width", "font-size", "font-family", "text-anchor", "dominant-baseline", "opacity", "transform"],
  tspan: ["x", "y", "dx", "dy", "baseline-shift", "fill", "font-size", "font-family", "text-anchor"]
};
function parseSafeSvg(source) {
  const cleaned = normalizeRaoultSvgNotation(String(source || "").replace(/^\s*<\?xml[^>]*\?>\s*/i, ""));
  const hasSvgRoot = /^\s*<svg\b/i.test(cleaned);
  const markup = hasSvgRoot
    ? cleaned.replace(/<svg\b(?![^>]*\bxmlns\s*=)/i, '<svg xmlns="http://www.w3.org/2000/svg"')
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">${cleaned}</svg>`;
  try {
    const document = new DOMParser().parseFromString(markup, "image/svg+xml");
    const svg = document.documentElement;
    if (!svg || svg.localName.toLowerCase() !== "svg" || document.querySelector("parsererror")) return null;
    const cleanNode = (node) => {
      const tag = node.localName?.toLowerCase();
      const allowed = new Set(safeSvgAttributes[tag] || []);
      for (const attribute of [...(node.attributes || [])]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        const unsafeUrl = /url\s*\(/i.test(value) && !/^url\(\s*#[\w.-]+\s*\)$/i.test(value);
        const safeStyle = name !== "style" || tag === "svg" && /^background-color\s*:\s*white\s*;?$/i.test(value);
        if (!allowed.has(name) || name.startsWith("on") || unsafeUrl || /javascript\s*:/i.test(value) || !safeStyle) {
          node.removeAttribute(attribute.name);
        }
      }
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.localName.toLowerCase();
        if (child.namespaceURI !== "http://www.w3.org/2000/svg" || !safeSvgElements.has(tag)) {
          child.remove();
          continue;
        }
        cleanNode(child);
      }
    };
    cleanNode(svg);
    return svg;
  } catch {
    return null;
  }
}
function InlineSvgDiagram({ source }) {
  const svg = React.useMemo(() => parseSafeSvg(source), [source]);
  const containerRef = useRef(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !svg) return undefined;
    container.replaceChildren(document.importNode(svg, true));
    return () => container.replaceChildren();
  }, [svg]);
  if (!svg) {
    return React.createElement("pre", { className: "assistant-svg-fallback" },
      React.createElement("code", null, source));
  }
  return React.createElement("div", { ref: containerRef, className: "bg-white rounded-xl p-4 shadow-sm w-full overflow-x-auto flex flex-col items-center justify-center assistant-inline-svg chat-svg-container" });
}
function svgSourceFromCodeBlock(children) {
  const nodes = React.Children.toArray(children);
  const codeNode = nodes.find((node) => React.isValidElement(node) && (
    node.type === "code" || /(?:^|\s)language-(?:svg|xml)(?:\s|$)/i.test(node.props?.className || "")
  ));
  const source = codeNode ? String(codeNode.props.children ?? "").replace(/\n$/, "") : "";
  if (/<svg\b/i.test(source)) return source;
  const codeClass = codeNode?.props?.className || "";
  const svgFence = /(?:^|\s)language-(?:svg|xml)(?:\s|$)/i.test(codeClass);
  const svgElements = source.match(/<(?:g|defs|marker|rect|circle|ellipse|line|polyline|polygon|path|text|tspan)\b[^>]*>/gi) || [];
  const svgLike = svgElements.length >= 2 && /(?:x1=|y1=|cx=|viewBox=|text-anchor=|stroke=)/i.test(source);
  return (svgFence || svgLike) && svgElements.length
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">${source}</svg>`
    : "";
}
function CanvasGraph({ functions = [], points = [], xDomain = [-10, 10], yDomain = [-10, 10], title = "", caption = "", className = "math-graph" }) {
  const canvasRef = useRef(null);
  const viewRef = useRef({ x: [...xDomain], y: [...yDomain] });
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const [revision, setRevision] = useState(0);
  const expressions = React.useMemo(() => functions.map((item) => {
    const source = String(item.expression || item.fn || "").replace(/\bpi\b/gi, "Math.PI").replace(/\be\b/g, "Math.E");
    if (!/^[\w+\-*/^().,\s]*$/.test(source)) return null;
    const js = source.replace(/\^/g, "**").replace(/\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sqrt|abs|exp|log|floor|ceil|round|min|max|sign)\s*\(/gi, "Math.$1(");
    try { return { ...item, evaluate: new Function("x", "y", "t", `"use strict"; return (${js});`) }; } catch { return null; }
  }).filter(Boolean), [functions]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const w = rect.width, h = rect.height, view = viewRef.current;
    const [xmin, xmax] = view.x, [ymin, ymax] = view.y;
    const sx = (x) => (x - xmin) / (xmax - xmin) * w;
    const sy = (y) => h - (y - ymin) / (ymax - ymin) * h;
    context.clearRect(0, 0, w, h); context.fillStyle = "#fff"; context.fillRect(0, 0, w, h);
    const tickStep = (span, pixels) => { const rough = span / Math.max(2, pixels / 48); const power = 10 ** Math.floor(Math.log10(rough)); const unit = rough / power; return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power; };
    const fmt = (n) => Number(n.toPrecision(4)).toString();
    const gx = tickStep(xmax - xmin, w), gy = tickStep(ymax - ymin, h);
    context.lineWidth = 1; context.strokeStyle = "#e8edf3"; context.fillStyle = "#64748b"; context.font = "11px DM Sans, sans-serif";
    for (let x = Math.ceil(xmin / gx) * gx; x <= xmax; x += gx) { const px = sx(x); context.beginPath(); context.moveTo(px, 0); context.lineTo(px, h); context.stroke(); }
    for (let y = Math.ceil(ymin / gy) * gy; y <= ymax; y += gy) { const py = sy(y); context.beginPath(); context.moveTo(0, py); context.lineTo(w, py); context.stroke(); }
    const axisY = ymin <= 0 && ymax >= 0 ? sy(0) : null, axisX = xmin <= 0 && xmax >= 0 ? sx(0) : null;
    context.strokeStyle = "#334155"; context.lineWidth = 1.35;
    if (axisY !== null) { context.beginPath(); context.moveTo(0, axisY); context.lineTo(w, axisY); context.stroke(); }
    if (axisX !== null) { context.beginPath(); context.moveTo(axisX, 0); context.lineTo(axisX, h); context.stroke(); }
    // Tick labels stay clipped inside the square viewport: x below its axis, y left of its axis.
    context.fillStyle = "#475569"; context.textBaseline = "top";
    for (let x = Math.ceil(xmin / gx) * gx; x <= xmax; x += gx) { const px = sx(x); context.textAlign = "center"; context.fillText(fmt(x), Math.max(14, Math.min(w - 14, px)), Math.max(3, Math.min(h - 16, axisY === null ? h - 18 : axisY + 4))); }
    context.textBaseline = "middle";
    for (let y = Math.ceil(ymin / gy) * gy; y <= ymax; y += gy) { const py = sy(y); context.textAlign = "right"; context.fillText(fmt(y), Math.max(28, Math.min(w - 4, axisX === null ? 34 : axisX - 5)), Math.max(8, Math.min(h - 8, py))); }
    const palette = ["#4f46e5", "#0891b2", "#db2777", "#16a34a", "#d97706", "#7c3aed"];
    expressions.forEach((fn, index) => {
      const graphColor = fn.color || (fn.fnType === "step" ? "#15803d" : fn.fnType === "fractional" ? "#2563eb" : palette[index % palette.length]);
      context.strokeStyle = graphColor; context.lineWidth = 2.2; context.lineJoin = "round"; context.lineCap = "round"; context.beginPath();
      if (fn.fnType === "implicit" || fn.type === "implicit") {
        const step = 3;
        const valueAt = (px, py) => { try { return Number(fn.evaluate(xmin + px / w * (xmax - xmin), ymax - py / h * (ymax - ymin), 0)); } catch { return NaN; } };
        for (let py = 0; py < h; py += step) for (let px = 0; px < w; px += step) {
          const corners = [[px,py],[px+step,py],[px+step,py+step],[px,py+step]].map(([cx,cy]) => ({ x:cx, y:cy, v:valueAt(cx,cy) }));
          if (corners.some((point) => !Number.isFinite(point.v))) continue;
          const crossings = [];
          for (let edge = 0; edge < 4; edge += 1) {
            const a = corners[edge], b = corners[(edge + 1) % 4];
            if ((a.v < 0) === (b.v < 0)) continue;
            const t = a.v / (a.v - b.v); crossings.push([a.x + t * (b.x-a.x), a.y + t * (b.y-a.y)]);
          }
          for (let n = 0; n + 1 < crossings.length; n += 2) { context.moveTo(...crossings[n]); context.lineTo(...crossings[n+1]); }
        }
        context.stroke(); return;
      }
      // Render discontinuous integer functions as exact unit segments. Sampling
      // a discontinuity can otherwise smear endpoints or create false bridges.
      if (fn.fnType === "step" || fn.fnType === "fractional") {
        const firstInteger = Math.floor(xmin) - 1;
        const lastInteger = Math.ceil(xmax) + 1;
        const intervalCount = Math.max(1, lastInteger - firstInteger + 1);
        const integerStride = Math.max(1, Math.ceil(intervalCount / Math.max(1, w * 1.5)));
        context.beginPath();
        for (let n = firstInteger; n <= lastInteger; n += integerStride) {
          const x0 = Math.max(xmin, n), x1 = Math.min(xmax, n + 1);
          if (x1 < x0) continue;
          const y0 = fn.fnType === "step" ? n : x0 - n;
          const y1 = fn.fnType === "step" ? n : x1 - n;
          context.moveTo(sx(x0), sy(y0));
          context.lineTo(sx(x1), sy(y1));
        }
        context.stroke();
        if (fn.fnType === "fractional" && ymin <= 1 && ymax >= 1) {
          context.save(); context.strokeStyle = graphColor; context.globalAlpha = 0.52; context.lineWidth = 1.4; context.setLineDash([5, 5]);
          context.beginPath(); context.moveTo(0, sy(1)); context.lineTo(w, sy(1)); context.stroke(); context.restore();
        }
        const drawEndpoint = (x, y, open) => {
          if (x < xmin || x > xmax || y < ymin || y > ymax) return;
          context.beginPath(); context.arc(sx(x), sy(y), 4.2, 0, Math.PI * 2);
          context.fillStyle = open ? "#fff" : graphColor; context.fill(); context.lineWidth = 1.8; context.strokeStyle = graphColor; context.stroke();
        };
        for (let n = firstInteger; n <= lastInteger; n += integerStride) {
          if (fn.fnType === "step") { drawEndpoint(n, n, false); drawEndpoint(n + 1, n, true); }
          else { drawEndpoint(n, 0, false); drawEndpoint(n + 1, 1, true); }
        }
        return;
      }
      let drawing = false, lastY = null, lastValue = null;
      const stepLike = ["step", "step-ceil", "step-round", "sign", "fractional"].includes(fn.fnType);
      const count = Math.max(500, Math.min(2200, Math.round(w * 2.2)));
      for (let i = 0; i <= count; i++) {
        const x = xmin + (xmax - xmin) * i / count;
        let y;
        try { y = Number(fn.evaluate(x, 0, x)); } catch { y = NaN; }
        const py = sy(y);
        if (!Number.isFinite(y) || !Number.isFinite(py) || py < -h * 3 || py > h * 4 || (lastY !== null && (Math.abs(py - lastY) > h * 0.8 || (stepLike && lastValue !== null && Math.abs(y - lastValue) > 0.45)))) { drawing = false; lastY = null; lastValue = null; continue; }
        const px = sx(x); if (!drawing) { context.moveTo(px, py); drawing = true; } else context.lineTo(px, py); lastY = py; lastValue = y;
      }
      context.stroke();
    });
    const parametric = points.filter((point) => point?.graphLine);
    if (parametric.length > 1) { context.beginPath(); context.strokeStyle = parametric[0].color || palette[0]; context.lineWidth = 2.2; context.lineJoin = "round"; parametric.forEach((point,index) => { const px=sx(Number(point.x)),py=sy(Number(point.y)); if(index) context.lineTo(px,py); else context.moveTo(px,py); }); context.stroke(); }
    points.forEach((raw, index) => { const p = Array.isArray(raw) ? { x: raw[0], y: raw[1] } : raw; if (p?.graphLine || !Number.isFinite(Number(p?.x)) || !Number.isFinite(Number(p?.y))) return; const px = sx(Number(p.x)), py = sy(Number(p.y)); context.beginPath(); context.arc(px, py, 5, 0, Math.PI * 2); context.fillStyle = p.open || p.hollow || p.filled === false ? "#fff" : p.color || palette[index % palette.length]; context.fill(); context.lineWidth = 2; context.strokeStyle = p.color || palette[index % palette.length]; context.stroke(); });
  }, [expressions, points, revision]);
  useEffect(() => { const canvas = canvasRef.current; if (!canvas || typeof ResizeObserver === "undefined") return; const observer = new ResizeObserver(() => setRevision((value) => value + 1)); observer.observe(canvas); return () => observer.disconnect(); }, []);
  const pointerDown = (event) => { event.currentTarget.setPointerCapture(event.pointerId); pointersRef.current.set(event.pointerId, { x:event.clientX, y:event.clientY }); if (pointersRef.current.size >= 2) { const pair = [...pointersRef.current.values()].slice(0,2); pinchRef.current = { distance:Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y), center:{x:(pair[0].x+pair[1].x)/2,y:(pair[0].y+pair[1].y)/2}, domain:{x:[...viewRef.current.x],y:[...viewRef.current.y]} }; dragRef.current = null; } else dragRef.current = { x:event.clientX, y:event.clientY, domain:{x:[...viewRef.current.x],y:[...viewRef.current.y]} }; };
  const pointerMove = (event) => { if (!pointersRef.current.has(event.pointerId)) return; pointersRef.current.set(event.pointerId,{x:event.clientX,y:event.clientY}); const rect=event.currentTarget.getBoundingClientRect(); if (pointersRef.current.size >= 2 && pinchRef.current) { const pair=[...pointersRef.current.values()].slice(0,2), distance=Math.max(1,Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)), center={x:(pair[0].x+pair[1].x)/2,y:(pair[0].y+pair[1].y)/2}, base=pinchRef.current, factor=base.distance/distance, px=(center.x-rect.left)/rect.width, py=1-(center.y-rect.top)/rect.height; const zoom=(domain,anchor,fraction)=>{const point=domain[0]+fraction*(domain[1]-domain[0]), span=(domain[1]-domain[0])*factor;return[point-fraction*span,point+(1-fraction)*span];}; viewRef.current={x:zoom(base.domain.x,0,px),y:zoom(base.domain.y,0,py)}; setRevision((value)=>value+1); return; } const drag=dragRef.current; if(!drag)return;const dx=(event.clientX-drag.x)/rect.width*(drag.domain.x[1]-drag.domain.x[0]),dy=(event.clientY-drag.y)/rect.height*(drag.domain.y[1]-drag.domain.y[0]);viewRef.current={x:drag.domain.x.map((v)=>v-dx),y:drag.domain.y.map((v)=>v+dy)};setRevision((value)=>value+1); };
  const pointerUp = (event) => { pointersRef.current.delete(event.pointerId); pinchRef.current = null; dragRef.current = null; };
  const wheel = (event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const factor = Math.exp(Math.max(-1, Math.min(1, event.deltaY * 0.001))); const px = (event.clientX - rect.left) / rect.width, py = 1 - (event.clientY - rect.top) / rect.height; const view = viewRef.current; const zoom = (domain, point, fraction) => { const anchor = domain[0] + point * (domain[1] - domain[0]); const span = (domain[1] - domain[0]) * factor; return [anchor - fraction * span, anchor + (1 - fraction) * span]; }; viewRef.current = { x: zoom(view.x, px, px), y: zoom(view.y, py, py) }; setRevision((value) => value + 1); };
  const initial = () => { viewRef.current = { x: [...xDomain], y: [...yDomain] }; setRevision((value) => value + 1); };
  return React.createElement("figure", { className: `${className}-frame`, "aria-label": title || "Interactive graph" }, title && React.createElement("div", { className: "math-graph-heading" }, React.createElement("strong", null, React.createElement(MathText, { children: title }))), React.createElement("canvas", { ref: canvasRef, className: "interactive-graph-canvas", role: "img", "aria-label": title || "Interactive graph", onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp, onPointerCancel: pointerUp, onWheel: wheel, onDoubleClick: initial, style: { touchAction: "none" } }), caption && React.createElement("figcaption", { className: "math-graph-caption" }, React.createElement(MathText, { children: caption })));
}
function MathGraph({ source, title: suppliedTitle = "" }) {
  const graph = React.useMemo(() => { try { return parseMathFunction(source); } catch { return null; } }, [source]);
  if (!graph) return React.createElement("div", { className: "math-graph-error", role: "status" }, "Graph could not be rendered.");
  let title = suppliedTitle || graph.title || graph.functions.map((fn) => fn.display || `y = ${fn.expression}`).join(", ");
  if (graph.functions.length === 1) title = (graph.functions[0].display || `y = ${graph.functions[0].expression}`)
    .replace(/\s*=\s*/g, " = ")
    .replace(/(?<=[\w)}])\s*\*\s*(?=[\w({])/g, " \\cdot ")
    .replace(/(?<!\\)\b(sin|cos|tan|ln|log)\b/g, "\\$1");
  const trig = graph.functions.some((fn) => /\b(?:sin|cos|tan)\s*\(/i.test(fn.expression));
  const implicit = graph.functions.some((fn) => fn.fnType === "implicit");
  return React.createElement(CanvasGraph, {
    title,
    caption: graph.caption,
    functions: graph.functions.map((fn) => ({ expression: fn.expression, display: fn.display, fnType: fn.fnType })),
    points: graph.points.map((point) => ({ ...point, open: point.open })),
    xDomain: graph.axisDomains.x || (trig ? [-2 * Math.PI, 2 * Math.PI] : implicit ? [-5, 5] : graph.functions.some((fn) => fn.fnType === "fractional") ? [-1.5, 3.9] : graph.functions.some((fn) => fn.fnType === "step") ? [-2.5, 4.5] : [-10, 10]),
    yDomain: graph.axisDomains.y || (trig ? [-2, 2] : implicit ? [-5, 5] : graph.functions.some((fn) => fn.fnType === "fractional") ? [-0.15, 1.15] : graph.functions.some((fn) => fn.fnType === "step") ? [-2.5, 3.5] : [-10, 10])
  });
}
function safeScientificGraphConfig(parsedConfig = {}) {
  const source = parsedConfig && typeof parsedConfig === "object" && !Array.isArray(parsedConfig) ? parsedConfig : {};
  const pointPair = (point) => {
    if (Array.isArray(point) && point.length >= 2) {
      const x = Number(point[0]);
      const y = Number(point[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    }
    if (point && typeof point === "object") {
      const x = Number(point.x);
      const y = Number(point.y);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    }
    return null;
  };
  const axisConfig = (name) => {
    const axis = source[`${name}Axis`] || source.axes?.[name] || {};
    if (Object.keys(axis).length) return axis;
    const legacyDomain = name === "x" ? source.domain : source.range;
    const labels = source.labels || {};
    return {
      label: labels[name] || labels[name === "x" ? "horizontal" : "vertical"] || "",
      ...(Array.isArray(legacyDomain) ? { domain: legacyDomain } : {})
    };
  };
  const safeAxis = (axis) => {
    const sourceAxis = axis && typeof axis === "object" && !Array.isArray(axis) ? axis : {};
    const domain = Array.isArray(sourceAxis.domain) && sourceAxis.domain.length === 2
      && sourceAxis.domain.every((value) => Number.isFinite(Number(value))) && Number(sourceAxis.domain[0]) !== Number(sourceAxis.domain[1])
      ? sourceAxis.domain.map(Number)
      : Number.isFinite(Number(sourceAxis.min)) && Number.isFinite(Number(sourceAxis.max)) && Number(sourceAxis.min) !== Number(sourceAxis.max)
        ? [Number(sourceAxis.min), Number(sourceAxis.max)]
        : null;
    return { ...sourceAxis, label: typeof sourceAxis.label === "string" ? sanitizeLatexForDisplay(sourceAxis.label) : "", domain };
  };
  const rawData = Array.isArray(source.data) ? source.data
    : source.data && typeof source.data === "object" ? [source.data]
      : [];
  const data = rawData.flatMap((rawItem) => {
    if (Array.isArray(rawItem)) {
      const point = pointPair(rawItem);
      return point ? [{ points: [point], graphType: source.type === "line" ? "polyline" : "scatter" }] : [];
    }
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return rawItem;
    const item = { ...rawItem };
    if (typeof item.function === "string" && item.fn === undefined) item.fn = item.function;
    if (Array.isArray(item.x) && Array.isArray(item.y)) {
      const points = item.x.slice(0, 1000).map((x, index) => pointPair([x, item.y[index]])).filter(Boolean);
      const mode = String(item.mode || "").toLowerCase();
      const graphType = item.graphType || (mode.includes("line") || source.type === "line" || item.type === "line" ? "polyline" : "scatter");
      if (points.length) return [{ ...item, points, graphType }];
      return [];
    }
    if (Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)) && item.fn === undefined && item.points === undefined) {
      return [{ ...item, points: [[Number(item.x), Number(item.y)]], graphType: source.type === "line" ? "polyline" : "scatter" }];
    }
    if (Array.isArray(item.points)) {
      item.points = item.points.map(pointPair).filter(Boolean);
      if (!item.points.length) return [];
    }
    if (typeof item.fn === "string") {
      const fn = item.fn.trim();
      if (fn.includes("=")) {
        const [left, ...rightParts] = fn.split("=");
        const right = rightParts.join("=");
        item.fn = `(${left.trim()})-(${right.trim()})`;
        item.fnType = "implicit";
      } else {
        item.fn = fn;
      }
    }
    return [item];
  });
  const pointSeries = (points, graphType = "scatter", color, closed = false) => {
    const normalized = (Array.isArray(points) ? points : []).map(pointPair).filter(Boolean).slice(0, 1000);
    return normalized.length ? [{ points: normalized, graphType, ...(color ? { color } : {}), ...(closed ? { closed: true } : {}) }] : [];
  };
  const isLineGraph = ["line", "polyline"].includes(String(source.type || "").toLowerCase());
  if (Array.isArray(source.points)) data.push(...pointSeries(source.points, isLineGraph ? "polyline" : "scatter"));
  const legacyLines = Array.isArray(source.polylines) ? source.polylines : Array.isArray(source.lines) ? source.lines : [];
  for (const line of legacyLines.slice(0, 30)) {
    if (Array.isArray(line)) data.push(...pointSeries(line, "polyline"));
    else if (line && typeof line === "object") {
      if (Array.isArray(line.points)) data.push(...pointSeries(line.points, "polyline", line.color, line.closed === true));
      else if (typeof line.fn === "string") data.push({ ...line });
    }
  }
  if (isLineGraph && data.length > 1 && data.every((item) => Array.isArray(item.points) && item.points.length === 1)) {
    data.splice(0, data.length, { points: data.flatMap((item) => item.points), graphType: "polyline" });
  }
  const hasRaoult = rawData.some((item) => {
    if (typeof item?.fn !== "string") return false;
    const probe = item.fn.replace(/\\text\s*\{([^{}]+)\}/gi, "$1").replace(/[{}]/g, "");
    return /P[_\s]*total|P[_\s]*A[^=]*x.*P[_\s]*B/i.test(probe);
  });
  const xAxis = safeAxis(axisConfig("x"));
  const yAxis = safeAxis(axisConfig("y"));
  return {
    ...source,
    title: typeof source.title === "string" && source.title.trim() ? sanitizeLatexForDisplay(source.title)
      : typeof source.name === "string" && source.name.trim() ? sanitizeLatexForDisplay(source.name) : "Scientific Graph",
    xAxis: xAxis.domain ? xAxis : { ...xAxis, domain: hasRaoult ? [0, 1] : null },
    yAxis,
    annotations: Array.isArray(source.annotations) ? source.annotations : [],
    data,
    colors: Array.isArray(source.colors) ? source.colors.filter((color) => typeof color === "string" && color.trim()) : [],
    points: Array.isArray(source.points) ? source.points.map(pointPair).filter(Boolean) : []
  };
}
function raoultScientificGraph(rawText) {
  if (!/raoult|vapou?r pressure|x[_\s]*A|P[_\s]*A/i.test(rawText)) return null;
  const pressure = (component, fallback) => {
    const pattern = new RegExp(`P[_\\s]*${component}[^\\n,}]{0,32}?(?:[:=]\\s*|\\s+)(\\d+(?:\\.\\d+)?)`, "i");
    const value = Number(rawText.match(pattern)?.[1]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const pureA = pressure("A", 100);
  const pureB = pressure("B", 40);
  return safeScientificGraphConfig({
    title: "Vapor Pressure Diagram (Ideal Solution)",
    xAxis: { label: "Mole fraction of component A (x_A)", domain: [0, 1] },
    yAxis: { label: "Vapor pressure (kPa)", domain: [0, Math.ceil(Math.max(pureA, pureB) * 1.1 / 10) * 10] },
    data: [
      { fn: `${pureA}*x`, color: "#2563eb", label: "Partial pressure of A" },
      { fn: `${pureB}*(1-x)`, color: "#dc2626", label: "Partial pressure of B" },
      { fn: `${pureB}+(${pureA}-${pureB})*x`, color: "#16a34a", label: "Total vapor pressure" }
    ],
    annotations: [
      { x: 0, y: pureB, text: `P_B° = ${pureB} kPa`, color: "#dc2626" },
      { x: 1, y: pureA, text: `P_A° = ${pureA} kPa`, color: "#2563eb" }
    ]
  });
}
function cleanScientificGraphJson(rawString) {
  const rawText = String(rawString ?? "").replace(/^\uFEFF/, "").trim()
    .replace(/^```(?:json|scientific-plot)?\s*/i, "").replace(/\s*```$/, "").trim();
  // Ignore a short model preamble or trailing note while preserving quoted
  // braces inside titles, labels, and function expressions.
  const candidates = [rawText];
  for (let start = 0; start < rawText.length; start += 1) {
    if (rawText[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < rawText.length; index += 1) {
      const character = rawText[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') { quoted = true; continue; }
      if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        candidates.push(rawText.slice(start, index + 1));
        break;
      }
    }
  }
  const stripTrailingCommas = (source) => {
    let output = "";
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        output += character;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') { quoted = true; output += character; continue; }
      if (character === ",") {
        let next = index + 1;
        while (/\s/.test(source[next] || "")) next += 1;
        if (source[next] === "}" || source[next] === "]") continue;
      }
      output += character;
    }
    return output;
  };
  for (const candidate of candidates) {
    try {
      let parsedConfig = JSON.parse(stripTrailingCommas(candidate));
      if (typeof parsedConfig === "string") parsedConfig = JSON.parse(parsedConfig);
      if (!parsedConfig || typeof parsedConfig !== "object" || Array.isArray(parsedConfig)) continue;
      const config = safeScientificGraphConfig(parsedConfig);
      if (config.data.some((item) => typeof item.fn === "string" && /P[_\s]*total|P[_\s]*A|P[_\s]*B|x[_\s]*A/i.test(item.fn))) {
        return raoultScientificGraph(rawText) || config;
      }
      if (config.data.length) return config;
    } catch { /* Try the next complete object. */ }
  }
  // Recover the common ideal-binary-solution plot when a model's JSON is
  // truncated or malformed. The screenshot example supplies 100 kPa and
  // 40 kPa; use those only as defaults when the payload omits both values.
  const recoveredRaoult = raoultScientificGraph(rawText);
  if (recoveredRaoult) return recoveredRaoult;
  throw new Error("Expected a valid scientific graph JSON object");
}
function isScientificGraphJson(rawString) {
  try {
    const config = cleanScientificGraphJson(rawString);
    return Boolean(config.data.length && (
      config.xAxis?.label || config.yAxis?.label || config.title !== "Scientific Graph"
      || ["scatter", "line", "polyline", "svg"].includes(String(config.type || "").toLowerCase())
    ));
  } catch {
    return false;
  }
}
function looksLikeScientificGraphPayload(rawString) {
  const source = String(rawString || "");
  return /"(?:data|points|polylines|lines)"\s*:/.test(source)
    && (/"type"\s*:\s*"(?:scatter|line|polyline|svg)"/i.test(source)
      || /"(?:xAxis|yAxis|axes|domain|range|labels)"\s*:/i.test(source)
      || /"function"\s*:/i.test(source));
}
function ScientificGraph({ config: suppliedConfig = {}, rawString }) {
  const parsed = useMemo(() => {
    if (rawString === undefined) return { config: safeScientificGraphConfig(suppliedConfig), error: "" };
    try { return { config: cleanScientificGraphJson(rawString), error: "" }; }
    catch { return { config: {}, error: "Graph could not be rendered." }; }
  }, [rawString, rawString === undefined ? suppliedConfig : null]);
  const config = parsed.config;
  if (parsed.error) return React.createElement("div", { className: "math-graph-error", role: "status" }, parsed.error);
  const functions = [], points = [];
  (config.data || []).forEach((item, index) => {
    if (typeof item.fn === "string") {
      let expression = item.fn;
      let fnType = item.fnType || item.type;
      try { const parsedFunction = parseMathFunction(expression); expression = parsedFunction.expression || expression; fnType ||= parsedFunction.fnType; } catch {}
      functions.push({ expression, fnType, color: item.color || config.colors?.[index] });
    }
    else if ((item.fnType === "parametric" || item.type === "parametric") && item.fn && typeof item.fn.x === "string" && typeof item.fn.y === "string") {
      const range = Array.isArray(item.range) && item.range.length === 2 ? item.range.map(Number) : [0, 2 * Math.PI];
      const compile = (source) => {
        let expression = source.replace(/\bpi\b/gi, "Math.PI").replace(/\be\b/g, "Math.E").replace(/\^/g, "**");
        expression = expression.replace(/\b(sin|cos|tan|sqrt|abs|exp|log|floor|ceil|round|min|max)\s*\(/gi, "Math.$1(");
        if (!/^[\w+\-*/^().,\s]*$/.test(source)) return null;
        try { return new Function("t", `"use strict"; return (${expression});`); } catch { return null; }
      };
      const fx = compile(item.fn.x), fy = compile(item.fn.y);
      if (fx && fy && range.every(Number.isFinite) && range[1] > range[0]) {
        const curve = [];
        for (let i = 0; i <= 900; i += 1) { const t = range[0] + (range[1] - range[0]) * i / 900; try { const x = Number(fx(t)), y = Number(fy(t)); if (Number.isFinite(x) && Number.isFinite(y)) curve.push([x,y]); } catch {} }
        if (curve.length > 1) points.push(...curve.map(([x,y]) => ({x,y,color:item.color || config.colors?.[index], graphLine:true})));
      }
    }
    else if (Array.isArray(item.points)) item.points.forEach((point) => {
      const graphLine = ["polyline", "line"].includes(String(item.graphType || item.mode || "").toLowerCase());
      if (Array.isArray(point)) points.push({ x: Number(point[0]), y: Number(point[1]), color: item.color, graphLine });
      else if (point && typeof point === "object") points.push({ ...point, color: point.color || item.color, graphLine: point.graphLine || graphLine });
    });
  });
  (config.points || []).forEach((point) => points.push(point));
  const infer = (axis, coordinate) => {
    if (axis?.domain) return axis.domain;
    const values = points.map((point) => Number(point[coordinate])).filter(Number.isFinite);
    if (!values.length) {
      if (functions.some((fn) => fn.fnType === "implicit")) return [-5, 5];
      if (functions.some((fn) => /\b(?:sin|cos|tan)\s*\(/i.test(fn.expression))) return [-2 * Math.PI, 2 * Math.PI];
      return [-10, 10];
    }
    let low = Math.min(...values), high = Math.max(...values); if (low === high) { low -= 1; high += 1; }
    const pad = (high - low) * 0.12; return [low - pad, high + pad];
  };
  let title = config.title && config.title !== "Scientific Graph" ? config.title : functions.map((fn) => `y = ${fn.expression}`).join(", ");
  if (functions.length === 1 && !String(title).includes("=")) title = `y = ${functions[0].expression}`;
  if (functions.length === 1) title = String(title).replace(/(?<!\\)\b(sin|cos|tan|ln|log)\b/g, "\\$1");
  return React.createElement(CanvasGraph, { title, functions, points, xDomain: infer(config.xAxis, "x"), yDomain: infer(config.yAxis, "y"), className: "scientific-graph" });
}
function SmilesRenderer({ smiles }) {
  const [svg, setSvg] = useState("");
  const value = String(smiles || "").trim();
  useEffect(() => {
    let active = true;
    setSvg("");
    if (!value) return undefined;
    getRDKitModule().then((RDKit) => {
      if (!active) return;
      const molecule = RDKit.get_mol(value);
      if (!molecule) return;
      try { setSvg(molecule.get_svg()); }
      finally { molecule.delete(); }
    }).catch(() => {});
    return () => { active = false; };
  }, [value]);
  if (!svg) return null;
  return React.createElement("figure", { className: "smiles-renderer", role: "img", "aria-label": `Molecular structure for ${value}` },
    React.createElement("div", { className: "smiles-renderer-svg", dangerouslySetInnerHTML: { __html: svg } })
  );
}
function MermaidDiagram({ source }) {
  const [result, setResult] = useState({ svg: "", error: false });
  useEffect(() => {
    let active = true;
    const id = `apex-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const diagram = normalizeLegacyXYChart(source);
    setResult({ svg: "", error: false });
    Promise.resolve().then(async () => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
      try {
        return await mermaid.render(id, diagram);
      } catch (error) {
        if (/^xychart(?:-beta)?\b/i.test(diagram)) {
          const compatible = diagram.replace(/^xychart(?:-beta)?\b/i, (header) => header.toLowerCase() === "xychart" ? "xychart-beta" : "xychart");
          return mermaid.render(`${id}-compat`, compatible);
        }
        throw error;
      }
    }).then((output) => {
      if (!output || typeof output.svg !== "string" || !output.svg.includes("<svg")) throw new Error("Mermaid returned no SVG");
      if (active) setResult({ svg: output.svg, error: false });
    }).catch(() => { if (active) setResult({ svg: "", error: true }); });
    return () => { active = false; };
  }, [source]);
  if (result.error) return React.createElement("div", { className: "assistant-mermaid assistant-mermaid-fallback", role: "status" }, "This flowchart could not be rendered. Check the diagram syntax and try again.");
  if (!result.svg) return React.createElement("div", { className: "assistant-mermaid assistant-mermaid-loading", role: "status" }, "Rendering diagram…");
  return React.createElement("div", { className: "bg-white rounded-xl p-4 shadow-sm text-black w-full overflow-x-auto flex flex-col items-center justify-center assistant-mermaid", dangerouslySetInnerHTML: { __html: result.svg } });
}
MermaidDiagram.displayName = "MermaidDiagram";
class MarkdownRenderBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      const fallback = String(this.props.source ?? "")
        .replace(/^\s{0,3}#{1,6}\s*/gm, "")
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
        .replace(/`+/g, "")
        .replace(/^\s*[-*+]\s+/gm, "• ")
        .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
        .replace(/\|/g, "  ·  ")
        .replace(/\$+/g, "")
        .replace(/[ \t]{2,}/g, " ");
      return React.createElement("p", { className: "math-render-fallback" }, fallback);
    }
    return this.props.children;
  }
}
function normalizeAssistantMarkdownHeadings(value) {
  const tick = String.fromCharCode(96);
  const fence = tick.repeat(3);
  const protectedMarkdown = new RegExp(`(${fence}[\\s\\S]*?(?:${fence}|$)|~~~[\\s\\S]*?(?:~~~|$)|\\$\\$[\\s\\S]*?\\$\\$|\\$[^$\\n]+\\$)`, "g");
  return String(value ?? "").split(protectedMarkdown).map((part, index) => {
    if (index % 2) return part;
    return part
      .replace(/^\s*#{1,6}\s*$/gm, "")
      .replace(/([^\n])\s+(#{1,6})\s*(?=\S)/g, "$1\n\n$2 ")
      .replace(/(^|\n)[ \t]*(#{1,6})[ \t]*(?=\S)/gm, "$1\n\n$2 ")
      .replace(/^(#{1,6} [^\n]+)$/gm, "$1\n\n");
  }).join("");
}
function repairUnmarkedMathNotation(value) {
  const protectedPattern = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;
  return String(value || "").split(protectedPattern).map((part, index) => {
    if (index % 2) return part;
    let output = part.replace(/\\{2,}(?=(?:left|right|lfloor|rfloor|lceil|rceil)\b)/g, "\\");
    output = output
      .replace(/\\(?:left\s*\\)?lfloor\s*([^\\\n$]+?)\s*\\(?:right\s*\\)?rfloor/g, (_match, body) => `$\\left\\lfloor ${body.trim()}\\right\\rfloor$`)
      .replace(/\\(?:left\s*\\)?lceil\s*([^\\\n$]+?)\s*\\(?:right\s*\\)?rceil/g, (_match, body) => `$\\left\\lceil ${body.trim()}\\right\\rceil$`);
    // Keep common powers as math even when a model leaves them unmarked in a
    // heading or sentence. Code, existing formulas, and inline code are held
    // out by the protected split above.
    output = output.replace(/\b([A-Za-z])\s*\^\s*(\{\s*[+-]?\d+\s*\}|[+-]?\d+)(?![A-Za-z0-9])/g, (_match, variable, exponent) => `$${variable}^{${exponent.replace(/[{}\s]/g, "")}}$`);
    return output;
  }).join("");
}
function normalizeInlineMathDelimiters(value) {
  const tick = String.fromCharCode(96);
  const protectedPattern = new RegExp(`(${tick}{3}[\\s\\S]*?(?:${tick}{3}|$)|${tick}[^${tick}\\n]*${tick})`, "g");
  const balance = (formula) => {
    let output = "", round = 0, square = 0, curly = 0;
    for (let i = 0; i < formula.length; i += 1) {
      const ch = formula[i];
      let slashes = 0; for (let j = i - 1; j >= 0 && formula[j] === "\\\\"; j -= 1) slashes += 1;
      if (slashes % 2) { output += ch; continue; }
      if (ch === "(") round += 1;
      else if (ch === ")") { if (!round) continue; round -= 1; }
      else if (ch === "[") square += 1;
      else if (ch === "]") { if (!square) continue; square -= 1; }
      else if (ch === "{") curly += 1;
      else if (ch === "}") { if (!curly) continue; curly -= 1; }
      output += ch;
    }
    return output + ")".repeat(round) + "]".repeat(square) + "}".repeat(curly);
  };
  return String(value || "").split(protectedPattern).map((block, index) => {
    if (index % 2) return block;
    block = block.split("\n").map((line) => {
      const first = line.indexOf("$$");
      if (first < 0) return line;
      const tokens = line.match(/\$\$/g) || [];
      const last = line.lastIndexOf("$$");
      const midSentence = Boolean(line.slice(0, first).trim() || line.slice(last + 2).trim());
      if (!midSentence && tokens.length % 2 === 0) return line;
      let repaired = line.replace(/\$\$/g, "$");
      const dollars = (repaired.match(/(?<!\\)\$/g) || []).length;
      if (dollars % 2) repaired += "$";
      return repaired;
    }).join("\n");
    return block
      .replace(/\$\$([^$\n]+)\$\$(?=\s+\S)/g, (whole, formula, offset, source) => /\S/.test(source.slice(0, offset).split("\n").pop() || "") ? `$${formula}$` : whole)
      .replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (math) => {
        const display = math.startsWith("$$");
        const body = math.slice(display ? 2 : 1, display ? -2 : -1);
        const repaired = balance(body)
          .replace(/\\(sin|cos|tan|ln|log|lim|exp)(?=[A-Za-z])/g, "\\$1 ")
          .replace(/\b(sin|cos|tan|ln|log)(?=x\b)/gi, "\\$1 x");
        return display ? `$$${repaired}$$` : `$${repaired}$`;
      })
      .replace(/([A-Za-z0-9])(\$[^$\n]+\$)/g, "$1 $2")
      .replace(/(\$[^$\n]+\$)([A-Za-z0-9])/g, "$1 $2");
  }).join("");
}
function MathText({ children, className = "", legacy = false, components = {} }) {
  // Run every content source through the same delimiter and Markdown repair
  // first. This repairs stray `$$` markers, escaped math, and compacted
  // headings before the rendering pass; it preserves TeX commands for KaTeX.
  const text = normalizeInlineMathDelimiters(normalizeAssistantMarkdownHeadings(sanitizeLatexOutput(repairUnmarkedMathNotation(String(children ?? "")))));
  const stripMathComments = (value) => String(value || "").replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (math) => math.replace(/%/g, ""));
  let source;
  try {
    const preparedText = prepareAssistantMath(text);
    const correctedText = normalizeRaoultNotation(stripMathComments(preparedText));
    const normalized = legacy ? repairLegacyMath(correctedText) : correctedText;
    // Apply the same raw-TeX wrapper to each prose span while leaving explicit
    // math and code untouched. This also handles prose that contains a
    // wrapped formula plus an unwrapped root or fraction nearby.
    const proseAware = normalized.split(/(\x60{3}[\s\S]*?(?:\x60{3}|$)|~~~[\s\S]*?(?:~~~|$)|\x60[^\x60\n]*\x60|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)
      .map((part, index) => index % 2 ? repairMalformedLatex(part) : normalizeAssistantMarkup(part))
      .join("");
    // Keep ordinary function parentheses at their authored size. Only promote
    // genuinely long equations to a display line, where fractions can breathe.
    const tableGuard = protectGfmTableBlocks(proseAware);
    const markedMath = tableGuard.restore(promoteLongInlineEquations(tableGuard.source));
    // Keep code and math source intact; convert any unsupported/raw command
    // residue in ordinary prose to readable text without damaging formulas.
    source = markedMath.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part) => {
      if (part.startsWith("```") || part.startsWith("$")) return part;
      return part;
    }).join("");
  } catch {
    // Preserve prose verbatim if an optional normalization step fails.
    source = String(text ?? "");
  }
  // Preflight the exact Markdown that will reach remark-math. Any TeX left in
  // prose gets one final normalization pass before the first render.
  if (containsUnrenderedLatex(source)) {
    const repaired = normalizeAssistantMarkup(repairMalformedLatex(source));
    if (repaired !== source) source = repaired;
  }
  const [recoveredSource, setRecoveredSource] = useState({ original: null, value: null });
  const renderedSource = recoveredSource.original === source ? recoveredSource.value : source;
  const recoveryAttemptsRef = useRef({ source: null, count: 0 });
  const renderRootRef = useRef(null);
  useLayoutEffect(() => {
    const root = renderRootRef.current;
    if (!root) return void 0;
    if (recoveryAttemptsRef.current.source !== source) recoveryAttemptsRef.current = { source, count: 0 };
    // Verify the DOM after KaTeX has run. Raw TeX outside a `.katex` node, or
    // a KaTeX parse error, gets one more pass through the shared repairer.
    const hasUnrenderedLatex = () => {
      if (root.querySelector(".katex-error")) return true;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) {
        const parent = textNode.parentElement;
        if (!parent || parent.closest(".katex, code, pre, script, style")) continue;
        if (containsUnrenderedLatex(textNode.nodeValue || "")) return true;
      }
      return false;
    };
    if (hasUnrenderedLatex() && recoveryAttemptsRef.current.count < 2) {
      recoveryAttemptsRef.current.count += 1;
      const repaired = normalizeAssistantMarkup(repairMalformedLatex(renderedSource));
      if (repaired !== renderedSource) setRecoveredSource({ original: source, value: repaired });
    }
    const observed = new WeakSet();
    const measure = () => {
      root.querySelectorAll(".katex-display").forEach((node) => {
        const formula = node.querySelector(":scope > .katex");
        const available = node.clientWidth;
        if (!formula || !available) return;
        formula.style.removeProperty("--math-fit-scale");
        const naturalWidth = Math.max(formula.scrollWidth, formula.getBoundingClientRect().width);
        const scale = naturalWidth > available ? (available - 4) / naturalWidth : 1;
        const canFit = scale >= 0.68;
        node.dataset.fitted = String(canFit && scale < 0.98);
        node.dataset.overflowing = String(!canFit && naturalWidth > available + 2);
        if (canFit && scale < 0.98) formula.style.setProperty("--math-fit-scale", String(scale));
      });
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const observeMath = () => {
      if (!resizeObserver) return;
      root.querySelectorAll(".katex-display, .katex").forEach((node) => {
        if (observed.has(node)) return;
        observed.add(node);
        resizeObserver.observe(node);
      });
    };
    observeMath();
    resizeObserver?.observe(root);
    measure();
    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      observeMath();
      measure();
    });
    mutationObserver?.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    document.fonts?.ready?.then(measure);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [source, renderedSource]);
  const markdown = React.createElement(ReactMarkdown, {
    remarkPlugins: [remarkMath, remarkGfm],
    remarkRehypeOptions: { allowDangerousHtml: true },
    rehypePlugins: [rehypeRaw, [rehypeSanitize, safeSvgSchema], [rehypeKatex, { throwOnError: false, errorColor: "inherit", strict: "ignore" }]],
    components: {
      table: ({ children: tableChildren, ...props }) => /* @__PURE__ */ jsx("div", {
        className: "math-table-scroll",
        children: /* @__PURE__ */ jsx("table", { ...props, children: tableChildren }, void 0, false, { fileName: "math-markdown.js", lineNumber: 38, columnNumber: 17 }, this)
      }, void 0, false, { fileName: "math-markdown.js", lineNumber: 37, columnNumber: 7 }, this),
      ...components,
      svg: ({ node, ...props }) => {
        const safeStyle = typeof props.style === "string" && /^background-color\s*:\s*white\s*;?$/i.test(props.style)
          ? { backgroundColor: "white" }
          : props.style;
        // KaTeX uses small, absolutely positioned SVGs for radical hooks and
        // stretchy symbols. Wrapping them in a diagram container breaks their
        // coordinates; inline SVGs can inherit the surrounding math layout.
        return React.createElement("svg", { ...props, style: safeStyle });
      },
      pre: (props) => {
        const svgSource = svgSourceFromCodeBlock(props.children);
        if (svgSource) return React.createElement(InlineSvgDiagram, { source: svgSource });
        const hasVisualBlock = React.Children.toArray(props.children).some((child) => {
          const classes = child?.props?.className?.split(/\s+/) || [];
          return classes.includes("language-mermaid") || classes.includes("language-math-graph") || classes.includes("language-plot") || classes.includes("language-scientific-plot") || classes.includes("language-plot-data");
        });
        const visualComponent = React.Children.toArray(props.children).some((child) => child?.type === InlineSvgDiagram || child?.type === MathGraph || child?.type === ScientificGraph || child?.type === MermaidDiagram || child?.props?.className?.includes("assistant-latex-rendered"));
        if (hasVisualBlock || visualComponent) return React.createElement(React.Fragment, null, props.children);
        if (components.pre) return components.pre(props);
        return React.createElement("pre", props, props.children);
      },
      code: (props) => {
        const className = props.className || "";
        const plotTitle = String(props.meta || props.node?.meta || props.node?.data?.meta || "").match(/\|\s*(.+)$/)?.[1]?.trim() || "";
        const codeSource = String(props.children ?? "").replace(/\n$/, "");
        const graphJson = /(?:^|\s)language-(?:json|scientific-plot)(?:\s|$)/i.test(className)
          ? isScientificGraphJson(codeSource) || looksLikeScientificGraphPayload(codeSource)
          : !className && isScientificGraphJson(codeSource);
        if (className.split(/\s+/).some((name) => ["language-scientific-plot", "language-plot-data"].includes(name)) || graphJson) {
          return React.createElement(ScientificGraph, { rawString: codeSource });
        }
        const mermaidFence = /(?:^|\s)language-(?:mermaid|flowchart|diagram)(?:\s|$)/i.test(className);
        const mermaidSource = /^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|mindmap|timeline|pie|quadrantChart|gitGraph|xychart(?:-beta)?)\b/i.test(codeSource);
        if (mermaidFence || (mermaidSource && !/(?:^|\s)language-(?:json|js|javascript|ts|typescript|css|html|svg|xml|python|bash|sh)(?:\s|$)/i.test(className))) {
          return React.createElement(MermaidDiagram, { source: codeSource });
        }
        const mathLanguage = className.split(/\s+/).some((name) => /^(?:language-)?(?:latex|tex|math)$/.test(name));
        const latexEnvironment = /\\+begin\s*\{(?:cases|aligned|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}/i.test(codeSource)
          && /\\+end\s*\{(?:cases|aligned|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}/i.test(codeSource);
        const unlabelledMath = (!className || className.split(/\s+/).includes("language-plaintext"))
          && isStandaloneLatexExpression(codeSource);
        if (mathLanguage || unlabelledMath || latexEnvironment) {
          const formula = repairMalformedLatex(codeSource.trim()).replace(/^\$+|\$+$/g, "");
          const displayMath = mathLanguage || latexEnvironment;
          return React.createElement("span", { className: "assistant-latex-rendered" }, React.createElement(MathText, { children: displayMath ? `$$\n${formula}\n$$` : `$${formula}$` }));
        }
        if (!className && /^(?:y\s*=|[a-zA-Z][a-zA-Z0-9_]*\s*\(\s*x\s*\)\s*=)/i.test(codeSource.trim())) {
          try {
            parseMathFunction(codeSource);
            return React.createElement(MathGraph, { source: codeSource });
          } catch { /* Render ordinary code when it is not a supported graph expression. */ }
        }
        if (!className && isBareLatexEquation(codeSource)) {
          const formula = repairMalformedLatex(codeSource);
          return React.createElement("span", { className: "assistant-repaired-inline-math", children: React.createElement(MathText, { children: "$" + formula + "$" }) });
        }
        const svgFence = /(?:^|\s)language-(?:svg|xml)(?:\s|$)/i.test(className);
        const hasSvgMarkup = /<svg\b/i.test(codeSource) || (svgFence && /<(?:g|defs|marker|rect|circle|ellipse|line|polyline|polygon|path|text|tspan)\b/i.test(codeSource));
        if (hasSvgMarkup) {
          return React.createElement(InlineSvgDiagram, { source: codeSource });
        }
        if (className.split(/\s+/).some((name) => name === "language-math-graph" || name === "language-plot")) {
          return React.createElement(MathGraph, { source: codeSource || plotTitle, title: plotTitle });
        }
        if (className.split(/\s+/).includes("language-mermaid")) {
          return React.createElement(MermaidDiagram, { source: codeSource });
        }
        if (components.code) return components.code(props);
        return React.createElement("code", { ...props, className: `assistant-markdown-code ${className}`.trim() }, props.children);
      }
    },
    children: renderedSource
  });
  return React.createElement("div", { ref: renderRootRef, className: `math-render-root ${className}`.trim() },
    React.createElement(MarkdownRenderBoundary, { key: renderedSource, source: renderedSource }, markdown));
}

const MemoizedMathText = React.memo(MathText);
export {
  MemoizedMathText as default,
  MemoizedMathText as MathText,
  MathGraph,
  CanvasGraph,
  ScientificGraph,
  SmilesRenderer,
  normalizeAssistantMarkup,
  normalizeUnfencedMermaid,
  normalizeMathGraphEquation
};
