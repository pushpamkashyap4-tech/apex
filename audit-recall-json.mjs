#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] || process.cwd());
const masterFiles = [
  "public/data/physics-11.json", "public/data/physics-12.json",
  "public/data/chemistry-11.json", "public/data/chemistry-12.json",
  "public/data/maths-11.json", "public/data/maths-12.json",
  "public/data/biology-11.json", "public/data/biology-12.json"
];

function normalizeMathMarkup(value) {
  let source = String(value ?? "").replace(/\\+n(?!(?:eq|e(?![A-Za-z])|abla|eg|i|ot|mid|u|exists|parallel|rightarrow|Rightarrow|subset|supset|vdash|triangleleft|triangleright))/g, "\n");
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
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`);
  rowSpacingEscapes.forEach((slashes, index) => {
    source = source.replace(`\uE000${index}\uE001`, slashes);
  });
  return source;
}

function convertLegacyRadicals(value) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const opening = value[index + 1];
    if (value[index] !== "√" || (opening !== "(" && opening !== "[")) {
      output += value[index];
      continue;
    }
    const closing = opening === "(" ? ")" : "]";
    let depth = 1;
    let end = index + 2;
    for (; end < value.length && depth; end += 1) {
      if (value[end] === opening) depth += 1;
      else if (value[end] === closing) depth -= 1;
    }
    if (depth) {
      output += value[index];
      continue;
    }
    const radicand = value.slice(index + 2, end - 1).trim();
    let nesting = 0;
    const divisions = [];
    for (let cursor = 0; cursor < radicand.length; cursor += 1) {
      if (radicand[cursor] === "(" || radicand[cursor] === "[") nesting += 1;
      else if (radicand[cursor] === ")" || radicand[cursor] === "]") nesting -= 1;
      else if (radicand[cursor] === "/" && nesting === 0) divisions.push(cursor);
    }
    let body = radicand;
    if (divisions.length === 1) {
      const division = divisions[0];
      body = `\\frac{${radicand.slice(0, division).trim()}}{${radicand.slice(division + 1).trim()}}`;
    }
    output += `$\\sqrt{${body}}$`;
    index = end - 1;
  }
  return output;
}

function repairLegacyMath(value) {
  let normalized = normalizeMathMarkup(value);
  const bareMath = (candidate) => {
    const trimmed = candidate.trim();
    if (/^\\[A-Za-z]+/.test(trimmed) || /^\{\s*\}\s*[\^_]/.test(trimmed)) return true;
    if (!trimmed || !/[\\^_{}=+*/]/.test(trimmed)) return false;
    if (/─{2,}>|:/.test(trimmed)) return false;
    const plainWords = trimmed.replace(/\\[A-Za-z]+/g, " ").match(/[A-Za-z]{2,}/g) || [];
    const proseWords = new Set(["and", "are", "but", "correct", "does", "for", "from", "given", "here", "if", "incorrect", "into", "is", "not", "of", "or", "the", "then", "this", "to", "was", "when", "where", "with"]);
    return !plainWords.some((word) => proseWords.has(word.toLowerCase()));
  };
  if (!normalized.includes("$") && bareMath(normalized)) normalized = `$${normalized.trim()}$`;
  const dollarCount = (normalized.match(/\$/g) || []).length;
  const firstDollar = normalized.indexOf("$");
  if (dollarCount % 2 === 1 && firstDollar > 0 && bareMath(normalized.slice(0, firstDollar))) normalized = `$${normalized}`;

  return normalized.split(/(```[\s\S]*?```|`[^`]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part) => {
    if (part.startsWith("`") || part.startsWith("$")) return part;
    let repaired = convertLegacyRadicals(part);
    const transformOutsideMath = (text, transform) => text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((segment) => segment.startsWith("$") ? segment : transform(segment)).join("");
    repaired = transformOutsideMath(repaired, (text) => text.replace(/\(([^()\n]+)\)\s*\/\s*\(([^()\n]+)\)/g, (_, numerator, denominator) => `$\\frac{${numerator.trim()}}{${denominator.trim()}}$`));
    repaired = transformOutsideMath(repaired, (text) => text.replace(/\b([A-Za-z][A-Za-z0-9']*)\^\(([^()\n]+)\)/g, (_, base, power) => `$${base}^{${power.trim()}}$`));
    repaired = transformOutsideMath(repaired, (text) => text.replace(/\b([A-Za-z][A-Za-z0-9']*)_\(([^()\n]+)\)/g, (_, base, index) => `$${base}_{${index.trim()}}$`));
    repaired = transformOutsideMath(repaired, (text) => text.replace(/\b([A-Za-z][A-Za-z0-9']*)_\{([^{}\n]+)\}/g, (_, base, index) => `$${base}_{${index}}$`));
    repaired = transformOutsideMath(repaired, (text) => text.replace(/\b([A-Za-z][A-Za-z0-9']*)_([A-Za-z0-9]+)/g, (_, base, index) => `$${base}_{${index}}$`));
    repaired = transformOutsideMath(repaired, (text) => text.replace(/\b([A-Za-z][A-Za-z0-9']*)\^\{([^{}\n]+)\}/g, (_, base, power) => `$${base}^{${power}}$`));
    return transformOutsideMath(repaired, (text) => text.replace(/\b([A-Za-z][A-Za-z0-9']*)\^([A-Za-z0-9+-]+)/g, (_, base, power) => `$${base}^{${power}}$`));
  }).join("");
}

function extractMath(markup) {
  const errors = [];
  const expressions = [];
  const parts = markup.split(/(```[\s\S]*?```|`[^`]*`)/g);
  for (const part of parts) {
    if (part.startsWith("`")) continue;
    for (let index = 0; index < part.length;) {
      if (part[index] !== "$" || (index > 0 && part[index - 1] === "\\")) {
        index += 1;
        continue;
      }
      const display = part[index + 1] === "$";
      const delimiter = display ? "$$" : "$";
      const start = index + delimiter.length;
      let close = -1;
      let searchFrom = start;
      while (searchFrom < part.length) {
        const found = part.indexOf(delimiter, searchFrom);
        if (found < 0) break;
        let slashCount = 0;
        for (let cursor = found - 1; cursor >= 0 && part[cursor] === "\\"; cursor -= 1) slashCount += 1;
        if (slashCount % 2 === 0) {
          close = found;
          break;
        }
        searchFrom = found + delimiter.length;
      }
      if (close < 0) {
        errors.push(`unclosed ${display ? "display" : "inline"} math delimiter`);
        break;
      }
      expressions.push(part.slice(start, close));
      index = close + delimiter.length;
    }
  }
  return { expressions, errors };
}

function rawDelimiterErrors(value) {
  const counts = { "\\(": 0, "\\)": 0, "\\[": 0, "\\]": 0 };
  for (const match of value.matchAll(/\\+([()[\]])/g)) {
    const [token, bracket] = match;
    if (bracket === "[" && /\\{2,}\[\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*(?:pt|em|ex|mu|mm|cm|in|bp|pc|dd|cc|nd|nc|sp)\]/i.test(token + value.slice(match.index + token.length, match.index + token.length + 12))) continue;
    if (bracket === "(") counts["\\("] += 1;
    else if (bracket === ")") counts["\\)"] += 1;
    else if (bracket === "[") counts["\\["] += 1;
    else counts["\\]"] += 1;
  }
  return [
    counts["\\("] !== counts["\\)"] ? `raw \\( / \\) delimiter counts differ (${counts["\\(" ]} / ${counts["\\)" ]})` : "",
    counts["\\["] !== counts["\\]"] ? `raw \\[ / \\] delimiter counts differ (${counts["\\[" ]} / ${counts["\\]" ]})` : ""
  ].filter(Boolean);
}

async function loadKatex() {
  const require = createRequire(import.meta.url);
  return require("katex");
}

const katex = await loadKatex();
const issues = [];
let fieldsScanned = 0;
let formulasScanned = 0;
let activeLocation = "";
let activeExpression = "";
const originalWarn = console.warn;
console.warn = (...args) => {
  issues.push({ location: activeLocation, message: `KaTeX warning: ${args.join(" ")}`, sample: activeExpression.slice(0, 160) });
};

for (const relativePath of masterFiles) {
  const filePath = join(root, relativePath);
  const chapters = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(chapters)) throw new Error(`${relativePath} must contain a chapter array`);
  for (const chapter of chapters) {
    for (const collection of ["flashcards", "quizzes"]) {
      for (const [itemIndex, item] of (chapter[collection] || []).entries()) {
        const visit = (value, field) => {
          if (typeof value === "string") {
            fieldsScanned += 1;
            const location = `${relativePath} > ${chapter.name} > ${field}`;
            for (const message of rawDelimiterErrors(value)) issues.push({ location, message });
            const markup = repairLegacyMath(value);
            activeLocation = location;
            const { expressions, errors } = extractMath(markup);
            for (const message of errors) issues.push({ location, message });
            for (const expression of expressions) {
              formulasScanned += 1;
              activeExpression = expression;
              if (/\\{2,}[A-Za-z]/.test(expression)) {
                issues.push({ location, message: "double-escaped LaTeX command remains after normalization", sample: expression.slice(0, 120) });
              }
              try {
                katex.renderToString(expression, { throwOnError: true, strict: "ignore", trust: false });
              } catch (error) {
                issues.push({ location, message: `KaTeX: ${error.message}`, sample: expression.slice(0, 160) });
              }
            }
          } else if (Array.isArray(value)) {
            value.forEach((entry, index) => visit(entry, `${field}[${index}]`));
          } else if (value && typeof value === "object") {
            for (const [key, entry] of Object.entries(value)) visit(entry, `${field}.${key}`);
          }
        };
        visit(item, `${collection}[${itemIndex}]`);
      }
    }
  }
}

const scalableDelimiterFixtures = [
  ["four-row cases", String.raw`\begin{cases}2x+1,&x<0\\x^2,&x\ge0\\0,&x=0\\x+3,&x>0\end{cases}`],
  ["five-row left brace", String.raw`\left\{\begin{array}{ll}a,&1\\b,&2\\c,&3\\d,&4\\e,&5\end{array}\right.`]
];
for (const [label, expression] of scalableDelimiterFixtures) {
  activeLocation = `KaTeX renderer > ${label}`;
  activeExpression = expression;
  try {
    const markup = katex.renderToString(expression, { displayMode: true, throwOnError: true, strict: "ignore", trust: false });
    if (!markup.includes("delimsizing") || markup.includes("katex-error")) throw new Error("KaTeX did not emit a scalable delimiter.");
  } catch (error) {
    issues.push({ location: activeLocation, message: `KaTeX scalable-delimiter check: ${error.message}`, sample: expression });
  }
}

const css = (await readFile(join(root, "styles.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
const cssRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
  selectors: selectors.split(",").map((selector) => selector.trim()),
  declarations
}));
const declarationFor = (selector) => cssRules.filter((rule) => rule.selectors.includes(selector)).at(-1)?.declarations || "";
const requiredStyles = [
  ['html[data-font-size="small"]', ["--font-scale:.95"]],
  ['html[data-font-size="medium"]', ["--font-scale:1.04"]],
  [".flashcard-face .card-content", ["overflow-y:auto", "flex:1 1 auto", "min-height:0"]],
  [".flashcard-face .flip-hint", ["position:static", "flex:0 0 auto"]],
  [".math-table-scroll", ["max-width:100%", "overflow-x:auto"]],
  [".recall-math-text .katex-display", ["max-width:100%", "overflow-x:auto", "overflow-y:hidden"]],
  [".recall-math-text :not(.katex-display) > .katex", ["max-width:100%", "overflow-x:auto"]],
  [".chapter-list-title", ["width:100%", "min-width:0", "display:flex"]],
  [".chapter-list-copy strong", ["min-width:0", "flex:1 1 auto", "text-overflow:ellipsis"]],
  [".cbse-boards-badge", ["flex:0 0 auto"]],
  [".quiz-option-text", ["min-width:0", "overflow-wrap:break-word"]]
];
for (const [selector, declarations] of requiredStyles) {
  const actual = declarationFor(selector).replace(/\s/g, "").toLowerCase();
  for (const declaration of declarations) {
    if (!actual.includes(declaration.replace(/\s/g, "").toLowerCase())) {
      issues.push({ location: "styles.css", message: `${selector} is missing ${declaration}` });
    }
  }
}

console.warn = originalWarn;
console.log(`Scanned ${fieldsScanned} flashcard and quiz text fields, parsed ${formulasScanned} math expressions with KaTeX 0.16.11, and checked responsive math and badge CSS.`);
if (issues.length) {
  for (const issue of issues.slice(0, 60)) console.error(`- ${issue.location}: ${issue.message}${issue.sample ? ` — ${issue.sample}` : ""}`);
  if (issues.length > 60) console.error(`... ${issues.length - 60} additional issue(s) omitted.`);
  console.error(`${issues.length} issue(s) found.`);
  process.exitCode = 1;
} else {
  console.log("No broken delimiters, leftover double-escaped commands, or KaTeX parse errors found.");
}
