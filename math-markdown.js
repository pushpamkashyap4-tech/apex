import { jsx } from "react/jsx-runtime";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import functionPlot from "function-plot";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { normalizeMathMarkup, prepareAssistantMath, protectGfmTableBlocks, sanitizeLatexForDisplay, sanitizeLatexOutput } from "./recall-math.js";
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
    const isLong = formula.length >= 72 || (formula.length >= 44 && fractionCount >= 2);
    return isLong ? `\n\n$$\n${formula}\n$$\n\n` : part;
  }).join("");
}
function repairMalformedLatex(value) {
  let repaired = String(value || "")
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
      || (/^[A-Za-z_][\w.-]*\b/.test(text)
        && (/(?:-->|---|-.->|==>|--o|--x|<--|<-->|-\.-|\|[^|]*\|)/.test(text)
          || /\[[^\]]*\]|\([^()\n]*\)|\{[^{}\n]*\}/.test(text)));
  };
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
          body.push(lines[cursor].trim());
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
  if (output.includes("$")) {
    for (const item of visualTokens) output = output.replace(item.token, item.tag);
    return output;
  }
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
  const commandPattern = /\\(?:displaystyle|textstyle|dfrac|tfrac|frac|sqrt|sum|prod|int|oint|lim|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|theta|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|infty|cdot|times|pm|mp|circ|degree|Delta|Sigma|partial|nabla|text|mathbb|mathrm|mathbf|mathcal|operatorname|overline|underline|overrightarrow|overleftarrow|overbrace|underbrace|vec|widehat|widetilde|lvert|rvert|langle|rangle|leq|geq|neq|approx|equiv|rightarrow|Rightarrow)\b/g;
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
    if (output[end] === "(" && /\\(?:sum|prod|int)\b/.test(command[0])) {
      const close = output.indexOf(")", end + 1);
      if (close !== -1) end = close + 1;
    }
    insertions.push({ start, end });
    commandPattern.lastIndex = end;
  }
  for (const range of insertions.reverse()) {
    if (output[range.start - 1] === "$" || output[range.end] === "$") continue;
    output = `${output.slice(0, range.start)}$${output.slice(range.start, range.end)}$${output.slice(range.end)}`;
  }
  output = output.replace(/\b([A-Za-z][A-Za-z0-9]*)\s*([_^])\s*(\{(?:[^{}]|\{[^{}]*\})*\}|[A-Za-z0-9]+)/g, (match, variable, script, value, offset, source) => {
    if (source[offset - 1] === "$" || source[offset + match.length] === "$") return match;
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
      .replace(/\\(?:left|right)\s*/g, "")
      .replace(/\bsgn\b/gi, "sign")
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
      .replace(/\\?(sin|cos|tan)\s*\^\s*\{?-1\}?/gi, (match, name) => ({ sin: "asin", cos: "acos", tan: "atan" }[name.toLowerCase()]))
      .replace(/\bln\b/g, "log")
      .replace(/\|([^|]+)\|/g, "abs($1)")
      .replace(/π/g, "pi")
      .replace(/²/g, "^2")
      .replace(/³/g, "^3")
      .replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)")
      .replace(/\b(cot|sec|csc)\s*\(\s*x\s*\)/gi, (_match, name) => ({ cot: "1/tan(x)", sec: "1/cos(x)", csc: "1/sin(x)" }[name.toLowerCase()]))
      .replace(/√\s*(\([^()]*\)|[a-zA-Z0-9.]+)/g, "sqrt($1)")
      .replace(/[×·]/g, "*")
      .replace(/[−–]/g, "-")
      .trim();
    const inverseFunction = expression.match(/^(asin|acos|atan|acot|asec|acsc)\s*\(\s*x\s*\)$/i)?.[1]?.toLowerCase() || "";
    expression = expression.replace(/\bacot\s*\(([^()]*)\)/gi, "(pi/2-atan($1))");
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
function MathGraph({ source, title: suppliedTitle = "" }) {
  const targetRef = useRef(null);
  const axisDomainsRef = useRef({ x: [-10, 10], y: [-10, 10] });
  const [tapCoordinates, setTapCoordinates] = useState(null);
  const [fallback, setFallback] = useState(false);
  const graph = React.useMemo(() => {
    try { return parseMathFunction(source); } catch { return ""; }
  }, [source, suppliedTitle]);
  const expression = graph?.expression || "";
  const hasGraph = Boolean(expression || graph?.points?.length);
  const legendEntries = [
    ...(graph?.functions || []).map((fn, index) => ({ type: "function", fn, index })),
    ...(graph?.points?.some((point) => !point.open) ? [{ type: "point", open: false }] : []),
    ...(graph?.points?.some((point) => point.open) ? [{ type: "point", open: true }] : [])
  ];
  useEffect(() => {
    let active = true;
    let resizeObserver;
    const target = targetRef.current;
    setFallback(!hasGraph);
    if (!target || !hasGraph) return undefined;
    const render = () => {
      const plotFn = typeof functionPlot === "function" ? functionPlot : functionPlot.default;
      try {
        const availableWidth = target.clientWidth || target.getBoundingClientRect().width || 450;
        const width = Math.max(240, Math.min(720, Math.floor(availableWidth)));
        const height = 350;
        const tangentFunctions = graph.functions.filter((fn) => /^(?:tan\s*\(\s*x\s*\)|1\s*\/\s*(?:tan|sin|cos)\s*\(\s*x\s*\))$/i.test(fn.expression.replace(/\s+/g, "")));
        const inverseKinds = [...new Set(graph.functions.map((fn) => fn.inverseFunction).filter(Boolean))];
        const inverseTrigFunctions = inverseKinds.length > 0;
        const trigInputAxis = graph.functions.some((fn) => !fn.inverseFunction && (/\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(fn.expression) || /\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(fn.display)));
        const pointsOnly = graph.functions.length === 0;
        const periodicTrig = graph.functions.some((fn) => /\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(fn.display) || /\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(fn.expression));
        const stepKinds = graph.functions.map((fn) => fn.fnType);
        const logarithmic = graph.functions.some((fn) => /^(?:log|ln)\s*\(/i.test(fn.display) || /^(?:log|ln)\s*\(/i.test(fn.expression));
        const exponential = graph.functions.some((fn) => /^exp\s*\(\s*x\s*\)$/i.test(fn.expression) || /e\s*\^\s*x/i.test(fn.display));
        const signGraph = stepKinds.includes("sign");
        const fractionalGraph = stepKinds.includes("fractional");
        const inverseYDomains = {
          asin: [-Math.PI / 2 - 0.4, Math.PI / 2 + 0.4],
          acos: [-0.4, Math.PI + 0.4],
          atan: [-Math.PI / 2 - 0.5, Math.PI / 2 + 0.5],
          acot: [-0.5, Math.PI + 0.5],
          asec: [-0.5, Math.PI + 0.5],
          acsc: [-Math.PI / 2 - 0.5, Math.PI / 2 + 0.5]
        };
        const inverseXDomain = inverseKinds.some((name) => name === "asin" || name === "acos") ? [-1.25, 1.25]
          : inverseKinds.some((name) => name === "asec" || name === "acsc") ? [-6, 6] : [-8, 8];
        const inverseYDomain = inverseKinds.length
          ? [Math.min(...inverseKinds.map((name) => inverseYDomains[name][0])), Math.max(...inverseKinds.map((name) => inverseYDomains[name][1]))]
          : [-10, 10];
        const defaultXDomain = inverseTrigFunctions ? inverseXDomain : periodicTrig ? [-2 * Math.PI, 2 * Math.PI]
          : logarithmic ? [-1, 10] : exponential ? [-4, 4]
            : signGraph || fractionalGraph || stepKinds.some((kind) => ["step", "step-ceil", "step-round"].includes(kind)) ? [-5, 5] : [-10, 10];
        const defaultYDomain = inverseTrigFunctions ? inverseYDomain : signGraph ? [-2, 2] : fractionalGraph ? [-0.5, 1.5]
          : periodicTrig ? (tangentFunctions.length ? [-6, 6] : [-2, 2])
            : logarithmic ? [-4, 4] : exponential ? [-1, 12]
              : stepKinds.some((kind) => ["step", "step-ceil", "step-round"].includes(kind)) ? [-5, 5] : defaultXDomain;
        const xDomain = graph.axisDomains.x || (pointsOnly ? extendGraphDomain(defaultXDomain, graph.points.map((point) => point.x), true) : defaultXDomain);
        const yDomain = graph.axisDomains.y || (pointsOnly ? extendGraphDomain(defaultYDomain, graph.points.map((point) => point.y), true) : defaultYDomain);
        const squareDomains = textbookSquareDomains(xDomain, yDomain);
        const preserveAxisDomains = inverseTrigFunctions || periodicTrig || logarithmic || exponential || signGraph || fractionalGraph || stepKinds.some((kind) => ["step", "step-ceil", "step-round"].includes(kind)) || Boolean(graph.axisDomains.x || graph.axisDomains.y);
        const initialXDomain = preserveAxisDomains ? xDomain : squareDomains.x;
        const initialYDomain = preserveAxisDomains ? yDomain : squareDomains.y;
        axisDomainsRef.current = { x: initialXDomain, y: initialYDomain };
        const colors = GRAPH_COLORS;
        const buildGraphData = (currentXDomain) => {
          const data = graph.functions.flatMap((fn, index) => {
          const color = colors[index % colors.length];
          if (fn.inverseFunction) {
            if (fn.inverseFunction === "asec" || fn.inverseFunction === "acsc") {
              return [[currentXDomain[0], Math.min(currentXDomain[1], -1)], [Math.max(currentXDomain[0], 1), currentXDomain[1]]].flatMap(([left, right]) => {
                if (right <= left) return [];
                const count = Math.max(120, Math.min(360, Math.floor(width * 0.5)));
                const samples = Array.from({ length: count + 1 }, (_, sample) => {
                  const x = left + (right - left) * sample / count;
                  return [x, fn.inverseFunction === "asec" ? Math.acos(1 / x) : Math.asin(1 / x)];
                });
                return [{ points: samples, fnType: "points", graphType: "polyline", color }];
              });
            }
            const samples = [];
            const sampleCount = Math.max(180, Math.min(480, Math.floor(width * 0.65)));
            for (let sample = 0; sample <= sampleCount; sample += 1) {
              const x = currentXDomain[0] + (currentXDomain[1] - currentXDomain[0]) * sample / sampleCount;
              if ((fn.inverseFunction === "asin" || fn.inverseFunction === "acos") && (x < -1 || x > 1)) continue;
              const y = fn.inverseFunction === "asin" ? Math.asin(x)
                : fn.inverseFunction === "acos" ? Math.acos(x)
                : fn.inverseFunction === "atan" ? Math.atan(x)
                  : Math.PI / 2 - Math.atan(x);
              if (Number.isFinite(y)) samples.push([x, y]);
            }
            return samples.length > 1
              ? [{ points: samples, fnType: "points", graphType: "polyline", color }]
              : [];
          }
          if (["step", "step-ceil", "step-round", "fractional"].includes(fn.fnType)) {
            const segments = [];
            const start = fn.fnType === "step-round" ? Math.floor(currentXDomain[0] - 0.5) : Math.floor(currentXDomain[0]);
            const end = Math.ceil(currentXDomain[1]);
            for (let value = start; value < end; value += 1) {
              if (fn.fnType === "step-round") {
                segments.push({ fn: String(value), range: [Math.max(currentXDomain[0], value - 0.5 + 1e-4), Math.min(currentXDomain[1], value + 0.5 - 1e-4)], color, graphType: "polyline", sampler: "builtIn" });
              } else if (fn.fnType === "step-ceil") {
                segments.push({ fn: String(value + 1), range: [Math.max(currentXDomain[0], value + 1e-4), Math.min(currentXDomain[1], value + 1)], color, graphType: "polyline", sampler: "builtIn" });
              } else if (fn.fnType === "fractional") {
                segments.push({ fn: "x-(" + value + ")", range: [Math.max(currentXDomain[0], value), Math.min(currentXDomain[1], value + 1 - 1e-4)], color, graphType: "polyline", sampler: "builtIn" });
              } else {
                segments.push({ fn: String(value), range: [Math.max(currentXDomain[0], value), Math.min(currentXDomain[1], value + 1 - 1e-4)], color, graphType: "polyline", sampler: "builtIn" });
              }
            }
            return segments.filter((segment) => segment.range[1] > segment.range[0]);
          }
          if (fn.fnType === "sign") {
            const branches = [];
            if (currentXDomain[0] < 0) branches.push({ fn: "-1", range: [currentXDomain[0], Math.min(currentXDomain[1], -1e-4)], color, graphType: "polyline", sampler: "builtIn" });
            if (currentXDomain[1] > 0) branches.push({ fn: "1", range: [Math.max(currentXDomain[0], 1e-4), currentXDomain[1]], color, graphType: "polyline", sampler: "builtIn" });
            if (currentXDomain[0] <= 0 && currentXDomain[1] >= 0) branches.push(
              { points: [[0, 0]], fnType: "points", graphType: "scatter", color, attr: { class: "graph scatter graph-filled-point", r: 6 } },
              { points: [[0, 1], [0, -1]], fnType: "points", graphType: "scatter", color, attr: { class: "graph scatter graph-open-point", r: 6 } }
            );
            return branches.filter((branch) => !branch.range || branch.range[1] > branch.range[0]);
          }
          if (/^tan\s*\(\s*x\s*\)$/i.test(fn.expression.replace(/\s+/g, ""))) {
            const poles = [];
            const firstPole = Math.ceil((currentXDomain[0] - Math.PI / 2) / Math.PI);
            const lastPole = Math.floor((currentXDomain[1] - Math.PI / 2) / Math.PI);
            for (let k = firstPole; k <= lastPole; k += 1) {
              const pole = Math.PI / 2 + k * Math.PI;
              if (pole > currentXDomain[0] && pole < currentXDomain[1]) poles.push(pole);
            }
            const bounds = [currentXDomain[0], ...poles, currentXDomain[1]];
            return bounds.slice(0, -1).map((left, index) => ({
              fn: fn.expression,
              range: [left + 0.035, bounds[index + 1] - 0.035],
              color,
              graphType: "polyline",
              sampler: "builtIn"
            }));
          }
          if (/^1\s*\/\s*x(?:\s*\^\s*2)?$/i.test(fn.expression.replace(/\s+/g, "")) && currentXDomain[0] < 0 && currentXDomain[1] > 0) {
            return [
              { fn: fn.expression, range: [currentXDomain[0], -1e-3], color, graphType: "polyline", sampler: "builtIn" },
              { fn: fn.expression, range: [1e-3, currentXDomain[1]], color, graphType: "polyline", sampler: "builtIn" }
            ];
          }
          const reciprocalTrig = fn.expression.replace(/\s+/g, "").toLowerCase().match(/^1\/(tan|sin|cos)\(x\)$/)?.[1];
          if (reciprocalTrig) {
            const poles = [];
            const offset = reciprocalTrig === "cos" ? Math.PI / 2 : 0;
            const firstPole = Math.ceil((currentXDomain[0] - offset) / Math.PI);
            const lastPole = Math.floor((currentXDomain[1] - offset) / Math.PI);
            for (let k = firstPole; k <= lastPole; k += 1) {
              const pole = reciprocalTrig === "cos" ? Math.PI / 2 + k * Math.PI : k * Math.PI;
              if (pole > currentXDomain[0] && pole < currentXDomain[1]) poles.push(pole);
            }
            const bounds = [currentXDomain[0], ...poles, currentXDomain[1]];
            return bounds.slice(0, -1).map((left, index) => ({
              fn: fn.expression,
              range: [left + 0.035, bounds[index + 1] - 0.035],
              color,
              graphType: "polyline",
              sampler: "builtIn"
            }));
          }
          return [{ fn: fn.expression, fnType: fn.fnType || "linear", graphType: "polyline", sampler: "builtIn", color }];
          });
          graph.points.forEach((point) => {
          const pointClass = point.open ? "graph scatter graph-open-point" : "graph scatter graph-filled-point";
          data.push({
            points: [[point.x, point.y]],
            fnType: "points",
            graphType: "scatter",
            color: "#4f46e5",
            attr: { class: pointClass }
          });
          });
          return data;
        };
        const data = buildGraphData(initialXDomain);
        target.replaceChildren();
        const chart = plotFn({
          target,
          width,
          height,
          margin: { left: 62, right: 14, top: 14, bottom: 54 },
          grid: true,
          disableZoom: false,
          tip: {
            xLine: true,
            yLine: true,
            renderer: (x, y) => `x: ${Number(x).toFixed(2)}, y: ${Number(y).toFixed(2)}`
          },
          xAxis: { domain: initialXDomain, label: graph.axisLabels.x, ...(trigInputAxis ? { ticks: piTicks(initialXDomain).length, tickValues: piTicks(initialXDomain), tickFormat: formatPiTick } : {}) },
          yAxis: { domain: initialYDomain, label: graph.axisLabels.y, ...(inverseTrigFunctions ? { ticks: piTicks(initialYDomain).length, tickValues: piTicks(initialYDomain), tickFormat: formatPiTick } : {}) },
          data
        });
        chart?.meta?.xAxis?.ticks?.(Math.max(4, Math.floor(width / 62)));
        chart?.meta?.yAxis?.ticks?.(Math.max(4, Math.floor(height / 48)));
        if (trigInputAxis) setRadianTicks(chart?.meta?.xAxis, initialXDomain);
        if (inverseTrigFunctions) setRadianTicks(chart?.meta?.yAxis, initialYDomain);
        chart?.build?.();
        const resegmentOnZoom = graph.functions.some((fn) => Boolean(fn.inverseFunction)
          || ["step", "step-ceil", "step-round", "fractional", "sign"].includes(fn.fnType)
          || /^tan\s*\(\s*x\s*\)$/i.test(fn.expression.replace(/\s+/g, ""))
          || /^1\s*\/\s*(?:x(?:\s*\^\s*2)?|(?:tan|sin|cos)\(x\))$/i.test(fn.expression.replace(/\s+/g, "")));
        let lastResegmentedDomain = initialXDomain.join(":");
        const syncZoomedDomains = () => {
          const nextX = chart?.meta?.xScale?.domain?.();
          const nextY = chart?.meta?.yScale?.domain?.();
          if (nextX?.length === 2 && nextY?.length === 2) {
            axisDomainsRef.current = { x: nextX, y: nextY };
            if (trigInputAxis) setRadianTicks(chart?.meta?.xAxis, nextX);
            if (inverseTrigFunctions) setRadianTicks(chart?.meta?.yAxis, nextY);
            if (trigInputAxis || inverseTrigFunctions) chart?.draw?.();
            const domainKey = nextX.join(":");
            if (resegmentOnZoom && domainKey !== lastResegmentedDomain) {
              lastResegmentedDomain = domainKey;
              chart.options.data = buildGraphData(nextX);
              chart.draw();
            }
          }
        };
        syncZoomedDomains();
        chart?.on?.("zoom", syncZoomedDomains);
        if (!target.querySelector("svg") || graph.functions.length && !target.querySelector(".graph path")) {
          throw new Error("The graph renderer did not create a visible curve.");
        }
        target.querySelectorAll(".x.origin").forEach((axis) => axis.classList.add("origin-x"));
        target.querySelectorAll(".y.origin").forEach((axis) => axis.classList.add("origin-y"));
        target.querySelectorAll(".x.axis .tick, .y.axis .tick").forEach((tick) => tick.classList.add("grid"));
        if (active) setFallback(false);
      } catch (error) {
        console.error("Math graph render failed:", error);
        if (active) setFallback(true);
      }
    };
    render();
    resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => render());
    resizeObserver?.observe(target);
    return () => {
      active = false;
      resizeObserver?.disconnect();
      target.replaceChildren();
    };
  }, [source, suppliedTitle, hasGraph]);
  const handlePlotPointerDown = (event) => {
    const plotArea = event.currentTarget.querySelector(".canvas");
    if (!plotArea) return;
    const bounds = plotArea.getBoundingClientRect();
    if (!bounds.width || !bounds.height || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    const xPosition = (event.clientX - bounds.left) / bounds.width;
    const yPosition = (event.clientY - bounds.top) / bounds.height;
    const { x, y } = axisDomainsRef.current;
    setTapCoordinates({
      x: x[0] + xPosition * (x[1] - x[0]),
      y: y[1] - yPosition * (y[1] - y[0])
    });
  };
  const equation = graph?.functions?.map((fn) => fn.display || fn.expression).filter(Boolean).join(", ") || graph?.display || expression || "Graph";
  return fallback
    ? React.createElement("figure", { className: "math-graph-frame math-graph-fallback", role: "status" }, React.createElement("figcaption", { className: "math-graph-heading" }, "Graph"), React.createElement("p", null, "This graph could not be rendered. Check the equation and try again."))
    : React.createElement("figure", { className: "math-graph-frame", "aria-label": `Graph of ${graph?.display || expression || "points"}` },
        React.createElement("div", { className: "math-graph-heading" },
        React.createElement("strong", null, graph?.title || suppliedTitle || `Graph of ${graph?.display || expression || "points"}`),
        React.createElement("div", { className: "math-graph-legend" },
          legendEntries.map((entry, index) => entry.type === "point"
            ? React.createElement("span", { className: "math-graph-legend-entry", key: `point-${entry.open ? "open" : "filled"}` },
              React.createElement("span", { className: `math-graph-legend-point ${entry.open ? "is-open" : "is-filled"}`, "aria-hidden": "true" }),
              React.createElement("span", null, entry.open ? "Excluded point" : "Included point"))
            : React.createElement("span", { className: "math-graph-legend-entry", key: `${entry.fn.display}-${entry.index}` },
              React.createElement("span", { className: "math-graph-legend-line", "aria-hidden": "true", style: { backgroundColor: GRAPH_COLORS[entry.index % GRAPH_COLORS.length] } }),
              React.createElement("span", null, entry.fn.display)))
        )),
      React.createElement("div", {
        ref: targetRef,
        className: "math-graph-container math-graph-plot function-plot",
        onPointerDown: handlePlotPointerDown,
        onPointerMove: handlePlotPointerDown,
        style: { backgroundColor: "#ffffff", overflow: "visible", color: "black", touchAction: "none" }
      }),
      tapCoordinates && React.createElement("div", { className: "math-graph-coordinate", role: "status", "aria-live": "polite" },
        `x = ${tapCoordinates.x.toFixed(2)}  ·  y = ${tapCoordinates.y.toFixed(2)}`
      ),
      graph?.caption && React.createElement("figcaption", null, graph.caption),
      React.createElement("p", { className: "text-xs text-gray-500 mt-2 text-center" }, `Reference: ${equation}`)
    );
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
  const axisConfig = (name) => source[`${name}Axis`] || source.axes?.[name] || {};
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
  const data = (Array.isArray(source.data) ? source.data : []).flatMap((rawItem) => {
    if (Array.isArray(rawItem)) {
      const point = pointPair(rawItem);
      return point ? [{ points: [point], graphType: source.type === "line" ? "polyline" : "scatter" }] : [];
    }
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return rawItem;
    const item = { ...rawItem };
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
      let fn = item.fn.trim();
      const raoultProbe = fn.replace(/\\text\s*\{([^{}]+)\}/gi, "$1").replace(/[{}]/g, "");
      const raoult = /P[_\s]*total/i.test(raoultProbe) || /P[_\s]*A[^=]*x.*P[_\s]*B/i.test(raoultProbe);
      if (raoult) {
        fn = fn.replace(/\\text\s*\{([^{}]+)\}/gi, "$1").replace(/[{}]/g, "");
        fn = fn.replace(/P[_\s]*total/gi, "y")
          .replace(/P[_\s]*A\s*(?:\^\s*(?:\\?circ|°))?/gi, "120")
          .replace(/P[_\s]*B\s*(?:\^\s*(?:\\?circ|°))?/gi, "80")
          .replace(/x[_\s]*A/gi, "x");
        item.fn = fn;
      }
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
  const hasRaoult = (Array.isArray(source.data) ? source.data : []).some((item) => {
    if (typeof item?.fn !== "string") return false;
    const probe = item.fn.replace(/\\text\s*\{([^{}]+)\}/gi, "$1").replace(/[{}]/g, "");
    return /P[_\s]*total|P[_\s]*A[^=]*x.*P[_\s]*B/i.test(probe);
  });
  const xAxis = safeAxis(axisConfig("x"));
  const yAxis = safeAxis(axisConfig("y"));
  return {
    ...source,
    title: typeof source.title === "string" && source.title.trim() ? sanitizeLatexForDisplay(source.title) : "Scientific Graph",
    xAxis: xAxis.domain ? xAxis : { ...xAxis, domain: hasRaoult ? [0, 1] : null },
    yAxis,
    annotations: Array.isArray(source.annotations) ? source.annotations : [],
    data,
    colors: Array.isArray(source.colors) ? source.colors.filter((color) => typeof color === "string" && color.trim()) : [],
    points: Array.isArray(source.points) ? source.points.map(pointPair).filter(Boolean) : []
  };
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
      return safeScientificGraphConfig(parsedConfig);
    } catch { /* Try the next complete object. */ }
  }
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
      || /"(?:xAxis|yAxis|axes)"\s*:/i.test(source));
}
function ScientificGraph({ config: suppliedConfig = {}, rawString }) {
  const parseResult = useMemo(() => {
    if (rawString === undefined) return { config: safeScientificGraphConfig(suppliedConfig), error: "" };
    try { return { config: cleanScientificGraphJson(rawString), error: "" }; }
    catch {
      console.log("Scientific graph JSON parse failed. Raw response:", rawString);
      return { config: {}, error: "⚠️ Error rendering scientific graph. Please ask the AI to regenerate." };
    }
  }, [rawString, rawString === undefined ? suppliedConfig : null]);
  const config = parseResult.config;
  const parseError = parseResult.error;
  const targetRef = useRef(null);
  const [renderError, setRenderError] = useState("");
  useEffect(() => {
    const target = targetRef.current;
    if (!target || parseError) {
      target?.replaceChildren();
      return undefined;
    }
    let active = true;
    let observer;
    const render = () => {
      const plotFn = typeof functionPlot === "function" ? functionPlot : functionPlot.default;
      const width = Math.max(280, Math.min(720, Math.floor(target.clientWidth || target.getBoundingClientRect().width || 480)));
      if (!target.clientWidth) return;
      try {
        const graphExpressions = (Array.isArray(config.data) ? config.data : []).flatMap((item) => [item?.fn, item?.fn?.x, item?.fn?.y]).filter((value) => typeof value === "string").join(" ").toLowerCase();
        const cleanAxis = (axis = {}, axisName = "x") => {
          const isInverse = /(?:asin|acos|atan|acot|asec|acsc|arcsin|arccos|arctan|arccot|arcsec|arccsc)\s*\(/.test(graphExpressions);
          const isTrig = /(?:sin|cos|tan|cot|sec|csc)\s*\(/.test(graphExpressions);
          const hasTan = /(?:tan|cot|sec|csc)\s*\(/.test(graphExpressions);
          const isLog = /(?:log|ln)\s*\(/.test(graphExpressions);
          const isExp = /exp\s*\(\s*x\s*\)|e\s*\^\s*x/.test(graphExpressions);
          const coordinateIndex = axisName === "x" ? 0 : 1;
          const graphPoints = (Array.isArray(config.data) ? config.data : []).flatMap((item) => Array.isArray(item?.points) ? item.points.map((point) => Number(point?.[coordinateIndex])) : []).filter(Number.isFinite);
          const inverseY = /(?:acos|arccos|acot|arccot|asec|arcsec)\s*\(/.test(graphExpressions) ? [-0.5, Math.PI + 0.5] : [-Math.PI / 2 - 0.5, Math.PI / 2 + 0.5];
          const domain = Array.isArray(axis.domain) && axis.domain.length === 2 && axis.domain.every(Number.isFinite) && axis.domain[0] !== axis.domain[1]
            ? axis.domain
            : graphPoints.length ? (() => { let low = Math.min(...graphPoints), high = Math.max(...graphPoints); if (low === high) { low -= 1; high += 1; } const padding = (high - low) * 0.15; return [low - padding, high + padding]; })()
              : config.data.some((item) => item?.fnType === "implicit" || item?.fnType === "parametric" || item?.type === "implicit" || item?.type === "parametric") ? [-5, 5]
                : axisName === "x" ? (isInverse ? /(?:asin|arcsin|acos|arccos)\s*\(/.test(graphExpressions) ? [-1.25, 1.25] : /(?:asec|arcsec|acsc|arccsc)\s*\(/.test(graphExpressions) ? [-6, 6] : [-8, 8] : isTrig ? [-2 * Math.PI, 2 * Math.PI] : isLog ? [-1, 10] : isExp ? [-4, 4] : [-10, 10])
                  : isInverse ? inverseY : isTrig ? (hasTan ? [-6, 6] : [-2, 2]) : isLog ? [-4, 4] : isExp ? [-1, 12] : [-10, 10];
          return { domain, ...(typeof axis.label === "string" && axis.label.trim() ? { label: axis.label.trim() } : {}) };
        };
        const palette = Array.isArray(config.colors) ? config.colors : [];
        const xAxis = cleanAxis(config.xAxis, "x");
        const xDomain = xAxis.domain;
        const yAxis = cleanAxis(config.yAxis, "y");
        const yDomain = yAxis.domain;
        const lines = [];
        const pointLayers = [];
        let curveIndex = 0;
        const addPoints = (values, fallbackColor = "") => {
          if (!Array.isArray(values)) return;
          values.forEach((value) => {
            const point = Array.isArray(value)
              ? { x: Number(value[0]), y: Number(value[1]) }
              : value && typeof value === "object"
                ? { ...value, x: Number(value.x), y: Number(value.y) }
                : null;
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const color = typeof point.color === "string" && point.color.trim()
              ? point.color.trim()
              : fallbackColor || GRAPH_COLORS[pointLayers.length % GRAPH_COLORS.length];
            const open = point.open === true || point.hollow === true || point.filled === false;
            pointLayers.push({
              points: [[point.x, point.y]],
              fnType: "points",
              graphType: "scatter",
              color,
              attr: {
                class: open ? "graph scatter graph-open-point" : "graph scatter graph-filled-point",
                fill: open ? "#ffffff" : color,
                stroke: color,
                "stroke-width": open ? "2.5" : "1.5"
              }
            });
          });
        };
        (Array.isArray(config.data) ? config.data : []).forEach((item) => {
          if (!item || typeof item !== "object") return;
          const color = typeof item.color === "string" && item.color.trim()
            ? item.color.trim()
            : typeof palette[curveIndex] === "string"
              ? palette[curveIndex]
              : GRAPH_COLORS[curveIndex % GRAPH_COLORS.length];
          if ((item.fnType === "parametric" || item.type === "parametric") && Array.isArray(item.range) && item.range.length === 2) {
            const pair = typeof item.fn === "object" && item.fn ? item.fn : { x: item.x, y: item.y };
            if (typeof pair.x === "string" && typeof pair.y === "string") lines.push({ fn: { x: pair.x, y: pair.y }, fnType: "parametric", range: item.range.map(Number), color, graphType: "polyline", sampler: "builtIn" });
            curveIndex += 1;
          } else if (typeof item.fn === "string" && item.fn.trim()) {
            let expression = item.fn.trim();
            let parsedFunction = null;
            try { parsedFunction = parseMathFunction(expression); expression = parsedFunction.expression || expression; } catch {}
            if (item.fnType === "implicit" || parsedFunction?.fnType === "implicit") {
              lines.push({ fn: expression, fnType: "implicit", color, graphType: "polyline", sampler: "builtIn" });
              curveIndex += 1;
            } else {
            const compact = expression.replace(/\s+/g, "").toLowerCase();
            const offset = /^tan\(x\)$/.test(compact) || /^1\/(?:cos)\(x\)$/.test(compact) ? Math.PI / 2
              : /^1\/(?:tan|sin)\(x\)$/.test(compact) ? 0 : null;
            const reciprocal = /^1\/x(?:\^2)?$/.test(compact);
            const low = Array.isArray(item.range) && item.range.length === 2 && item.range.every(Number.isFinite) ? Math.max(xDomain[0], item.range[0]) : xDomain[0];
            const high = Array.isArray(item.range) && item.range.length === 2 && item.range.every(Number.isFinite) ? Math.min(xDomain[1], item.range[1]) : xDomain[1];
            let poles = [];
            if (reciprocal && low < 0 && high > 0) poles = [0];
            else if (offset !== null) {
              const first = Math.ceil((low - offset) / Math.PI);
              const last = Math.floor((high - offset) / Math.PI);
              for (let k = first; k <= last; k += 1) {
                const pole = offset + k * Math.PI;
                if (pole > low && pole < high) poles.push(pole);
              }
            }
            if (poles.length && high > low) {
              const bounds = [low, ...poles, high];
              const epsilon = Math.min(0.035, (high - low) / 1000);
              bounds.slice(0, -1).forEach((start, segmentIndex) => lines.push({
                fn: expression,
                range: [start + (segmentIndex ? epsilon : 0), bounds[segmentIndex + 1] - (segmentIndex < bounds.length - 2 ? epsilon : 0)],
                color,
                graphType: "polyline",
                sampler: "builtIn"
              }));
            } else {
              const datum = { fn: expression, color, graphType: "polyline", sampler: "builtIn" };
              if (Array.isArray(item.range) && item.range.length === 2 && item.range.every(Number.isFinite) && item.range[0] < item.range[1]) datum.range = item.range;
              if (item.closed === true) datum.closed = true;
              lines.push(datum);
            }
            curveIndex += 1;
            }
          }
          if (Array.isArray(item.points)) {
            if (item.graphType === "polyline" || item.type === "polyline" || item.closed === true) {
              const points = item.points.slice(0, 1000).filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))).map((point) => [Number(point[0]), Number(point[1])]);
              if (points.length > 1) lines.push({ points, fnType: "points", graphType: "polyline", color, ...(item.closed ? { closed: true } : {}) });
            } else addPoints(item.points, color);
          }
          if (item.type === "point" || (Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)))) {
            addPoints([item], color);
          }
        });
        addPoints(config.points);
        const scientificTrigInput = config.data.some((item) => typeof item?.fn === "string" && /\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(item.fn));
        const scientificInverseOutput = config.data.some((item) => typeof item?.fn === "string" && /\b(?:asin|acos|atan|acot|arcsin|arccos|arctan)\s*\(/i.test(item.fn));
        const annotations = Array.isArray(config.annotations) ? config.annotations : [];
        const axisAnnotations = [];
        const textAnnotations = [];
        annotations.forEach((annotation) => {
          if (!annotation || typeof annotation !== "object") return;
          const hasX = Number.isFinite(annotation.x);
          const hasY = Number.isFinite(annotation.y);
          if (hasX && hasY && typeof annotation.text === "string" && annotation.text.trim()) {
            textAnnotations.push({
              graphType: "text",
              location: [annotation.x, annotation.y],
              text: annotation.text.trim(),
              color: typeof annotation.color === "string" ? annotation.color : "#334155",
              attr: { "font-size": "12px", "font-weight": "600" }
            });
          } else if (hasX !== hasY) {
            axisAnnotations.push({ ...(hasX ? { x: annotation.x } : { y: annotation.y }), ...(typeof annotation.text === "string" && annotation.text.trim() ? { text: annotation.text.trim() } : {}) });
          }
        });
        target.replaceChildren();
        const chart = plotFn({
          target,
          width,
          height: 350,
          margin: { left: 68, right: 18, top: 24, bottom: 58 },
          grid: true,
          disableZoom: false,
          tip: {
            xLine: true,
            yLine: true,
            renderer: (x, y) => `x: ${Number(x).toFixed(3)}, y: ${Number(y).toFixed(3)}`
          },
          xAxis: { ...xAxis, label: String(config.xAxis?.label || "x").slice(0, 60), ...(scientificTrigInput ? { ticks: piTicks(xDomain).length, tickValues: piTicks(xDomain), tickFormat: formatPiTick } : {}) },
          yAxis: { ...yAxis, label: String(config.yAxis?.label || "y").slice(0, 60), ...(scientificInverseOutput ? { ticks: piTicks(yDomain).length, tickValues: piTicks(yDomain), tickFormat: formatPiTick } : {}) },
          annotations: axisAnnotations,
          data: [...lines, ...pointLayers, ...textAnnotations]
        });
        if (scientificTrigInput) setRadianTicks(chart?.meta?.xAxis, xDomain);
        if (scientificInverseOutput) setRadianTicks(chart?.meta?.yAxis, yDomain);
        chart?.build?.();
        if (!target.querySelector(".graph path, .graph circle, .graph .scatter")) throw new Error("The scientific graph contains no visible data.");
        chart?.on?.("zoom", () => {
          const activeX = chart?.meta?.xScale?.domain?.();
          const activeY = chart?.meta?.yScale?.domain?.();
          if (scientificTrigInput && activeX?.length === 2) setRadianTicks(chart?.meta?.xAxis, activeX);
          if (scientificInverseOutput && activeY?.length === 2) setRadianTicks(chart?.meta?.yAxis, activeY);
          if (scientificTrigInput && activeX?.length === 2) {
            const trigRows = config.data.filter((item) => typeof item?.fn === "string" && /\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(item.fn));
            const expressions = new Set(trigRows.map((item) => { try { return parseMathFunction(item.fn).expression; } catch { return item.fn.trim(); } }));
            const retained = lines.filter((line) => !expressions.has(line.fn));
            const regenerated = trigRows.flatMap((item, index) => {
              let equation = item.fn.trim();
              try { equation = parseMathFunction(equation).expression || equation; } catch {}
              const compact = equation.replace(/\s+/g, "").toLowerCase();
              const offset = /^tan\(x\)$/.test(compact) || /^1\/cos\(x\)$/.test(compact) ? Math.PI / 2 : /^1\/(?:tan|sin)\(x\)$/.test(compact) ? 0 : null;
              const low = Array.isArray(item.range) && item.range.length === 2 ? Math.max(activeX[0], Number(item.range[0])) : activeX[0];
              const high = Array.isArray(item.range) && item.range.length === 2 ? Math.min(activeX[1], Number(item.range[1])) : activeX[1];
              const color = typeof item.color === "string" ? item.color : typeof palette[index] === "string" ? palette[index] : GRAPH_COLORS[index % GRAPH_COLORS.length];
              if (offset === null || high <= low) return [{ fn: equation, color, graphType: "polyline", sampler: "builtIn", ...(item.range ? { range: item.range } : {}) }];
              const poles = [];
              for (let k = Math.ceil((low - offset) / Math.PI); k <= Math.floor((high - offset) / Math.PI); k += 1) { const pole = offset + k * Math.PI; if (pole > low && pole < high) poles.push(pole); }
              const bounds = [low, ...poles, high];
              const epsilon = Math.min(0.035, (high - low) / 1000);
              return bounds.slice(0, -1).map((left, segment) => ({ fn: equation, range: [left + (segment ? epsilon : 0), bounds[segment + 1] - (segment < bounds.length - 2 ? epsilon : 0)], color, graphType: "polyline", sampler: "builtIn" }));
            });
            chart.options.data = [...retained, ...regenerated, ...pointLayers, ...textAnnotations];
          }
          if (scientificTrigInput || scientificInverseOutput) chart?.draw?.();
        });
        target.querySelectorAll("text").forEach((text) => { text.style.fill = "#111827"; });
        setRenderError("");
      } catch (cause) {
        console.error("Scientific graph render failed:", cause);
        target.replaceChildren();
        if (active) setRenderError("Graph could not be rendered. Please check the formula and try again.");
      }
    };
    render();
    observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(render);
    observer?.observe(target);
    return () => { active = false; observer?.disconnect(); target.replaceChildren(); };
  }, [config, parseError]);
  const error = parseError || renderError;
  return React.createElement("figure", { className: "scientific-graph-frame" },
    typeof config.title === "string" && config.title.trim() && React.createElement("figcaption", { className: "scientific-graph-title" }, config.title.trim()),
    !parseError && React.createElement("div", { className: "bg-white rounded-xl p-4 shadow-sm text-black" }, React.createElement("div", { ref: targetRef, className: "scientific-graph-plot function-plot", role: "img", "aria-label": typeof config.title === "string" ? config.title : "Scientific graph" })),
    error && React.createElement("div", { className: "scientific-graph-error", role: "alert" }, error),
    React.createElement("p", { className: "text-xs text-gray-500 mt-2 text-center" }, `Reference: ${config.title || "Scientific graph"}`)
  );
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
    Promise.resolve().then(() => import("mermaid")).then(async (module) => {
      const mermaid = module.default || module;
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
      .replace(/([^\n])\s+(#{1,6})\s*(?=\S)/g, "$1\n\n$2 ")
      .replace(/(^|\n)[ \t]*(#{1,6})[ \t]*(?=\S)/gm, "$1\n\n$2 ")
      .replace(/^(#{1,6} [^\n]+)$/gm, "$1\n\n");
  }).join("");
}
function MathText({ children, className = "", legacy = false, components = {} }) {
  // Run every content source through the same delimiter and Markdown repair
  // first. This repairs stray `$$` markers, escaped math, and compacted
  // headings before the rendering pass; it preserves TeX commands for KaTeX.
  const text = normalizeAssistantMarkdownHeadings(sanitizeLatexOutput(String(children ?? "")));
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
      .map((part, index) => index % 2 ? part : normalizeAssistantMarkup(part))
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
  const renderRootRef = useRef(null);
  useLayoutEffect(() => {
    const root = renderRootRef.current;
    if (!root) return void 0;
    const observed = new WeakSet();
    const measure = () => {
      root.querySelectorAll(".katex-display, .katex").forEach((node) => {
        const overflowing = node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 2;
        node.dataset.overflowing = String(overflowing);
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
  }, [source]);
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
          return classes.includes("language-mermaid") || classes.includes("language-math-graph") || classes.includes("language-plot") || classes.includes("language-scientific-plot");
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
        if (className.split(/\s+/).includes("language-scientific-plot") || graphJson) {
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
    children: source
  });
  return React.createElement("div", { ref: renderRootRef, className: `math-render-root ${className}`.trim() },
    React.createElement(MarkdownRenderBoundary, { key: source, source }, markdown));
}

const MemoizedMathText = React.memo(MathText);
export {
  MemoizedMathText as default,
  MemoizedMathText as MathText,
  MathGraph,
  ScientificGraph,
  SmilesRenderer,
  normalizeAssistantMarkup,
  normalizeUnfencedMermaid,
  normalizeMathGraphEquation
};
