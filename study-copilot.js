import { Fragment, jsx } from "react/jsx-runtime";
import React, { useEffect, useRef, useState } from "react";
import functionPlot from "function-plot";
import { ArrowUp, ChevronDown, MoreHorizontal, Plus, Images, Trash2, X, Send, FileText, Volume2, Play, Square, Sparkles, Pencil } from "lucide-react";
import MathMarkdown, { ScientificGraph, SmilesRenderer, normalizeUnfencedMermaid } from "./math-markdown.js";
import { AI_MODELS, DEFAULT_MODEL_PREFERENCES, getProviderKeys } from "./ai.js";
import { extractJson } from "./ai.js";
import { ImageFullView, readImageDataUrl } from "./image-viewer.js";
import { STUDY_FIGURES } from "./figure-library.js";
import { JEE_DIAGRAMS } from "./lib/jee-diagrams.js";
import { sanitizeLatexForDisplay } from "./recall-math.js";
const THREAD_KEY = "apexjee-copilot-threads-v1";
const ACTIVE_THREAD_KEY = "apexjee-copilot-active-thread-v1";
function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the audio file."));
    reader.readAsDataURL(file);
  });
}
function readThreads() {
  try {
    const saved = JSON.parse(localStorage.getItem(THREAD_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}
function summarizeLimitError(error) {
  const message = String(error?.message || error || "");
  const metric = message.match(/tokens per minute\s*\(TPM\)|tokens per day\s*\(TPD\)|requests per minute\s*\(RPM\)|requests per day\s*\(RPD\)/i)?.[0];
  const limit = Number(message.match(/\bLimit\s+([\d,]+)/i)?.[1]?.replace(/,/g, ""));
  const requested = Number(message.match(/\bRequested\s+([\d,]+)/i)?.[1]?.replace(/,/g, ""));
  if (!metric || !limit || !requested) return "";

  const code = metric.match(/\((TPM|TPD|RPM|RPD)\)/i)?.[1].toUpperCase();
  const used = Number(message.match(/\bUsed\s+([\d,]+)/i)?.[1]?.replace(/,/g, "") || 0);
  const over = Math.max(0, used + requested - limit);
  const daily = code === "TPD" || code === "RPD";
  const now = new Date();
  const retryText = message.match(/(?:try again in|retry after)\s+((?:[\d.]+\s*(?:milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|min|m|hours?|hrs?|h)\s*)+)/i)?.[1] || "";
  const retryParts = [...retryText.matchAll(/([\d.]+)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|min|m|hours?|hrs?|h)/gi)];
  let retryMs = 0;
  for (const part of retryParts) {
    const unit = part[2].toLowerCase();
    const multiplier = unit.startsWith("ms") || unit.startsWith("millisecond") ? 1 : unit.startsWith("m") ? 60000 : unit.startsWith("h") ? 3600000 : 1000;
    retryMs += Number(part[1]) * multiplier;
  }
  const resetAt = retryMs
    ? new Date(now.getTime() + retryMs)
    : daily
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1);
  const seconds = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
  const wait = seconds < 60 ? seconds + "s" : Math.ceil(seconds / 60) + " min";
  const time = resetAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const unit = code.startsWith("T") ? "tokens" : "requests";
  return code + " limit reached: " + requested.toLocaleString() + " / " + limit.toLocaleString() + " " + unit + "/" + (daily ? "day" : "min") + (over ? " (" + over.toLocaleString() + " over)" : "") + " · resets in " + wait + " at " + time;
}
const SYSTEM_PROMPT = `You are an expert study tutor. Answer clearly, solve study problems accurately, and use valid standard Markdown. Preserve normal spaces between every word and keep prose in ordinary sentences. Keep every mathematical command inside valid LaTeX delimiters; use $...$ inline with ordinary spaces around the delimiters when they touch prose, and put $$ display math on its own lines with a blank line before and after. Never leak raw LaTeX. Use standard KaTeX commands for nested roots, indexed roots, fractions, vectors (such as \\overrightarrow{...}), absolute values, sums, and integrals. Use one backslash per LaTeX command, never JSON-style doubled backslashes. Do not nest $ delimiters or use \\( \\) inside an already delimited formula; balance every brace and use one consistent delimiter pair per expression. Keep prose outside formulas, use \\text{} for words inside equations, and use inline math for individual variables. Never repeat a formula as both raw source and rendered notation, and never output replacement characters (�) in place of math symbols. Do not wrap equations in \\boxed unless the user explicitly requests a box. Never put Markdown emphasis or list markers inside math.

POLISHED MATHEMATICS ANSWERS: For explanations, use a short opening, descriptive Markdown headings, and numbered steps or bullets. Put each important equation on its own display-math block with $$ on separate lines. Keep ordinary variables inline as $x$. Do not use a table for a multi-step derivation or for long equations; explain it in readable steps instead. Before responding, check that every $ and $$ pair is balanced, every TeX command is inside math delimiters, every fraction/root/sum has complete braces and scripts, and headings/lists are separated from neighboring prose by line breaks. For Taylor/Maclaurin explanations, present the formula, substitution, approximation, error term, and convergence in separate clearly labeled sections.

TABLE RULE: Use standard Markdown pipe tables, with a header, a separator row, and one physical line per data row. Put a blank line before and after each table. Inside table cells, NEVER use $$...$$ or multiline math blocks; use single-dollar inline math $...$ (for example, $\\Delta G = -nFE_{\\text{cell}}$), with spaces around the math delimiters when adjacent to prose. Keep column text concise and do not omit spaces between words.

VISUAL ROUTING — use the matching renderer:
1. Wikipedia, biology, anatomy, and real-world illustrations: emit [WIKI_IMAGE: concise search query] on its own line with a literal unescaped underscore. Never say an image is unavailable.
2. Flowcharts and pathways: emit only a fenced Mermaid block, using flowchart TD or flowchart LR syntax inside the fence.
3. Pure mathematical functions: emit a fenced plot block containing the exact equation, such as \`\`\`plot followed by y = cos(x) and a closing fence. Plot blocks must use x as the independent variable and y as the dependent variable. For mixture graphs, convert x_A to x and x_B to (1-x), then write a single y = ... equation; use optional x-range and y-range metadata only as separate lines.
4. Scientific graphs, conics, parametric curves, and geometry: emit exactly one fenced scientific-plot JSON block with valid JSON, labeled axes, numeric domains, and data. Validate every quote, comma, bracket, and numeric coordinate before responding. Use numeric [x,y] points for scatter plots, polylines for connected curves and polygons, fnType implicit for conics, or parametric x/y functions and a t range. For Raoult's law use x_A from 0 to 1, label the axes with units, and plot both partial pressures and their total; never substitute guessed constants when the prompt supplies values. Do not emit chart JSON as ordinary prose or a generic json code block. Prefer structured points and polylines over hand-drawn SVG for plotted figures.
5. Chemistry molecules: emit [SMILES: ...], never ASCII structures.
For free-body diagrams, geometric shapes, coordinate figures, and patterns, use scientific-plot polygon data or a complete labeled SVG. Do not invent local figure identifiers. Keep JSON responses strictly valid when requested. Use spaces after sentence punctuation and between all words; do not concatenate headings, paragraphs, or table rows.`;
function visualSystemRules() { return SYSTEM_PROMPT; }
function wantsFunctionGraph(prompt = "") {
  const text = String(prompt || "");
  return /\b(?:graph|plot|curve)\b|\binteractive\s+plot\b|\buse\s+function-plot\b|\buse\s+mafs\b/i.test(text)
    || /^\s*(?:y|f\s*\(\s*x\s*\))\s*=/im.test(text);
}
function ensureRequestedGraph(prompt, answer) {
  if (!wantsFunctionGraph(prompt) || /```\s*(?:plot|scientific-plot)\b/i.test(answer)) return answer;
  const request = String(prompt || "").toLowerCase();
  let equations = "";
  let ranges = "";
  if (/\b(?:sec(?:ant)?\s+inverse|inverse\s+sec(?:ant)?|arcsec)\b/.test(request)) {
    equations = "y = asec(x)";
    ranges = "x-range: -10, 10\ny-range: 0, 3.141592653589793";
  } else if (/\b(sin|sine|cos|cosine|tan|tangent)\s+inverse\s+x\b/.test(request)) {
    const inverseName = request.match(/\b(sin|sine|cos|cosine|tan|tangent)\s+inverse\s+x\b/)[1];
    const functionName = /^(?:sin|sine)$/.test(inverseName) ? "asin" : /^(?:cos|cosine)$/.test(inverseName) ? "acos" : "atan";
    equations = `y = ${functionName}(x)`;
    ranges = functionName === "asin" ? "x-range: -1, 1\ny-range: -1.5707963267948966, 1.5707963267948966"
      : functionName === "acos" ? "x-range: -1, 1\ny-range: 0, 3.141592653589793"
        : "x-range: -10, 10\ny-range: -1.5707963267948966, 1.5707963267948966";
  } else if (/\bhyperbola\b/.test(request)) {
    const matches = [...String(answer).matchAll(/\\frac\s*\{\s*\$?([xy])\s*\^\s*\{?2\}?\$?\s*\}\s*\{\s*\$?(\d+(?:\.\d+)?)\$?\s*\}/gi)];
    const horizontalX = Number(matches.find((entry) => entry[1].toLowerCase() === "x")?.[2] || 4);
    const verticalY = Number(matches.find((entry) => entry[1].toLowerCase() === "y")?.[2] || 9);
    const a2 = Number.isFinite(horizontalX) && horizontalX > 0 ? horizontalX : 4;
    const b2 = Number.isFinite(verticalY) && verticalY > 0 ? verticalY : 9;
    equations = `y = sqrt((x^2/${a2} - 1)*${b2})\ny = -sqrt((x^2/${a2} - 1)*${b2})`;
  } else {
    const trig = request.match(/\b(sin|cos|tan|cot|sec|csc)\s*(?:\(\s*x\s*\)|\s+inverse\s+x|\s+x)\b/i)?.[1]?.toLowerCase();
    if (trig) equations = `y = ${trig}(x)`;
    else {
      const explicit = String(prompt || "").match(/(?:^|\s)(?:y|f\s*\(\s*x\s*\))\s*=\s*([^\n,;]+)/i);
      if (explicit) equations = `y = ${explicit[1].trim()}`;
    }
  }
  if (!equations) return answer;
  return `${answer.trim()}\n\n\`\`\`plot\n${equations}${ranges ? `\n${ranges}` : ""}\n\`\`\``;
}
function wantsIllustration(prompt = "") {
  const visualNoun = /\b(diagram|illustration|picture|image|drawing|schematic|infographic|flowchart|shape|shapes)\b/i;
  const action = /\b(show|make|create|generate|draw|sketch|visuali[sz]e|give|need)\b/i;
  return visualNoun.test(prompt) && (action.test(prompt) || /^\s*(?:diagram|illustration|picture|image|drawing|schematic|infographic)\b/i.test(prompt) || /\b(?:diagram|illustration|picture|image|drawing|schematic|infographic)\s+(?:of|for|showing)\b/i.test(prompt));
}
function wantsGeneratedVisual(prompt = "") {
  if (wantsFunctionGraph(prompt)) return false;
  const smilesIntent = /\b(?:structure|structural formula)\b/i.test(prompt) && /\b(?:molecule|phenol|aspirin|benzene|toluene|naphthalene|ethanol|glucose|caffeine|acetic acid)\b/i.test(prompt);
  return smilesIntent || /\b(?:visuals?|diagrams?|illustrations?|draw|graph|plot|flowcharts?|shapes?)\b|\bshow\s+(?:me|some)\b/i.test(prompt) || wantsIllustration(prompt);
}
function sanitizeForTTS(text) {
  const spoken = String(text || "")
    // Strip complete and unterminated drawing/code payloads before removing
    // markup, so their source is never read aloud.
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, " ")
    .replace(/<svg\b[\s\S]*?(?:<\/svg\s*>|$)/gi, " diagram ")
    .replace(/<\?xml\b[\s\S]*?(?:<\/([A-Za-z_:][\w:.-]*)\s*>|$)/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\[(?:DIAGRAM|FIGURE|SMILES|WIKI_IMAGE|IMAGE_SEARCH):[^\]]*\]/gi, " diagram ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/(^|\n)\s*\|?[-: ]+(?:\|[-: ]+)+\|?\s*(?=\n|$)/g, " ")
    .replace(/\\(?:left|right)\b\s*/g, "")
    .replace(/\\text\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:d?frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1 over $2")
    .replace(/\\sqrt(?:\s*\{([^{}]+)\}|\s*([a-zA-Z0-9]+))?/g, (_, braced, plain) => ` square root of ${braced || plain || ""} `)
    .replace(/\\(?:times|cdot)\b/g, " times ")
    .replace(/\\pi\b/g, " pi ")
    .replace(/\\theta\b/g, " theta ")
    .replace(/\\(?:leq?|le)\b/g, " is less than or equal to ")
    .replace(/\\(?:geq?|ge)\b/g, " is greater than or equal to ")
    .replace(/\\neq\b/g, " is not equal to ")
    .replace(/\\(?:begin|end)\s*\{[^{}]*\}/g, " ")
    .replace(/\\[A-Za-z]+\*?/g, " ")
    .replace(/\\\\/g, ", ")
    .replace(/\|([^|\n]+)\|/g, " absolute value of $1 ")
    .replace(/\^\s*\{?2\}?(?=\W|$)/g, " squared ")
    .replace(/\^\s*\{?3\}?(?=\W|$)/g, " cubed ")
    .replace(/\^\s*\{([^{}]+)\}/g, " to the power of $1 ")
    .replace(/>=|<=|>|</g, (symbol) => symbol === ">=" ? " is greater than or equal to " : symbol === "<=" ? " is less than or equal to " : symbol === ">" ? " is greater than " : " is less than ")
    .replace(/=/g, " equals ")
    .replace(/(^|\n)\s*[-–—]\s+(?=\S)/g, "$1")
    .replace(/\*{1,2}|_{1,2}|~~/g, "")
    .replace(/\|/g, " ")
    .replace(/\$+|\\\(|\\\)|\\\[|\\\]/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spoken;
}
function normalizeInteractiveGraphEquation(equation) {
  let expression = String(equation || "")
    .replace(/^\s*[A-Za-z][A-Za-z0-9_{}^*]*(?:\s*\(\s*x\s*\))?\s*=\s*/i, "")
    .replace(/x\s*[_^]\s*\{?A\}?/gi, "x")
    .replace(/x\s*[_^]\s*\{?B\}?/gi, "(1-x)")
    // Accept the inverse-trig names models commonly use in prose and TeX.
    .replace(/\\?arc(?:sin|sine)\b/gi, "asin")
    .replace(/\\?arc(?:cos|cosine)\b/gi, "acos")
    .replace(/\\?arc(?:tan|tangent)\b/gi, "atan")
    .replace(/\\?arc(?:cot|cotangent)\b/gi, "acot")
    .replace(/\\?arc(?:sec|secant)\b/gi, "asec")
    .replace(/\\?arc(?:csc|cosecant)\b/gi, "acsc")
    .replace(/\b(?:inverse\s+)?sec(?:ant)?\s+(?:inverse\s+)?x\b/gi, "asec(x)")
    .replace(/\b(?:inverse\s+)?csc(?:ant)?\s+(?:inverse\s+)?x\b/gi, "acsc(x)")
    .replace(/\binverse\s+(?:sin(?:e)?|sine)\s+x\b/gi, "asin(x)")
    .replace(/\binverse\s+(?:cos(?:ine)?|cosine)\s+x\b/gi, "acos(x)")
    .replace(/\binverse\s+(?:tan(?:gent)?|tangent)\s+x\b/gi, "atan(x)")
    .replace(/\binverse\s+(?:cot(?:angent)?|cotangent)\s+x\b/gi, "acot(x)")
    .replace(/\binverse\s+(?:sec(?:ant)?|secant)\s+x\b/gi, "asec(x)")
    .replace(/\binverse\s+(?:csc(?:ant)?|cosecant)\s+x\b/gi, "acsc(x)")
    .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|biggl|biggr)\s*/g, "")
    .replace(/\\(?:cdot|times)\b/g, "*")
    .replace(/\\(?:d?frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "(($1)/($2))")
    .replace(/\\pi\b/g, "pi")
    .replace(/(\d)\s*(?=x\b)/g, "$1*")
    .replace(/(\d|\))\s*(?=\()/g, "$1*")
    .replace(/\bnthRoot\s*\(\s*x\s*,\s*3\s*\)/gi, "sign(x)*abs(x)^(1/3)")
    .replace(/\b(?:cbrt|cubeRoot)\s*\(\s*x\s*\)/gi, "sign(x)*abs(x)^(1/3)")
    .replace(/\bx\s*\^\s*\(\s*1\s*\/\s*3\s*\)/gi, "sign(x)*abs(x)^(1/3)")
    .replace(/\\(?:arcsin|arccos|arctan|arccot)\b/gi, (name) => ({ "\\arcsin": "asin", "\\arccos": "acos", "\\arctan": "atan", "\\arccot": "acot" }[name.toLowerCase()] || name))
    .replace(/\barcsin\b/gi, "asin")
    .replace(/\barccos\b/gi, "acos")
    .replace(/\barctan\b/gi, "atan")
    .replace(/\barccot\b/gi, "acot")
    .replace(/\barcsec\b/gi, "asec")
    .replace(/\barccsc\b/gi, "acsc")
    .replace(/\b(cot|sec|csc)\s*\(\s*x\s*\)/gi, (_match, name) => ({ cot: "1/tan(x)", sec: "1/cos(x)", csc: "1/sin(x)" }[name.toLowerCase()]))
    // A frequent compact form is “sin x” rather than “sin(x)”.
    .replace(/\b(sin|cos|tan|asin|acos|atan|acot|asec|acsc)\s+x\b/gi, "$1(x)")
    .trim();
  const inverseFunction = expression.match(/^(asin|acos|atan|acot|asec|acsc)\s*\(\s*x\s*\)$/i)?.[1]?.toLowerCase() || "";
  if (inverseFunction === "acot") expression = "(pi/2-atan(x))";
  if (inverseFunction === "asec") expression = "acos(1/x)";
  if (inverseFunction === "acsc") expression = "asin(1/x)";
  return { equation: expression, inverseFunction };
}
function sampleInteractiveGraphSeries(series, xDomain, yDomain, color) {
  const compact = String(series?.equation || "").replace(/\s+/g, "");
  const match = compact.match(/^([+-]?(?:\d+(?:\.\d*)?)?\*?)(sin|cos|tan)\(x\)(?:([+-])(\d+(?:\.\d*)?))?$/i);
  if (!match) return [];
  const coefficientText = match[1].replace(/\*/g, "");
  const coefficient = coefficientText === "" || coefficientText === "+" ? 1 : coefficientText === "-" ? -1 : Number(coefficientText);
  const offset = match[3] ? Number(`${match[3]}${match[4]}`) : 0;
  const trig = match[2].toLowerCase();
  const segments = [];
  let segment = [];
  let previousY = null;
  for (let index = 0; index <= 480; index += 1) {
    const x = xDomain[0] + (xDomain[1] - xDomain[0]) * index / 480;
    const y = coefficient * Math[trig](x) + offset;
    const discontinuity = Number.isFinite(previousY) && Math.abs(y - previousY) > (yDomain[1] - yDomain[0]) * 0.8;
    if (!Number.isFinite(y) || y < yDomain[0] || y > yDomain[1] || discontinuity) {
      if (segment.length > 1) segments.push({ points: segment, fnType: "points", graphType: "polyline", color });
      segment = [];
      previousY = null;
      if (!Number.isFinite(y) || y < yDomain[0] || y > yDomain[1]) continue;
    }
    segment.push([x, y]);
    previousY = y;
  }
  if (segment.length > 1) segments.push({ points: segment, fnType: "points", graphType: "polyline", color });
  return segments;
}
function parseInteractiveGraphInput(source) {
  const points = [];
  const xDomain = [];
  const yDomain = [];
  const equations = String(source || "").split(/\r?\n/).filter((line) => {
    const range = line.match(/^\s*([xy])\s*-?\s*range\s*:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*$/i);
    if (range) {
      const domain = [Number(range[2]), Number(range[3])];
      if (domain[0] < domain[1]) (range[1].toLowerCase() === "x" ? xDomain : yDomain).splice(0, 2, ...domain);
      return false;
    }
    if (/^\s*(?:title|caption|x-axis|y-axis)\s*:/i.test(line)) return false;
    if (!/^\s*(?:(?:open|hollow|excluded|closed|filled)[ -]point|hole|point)\s*:/i.test(line)) return Boolean(line.trim());
    const coordinates = line.match(/([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/i);
    if (coordinates) {
      const kind = line.match(/^\s*(open|hollow|excluded|closed|filled)[ -]point/i)?.[1]?.toLowerCase();
      points.push({ x: Number(coordinates[1]), y: Number(coordinates[2]), open: ["open", "hollow", "excluded"].includes(kind) || /^\s*hole\s*:/i.test(line) });
    }
    return false;
  });
  const series = equations.map(normalizeInteractiveGraphEquation);
  return { ...(series[0] || normalizeInteractiveGraphEquation("")), series, points, xDomain, yDomain };
}
function piTickValues(domain) {
  const step = Math.PI / 2;
  const first = Math.ceil(domain[0] / step - 1e-8);
  const last = Math.floor(domain[1] / step + 1e-8);
  const stride = Math.max(1, Math.ceil((last - first + 1) / 16));
  const values = [];
  for (let multiple = first; multiple <= last; multiple += stride) values.push(multiple * step);
  return values;
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
function useRadianTicks(axis, domain) {
  axis?.tickValues?.(piTickValues(domain));
  axis?.tickFormat?.(formatPiTick);
}
function SvgInteractiveGraph({ equation }) {
  const graph = useMemo(() => {
    const parsed = parseInteractiveGraphInput(equation);
    const trig = parsed.series.some((series) => /\b(?:sin|cos|tan)\s*\(/i.test(series.equation));
    const xDomain = parsed.xDomain.length ? parsed.xDomain
      : parsed.inverseFunction === "asin" || parsed.inverseFunction === "acos" ? [-1.25, 1.25]
        : parsed.inverseFunction === "asec" || parsed.inverseFunction === "acsc" ? [-6, 6]
          : trig ? [-2 * Math.PI, 2 * Math.PI] : [-10, 10];
    const yDomain = parsed.yDomain.length ? parsed.yDomain
      : parsed.inverseFunction === "asin" || parsed.inverseFunction === "acsc" ? [-Math.PI / 2 - 0.4, Math.PI / 2 + 0.4]
        : parsed.inverseFunction ? [-0.4, Math.PI + 0.4] : trig ? [-2, 2] : [-10, 10];
    const compile = (source) => {
      const raw = String(source || "");
      if (!/^[\d.x+*/^(),%\sA-Za-z-]*$/.test(raw)) return null;
      const tokens = raw.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Za-z]+|[()+*/^%,\-]/gi) || [];
      if (tokens.join("").toLowerCase() !== raw.replace(/\s+/g, "").toLowerCase()) return null;
      const allowed = new Set(["x", "pi", "e", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "abs", "exp", "log", "floor", "ceil", "round", "sign", "min", "max"]);
      const functions = new Set(["sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "abs", "exp", "log", "floor", "ceil", "round", "sign", "min", "max"]);
      let cursor = 0;
      const take = (token) => tokens[cursor] === token ? (cursor += 1, true) : false;
      const expression = () => {
        let left = term();
        while (tokens[cursor] === "+" || tokens[cursor] === "-") {
          const operator = tokens[cursor++], right = term(), previous = left;
          left = (x) => operator === "+" ? previous(x) + right(x) : previous(x) - right(x);
        }
        return left;
      };
      const term = () => {
        let left = power();
        while (["*", "/", "%"].includes(tokens[cursor])) {
          const operator = tokens[cursor++], right = power(), previous = left;
          left = (x) => operator === "*" ? previous(x) * right(x) : operator === "/" ? previous(x) / right(x) : previous(x) % right(x);
        }
        return left;
      };
      const power = () => {
        let left = unary();
        if (take("^")) { const right = power(), previous = left; left = (x) => previous(x) ** right(x); }
        return left;
      };
      const unary = () => take("-") ? ((value) => (x) => -value(x))(unary()) : take("+") ? unary() : primary();
      const primary = () => {
        const token = tokens[cursor++];
        if (token === "(") {
          const inner = expression();
          if (!take(")")) throw new Error("Unclosed expression");
          return inner;
        }
        if (/^(?:\d|\.)/.test(token || "")) { const value = Number(token); return () => value; }
        const name = String(token || "").toLowerCase();
        if (!allowed.has(name)) throw new Error("Unsupported graph symbol");
        if (name === "x") return (x) => x;
        if (name === "pi") return () => Math.PI;
        if (name === "e") return () => Math.E;
        if (!functions.has(name) || !take("(")) throw new Error("Expected a graph function");
        const args = [expression()];
        while (take(",")) args.push(expression());
        if (!take(")")) throw new Error("Unclosed function");
        const method = Math[name];
        return (x) => method(...args.map((argument) => argument(x)));
      };
      try {
        const evaluate = expression();
        if (cursor !== tokens.length) return null;
        return evaluate;
      } catch { return null; }
    };
    const width = 640, height = 350, pad = { left: 52, right: 18, top: 18, bottom: 40 };
    const plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom;
    const px = (x) => pad.left + (x - xDomain[0]) / (xDomain[1] - xDomain[0]) * plotWidth;
    const py = (y) => pad.top + (yDomain[1] - y) / (yDomain[1] - yDomain[0]) * plotHeight;
    const ticks = (domain) => Array.from({ length: 7 }, (_, index) => domain[0] + (domain[1] - domain[0]) * index / 6);
    const curves = parsed.series.flatMap((series, index) => {
      const fn = compile(series.equation);
      if (!fn) return [];
      const segments = [];
      let segment = [];
      let previous = null;
      for (let sample = 0; sample <= 700; sample += 1) {
        const x = xDomain[0] + (xDomain[1] - xDomain[0]) * sample / 700;
        let y = Number.NaN;
        try { y = Number(fn(x)); } catch { /* Skip invalid points. */ }
        if (!Number.isFinite(y) || y < yDomain[0] || y > yDomain[1] || (previous !== null && Math.abs(y - previous) > (yDomain[1] - yDomain[0]) * 0.45)) {
          if (segment.length > 1) segments.push(segment);
          segment = [];
          previous = null;
          if (!Number.isFinite(y) || y < yDomain[0] || y > yDomain[1]) continue;
        }
        segment.push(`${sample === 0 || !segment.length ? "M" : "L"}${px(x).toFixed(1)},${py(y).toFixed(1)}`);
        previous = y;
      }
      if (segment.length > 1) segments.push(segment);
      return segments.map((path, pathIndex) => ({ d: path.join(" "), key: `${index}-${pathIndex}`, color: ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f97316"][index % 5] }));
    });
    return { width, height, pad, plotWidth, plotHeight, xDomain, yDomain, px, py, xTicks: ticks(xDomain), yTicks: ticks(yDomain), curves, points: parsed.points };
  }, [equation]);
  const { width, height, pad, plotWidth, plotHeight, xDomain, yDomain, px, py, xTicks, yTicks, curves, points } = graph;
  const axisX = yDomain[0] <= 0 && yDomain[1] >= 0 ? py(0) : py(yDomain[0]);
  const axisY = xDomain[0] <= 0 && xDomain[1] >= 0 ? px(0) : px(xDomain[0]);
  return React.createElement("figure", { className: "math-graph-frame", "aria-label": `Graph of ${sanitizeLatexForDisplay(equation)}` },
    React.createElement("figcaption", { className: "math-graph-heading" }, sanitizeLatexForDisplay(equation)),
    React.createElement("svg", { className: "math-graph-svg-fallback", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Function graph" },
      xTicks.map((value, index) => React.createElement("g", { key: `x-${index}` }, React.createElement("line", { x1: px(value), y1: pad.top, x2: px(value), y2: height - pad.bottom, stroke: "#e5e7eb" }), React.createElement("text", { x: px(value), y: height - 13, textAnchor: "middle" }, Math.abs(value) < 1e-8 ? "0" : Number(value.toPrecision(2)).toString()))),
      yTicks.map((value, index) => React.createElement("g", { key: `y-${index}` }, React.createElement("line", { x1: pad.left, y1: py(value), x2: width - pad.right, y2: py(value), stroke: "#e5e7eb" }), React.createElement("text", { x: pad.left - 8, y: py(value) + 4, textAnchor: "end" }, Math.abs(value) < 1e-8 ? "0" : Number(value.toPrecision(2)).toString()))),
      React.createElement("line", { x1: pad.left, y1: axisX, x2: width - pad.right, y2: axisX, stroke: "#64748b", strokeWidth: 1.5 }),
      React.createElement("line", { x1: axisY, y1: pad.top, x2: axisY, y2: height - pad.bottom, stroke: "#64748b", strokeWidth: 1.5 }),
      curves.map((curve) => React.createElement("path", { key: curve.key, d: curve.d, fill: "none", stroke: curve.color, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" })),
      points.map((point, index) => React.createElement("circle", { key: `point-${index}`, cx: px(point.x), cy: py(point.y), r: 5, fill: point.open ? "white" : "#2563eb", stroke: "#2563eb", strokeWidth: 2 }))
    )
  );
}
function initialInteractiveDomain(base, values, pointsOnly) {
  if (!values.length) return base;
  if (!pointsOnly && values.every((value) => value >= base[0] && value <= base[1])) return base;
  let low = pointsOnly ? Math.min(0, ...values) : Math.min(base[0], ...values);
  let high = pointsOnly ? Math.max(0, ...values) : Math.max(base[1], ...values);
  if (low === high) { low -= 1; high += 1; }
  const padding = (high - low) * 0.1;
  return [low - padding, high + padding];
}
function textbookInteractiveDomains(xDomain, yDomain) {
  const span = Math.max(xDomain[1] - xDomain[0], yDomain[1] - yDomain[0]);
  const xCenter = (xDomain[0] + xDomain[1]) / 2;
  const yCenter = (yDomain[0] + yDomain[1]) / 2;
  return {
    x: [xCenter - span / 2, xCenter + span / 2],
    y: [yCenter - span / 2, yCenter + span / 2]
  };
}
function InteractiveMathGraph({ equation }) {
  const containerRef = useRef(null);
  const axisDomainsRef = useRef({ x: [-10, 10], y: [-10, 10] });
  const [tapCoordinates, setTapCoordinates] = useState(null);
  const [plotError, setPlotError] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let active = true;
    let renderFrame = 0;
    setPlotError(false);
    const render = () => {
      const plotFn = typeof functionPlot === "function" ? functionPlot : functionPlot.default;
      if (!active || !container.clientWidth) return;
      try {
        const parsed = parseInteractiveGraphInput(equation);
        const pointsOnly = !parsed.equation;
        const trigInputAxis = parsed.series.some((series) => !series.inverseFunction && /\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(series.equation));
        const inverseTrigAxis = parsed.series.some((series) => Boolean(series.inverseFunction));
        const inverseYDomains = { asin: [-Math.PI / 2 - 0.4, Math.PI / 2 + 0.4], acos: [-0.4, Math.PI + 0.4], atan: [-Math.PI / 2 - 0.5, Math.PI / 2 + 0.5], acot: [-0.5, Math.PI + 0.5], asec: [-0.5, Math.PI + 0.5], acsc: [-Math.PI / 2 - 0.5, Math.PI / 2 + 0.5] };
        const hasTrigAsymptotes = parsed.series.some((series) => /^1\s*\/\s*(?:tan|sin|cos)\s*\(\s*x\s*\)$/i.test(series.equation.replace(/\s+/g, "")));
        const isPeriodicTrig = trigInputAxis;
        const isLog = parsed.series.some((series) => /^(?:log|ln)\s*\(/i.test(series.equation));
        const isExp = parsed.series.some((series) => /^exp\s*\(\s*x\s*\)$/i.test(series.equation));
        const isSign = parsed.series.some((series) => /^(?:sgn|sign)\s*\(\s*x\s*\)$/i.test(series.equation));
        const isFractional = parsed.series.some((series) => /^x\s*-\s*floor\s*\(\s*x\s*\)$/i.test(series.equation));
        const baseXDomain = parsed.inverseFunction === "asin" || parsed.inverseFunction === "acos" ? [-1.25, 1.25]
          : parsed.inverseFunction === "asec" || parsed.inverseFunction === "acsc" ? [-6, 6]
            : parsed.inverseFunction ? [-8, 8] : isPeriodicTrig ? [-2 * Math.PI, 2 * Math.PI]
              : isLog ? [-1, 10] : isExp ? [-4, 4] : isSign || isFractional ? [-5, 5] : hasTrigAsymptotes ? [-2 * Math.PI, 2 * Math.PI] : [-10, 10];
        const baseYDomain = parsed.inverseFunction ? inverseYDomains[parsed.inverseFunction]
          : isSign ? [-2, 2] : isFractional ? [-0.5, 1.5]
            : isPeriodicTrig ? (hasTrigAsymptotes ? [-6, 6] : [-2, 2])
              : isLog ? [-4, 4] : isExp ? [-1, 12] : [-10, 10];
        const xDomain = parsed.xDomain.length ? parsed.xDomain : pointsOnly ? initialInteractiveDomain(baseXDomain, parsed.points.map((point) => point.x), true) : baseXDomain;
        const yDomain = parsed.yDomain.length ? parsed.yDomain : pointsOnly ? initialInteractiveDomain(baseYDomain, parsed.points.map((point) => point.y), true) : baseYDomain;
        const squareDomains = textbookInteractiveDomains(xDomain, yDomain);
        const preservePrincipal = parsed.inverseFunction || isPeriodicTrig || isLog || isExp || isSign || isFractional || parsed.xDomain.length || parsed.yDomain.length;
        const graphXDomain = preservePrincipal || pointsOnly ? xDomain : squareDomains.x;
        const graphYDomain = preservePrincipal || pointsOnly ? yDomain : squareDomains.y;
        axisDomainsRef.current = { x: graphXDomain, y: graphYDomain };
        let data = [];
        if (parsed.inverseFunction && parsed.series.length === 1) {
          if (parsed.inverseFunction === "asec" || parsed.inverseFunction === "acsc") {
            const sampleCount = Math.max(120, Math.min(360, Math.floor(container.clientWidth * 0.5)));
            [[graphXDomain[0], Math.min(graphXDomain[1], -1)], [Math.max(graphXDomain[0], 1), graphXDomain[1]]].forEach(([left, right]) => {
              if (right <= left) return;
              const samples = [];
              for (let sample = 0; sample <= sampleCount; sample += 1) {
                const x = left + (right - left) * sample / sampleCount;
                samples.push([x, parsed.inverseFunction === "asec" ? Math.acos(1 / x) : Math.asin(1 / x)]);
              }
              data.push({ points: samples, fnType: "points", graphType: "polyline", color: "#3b82f6" });
            });
          } else {
          const samples = [];
          const sampleCount = Math.max(180, Math.min(480, Math.floor(container.clientWidth * 0.65)));
          for (let sample = 0; sample <= sampleCount; sample += 1) {
            const x = graphXDomain[0] + (graphXDomain[1] - graphXDomain[0]) * sample / sampleCount;
            if ((parsed.inverseFunction === "asin" || parsed.inverseFunction === "acos") && (x < -1 || x > 1)) continue;
            const y = parsed.inverseFunction === "asin" ? Math.asin(x)
              : parsed.inverseFunction === "acos" ? Math.acos(x)
                : parsed.inverseFunction === "atan" ? Math.atan(x)
                  : Math.PI / 2 - Math.atan(x);
            if (Number.isFinite(y)) samples.push([x, y]);
          }
          if (samples.length > 1) {
            data.push({ points: samples, fnType: "points", graphType: "polyline", color: "#3b82f6" });
            if (parsed.inverseFunction === "asin" || parsed.inverseFunction === "acos") [-1, 1].forEach((x) => data.push({ points: [[x, parsed.inverseFunction === "asin" ? Math.asin(x) : Math.acos(x)]], fnType: "points", graphType: "scatter", color: "#3b82f6", attr: { class: "graph scatter graph-filled-point" } }));
          }
          }
        } else if (parsed.equation) {
          const colors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f97316"];
          for (const [index, series] of parsed.series.entries()) {
            if (!series.equation) continue;
            const color = colors[index % colors.length];
            const reciprocalTrig = series.equation.replace(/\s+/g, "").toLowerCase().match(/^1\/(tan|sin|cos)\(x\)$/)?.[1];
            if (reciprocalTrig) {
              const offset = reciprocalTrig === "cos" ? Math.PI / 2 : 0;
              const firstPole = Math.ceil((graphXDomain[0] - offset) / Math.PI);
              const lastPole = Math.floor((graphXDomain[1] - offset) / Math.PI);
              const poles = [];
              for (let k = firstPole; k <= lastPole; k += 1) {
                const pole = offset + k * Math.PI;
                if (pole > graphXDomain[0] && pole < graphXDomain[1]) poles.push(pole);
              }
              const bounds = [graphXDomain[0], ...poles, graphXDomain[1]];
              bounds.slice(0, -1).forEach((left, segmentIndex) => data.push({
                fn: series.equation,
                range: [left + 0.035, bounds[segmentIndex + 1] - 0.035],
                color,
                graphType: "polyline",
                sampler: "builtIn"
              }));
            } else if (/^(?:sgn|sign)\s*\(\s*x\s*\)$/i.test(series.equation)) {
              data.push(
                { fn: "-1", range: [graphXDomain[0], Math.min(graphXDomain[1], -1e-4)], color, graphType: "polyline", sampler: "builtIn" },
                { fn: "1", range: [Math.max(graphXDomain[0], 1e-4), graphXDomain[1]], color, graphType: "polyline", sampler: "builtIn" },
                { points: [[0, 0]], fnType: "points", graphType: "scatter", color, attr: { class: "graph scatter graph-filled-point", r: 6 } },
                { points: [[0, 1], [0, -1]], fnType: "points", graphType: "scatter", color, attr: { class: "graph scatter graph-open-point", r: 6 } }
              );
            } else {
              data.push({ fn: series.equation, color, graphType: "polyline", sampler: "builtIn" });
            }
          }
        }
        const pointColors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f97316"];
        parsed.points.forEach((point, index) => data.push({
          points: [[point.x, point.y]],
          fnType: "points",
          graphType: "scatter",
          color: pointColors[index % pointColors.length],
          attr: { class: point.open ? "graph scatter graph-open-point" : "graph scatter graph-filled-point" }
        }));
        container.innerHTML = "";
        let chart = plotFn({
          target: container,
          width: Math.max(240, Math.floor(container.clientWidth)),
          height: 350,
          margin: { left: 62, right: 14, top: 14, bottom: 54 },
          grid: true,
          disableZoom: false,
          tip: {
            xLine: true,
            yLine: true,
            renderer: (x, y) => `x: ${Number(x).toFixed(2)}, y: ${Number(y).toFixed(2)}`
          },
          xAxis: { domain: graphXDomain, label: "x", ...(trigInputAxis ? { ticks: piTickValues(graphXDomain).length, tickValues: piTickValues(graphXDomain), tickFormat: formatPiTick } : {}) },
          yAxis: { domain: graphYDomain, label: "y", ...(inverseTrigAxis ? { ticks: piTickValues(graphYDomain).length, tickValues: piTickValues(graphYDomain), tickFormat: formatPiTick } : {}) },
          data
        });
        // Let D3 choose readable tick values from the active scale. The axis
        // generators recalculate them whenever function-plot zooms or pans.
        chart?.meta?.xAxis?.ticks?.(Math.max(4, Math.floor(container.clientWidth / 62)));
        chart?.meta?.yAxis?.ticks?.(Math.max(4, Math.floor(container.clientWidth / 62)));
        if (trigInputAxis) useRadianTicks(chart?.meta?.xAxis, graphXDomain);
        if (inverseTrigAxis) useRadianTicks(chart?.meta?.yAxis, graphYDomain);
        chart?.build?.();
        const hasCurve = () => [...container.querySelectorAll(".graph path")].some((path) => (path.getAttribute("d") || "").length > 2);
        if (parsed.equation && !hasCurve()) {
          const sampledData = parsed.series.flatMap((series, index) => sampleInteractiveGraphSeries(
            series,
            graphXDomain,
            graphYDomain,
            ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f97316"][index % 5]
          ));
          if (sampledData.length) {
            container.replaceChildren();
            chart = plotFn({
              target: container,
              width: Math.max(240, Math.floor(container.clientWidth)),
              height: 350,
              margin: { left: 62, right: 14, top: 14, bottom: 54 },
              grid: true,
              disableZoom: false,
              xAxis: { domain: graphXDomain, label: "x", ...(trigInputAxis ? { ticks: piTickValues(graphXDomain).length, tickValues: piTickValues(graphXDomain), tickFormat: formatPiTick } : {}) },
              yAxis: { domain: graphYDomain, label: "y", ...(inverseTrigAxis ? { ticks: piTickValues(graphYDomain).length, tickValues: piTickValues(graphYDomain), tickFormat: formatPiTick } : {}) },
              data: sampledData
            });
            chart?.build?.();
          }
        }
        if (parsed.equation && !hasCurve()) throw new Error("The graph renderer did not produce a curve.");
        const syncZoomedDomains = () => {
          const nextX = chart?.meta?.xScale?.domain?.();
          const nextY = chart?.meta?.yScale?.domain?.();
          if (nextX?.length === 2 && nextY?.length === 2) {
            axisDomainsRef.current = { x: nextX, y: nextY };
            if (trigInputAxis) useRadianTicks(chart?.meta?.xAxis, nextX);
            if (inverseTrigAxis) useRadianTicks(chart?.meta?.yAxis, nextY);
            if (trigInputAxis || inverseTrigAxis) chart?.draw?.();
          }
        };
        syncZoomedDomains();
        chart?.on?.("zoom", syncZoomedDomains);
        if (parsed.series.some((series) => /^(?:sgn|sign)\s*\(\s*x\s*\)$/i.test(series.equation)
          || /^1\s*\/\s*(?:tan|sin|cos)\s*\(\s*x\s*\)$/i.test(series.equation.replace(/\s+/g, "")))) {
          let segmentedDomain = graphXDomain.join(":");
          chart?.on?.("zoom", () => {
            const domain = chart?.meta?.xScale?.domain?.();
            if (!domain || domain.length !== 2 || domain.join(":") === segmentedDomain) return;
            segmentedDomain = domain.join(":");
            const refreshed = data.filter((entry) => !entry.range);
            parsed.series.forEach((series, index) => {
              const color = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f97316"][index % 5];
              const reciprocal = series.equation.replace(/\s+/g, "").toLowerCase().match(/^1\/(tan|sin|cos)\(x\)$/)?.[1];
              if (reciprocal) {
                const offset = reciprocal === "cos" ? Math.PI / 2 : 0;
                const poles = [];
                for (let k = Math.ceil((domain[0] - offset) / Math.PI); k <= Math.floor((domain[1] - offset) / Math.PI); k += 1) {
                  const pole = offset + k * Math.PI;
                  if (pole > domain[0] && pole < domain[1]) poles.push(pole);
                }
                const bounds = [domain[0], ...poles, domain[1]];
                bounds.slice(0, -1).forEach((left, segmentIndex) => refreshed.push({ fn: series.equation, range: [left + 0.035, bounds[segmentIndex + 1] - 0.035], color, graphType: "polyline", sampler: "builtIn" }));
              } else if (/^(?:sgn|sign)\s*\(\s*x\s*\)$/i.test(series.equation)) {
                if (domain[0] < 0) refreshed.push({ fn: "-1", range: [domain[0], Math.min(domain[1], -1e-4)], color, graphType: "polyline", sampler: "builtIn" });
                if (domain[1] > 0) refreshed.push({ fn: "1", range: [Math.max(domain[0], 1e-4), domain[1]], color, graphType: "polyline", sampler: "builtIn" });
              }
            });
            chart.options.data = refreshed;
            chart.draw();
          });
        }
        const texts = container.querySelectorAll("text");
        texts.forEach((text) => { text.style.fill = "#000000"; });
      } catch (err) {
        console.error(err);
        if (active) setPlotError(true);
      }
    };
    const scheduleRender = () => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      renderFrame = requestAnimationFrame(() => {
        renderFrame = 0;
        render();
      });
    };
    scheduleRender();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleRender);
    observer?.observe(container);
    window.addEventListener("resize", scheduleRender);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", scheduleRender);
      if (renderFrame) cancelAnimationFrame(renderFrame);
      container.replaceChildren();
    };
  }, [equation]);
  const handlePlotPointerDown = (event) => {
    const plotArea = event.currentTarget.querySelector(".canvas");
    if (!plotArea) return;
    const bounds = plotArea.getBoundingClientRect();
    if (!bounds.width || !bounds.height || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    const { x: xDomain, y: yDomain } = axisDomainsRef.current;
    const xPosition = (event.clientX - bounds.left) / bounds.width;
    const yPosition = (event.clientY - bounds.top) / bounds.height;
    const x = xDomain[0] + xPosition * (xDomain[1] - xDomain[0]);
    const y = yDomain[1] - yPosition * (yDomain[1] - yDomain[0]);
    setTapCoordinates({ x, y });
  };
  if (plotError) return React.createElement(SvgInteractiveGraph, { equation });
  return React.createElement("figure", { className: "math-graph-frame", "aria-label": `Graph of ${sanitizeLatexForDisplay(equation)}` },
    React.createElement("figcaption", { className: "math-graph-heading" }, sanitizeLatexForDisplay(equation)),
    React.createElement("div", { ref: containerRef, className: "interactive-math-graph-plot", onPointerDown: handlePlotPointerDown, onPointerMove: handlePlotPointerDown, style: { color: "black", width: "100%", minWidth: 0, touchAction: "none" } }),
    tapCoordinates && React.createElement("div", { className: "math-graph-coordinate", role: "status", "aria-live": "polite" }, `x = ${tapCoordinates.x.toFixed(2)}  ·  y = ${tapCoordinates.y.toFixed(2)}`)
  );
}
async function generateSpeech(text, model) {
  const response = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: String(text || "").slice(0, 8000), model, ...getProviderKeys() })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Speech request failed (${response.status}).`);
  if (typeof data.audioBase64 !== "string" || !data.audioBase64) throw new Error("The speech service returned an invalid audio response.");
  const binary = atob(data.audioBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (!bytes.byteLength) throw new Error("The speech service returned an empty audio file.");
  const mimeType = String(data.mimeType || "audio/wav");
  return new Blob([bytes], { type: mimeType.startsWith("audio/") ? mimeType : "audio/wav" });
}
function sanitizeAssistantDiagramMarkup(text) {
  return String(text || "")
    // Remove complete or unterminated visual/code fences before Markdown can
    // turn their contents into large code blocks.
    .replace(/```[ \t]*(?:xml|html)\b[^\n]*(?:\r?\n[\s\S]*?(?:```|$)|$)/gi, "")
    .replace(/~~~[ \t]*(?:xml|html)\b[^\n]*(?:\r?\n[\s\S]*?(?:~~~|$)|$)/gi, "")
    // Keep complete SVGs for MathMarkdown's allowlisted SVG renderer; discard
    // only a malformed, unterminated root that cannot be safely parsed.
    .replace(/<svg\b(?![\s\S]*?<\/svg\s*>)[\s\S]*$/gi, "")
    // Remove only an XML declaration, preserving its complete SVG document.
    .replace(/<\?xml\b[^?]*\?>/gi, "")
    .replace(/<!doctype\b[\s\S]*?(?:\]>|>)/gi, "")
    .replace(/<xml\b[\s\S]*?<\/xml\s*>/gi, "")
    .replace(/!\[[^\]]*\]\(data:image\/svg\+xml[^)]*\)/gi, "");
}

function normalizeAssistantFlowcharts(text) {
  const fence = String.fromCharCode(96).repeat(3);
  let source = String(text || "")
    .replace(/([^\n])```mermaid\b/gi, `$1\n\n${fence}mermaid`)
    .replace(new RegExp(`${fence}mermaid[ \\t]+(?=(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram)\\b)`, "gi"), `${fence}mermaid\n`)
    .replace(/(?:^|\n)(?:mermaid\s*\n)?(flowchart\s+(?:TD|LR|TB|RL)\b[\s\S]+?)(?=\n\s*(?:#{1,4}\s|\n\n|$))/gi, (_match, diagram) => `\n\n${fence}mermaid\n${diagram.trim()}\n${fence}\n\n`);
  source = source
    .replace(/\bsequence\s*:\s*(?=\n?\s*(?:\x60{3}\s*)?(?:mermaid\s*)?(?:flowchart|graph)\s)/gi, "")
    .replace(/([^\n])[ \t]+(flowchart\s+(?:TD|LR|TB|RL)\b)/gi, "$1\n$2")
    .replace(/(^|\n)([ \t]*flowchart\s+(?:TD|LR|TB|RL)\b)[ \t]+(?=[A-Za-z_][\w.-]*(?:\[|\(|\{)?)/gim, "$1$2\n");
  return normalizeUnfencedMermaid(source);
}

function AssistantMessageContent({ message, previousMessage }) {
  const boundedBox = "";
  const usedVisualAssets = new Set();
  const assetKey = (src) => String(src || "").replace(/^\.\//, "/");
  const visualCanvas = (key, child) => React.cloneElement(child, { key });
  const resolveDiagram = (query) => {
    const normalized = String(query || "").trim().toLowerCase();
    const figure = STUDY_FIGURES.find((item) =>
      String(item.id || "").trim().toLowerCase() === normalized ||
      String(item.title || "").trim().toLowerCase() === normalized
    );
    if (figure && !usedVisualAssets.has(assetKey(figure.src))) {
      usedVisualAssets.add(assetKey(figure.src));
      return { src: figure.src, title: figure.title };
    }
    return null;
  };
  const tableComponents = {
    table: ({ children, ...props }) => React.createElement("div", { className: "assistant-table-scroll" }, React.createElement("table", props, children)),
    pre: ({ children, ...props }) => React.createElement("div", { className: `assistant-code-scroll assistant-bounded-box ${boundedBox}` }, React.createElement("pre", props, children)),
    div: ({ children, className = "", ...props }) => className.includes("math-display") || className.includes("katex-display")
      ? React.Children.toArray(children).some((child) => child !== "" && child !== null && child !== false)
        ? React.createElement("div", { className: "assistant-math-scroll" }, React.createElement("div", { ...props, className }, children))
        : null
      : React.createElement("div", { ...props, className }, children),
    input: ({ type, checked, ...props }) => type === "checkbox"
      ? React.createElement("input", { ...props, type: "checkbox", defaultChecked: checked, disabled: false })
      : React.createElement("input", { ...props, type }),
    img: (props) => React.createElement(AssistantMarkdownImage, { ...props, boundedBox })
  };
  const markdown = (text, key) => {
    const sanitized = sanitizeAssistantDiagramMarkup(text);
    if (!sanitized.trim()) return null;
    // MathText owns math repair and Markdown normalization. Running the
    // delimiter/table repair here as well mutated valid formulas twice.
    const sanitizedText = String(sanitized).trim();
    return sanitizedText.trim()
      ? React.createElement(MarkdownErrorBoundary, { key, source: sanitizedText }, React.createElement("div", { className: "assistant-markdown assistant-markdown-content text-gray-900 dark:text-gray-100" }, React.createElement(MathMarkdown, { components: tableComponents, children: sanitizedText })))
      : null;
  };
  const messageText = message.text ?? message.content ?? "";
  const precedingPrompt = previousMessage?.role === "user" ? String(previousMessage.content || "") : "";
  const cleanText = ensureRequestedGraph(precedingPrompt, String(messageText || ""));
  const renderWithDiagramTags = (text, key) => {
    // Strip rogue drawing output before the token splitter or Markdown parser
    // can mistake it for displayable content.
    text = String(text || "")
      // Visual tags are plain routing markup, but the model occasionally
      // wraps them in escaped brackets that the math sanitizer reads as TeX.
      .replace(/\\\[((?:WIKI(?:\\?_|\s+)IMAGE|IMAGE(?:\\?_|\s+)SEARCH|DIAGRAM|FIGURE|SMILES)\s*:[^\]]*?)\\\]/gi, "[$1]")
      .replace(/\[\s*\$?(?:WIKI(?:\\?_|\s+)IMAGE|IMAGE(?:\\?_|\s+)SEARCH)\$?\s*:\s*([^\]]+)\]/gi, (_whole, query) => `[WIKI_IMAGE: ${query.trim()}]`)
      .replace(/\[(WIKI(?:\\?_|\s+)IMAGE|IMAGE(?:\\?_|\s+)SEARCH|DIAGRAM|FIGURE|SMILES)\s*:\s*([^\]\n]*?)\]/gi, (_whole, tag, query) => `[${tag.replace(/\\_/g, "_").replace(/\s+/g, "_").toUpperCase()}: ${query.trim()}]`);
    text = normalizeAssistantFlowcharts(sanitizeAssistantDiagramMarkup(text));
    const smilesRegex = /^\[SMILES:\s*(.+)\]$/i;
    const chunks = String(text || "").split(/(```(?:plot|scientific-plot)[ \t]*\r?\n[\s\S]*?```|\[DIAGRAM:\s*[^\]]+\]|\[FIGURE:\s*[^\]]+\]|\[(?:WIKI_IMAGE|IMAGE_SEARCH):\s*[^\]]+\]|\[SMILES:\s*[^\r\n]*\](?=[\t ]*(?:$|[.,;!?](?:[\t ]|$)))|<jee-[a-zA-Z0-9-]+\s*\/?>)/gim);
    if (chunks.length === 1) return markdown(text, key);
    return React.createElement(React.Fragment, { key }, chunks.map((chunk, index) => {
      const plot = chunk.match(/^```plot[ \t]*\r?\n([\s\S]*?)```$/i);
      if (plot) return visualCanvas(`${key}-plot-canvas-${index}`, React.createElement(InteractiveMathGraph, { equation: plot[1].trim() }));
      const scientificPlot = chunk.match(/^```scientific-plot[ \t]*\r?\n([\s\S]*?)```$/i);
      if (scientificPlot) return visualCanvas(`${key}-scientific-canvas-${index}`, React.createElement(ScientificGraph, { rawString: scientificPlot[1] }));
      const diagram = chunk.match(/^\[DIAGRAM:\s*([^\]]+)\]$/i);
      if (diagram) {
        const query = diagram[1].trim();
        const figure = resolveDiagram(query);
        return figure
          ? React.createElement(AssistantMarkdownImage, { key: `${key}-diagram-${index}`, src: figure.src, alt: figure.title, caption: figure.title, boundedBox })
          : React.createElement(AssistantSearchImage, { key: `${key}-diagram-search-${index}`, query, boundedBox });
      }
      const figureTag = chunk.match(/^\[FIGURE:\s*([^\]]+)\]$/i);
      if (figureTag) {
        const figure = STUDY_FIGURES.find((item) => item.id.toLowerCase() === figureTag[1].trim().toLowerCase());
        if (figure && usedVisualAssets.has(assetKey(figure.src))) return null;
        if (figure) usedVisualAssets.add(assetKey(figure.src));
        return figure
          ? React.createElement(AssistantMarkdownImage, { key: `${key}-figure-${index}`, src: figure.src, alt: figure.title, caption: figure.title, boundedBox })
          : React.createElement(AssistantSearchImage, { key: `${key}-figure-search-${index}`, query: figureTag[1].trim(), boundedBox });
      }
      const wikiTag = chunk.match(/^\[WIKI_IMAGE:\s*([^\]]+)\]$/i);
      if (wikiTag) {
        return React.createElement(AssistantSearchImage, {
          key: `${key}-wiki-${index}`,
          query: wikiTag[1].trim(),
          boundedBox
        });
      }
      const search = chunk.match(/^\[IMAGE_SEARCH:\s*([^\]]+)\]$/i);
      if (search) {
        const query = search[1].trim();
        if (/^https:\/\//i.test(query)) {
          try {
            const url = new URL(query);
            if (url.hostname === "upload.wikimedia.org") {
              if (usedVisualAssets.has(assetKey(url.href))) return null;
              usedVisualAssets.add(assetKey(url.href));
              return React.createElement(AssistantMarkdownImage, { key: `${key}-wiki-${index}`, src: url.href, alt: "Wikimedia Commons diagram", caption: "Wikimedia Commons", boundedBox });
            }
          } catch {}
        }
        return React.createElement(AssistantSearchImage, { key: `${key}-search-${index}`, query, boundedBox });
      }
      const smiles = chunk.match(smilesRegex);
      if (smiles) {
        let safeSmiles = smiles[1].trim();
        // Force aromatic rings for common structures the model may emit in invalid Kekule form.
        if (safeSmiles.includes("C=CC=CC=C") || safeSmiles.toUpperCase() === "C6H6") safeSmiles = "c1ccccc1"; // Benzene
        if (safeSmiles.includes("CC=CC=CC=C") || safeSmiles.toUpperCase() === "C7H8") safeSmiles = "Cc1ccccc1"; // Toluene
        if (safeSmiles.includes("OC=CC=CC=C")) safeSmiles = "Oc1ccccc1"; // Phenol
        if (safeSmiles.includes("CC(=O)OC1=CC=CC=C1C(=O)O")) safeSmiles = "CC(=O)Oc1ccccc1C(=O)O"; // Aspirin
        return visualCanvas(`${key}-smiles-canvas-${index}`, React.createElement(SmilesRenderer, { smiles: safeSmiles }));
      }
      const match = chunk.match(/^<jee-([a-zA-Z0-9-]+)\s*\/?>$/);
      const src = match && JEE_DIAGRAMS[match[1]];
      if (src && usedVisualAssets.has(assetKey(src))) return null;
      if (src) usedVisualAssets.add(assetKey(src));
      return src
        ? React.createElement(AssistantMarkdownImage, { key: `${key}-diagram-${index}`, src, alt: match[1].replace(/^chem-/, "").replace(/-/g, " "), caption: match[1].replace(/^chem-/, "").replace(/-/g, " "), boundedBox })
        : markdown(chunk, `${key}-markdown-${index}`);
    }));
  };
  const visual = message.visual;
  return React.createElement(React.Fragment, null,
    visual ? renderWithDiagramTags(visual.before, "before") : renderWithDiagramTags(cleanText, "body"),
    visual?.url && React.createElement(AssistantGeneratedImage, { src: visual.url }),
    visual?.loading && React.createElement("div", { className: "assistant-generated-placeholder assistant-generating-diagram", role: "status" }, React.createElement("span", null, "Generating diagram…")),
    visual && renderWithDiagramTags(visual.after, "after"),
  );
}
function ScientificPlot({ source }) {
  const targetRef = useRef(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;
    let active = true;
    setError(false);
    const plotFn = typeof functionPlot === "function" ? functionPlot : functionPlot.default;
    try {
      const config = extractJson(source);
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid plot configuration");
      const colors = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f97316"];
      const safeColor = (value, fallback) => typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
      const rawData = Array.isArray(config.data) ? config.data.slice(0, 30) : [];
      const graphText = rawData.flatMap((item) => [item?.fn, item?.fn?.x, item?.fn?.y]).filter((value) => typeof value === "string").join(" ").toLowerCase();
      const inferredDomain = (axis, axisName = "x") => {
        const values = axis?.domain;
        if (Array.isArray(values) && values.length === 2 && values.every((value) => Number.isFinite(Number(value))) && Number(values[0]) < Number(values[1])) return values.map(Number);
        const coordinateIndex = axisName === "x" ? 0 : 1;
        const coordinates = rawData.flatMap((item) => Array.isArray(item?.points) ? item.points.map((point) => Number(point?.[coordinateIndex])) : []).filter(Number.isFinite);
        if (coordinates.length) {
          let low = Math.min(...coordinates), high = Math.max(...coordinates);
          if (low === high) { low -= 1; high += 1; }
          const padding = (high - low) * 0.15;
          return [low - padding, high + padding];
        }
        if (rawData.some((item) => item?.fnType === "implicit" || item?.type === "implicit" || item?.fnType === "parametric" || item?.type === "parametric")) return [-5, 5];
        if (axisName === "x") return /(?:asin|acos|arcsin|arccos)\s*\(/.test(graphText) ? [-1.25, 1.25] : /(?:asec|acsc|arcsec|arccsc)\s*\(/.test(graphText) ? [-6, 6] : /(?:atan|acot|arctan|arccot)\s*\(/.test(graphText) ? [-8, 8] : /(?:sin|cos|tan|cot|sec|csc)\s*\(/.test(graphText) ? [-2 * Math.PI, 2 * Math.PI] : /(?:ln|log)\s*\(/.test(graphText) ? [-1, 10] : /exp\s*\(\s*x\s*\)|e\s*\^\s*x/.test(graphText) ? [-4, 4] : [-10, 10];
        return /(?:acos|arccos|acot|arccot|asec|arcsec)\s*\(/.test(graphText) ? [-0.5, Math.PI + 0.5] : /(?:asin|arcsin|acsc|arccsc|atan|arctan)\s*\(/.test(graphText) ? [-Math.PI / 2 - 0.5, Math.PI / 2 + 0.5] : /(?:tan|cot|sec|csc)\s*\(/.test(graphText) ? [-6, 6] : /(?:sin|cos)\s*\(/.test(graphText) ? [-2, 2] : /(?:ln|log)\s*\(/.test(graphText) ? [-4, 4] : /exp\s*\(\s*x\s*\)|e\s*\^\s*x/.test(graphText) ? [-1, 12] : [-10, 10];
      };
      const xDomain = inferredDomain(config.xAxis, "x");
      const segmentFunction = (equation, color, range, activeXDomain = xDomain) => {
        const compact = equation.replace(/\s+/g, "").toLowerCase();
        let offset = null;
        let period = Math.PI;
        if (/^tan\(x\)$/.test(compact)) offset = Math.PI / 2;
        else if (/^1\/tan\(x\)$/.test(compact) || /^1\/sin\(x\)$/.test(compact)) offset = 0;
        else if (/^1\/cos\(x\)$/.test(compact)) offset = Math.PI / 2;
        else if (/^1\/x(?:\^2)?$/.test(compact)) { offset = 0; period = Infinity; }
        const low = Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) ? Math.max(activeXDomain[0], range[0]) : activeXDomain[0];
        const high = Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) ? Math.min(activeXDomain[1], range[1]) : activeXDomain[1];
        if (offset === null || high <= low) return [{ fn: equation, color, graphType: "polyline", sampler: "builtIn", ...(range ? { range } : {}) }];
        const poles = period === Infinity
          ? (low < 0 && high > 0 ? [0] : [])
          : Array.from({ length: Math.max(0, Math.ceil((high - offset) / period) - Math.floor((low - offset) / period) + 1) }, (_, index) => (Math.floor((low - offset) / period) + index + 1) * period + offset).filter((pole) => pole > low && pole < high);
        const bounds = [low, ...poles, high];
        const epsilon = Math.min(0.035, (high - low) / 1000);
        return bounds.slice(0, -1).map((left, index) => ({
          fn: equation,
          range: [left + (index ? epsilon : 0), bounds[index + 1] - (index < bounds.length - 2 ? epsilon : 0)],
          color,
          graphType: "polyline",
          sampler: "builtIn"
        })).filter((item) => item.range[1] > item.range[0]);
      };
      const data = rawData.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const color = safeColor(item.color, safeColor(config.colors?.[index], colors[index % colors.length]));
        if (Array.isArray(item.points)) {
          const points = item.points.slice(0, 1000).filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))).map((point) => [Number(point[0]), Number(point[1])]);
          if (!points.length) return [];
          const polyline = item.graphType === "polyline" || item.type === "polyline" || item.closed === true;
          return [{ points, fnType: "points", graphType: polyline ? "polyline" : "scatter", color, ...(item.closed === true ? { closed: true } : {}) }];
        }
        if (item.fnType === "parametric" && item.range?.length === 2) {
          const pair = typeof item.fn === "object" && item.fn ? item.fn : { x: item.x, y: item.y };
          if (typeof pair.x === "string" && typeof pair.y === "string") return [{ fn: { x: pair.x, y: pair.y }, fnType: "parametric", range: item.range.map(Number), color, graphType: "polyline", sampler: "builtIn" }];
        }
        if (typeof item.fn === "string" && item.fn.length <= 240) {
          try {
            const parsed = normalizeInteractiveGraphEquation(item.fn);
            const equation = parsed.equation;
            return item.fnType === "implicit" || parsed.fnType === "implicit"
              ? [{ fn: equation, fnType: "implicit", color, graphType: "polyline", sampler: "builtIn" }]
              : segmentFunction(equation, color, item.range);
          }
          catch { return []; }
        }
        return [];
      });
      if (!data.length) throw new Error("No graph data");
      const scientificTrigInput = rawData.some((item) => typeof item?.fn === "string" && /\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(item.fn));
      const scientificInverseOutput = rawData.some((item) => typeof item?.fn === "string" && /\b(?:asin|acos|atan|acot|arcsin|arccos|arctan)\s*\(/i.test(item.fn));
      const width = Math.max(260, Math.floor(target.clientWidth || 480));
      const yDomain = inferredDomain(config.yAxis, "y");
      const chart = plotFn({ target, width, height: 350, margin: { left: 68, right: 18, top: 24, bottom: 58 }, grid: true, disableZoom: false, xAxis: { domain: xDomain, label: String(config.xAxis?.label || "x").slice(0, 60), ...(scientificTrigInput ? { ticks: piTickValues(xDomain).length, tickValues: piTickValues(xDomain), tickFormat: formatPiTick } : {}) }, yAxis: { domain: yDomain, label: String(config.yAxis?.label || "y").slice(0, 60), ...(scientificInverseOutput ? { ticks: piTickValues(yDomain).length, tickValues: piTickValues(yDomain), tickFormat: formatPiTick } : {}) }, data });
      if (scientificTrigInput) useRadianTicks(chart?.meta?.xAxis, xDomain);
      if (scientificInverseOutput) useRadianTicks(chart?.meta?.yAxis, yDomain);
      chart?.build?.();
      chart?.on?.("zoom", () => {
        const nextX = chart?.meta?.xScale?.domain?.();
        const nextY = chart?.meta?.yScale?.domain?.();
        if (scientificTrigInput && nextX?.length === 2) useRadianTicks(chart?.meta?.xAxis, nextX);
        if (scientificInverseOutput && nextY?.length === 2) useRadianTicks(chart?.meta?.yAxis, nextY);
        if (scientificTrigInput && nextX?.length === 2) {
          const dynamicRows = rawData.filter((item) => typeof item?.fn === "string" && /\b(?:sin|cos|tan|cot|sec|csc)\s*\(/i.test(item.fn));
          const dynamicExpressions = new Set(dynamicRows.map((item) => {
            try { return normalizeInteractiveGraphEquation(item.fn).equation; } catch { return item.fn.trim(); }
          }));
          const retained = data.filter((entry) => !dynamicExpressions.has(entry.fn));
          const refreshed = dynamicRows.flatMap((item, index) => {
            let equation = item.fn.trim();
            try { equation = normalizeInteractiveGraphEquation(equation).equation || equation; } catch {}
            return segmentFunction(equation, safeColor(item.color, safeColor(config.colors?.[index], colors[index % colors.length])), item.range, nextX);
          });
          chart.options.data = [...retained, ...refreshed];
        }
        if (scientificTrigInput || scientificInverseOutput) chart?.draw?.();
      });
      target.querySelectorAll("text").forEach((node) => { node.style.fill = "currentColor"; });
    } catch { if (active) setError(true); }
    return () => { active = false; target.replaceChildren(); };
  }, [source]);
  if (error) return React.createElement("figure", { className: "scientific-graph-frame scientific-graph-fallback", role: "status" }, React.createElement("figcaption", { className: "scientific-graph-title" }, "Scientific graph"), React.createElement("p", null, "This graph could not be rendered. Please check the graph data and try again."));
  let title = "Scientific graph";
  try { title = String(extractJson(source).title || title).slice(0, 120); } catch {}
  return React.createElement("figure", { className: "scientific-graph-frame" }, React.createElement("div", { ref: targetRef, className: "scientific-graph-plot function-plot", role: "img", "aria-label": title }), React.createElement("figcaption", { className: "scientific-graph-title" }, title));
}
function AssistantGeneratedImage({ src }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return React.createElement("img", { className: "assistant-generated-image", src, alt: "Concept diagram", loading: "lazy", onError: () => setFailed(true) });
}
function AssistantSearchImage({ query, boundedBox }) {
  const [result, setResult] = useState({ images: [], index: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setResult({ images: [], index: 0 });
    setLoading(true);
    const normalizeCandidates = (image) => {
      const candidates = Array.isArray(image?.images) ? image.images : (image?.url ? [image] : []);
      return candidates.flatMap((candidate) => {
        try {
          const safeUrl = new URL(candidate?.url, window.location.origin);
          return safeUrl.protocol === "https:" || safeUrl.origin === window.location.origin
            ? [{ ...candidate, url: safeUrl.href }]
            : [];
        } catch { return []; }
      });
    };
    const searchDirectly = async () => {
      const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
      Object.entries({ action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "12", prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "1200", format: "json", formatversion: "2", origin: "*" }).forEach(([key, value]) => endpoint.searchParams.set(key, value));
      const response = await fetch(endpoint.href, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Wikimedia image search failed.");
      const payload = await response.json();
      const images = (payload.query?.pages || []).flatMap((page) => {
        const info = page.imageinfo?.[0];
        const url = info?.thumburl || info?.url;
        if (!url || !/^https:\/\/(?:upload\.wikimedia\.org|thumb\.wikimedia\.org)\//i.test(url)) return [];
        const title = String(page.title || "Study illustration").replace(/^File:/, "").replace(/_/g, " ");
        return [{ url, title, pageUrl: info.descriptionurl || "", license: String(info.extmetadata?.LicenseShortName?.value || "").replace(/<[^>]*>/g, "") }];
      });
      if (!images.length) throw new Error("No suitable Wikimedia image was found.");
      return { images };
    };
    const search = async () => {
      try {
        const response = await fetch(`/api/image-search?q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!response.ok) throw new Error(`Image search failed (${response.status})`);
        return await response.json();
      } catch {
        return searchDirectly();
      }
    };
    search()
      .then((image) => {
        if (!active) return;
        const images = normalizeCandidates(image);
        setResult({ images, index: 0 });
        setLoading(false);
      })
      .catch(() => { if (active) { setResult({ images: [], index: 0 }); setLoading(false); } });
    return () => { active = false; };
  }, [query]);
  if (loading) return React.createElement("div", { className: "assistant-reference-figure bg-white rounded-xl p-4 shadow-sm w-full", role: "status", "aria-label": `Searching for ${query}` }, React.createElement("div", { className: "assistant-image-skeleton" }));
  const image = result.images[result.index];
  if (!image?.url) return React.createElement("div", { className: "assistant-reference-figure bg-white rounded-xl p-4 shadow-sm w-full text-sm text-gray-500", role: "status" }, `No Wikimedia image was found for “${query}”.`);
  return React.createElement("figure", { className: "assistant-reference-figure" },
    React.createElement(AssistantMarkdownImage, {
      key: image.url,
      src: image.url,
      alt: image.title || query,
      boundedBox,
      onError: () => setResult((current) => ({ ...current, index: Math.min(current.index + 1, current.images.length) }))
    }),
    React.createElement("figcaption", null, image.pageUrl ? React.createElement("a", { href: image.pageUrl, target: "_blank", rel: "noreferrer" }, image.title || query) : (image.title || query), image.license ? ` · ${image.license}` : " · Wikimedia Commons")
  );
}
function AssistantMarkdownImage({ src, alt = "Study diagram", caption = "", boundedBox, ...props }) {
  const [loaded, setLoaded] = useState(false);
  return React.createElement("figure", { className: "assistant-reference-figure" }, React.createElement("div", { className: `bg-white rounded-xl p-4 shadow-sm text-black w-full flex flex-col items-center assistant-image-scroll assistant-bounded-box ${boundedBox} ${loaded ? "is-loaded" : "is-loading"}` },
    !loaded && React.createElement("div", { className: "assistant-image-skeleton", role: "status", "aria-label": `Loading ${alt}` }),
    React.createElement(ImageFullView, {
      ...props,
      src,
      alt,
      loading: "lazy",
      className: `assistant-markdown-image ${loaded ? "is-loaded" : ""}`,
      onLoad: (event) => { props.onLoad?.(event); setLoaded(true); },
      onError: (event) => { props.onError?.(event); setLoaded(true); }
    })
  ), caption && React.createElement("figcaption", null, caption));
}
class MarkdownErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return React.createElement("div", { className: "math-render-fallback" }, String(this.props.source ?? "")
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
      .replace(/`+/g, "")
      .replace(/^\s*[-*+]\s+/gm, "• ")
      .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
      .replace(/\|/g, "  ·  ")
      .replace(/\$+/g, "")
      .replace(/[ \t]{2,}/g, " "));
    return this.props.children;
  }
}
const MemoAssistantMessageContent = React.memo(AssistantMessageContent);
function StudyCopilot({ messages = [], onChange, userName = "", onHome, modelPrefs = DEFAULT_MODEL_PREFERENCES }) {
  const [threads, setThreads] = useState(readThreads);
  const [threadId, setThreadId] = useState(() => localStorage.getItem(ACTIVE_THREAD_KEY) || null);
  const [chatMessages, setChatMessages] = useState(() => {
    const id = localStorage.getItem(ACTIVE_THREAD_KEY);
    const active = readThreads().find((thread) => thread.id === id);
    return active?.messages || messages || [];
  });
  const chatMessagesRef = useRef(chatMessages);
  chatMessagesRef.current = chatMessages;
  const [sidebar, setSidebar] = useState(false);
  const [sidebarClosing, setSidebarClosing] = useState(false);
  const [threadMenu, setThreadMenu] = useState(null);
  const [renamingThreadId, setRenamingThreadId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [selectedModelOverride, setSelectedModelOverride] = useState(modelPrefs?.assistant || "auto");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retryStatus, setRetryStatus] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [audioUrls, setAudioUrls] = useState({});
  const [speaking, setSpeaking] = useState(null);
  const [audioLoadingId, setAudioLoadingId] = useState(null);
  const [localNow, setLocalNow] = useState(() => new Date());
  useEffect(() => {
    const prefill = localStorage.getItem("apex-copilot-prefill");
    if (!prefill) return;
    localStorage.removeItem("apex-copilot-prefill");
    setDraft(prefill);
  }, []);
  const audioPlayersRef = useRef({});
  const modelPickerRef = useRef(null);
  const discardAudio = (id, urlToRevoke = audioUrls[id]) => {
    const url = urlToRevoke;
    if (url) URL.revokeObjectURL(url);
    delete audioPlayersRef.current[id];
    setAudioUrls((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };
  const stopAudio = (id) => {
    const audio = audioPlayersRef.current[id];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setSpeaking(null);
  };
  const fileInputRef = useRef(null);
  const listRef = useRef(null);
  const followAssistantResponseRef = useRef(true);
  const headerActionsRef = useRef(null);
  const assistantSidebarRef = useRef(null);
  const assistantSidebarBackdropRef = useRef(null);
  const assistantTouchRef = useRef(null);
  const assistantSidebarTouchRef = useRef(null);
  const sidebarCloseTimerRef = useRef(null);
  const openSidebar = () => {
    window.clearTimeout(sidebarCloseTimerRef.current);
    setSidebarClosing(false);
    setSidebar(true);
  };
  const closeSidebar = () => {
    if (!sidebar) return;
    setSidebarClosing(true);
    if (assistantSidebarRef.current) assistantSidebarRef.current.style.transform = "";
    if (assistantSidebarBackdropRef.current) assistantSidebarBackdropRef.current.style.opacity = "";
    window.clearTimeout(sidebarCloseTimerRef.current);
    sidebarCloseTimerRef.current = window.setTimeout(() => {
      setSidebar(false);
      setSidebarClosing(false);
    }, 300);
  };
  const onAssistantTouchStart = (event) => {
    if (sidebar || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (touch.clientX <= 26) assistantTouchRef.current = { x: touch.clientX, y: touch.clientY, active: false };
  };
  const onAssistantTouchMove = (event) => {
    const start = assistantTouchRef.current;
    const touch = event.touches?.[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) || dx < 10) return;
    start.active = true;
    if (event.cancelable) event.preventDefault();
  };
  const onAssistantTouchEnd = (event) => {
    const start = assistantTouchRef.current;
    assistantTouchRef.current = null;
    const touch = event.changedTouches?.[0];
    if (sidebar || !start || !touch) return;
    if (touch.clientX - start.x >= 58 && Math.abs(touch.clientY - start.y) < 70) openSidebar();
  };
  const onAssistantSidebarTouchStart = (event) => {
    if (event.touches.length !== 1 || sidebarClosing) return;
    const touch = event.touches[0];
    assistantSidebarTouchRef.current = { x: touch.clientX, y: touch.clientY, lastX: touch.clientX, lastTime: performance.now(), width: event.currentTarget.clientWidth, active: false, velocity: 0 };
  };
  const onAssistantSidebarTouchMove = (event) => {
    const gesture = assistantSidebarTouchRef.current;
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x;
    if (!gesture.active && Math.abs(touch.clientY - gesture.y) > Math.abs(dx)) return;
    if (dx >= 0) return;
    gesture.active = true;
    const now = performance.now();
    gesture.velocity = Math.max(0, gesture.lastX - touch.clientX) / Math.max(1, now - gesture.lastTime);
    gesture.lastX = touch.clientX;
    gesture.lastTime = now;
    const offset = Math.max(-gesture.width, dx);
    event.currentTarget.classList.add("is-swiping");
    event.currentTarget.style.transform = `translate3d(${offset}px,0,0)`;
    if (assistantSidebarBackdropRef.current) {
      assistantSidebarBackdropRef.current.classList.add("is-swiping");
      assistantSidebarBackdropRef.current.style.opacity = String(1 - Math.min(1, Math.abs(offset) / gesture.width) * 0.68);
    }
    if (event.cancelable) event.preventDefault();
  };
  const onAssistantSidebarTouchEnd = (event, cancelled = false) => {
    const gesture = assistantSidebarTouchRef.current;
    assistantSidebarTouchRef.current = null;
    if (!gesture?.active) return;
    const touch = event.changedTouches?.[0];
    const endX = touch?.clientX ?? gesture.lastX;
    const distance = gesture.x - endX;
    const finalDelta = Math.max(0, gesture.lastX - endX);
    const velocity = finalDelta ? finalDelta / Math.max(1, performance.now() - gesture.lastTime) : gesture.velocity;
    const close = !cancelled && (distance >= gesture.width * 0.38 || distance >= 28 && velocity >= 0.65);
    assistantSidebarRef.current?.classList.remove("is-swiping");
    assistantSidebarBackdropRef.current?.classList.remove("is-swiping");
    if (close) closeSidebar();
    else {
      if (assistantSidebarRef.current) assistantSidebarRef.current.style.transform = "";
      if (assistantSidebarBackdropRef.current) assistantSidebarBackdropRef.current.style.opacity = "";
    }
  };
  useEffect(() => () => window.clearTimeout(sidebarCloseTimerRef.current), []);
  useEffect(() => {
    const timer = window.setInterval(() => setLocalNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const conversation = listRef.current;
    if (!conversation) return;
    if (followAssistantResponseRef.current) conversation.scrollTop = conversation.scrollHeight;
    setHeaderScrolled(conversation.scrollTop > 0);
  }, [chatMessages, sending, retryStatus]);
  useEffect(() => {
    if (!headerMenuOpen) return;
    const closeOnOutsidePress = (event) => {
      if (!headerActionsRef.current?.contains(event.target)) setHeaderMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setHeaderMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [headerMenuOpen]);
  useEffect(() => {
    if (!modelMenuOpen) return;
    const closeOnOutsidePress = (event) => {
      if (!modelPickerRef.current?.contains(event.target)) setModelMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setModelMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelMenuOpen]);
  useEffect(() => {
    if (!imageGalleryOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setImageGalleryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imageGalleryOpen]);
  useEffect(() => {
    onChange?.(chatMessages);
  }, [chatMessages]);
  const persistThreads = (next) => {
    setThreads(next);
    try {
      localStorage.setItem(THREAD_KEY, JSON.stringify(next));
    } catch {
      setError("Could not save chat history on this device.");
    }
  };
  const saveThread = (id, items, title) => {
    const nextThread = { id, title: title || "New thread", messages: items, updatedAt: Date.now() };
    persistThreads([nextThread, ...threads.filter((item) => item.id !== id)].slice(0, 50));
  };
  const newThread = () => {
    setThreadId(null);
    localStorage.removeItem(ACTIVE_THREAD_KEY);
    setChatMessages([]);
    setDraft("");
    setError("");
    closeSidebar();
    setThreadMenu(null);
    setHeaderMenuOpen(false);
  };
  const selectThread = (thread) => {
    setThreadId(thread.id);
    localStorage.setItem(ACTIVE_THREAD_KEY, thread.id);
    setChatMessages(thread.messages || []);
    setDraft("");
    setError("");
    closeSidebar();
  };
  const removeThread = (id) => {
    persistThreads(threads.filter((thread) => thread.id !== id));
    if (threadId === id) newThread();
    setThreadMenu(null);
  };
  const beginRenameThread = (thread) => {
    setRenameDraft(thread.title || "");
    setRenamingThreadId(thread.id);
    setThreadMenu(null);
  };
  const commitRenameThread = (id) => {
    const title = renameDraft.trim();
    if (title) persistThreads(threads.map((thread) => thread.id === id ? { ...thread, title } : thread));
    setRenamingThreadId(null);
    setRenameDraft("");
  };
  const deleteHistory = () => {
    persistThreads([]);
    localStorage.removeItem(ACTIVE_THREAD_KEY);
    setThreadId(null);
    setChatMessages([]);
    setDraft("");
    setAttachments([]);
    setError("");
    setRetryStatus("");
    closeSidebar();
    setThreadMenu(null);
    setHeaderMenuOpen(false);
  };
  const readAttachment = async (file) => {
    if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is larger than 15 MB.`);
    if (file.type === "application/pdf") {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const pdfWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 35); pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => item.str).join(" "));
      }
      return { name: file.name, type: "application/pdf", text: pages.join("\n").slice(0, 8e3) };
    }
    if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name)) {
      const response = await fetch("/api/transcription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: await readFileDataUrl(file), mimeType: file.type || "audio/webm", model: modelPrefs?.transcription || "whisper-large-v3-turbo", ...getProviderKeys() }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.transcript) throw new Error(result.error || "Voice transcription is unavailable.");
      const transcript = result.transcript;
      return { name: file.name, type: "audio/transcript", transcript, text: transcript };
    }
    if (!file.type.startsWith("image/")) throw new Error("Choose a photo, PDF, or audio recording.");
    const data = await readImageDataUrl(file, 1200, 0.72);
    return { name: file.name, type: "image/jpeg", data };
  };
  const addAttachments = async (files) => {
    setError("");
    setRetryStatus("");
    try {
      const next = [];
      for (const file of files) next.push(await readAttachment(file));
      const combined = [...attachments, ...next].slice(0, 5);
      if (combined.filter((item) => item.data).length > 3) {
        setError("Attach up to three images per message.");
        return;
      }
      setAttachments(combined);
    } catch (e) {
      setError(summarizeLimitError(e) || e.message || "Could not attach that file.");
    } finally {
      setRetryStatus("");
    }
  };
  const send = async (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text && !attachments.length || sending) return;
    const promptText = text || "Please analyze the attached file.";
    const attachmentText = attachments.map((item) => item.type === "application/pdf" ? `

PDF ${item.name}:
${item.text}` : item.transcript ? `

Audio transcript (${item.name}):
${item.transcript}` : `
[Image attached: ${item.name}]`).join("");
    const user = { id: crypto.randomUUID(), role: "user", content: `${promptText}${attachmentText}`, attachments, modelOverride: selectedModelOverride };
    const current = [...chatMessages, user].slice(-50);
    followAssistantResponseRef.current = true;
    const id = threadId || crypto.randomUUID();
    const title = threads.find((thread) => thread.id === id)?.title || promptText.replace(/\s+/g, " ").slice(0, 56);
    setThreadId(id);
    localStorage.setItem(ACTIVE_THREAD_KEY, id);
    setChatMessages(current);
    saveThread(id, current, title);
    setDraft("");
    setAttachments([]);
    setSending(true);
    setError("");
    setRetryStatus("");
    try {
      const history = current.slice(-8).map((message) => {
        const content = String(message.content || "").replace(/data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+/gi, "[previous generated image omitted]");
        const boundedText = content;
        const bounded = message.id === user.id ? boundedText.slice(-9e3) : boundedText.slice(-1100);
        return { role: message.role, content: message.id === user.id && message.attachments?.some((file) => file.data) ? [{ type: "text", text: bounded }, ...message.attachments.filter((file) => file.data).slice(0, 3).map((file) => ({ type: "image_url", image_url: { url: file.data } }))] : bounded };
      });
      const requestText = String(user.content).toLowerCase();
      const functionPlotRequest = wantsFunctionGraph(promptText);
      const visualRequest = wantsGeneratedVisual(promptText) || functionPlotRequest;
      const needsSearch = !visualRequest && /\b(latest|current|today|news|price|recent|source|cite|search|update|verify|verified|accurate data)\b/.test(requestText);
      const systemPrompt = visualSystemRules();
      const requestMessages = [{ role: "system", content: systemPrompt }, ...history];
      let response;
      try {
        response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: visualRequest ? "visual" : "assistant", messages: requestMessages, googleSearch: needsSearch, modelOverride: selectedModelOverride, ...getProviderKeys() })
        });
      } catch {
        throw new Error("Can’t reach the assistant right now. Check your connection and try again.");
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The assistant is temporarily unavailable. Please try again.");
      const rawAnswer = String(result.answer || "").trim();
      const answer = normalizeUnfencedMermaid(ensureRequestedGraph(promptText, rawAnswer)).trim();
      if (!answer) throw new Error("The assistant returned an empty reply. Please try again.");
      const assistantMessage = { id: crypto.randomUUID(), role: "assistant", content: answer, model: result.provider || "Apex Assistant" };
      const next = [...current, assistantMessage].slice(-50);
      chatMessagesRef.current = next;
      setChatMessages(next);
      saveThread(id, next, title);
    } catch (e) {
      setError(String(e?.message || "I couldn’t generate a reply. Please try again."));
    } finally {
      setSending(false);
      setRetryStatus("");
    }
  };
  const speakAnswer = async (message) => {
    if (audioUrls[message.id]) {
      const audio = audioPlayersRef.current[message.id];
      if (audio) {
        if (speaking === message.id) {
          audio.pause();
          setSpeaking(null);
        } else {
          Object.values(audioPlayersRef.current).forEach((item) => item?.pause());
          try {
            await audio.play();
            setSpeaking(message.id);
            setError("");
          } catch {
            discardAudio(message.id);
            setError("The generated audio could not be played.");
          }
        }
      }
      return;
    }
    if (audioLoadingId) return;
    setAudioLoadingId(message.id);
    setError("");
    setRetryStatus("");
    try {
      const sanitizedText = sanitizeForTTS(message.content);
      const blob = await generateSpeech(sanitizedText, modelPrefs?.speech || "canopylabs/orpheus-v1-english");
      if (!blob.size) throw new Error("The speech service returned an empty audio file.");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioPlayersRef.current[message.id] = audio;
      audio.onended = () => setSpeaking((current) => current === message.id ? null : current);
      audio.onerror = () => {
        discardAudio(message.id, url);
        setSpeaking(null);
        setError("The generated audio could not be played.");
      };
      Object.values(audioPlayersRef.current).forEach((item) => { if (item !== audio) item?.pause(); });
      setAudioUrls((current) => ({ ...current, [message.id]: url }));
      await audio.play();
      setSpeaking(message.id);
    } catch (error) {
      setError(summarizeLimitError(error) || error?.message || "Could not generate spoken audio.");
    } finally {
      setAudioLoadingId(null);
      setRetryStatus("");
    }
  };
  const greetingName = userName?.trim() ? `, ${userName.trim()}` : "";
  const greetingHour = localNow.getHours();
  const greeting = greetingHour >= 5 && greetingHour < 12 ? "Good morning" : greetingHour >= 12 && greetingHour < 17 ? "Good afternoon" : "Good evening";
  const limitStatus = error.includes(" limit reached: ");
  const galleryImages = (() => {
    const found = [];
    const seen = new Set();
    const add = (src, alt) => {
      if (!src || seen.has(src)) return;
      seen.add(src);
      found.push({ src, alt: alt || "Assistant image" });
    };
    const imageMessages = chatMessages;
    for (const message of imageMessages) {
      if (message.role !== "assistant") continue;
      if (message.visual?.url) add(message.visual.url, message.visual.explanation || "Generated illustration");
      const text = [message.content, message.visual?.before, message.visual?.after].filter(Boolean).join("\n");
      for (const match of text.matchAll(/!\[([^\]]*)\]\(([^\s)]+)\)/g)) add(match[2], match[1]);
      for (const match of text.matchAll(/\[WIKI_IMAGE:\s*(https?:\/\/[^\]\s]+)\s*\]/gi)) add(match[1], "Study illustration");
      for (const match of text.matchAll(/(?:data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+|data:image\/svg\+xml;charset=utf-8,[^\s)]+)/gi)) add(match[0], "Generated diagram");
      if (message.visual?.dataUrl) add(message.visual.dataUrl, message.visual.explanation || "Generated illustration");
      if (message.visual?.svg) add(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(message.visual.svg)}`, message.visual.explanation || "Generated diagram");
      for (const match of text.matchAll(/<jee-([a-zA-Z0-9-]+)\s*\/?>/g)) {
        const src = JEE_DIAGRAMS[match[1]];
        if (src) add(src, match[1].replace(/^chem-/, "").replace(/-/g, " "));
      }
      for (const id of message.figureIds || []) {
        const figure = STUDY_FIGURES.find((item) => item.id === id);
        if (figure) add(figure.src, figure.title);
      }
    }
    if (imageGalleryOpen) {
      document.querySelectorAll(".assistant-conversation canvas").forEach((canvas, index) => {
        try { add(canvas.toDataURL("image/png"), `Generated molecule ${index + 1}`); } catch { /* Ignore tainted or empty canvases. */ }
      });
      document.querySelectorAll(".assistant-conversation .math-graph-plot > svg, .assistant-conversation .interactive-math-graph-plot > svg, .assistant-conversation .scientific-graph-plot > svg, .assistant-conversation .assistant-mermaid svg, .assistant-conversation .assistant-inline-svg svg, .assistant-conversation .smiles-renderer-svg > svg").forEach((svg, index) => {
        try {
          const snapshot = svg.cloneNode(true);
          const box = snapshot.viewBox?.baseVal;
          const width = box?.width || Number.parseFloat(snapshot.getAttribute("width")) || 600;
          const height = box?.height || Number.parseFloat(snapshot.getAttribute("height")) || 400;
          const x = box?.x || 0;
          const y = box?.y || 0;
          const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          background.setAttribute("x", String(x));
          background.setAttribute("y", String(y));
          background.setAttribute("width", String(width));
          background.setAttribute("height", String(height));
          background.setAttribute("fill", "white");
          snapshot.insertBefore(background, snapshot.firstChild);
          snapshot.setAttribute("color", "black");
          snapshot.setAttribute("style", "background-color: white;");
          add(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(snapshot))}`, `Generated diagram ${index + 1}`);
        } catch { /* Ignore unavailable SVG snapshots. */ }
      });
      document.querySelectorAll(".assistant-conversation .assistant-answer-body img").forEach((img) => add(img.currentSrc || img.src, img.alt || "Generated image"));
    }
    return found;
  })();
  const modelChoices = [
    { value: "auto", label: "Auto · GPT-OSS 120B first" },
    ...AI_MODELS.filter((model) => model.kind === "chat" || model.kind === "image").map((model) => ({ value: model.id, label: model.label }))
  ];
  return /* @__PURE__ */ jsx("section", { className: `assistant-page ${chatMessages.length ? "has-chat fixed inset-0 w-full h-full bg-white dark:bg-black z-40 overflow-y-auto" : ""} ${sidebar ? "sidebar-open" : ""}`, "aria-label": "AI Assistant", onTouchStart: onAssistantTouchStart, onTouchMove: onAssistantTouchMove, onTouchEnd: onAssistantTouchEnd, children: [
    React.createElement("header", { className: `assistant-topbar ${headerScrolled ? "is-scrolled" : ""}` },
      React.createElement("div", { className: "assistant-header-left" },
        React.createElement("button", { className: "assistant-sidebar-toggle", onClick: openSidebar, "aria-label": "Open chat threads" },
          React.createElement("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" },
            React.createElement("path", { d: "M4 8h16M4 16h16", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" })
          )
        ),
        React.createElement("div", { className: "assistant-model-picker", ref: modelPickerRef },
          React.createElement("button", { type: "button", className: "assistant-model-trigger", onClick: () => setModelMenuOpen((open) => !open), "aria-label": "Choose assistant model", "aria-haspopup": "menu", "aria-expanded": modelMenuOpen, disabled: sending },
            React.createElement("span", null, "Apex Assistant"),
            React.createElement(ChevronDown, { size: 17, strokeWidth: 1.9, "aria-hidden": "true" })
          ),
          modelMenuOpen && React.createElement("div", { className: "assistant-model-menu", role: "menu", "aria-label": "Choose model for the next message" },
            modelChoices.map((choice) => React.createElement("button", { key: choice.value, type: "button", role: "menuitemradio", "aria-checked": selectedModelOverride === choice.value, onClick: () => { setSelectedModelOverride(choice.value); setModelMenuOpen(false); } },
              React.createElement("span", null, choice.label),
              selectedModelOverride === choice.value && React.createElement("span", { className: "assistant-model-check", "aria-hidden": "true" }, "✓")
            ))
          )
        )
      ),
      React.createElement("div", { className: "assistant-header-actions", ref: headerActionsRef },
        React.createElement("div", { className: "assistant-header-glass" },
          React.createElement("button", { className: "assistant-header-action", onClick: newThread, "aria-label": "New chat", title: "New chat" },
            React.createElement("svg", { className: "assistant-new-chat-icon", width: 26, height: 26, viewBox: "0 0 24 24", "aria-hidden": "true" },
              React.createElement("path", { d: "M12 3.5a8 8 0 0 1 8 8v.5a8 8 0 0 1-8 8H8l-4 1.5 1-4A8 8 0 0 1 4 12v-.5a8 8 0 0 1 8-8Z", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }),
              React.createElement("path", { d: "M12 9v6M9 12h6", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" })
            )
          ),
          React.createElement("button", { className: "assistant-header-action", onClick: () => setHeaderMenuOpen((open) => !open), "aria-label": "More assistant options", "aria-haspopup": "menu", "aria-expanded": headerMenuOpen }, React.createElement(MoreHorizontal, { size: 21, strokeWidth: 1.8 })),
          React.createElement("button", { className: "assistant-header-action assistant-header-close", onClick: onHome, "aria-label": "Close assistant", title: "Close assistant" }, React.createElement(X, { size: 18, strokeWidth: 1.9 }))
        ),
        headerMenuOpen && React.createElement("div", { className: "assistant-header-menu", role: "menu" },
          React.createElement("button", { role: "menuitem", onClick: deleteHistory }, React.createElement(Trash2, { size: 17, strokeWidth: 1.8 }), React.createElement("span", null, "Delete history")),
          React.createElement("button", { role: "menuitem", onClick: () => { setHeaderMenuOpen(false); setImageGalleryOpen(true); } }, React.createElement(Images, { size: 17, strokeWidth: 1.8 }), React.createElement("span", null, "View generated images"))
        )
      )
    ),
    imageGalleryOpen && React.createElement("div", { className: "assistant-image-gallery-backdrop", onMouseDown: (event) => { if (event.target === event.currentTarget) setImageGalleryOpen(false); } },
      React.createElement("section", { className: "assistant-image-gallery-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Generated images" },
        React.createElement("div", { className: "assistant-image-gallery-heading" },
          React.createElement("h2", null, "Generated images"),
          React.createElement("button", { className: "assistant-gallery-close", onClick: () => setImageGalleryOpen(false), "aria-label": "Close generated images" }, React.createElement(X, { size: 19 }))
        ),
        galleryImages.length
          ? React.createElement("div", { className: "assistant-image-gallery-grid" }, galleryImages.map((item, index) => React.createElement("figure", { className: "assistant-image-gallery-card", key: `${item.src}-${index}` }, React.createElement(ImageFullView, { src: item.src, alt: item.alt, loading: "lazy" }), React.createElement("figcaption", null, item.alt))))
          : React.createElement("p", { className: "assistant-image-gallery-empty" }, "No generated images in this conversation yet.")
      )
    ),
    sidebar && /* @__PURE__ */ jsx(Fragment, { children: [
      /* @__PURE__ */ jsx("button", { ref: assistantSidebarBackdropRef, className: `assistant-sidebar-backdrop ${sidebarClosing ? "is-closing" : ""}`, "aria-label": "Close chat threads", onClick: closeSidebar }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 184,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("aside", { ref: assistantSidebarRef, className: `assistant-sidebar ${sidebarClosing ? "is-closing" : ""}`, "aria-label": "Chat history", onTouchStart: onAssistantSidebarTouchStart, onTouchMove: onAssistantSidebarTouchMove, onTouchEnd: onAssistantSidebarTouchEnd, onTouchCancel: (event) => onAssistantSidebarTouchEnd(event, true), children: [
        /* @__PURE__ */ jsx("div", { className: "assistant-sidebar-head", children: [
          /* @__PURE__ */ jsx("strong", { children: "Chats" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 186,
            columnNumber: 49
          }, this),
          /* @__PURE__ */ jsx("button", { className: "assistant-icon-button", "aria-label": "Close threads", onClick: closeSidebar, children: /* @__PURE__ */ jsx(X, { size: 18 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 186,
            columnNumber: 174
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 186,
            columnNumber: 71
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 186,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("button", { className: "assistant-new-thread", onClick: newThread, children: [
          /* @__PURE__ */ jsx(Plus, { size: 16 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 187,
            columnNumber: 70
          }, this),
          " New thread"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 187,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "assistant-thread-list", children: [
          threads.map((thread) => /* @__PURE__ */ jsx("div", { className: `assistant-thread-row ${thread.id === threadId ? "active" : ""}`, children: [
            renamingThreadId === thread.id
              ? React.createElement("input", { className: "assistant-thread-rename", autoFocus: true, value: renameDraft, "aria-label": `Rename ${thread.title || "chat"}`, onChange: (event) => setRenameDraft(event.target.value), onBlur: () => commitRenameThread(thread.id), onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); commitRenameThread(thread.id); } if (event.key === "Escape") { setRenamingThreadId(null); setRenameDraft(""); } } })
              : /* @__PURE__ */ jsx("button", { className: "assistant-thread-select", onClick: () => selectThread(thread), title: thread.title, children: thread.title || "New thread" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 190,
                columnNumber: 13
              }, this),
            /* @__PURE__ */ jsx("div", { className: "assistant-thread-actions", children: [
              /* @__PURE__ */ jsx("button", { className: "assistant-icon-button", "aria-label": `Options for ${thread.title}`, onClick: () => setThreadMenu(threadMenu === thread.id ? null : thread.id), children: /* @__PURE__ */ jsx(MoreHorizontal, { size: 17 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 191,
                columnNumber: 215
              }, this) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 191,
                columnNumber: 55
              }, this),
              threadMenu === thread.id && React.createElement("div", { className: "assistant-thread-menu" },
                React.createElement("button", { type: "button", onClick: () => beginRenameThread(thread) }, React.createElement(Pencil, { size: 14 }), "Rename"),
                React.createElement("button", { type: "button", className: "danger", onClick: () => removeThread(thread.id) }, React.createElement(Trash2, { size: 14 }), "Delete")
              )
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 191,
              columnNumber: 13
            }, this)
          ] }, thread.id, true, {
            fileName: "<stdin>",
            lineNumber: 189,
            columnNumber: 36
          }, this)),
          !threads.length && /* @__PURE__ */ jsx("p", { className: "assistant-empty-history", children: "Your conversations will appear here." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 195,
            columnNumber: 31
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 188,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("button", { className: "assistant-back-home", onClick: () => {
          if (sidebar) {
            closeSidebar();
            window.setTimeout(() => onHome?.(), 300);
          } else onHome?.();
        }, children: "\u2190 Back to study home" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 197,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 185,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 183,
      columnNumber: 17
    }, this),
    !chatMessages.length ? /* @__PURE__ */ jsx("main", { className: "assistant-landing", children: [
      /* @__PURE__ */ jsx("div", { className: "assistant-welcome-mark", children: /* @__PURE__ */ jsx(Sparkles, { size: 25 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 201,
        columnNumber: 47
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 201,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("h1", { children: [
        greeting,
        greetingName,
        ".",
        /* @__PURE__ */ jsx("br", {}, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 202,
          columnNumber: 38
        }, this),
        /* @__PURE__ */ jsx("span", { children: "What\u2019s on your mind?" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 202,
          columnNumber: 43
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 202,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("p", { children: "Ask a question, explore an idea, or work through a problem." }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 203,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 200,
      columnNumber: 29
    }, this) : /* @__PURE__ */ jsx("main", { className: "assistant-conversation", ref: listRef, children: [
      chatMessages.map((message, messageIndex) => message.role === "user" ? /* @__PURE__ */ jsx("div", { className: "assistant-user-row", children: /* @__PURE__ */ jsx("div", { className: "assistant-user-bubble", children: [
        /* @__PURE__ */ jsx("span", { children: String(message.content).split("\n\nPDF ")[0].replace(/\n\[Image attached: [^\]]+\]/g, "") }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 205,
          columnNumber: 156
        }, this),
        message.attachments?.length > 0 && /* @__PURE__ */ jsx("div", { className: "assistant-attachment-preview", children: message.attachments.map((file, index) => file.data ? /* @__PURE__ */ jsx(ImageFullView, { src: file.data, alt: file.name }, index, false, {
          fileName: "<stdin>",
          lineNumber: 205,
          columnNumber: 386
        }, this) : /* @__PURE__ */ jsx("span", { children: [
          /* @__PURE__ */ jsx(FileText, { size: 14 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 205,
            columnNumber: 455
          }, this),
          file.name
        ] }, index, true, {
          fileName: "<stdin>",
          lineNumber: 205,
          columnNumber: 437
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 205,
          columnNumber: 291
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 205,
        columnNumber: 117
      }, this) }, message.id, false, {
        fileName: "<stdin>",
        lineNumber: 205,
        columnNumber: 64
      }, this) : /* @__PURE__ */ jsx("article", { className: "assistant-answer assistant-message", children: [
        /* @__PURE__ */ jsx("div", { className: "assistant-answer-mark", children: /* @__PURE__ */ jsx(Sparkles, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 206,
          columnNumber: 48
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 206,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "assistant-answer-body", children: [
          /* @__PURE__ */ jsx("div", { className: `assistant-answer-tools ${audioUrls[message.id] ? "audio-ready" : ""}`, children: [
            /* @__PURE__ */ jsx("span", { className: "assistant-model-used", children: message.model || "Apex Assistant" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 207,
              columnNumber: 136
            }, this),
            /* @__PURE__ */ jsx("button", { className: `assistant-speak ${audioLoadingId === message.id ? "is-loading" : ""}`, onClick: () => speakAnswer(message), disabled: audioLoadingId !== null, "aria-label": audioUrls[message.id] && speaking === message.id ? "Pause read aloud" : audioLoadingId === message.id ? "Generating voice" : "Read answer aloud", children: [
              /* @__PURE__ */ jsx(Play, { size: 14 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 207,
                columnNumber: 394
              }, this),
              audioLoadingId === message.id ? "Generating voice..." : "Read aloud"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 207,
              columnNumber: 207
            }, this),
            audioUrls[message.id] && /* @__PURE__ */ jsx(Fragment, { children: [
              /* @__PURE__ */ jsx("button", { className: "assistant-speak assistant-stop", onClick: () => stopAudio(message.id), "aria-label": "Stop read aloud", children: [
                /* @__PURE__ */ jsx(Square, { size: 12, fill: "currentColor" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 207,
                  columnNumber: 685
                }, this),
                " Stop"
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 207,
                columnNumber: 569
              }, this),
              null
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 207,
              columnNumber: 567
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 207,
            columnNumber: 48
          }, this),
          /* @__PURE__ */ jsx("div", { className: "assistant-markdown", children: /* @__PURE__ */ jsx("div", { className: "bg-transparent text-gray-900 dark:text-gray-100 w-full", children: React.createElement(MemoAssistantMessageContent, { message, previousMessage: chatMessages[messageIndex - 1] }) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 208,
            columnNumber: 9
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 208,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 207,
          columnNumber: 9
        }, this)
      ] }, message.id, true, {
        fileName: "<stdin>",
        lineNumber: 205,
        columnNumber: 518
      }, this)),
    ], onScroll: (event) => {
      const conversation = event.currentTarget;
      followAssistantResponseRef.current = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 80;
      setHeaderScrolled(conversation.scrollTop > 0);
    } }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 204,
      columnNumber: 15
    }, this),
    /* @__PURE__ */ jsx("div", { className: `assistant-composer-wrap ${chatMessages.length ? "has-chat" : ""}`, children: [
      sending && /* @__PURE__ */ jsx("div", { className: "assistant-thinking", children: [
        /* @__PURE__ */ jsx("span", {}, void 0, false, { fileName: "<stdin>", lineNumber: 210, columnNumber: 55 }, this),
        retryStatus || "Thinking\u2026"
      ] }, void 0, true, { fileName: "<stdin>", lineNumber: 210, columnNumber: 19 }, this),
      error && /* @__PURE__ */ jsx("p", { className: limitStatus ? "assistant-error assistant-limit-status" : "assistant-error", role: limitStatus ? "status" : "alert", children: error }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 213,
        columnNumber: 17
      }, this),
      retryStatus && !sending && /* @__PURE__ */ jsx("p", { className: "assistant-retry-status", role: "status", children: retryStatus }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 213,
        columnNumber: 97
      }, this),
      /* @__PURE__ */ jsx("form", { className: "assistant-composer bg-gray-100/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10", onSubmit: send, children: [
        /* @__PURE__ */ jsx("input", { ref: fileInputRef, className: "assistant-file-input", type: "file", accept: "image/*,.pdf,application/pdf", multiple: true, onChange: (event) => {
          addAttachments(Array.from(event.target.files || []));
          event.target.value = "";
        }, "aria-label": "Attach images or PDF files" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 215,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("button", { type: "button", className: "assistant-attach", onClick: () => fileInputRef.current?.click(), "aria-label": "Attach images or PDF files", children: /* @__PURE__ */ jsx(Plus, { size: 20 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 216,
          columnNumber: 144
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 216,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "assistant-compose-content", children: [
          attachments.length > 0 && /* @__PURE__ */ jsx("div", { className: "assistant-pending-files", children: attachments.map((file, index) => /* @__PURE__ */ jsx("span", { children: [
            file.type.startsWith("image/") ? /* @__PURE__ */ jsx(ImageFullView, { src: file.data, alt: file.name }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 217,
              columnNumber: 215
            }, this) : /* @__PURE__ */ jsx(FileText, { size: 13 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 217,
              columnNumber: 245
            }, this),
            /* @__PURE__ */ jsx("small", { children: file.name }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 217,
              columnNumber: 267
            }, this),
            /* @__PURE__ */ jsx("button", { type: "button", "aria-label": `Remove ${file.name}`, onClick: () => setAttachments((items) => items.filter((_, i) => i !== index)), children: /* @__PURE__ */ jsx(X, { size: 12 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 217,
              columnNumber: 418
            }, this) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 217,
              columnNumber: 293
            }, this)
          ] }, `${file.name}-${index}`, true, {
            fileName: "<stdin>",
            lineNumber: 217,
            columnNumber: 147
          }, this)) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 217,
            columnNumber: 75
          }, this),
          /* @__PURE__ */ jsx("textarea", { value: draft, onChange: (event) => setDraft(event.target.value), onKeyDown: (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(event);
            }
          }, placeholder: "Ask Apex assistant", rows: 1, "aria-label": "Ask Apex assistant" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 218,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 217,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("button", { className: "assistant-send", disabled: !draft.trim() && !attachments.length || sending, "aria-label": "Send message", children: /* @__PURE__ */ jsx(Send, { size: 17, fill: "currentColor" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 220,
          columnNumber: 129
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 220,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 214,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 212,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 177,
    columnNumber: 10
  }, this);
}
export {
  StudyCopilot as default
};
export { normalizeInteractiveGraphEquation, parseInteractiveGraphInput };
