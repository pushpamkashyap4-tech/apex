import { Fragment, jsx } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Download, Lightbulb, MoreVertical, Pencil, RotateCcw, Sparkles, X } from "lucide-react";
import MathText from "./math-markdown.js";
import { runRecallMathSelfTest } from "./recall-math.js";
import { SYLLABUS } from "./syllabus-data.js";
import { DEFAULT_MODEL_PREFERENCES, requestAssistantTask, parseAIJson, resolveAIModel } from "./ai.js";
import { useSubjectMode } from "./subject-mode.js";
import { FlashcardsIcon } from "./icon-illustrations.js";
runRecallMathSelfTest();
// Bump when consolidated master recall data changes so cached decks reload it.
const DECK_VERSION = 15;
const CARD_SCHEMA = {
  name: "chapter_flashcards",
  schema: {
    type: "object",
    properties: { items: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" }, topic: { type: "string" } }, required: ["front", "back", "topic"], additionalProperties: false } } },
    required: ["items"],
    additionalProperties: false
  }
};
const QUIZ_SCHEMA = {
  name: "chapter_quizzes",
  schema: {
    type: "object",
    properties: { items: { type: "array", items: { type: "object", properties: {
      question: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      correctIndex: { type: "integer" },
      hint: { type: "string" },
      explanation: { type: "string" },
      solution: { type: "string" },
      formula: { type: "string" },
      optionExplanations: { type: "array", items: { type: "string" } },
      topic: { type: "string" }
    }, required: ["question", "options", "correctIndex", "hint", "explanation", "solution", "formula", "optionExplanations", "topic"], additionalProperties: false } } },
    required: ["items"],
    additionalProperties: false
  }
};
function assignedClass(chapter) {
  if (chapter.classLevel === "Class 11") return "11";
  if (chapter.classLevel === "Class 12") return "12";
  const text = `${chapter.unit} ${chapter.name}`.toLowerCase();
  if (chapter.subject === "Physics") return /electric|magnet|optics|modern|nuclear|atom|semiconductor|induction|current|capacitan/.test(text) ? "12" : "11";
  if (chapter.subject === "Chemistry") return /solution|electrochem|kinetic|surface|d- and f|coordination|metallurgy|halo|alcohol|aldehyde|nitrogen|biomolecule|polymer|everyday|solid state/.test(text) ? "12" : "11";
  if (/matrix|determinant|probability|calculus|differential|integral|derivative|vector|three-dimensional|statistics|ellipse|hyperbola|parabola/.test(text)) return "12";
  return "11";
}
function masterRecallPath(chapter, classLevel) {
  if (!chapter || chapter.custom) return null;
  const subject = chapter?.subject;
  const filename = subject === "Physics" ? "physics" : subject === "Chemistry" ? "chemistry" : subject === "Mathematics" || subject === "Maths" ? "maths" : ["Botany", "Zoology"].includes(subject) ? "biology" : "";
  const level = ["11", "12"].includes(String(classLevel || "")) ? String(classLevel) : assignedClass(chapter);
  return filename ? `/data/${filename}-${level}.json` : null;
}
async function fetchMasterRecall(path) {
  const urls = path.startsWith("/data/") ? [path, `/public${path}`] : [path];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch { /* Try the alternate static asset path. */ }
  }
  throw new Error("Bundled recall set is unavailable.");
}
function itemKey(item, type) {
  return String(type === "cards" ? item.front : item.question || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}
function conceptKey(value) {
  if (value && typeof value === "object") value = value.topic;
  return String(value || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}
function hasTemplateLanguage(value) {
  return /(?:governing result|defining rule|standard relation describes|which option (?:states|correctly|should)|what is the defining|select the accurate|key idea in|named concept|separate result for|·\s*(?:principle|definition|application|recall))/i.test(String(value || ""));
}
function hasDistinctConcepts(items, previous = [], avoidConcepts = []) {
  const seen = new Set([...previous.map((item) => conceptKey(item.topic)), ...avoidConcepts.map(conceptKey)].filter(Boolean));
  for (const item of items) {
    const key = conceptKey(item.topic);
    if (!key || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
function mathSafeItem(item) {
  return Object.values(item).flatMap((value) => Array.isArray(value) ? value : [value]).every((value) => typeof value !== "string" || !hasTemplateLanguage(value));
}
function hasDistinctCardSides(cards) {
  return Array.isArray(cards) && cards.length > 0 && cards.every((card) => {
    const front = String(card?.front || "").trim();
    const back = String(card?.back || "").trim();
    return Boolean(front && back) && front.toLocaleLowerCase() !== back.toLocaleLowerCase() && !/[?？]\s*$/.test(back);
  });
}
function stripChapterPrefix(value, chapter) {
  const escapedName = String(chapter?.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(value || "").trim().replace(new RegExp(`^${escapedName}\\s*:\\s*`, "i"), "");
}
function hasNoChapterPrefixes(deck, chapter) {
  const escapedName = String(chapter?.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^${escapedName}\\s*:`, "i");
  const quizText = (deck?.quizzes || []).flatMap((quiz) => [quiz.question, quiz.hint, quiz.explanation, quiz.solution, quiz.formula, ...quiz.options || [], ...quiz.optionExplanations || []]);
  return [...(deck?.cards || []).flatMap((card) => [card.front, card.back]), ...quizText].every((text) => !prefix.test(String(text || "").trim()));
}
function quizSolutionText(question) {
  if (question.solution?.trim()) return question.solution;
  const correctIndex = Number(question.correctIndex) || 0;
  const correctReason = String(question.optionExplanations?.[correctIndex] || question.explanation || "").replace(/^correct:\s*/i, "");
  const otherReasons = (question.optionExplanations || []).map((reason, index) => index === correctIndex ? "" : `${String.fromCharCode(65 + index)}: ${String(reason || "").replace(/^correct:\s*/i, "")}`).filter(Boolean);
  return `Correct answer: ${String.fromCharCode(65 + correctIndex)}. ${correctReason} Key relation or fact: ${question.formula || question.explanation || "Review the stated concept."}${otherReasons.length ? ` Why the other choices do not fit: ${otherReasons.join(" ")}` : ""}`;
}
function normalizeBundledDeck(data, chapter) {
  if (Array.isArray(data)) {
    const normalizeChapterName = (value) => {
      const normalized = String(value || "").toLocaleLowerCase().replace(/&/g, "and").replace(/[^\p{L}\p{N}]+/gu, "").trim();
      const aliases = {
        thermalpropertiesofmatter: "thermalpropertiesandcalorimetry",
        oscillations: "oscillationsandsimpleharmonicmotion",
        waves: "wavemotion",
        rayopticsandopticalinstruments: "rayoptics",
        trigonometricratioandidentities: "trigonometricratiosandidentities",
        pblockelementsclass11groups13and14: "pblockelements"
      };
      return aliases[normalized] || normalized;
    };
    const batch = data.find((item) => item?.id === chapter.id) || data.find((item) => normalizeChapterName(item?.chapterName || item?.name) === normalizeChapterName(chapter.name));
    if (!batch || !Array.isArray(batch.flashcards) || !Array.isArray(batch.quizzes)) return null;
    return {
      schemaVersion: DECK_VERSION,
      chapter: { id: chapter.id, name: chapter.name, subject: chapter.subject, unit: chapter.unit },
      cards: batch.flashcards.map((card) => ({ front: card.front, back: card.back, ...(card.topic ? { topic: card.topic } : {}), ...(card.image ? { image: card.image } : {}) })),
      quizzes: batch.quizzes.map((quiz) => ({
        question: quiz.question,
        options: quiz.options,
        correctIndex: Number(quiz.correctIndex ?? quiz.correctOption ?? quiz.correctAnswer),
        hint: quiz.hint || "",
        explanation: quiz.fullExplanation || quiz.explanation || "",
        fullExplanation: quiz.fullExplanation || quiz.solution || quiz.explanation || "",
        solution: quiz.solution || quiz.fullExplanation || quiz.explanation || "",
        formula: quiz.formula || "",
        optionExplanations: quiz.optionExplanations,
        topic: quiz.topic || chapter.name,
        ...(quiz.image ? { image: quiz.image } : {})
      })),
      source: chapter.subject === "Botany" || chapter.subject === "Zoology" ? "biology-bundled" : "attached-json"
    };
  }
  return data;
}
function readItems(content) {
  const parsed = parseAIJson(content);
  const items = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(items)) throw new Error("The model did not return a recall set. Please try again.");
  return items;
}
function validateCards(items, count, previous = [], chapter, avoidConcepts = [], requireCount = true) {
  const seen = new Set(previous.map((item) => itemKey(item, "cards")));
  const seenAnswers = new Set(previous.map((item) => itemKey({ front: item.back }, "cards")));
  const clean = [];
  for (const item of items) {
    const card = { front: stripChapterPrefix(item?.front, chapter), back: stripChapterPrefix(item?.back, chapter), topic: String(item?.topic || "").trim() };
    const key = itemKey(card, "cards");
    const answerKey = itemKey({ front: card.back }, "cards");
    if (!key || !card.back || !card.topic || seen.has(key) || seenAnswers.has(answerKey) || card.front.length > 240 || card.back.length > 360 || !mathSafeItem(card)) continue;
    seen.add(key);
    seenAnswers.add(answerKey);
    clean.push(card);
    if (clean.length === count) break;
  }
  if ((requireCount && clean.length !== count) || (requireCount && !hasDistinctConcepts(clean, previous, avoidConcepts))) throw new Error(`Only ${clean.length} complete flashcards with distinct concepts and valid notation came back. Generate again for a complete set of ${count}.`);
  return clean;
}
function validateQuizzes(items, count, previous = [], chapter, avoidConcepts = [], requireCount = true) {
  const seen = new Set(previous.map((item) => itemKey(item, "quizzes")));
  const seenAnswers = new Set(previous.map((item) => itemKey({ question: item.options?.[item.correctIndex] }, "quizzes")));
  const clean = [];
  for (const item of items) {
    const options = Array.isArray(item?.options) ? item.options.map((option) => stripChapterPrefix(option, chapter)) : [];
    const reasons = Array.isArray(item?.optionExplanations) ? item.optionExplanations.map((reason) => stripChapterPrefix(reason, chapter)) : [];
    const quiz = {
      question: stripChapterPrefix(item?.question, chapter),
      options,
      correctIndex: Number(item?.correctIndex),
      hint: stripChapterPrefix(item?.hint, chapter),
      explanation: stripChapterPrefix(item?.explanation, chapter),
      solution: stripChapterPrefix(item?.solution, chapter),
      formula: stripChapterPrefix(item?.formula, chapter),
      optionExplanations: reasons,
      topic: String(item?.topic || "").trim()
    };
    const key = itemKey(quiz, "quizzes");
    const answerKey = itemKey({ question: options[quiz.correctIndex] }, "quizzes");
      if (!key || !quiz.topic || seen.has(key) || seenAnswers.has(answerKey) || options.length !== 4 || new Set(options.map((x) => x.toLowerCase())).size !== 4 || !Number.isInteger(quiz.correctIndex) || quiz.correctIndex < 0 || quiz.correctIndex > 3 || !quiz.hint || !quiz.explanation || !quiz.solution || !quiz.formula || reasons.length !== 4 || reasons.some((reason) => !reason) || quiz.question.length > 360 || !mathSafeItem(quiz)) continue;
    seen.add(key);
    seenAnswers.add(answerKey);
    clean.push(quiz);
    if (clean.length === count) break;
  }
  if ((requireCount && clean.length !== count) || (requireCount && !hasDistinctConcepts(clean, previous, avoidConcepts))) throw new Error(`Only ${clean.length} complete quiz questions with distinct concepts and valid notation came back. Generate again for a complete set of ${count}.`);
  return clean;
}
function cardPrompt(chapter, amount, previous = [], avoidConcepts = [], level = "JEE") {
  return `Write exactly ${amount} original ${level}-level flashcards for ${chapter.name} (${chapter.subject}, ${chapter.unit}). The chapter title is already visible in the app; do not repeat it in the card text. Write real ${level}-level questions about the actual subject matter, with enough information to answer without guessing. Across the set, test different concepts, laws, definitions, conditions, derivations, and numerical uses. Never reuse a concept or change only the wording of an earlier card. Give each card a short, specific topic name that identifies its unique tested concept; do not use labels such as "principle", "definition", "application", or "recall" as fake topic names. Vary the question forms naturally; avoid repeated templates, filler, and topic-name prefixes. Format every mathematical expression as valid LaTeX inside $...$ or $$...$$, including roots as \\sqrt{...} and cube roots as \\sqrt[3]{...}. Keep prose outside math delimiters, balance braces, and encode LaTeX backslashes correctly in the JSON strings. Do not replace roots with words such as "sqrt" or "cube root of". Keep every answer concise, correct, and explicit about assumptions and units. Return JSON only in this shape: {"items":[{"front":"...","back":"...","topic":"..."}]}. Concepts already covered by cards: ${JSON.stringify(previous.map((item) => ({ topic: item.topic, front: item.front, back: item.back })))}. Concepts reserved for quiz questions and therefore forbidden here: ${JSON.stringify(avoidConcepts)}`;
}
function quizPrompt(chapter, amount, previous = [], avoidConcepts = [], level = "JEE") {
  return `Write exactly ${amount} original four-option ${level}-level questions for ${chapter.name} (${chapter.subject}, ${chapter.unit}). Ask contextual, solvable questions: include numerical values when useful, and test different laws, measurement methods, uncertainty rules, vector operations, and applications. Do not make generic "which statement is correct" questions. Every question must test a different precise concept and have a short, specific topic label. Do not repeat the chapter title in the question or explanations. Make each distractor plausible for this exact question: use a common sign, component, unit, angle, exponent, or calculation error; never copy an unrelated fact from another question. There must be exactly one correct answer. Give a brief hint that does not reveal it, a direct explanation, a worked solution with clear steps and units, one concise reason for EACH option, and a non-empty formula field containing the relevant equation or concept relation. Format all mathematical expressions in questions, options, hints, explanations, solutions, and formulas as valid LaTeX inside $...$ or $$...$$. Use \\sqrt{...} for square roots and \\sqrt[3]{...} for cube roots; balance braces and encode backslashes correctly in JSON. Keep prose outside math delimiters. Return JSON only in this shape: {"items":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"hint":"...","explanation":"...","solution":"...","formula":"...","optionExplanations":["...","...","...","..."],"topic":"..."}]}. Concepts already covered by earlier quiz questions: ${JSON.stringify(previous.map((item) => ({ topic: item.topic, question: item.question, answer: item.options?.[item.correctIndex] })))}. Concepts already used by flashcards and forbidden here: ${JSON.stringify(avoidConcepts)}`;
}
const RECALL_SYSTEM_PROMPT = String.raw`You are a careful CBSE and JEE study-material author. Before generating content, search multiple authoritative web resources relevant to the supplied chapter, such as NCERT, official CBSE material, NTA, and established educational references. Use those sources to verify facts and methods; never invent source findings. If a web-search tool is unavailable, use reliable curriculum knowledge and do not fabricate source findings or claim to have browsed.

Return valid JSON only and match the supplied schema exactly. Do not add keys, markdown fences, citations, or prose outside the JSON object. Generate original, accurate material appropriate to the requested chapter and level. For a full chapter set, produce exactly 10 CBSE-level questions and 20 JEE-level questions. For a small starter set or numbered batch, honor its exact requested count instead of expanding it. Include both flashcards and four-option quizzes only when asked. Give each item a specific, unique topic that starts with "CBSE ·" or "JEE ·" as requested. Every quiz must have exactly four distinct options and one correct answer.

CRITICAL FORMATTING RULE: Format every mathematical expression with valid KaTeX LaTeX inside $...$ for inline math or $$...$$ for display math. Use \sqrt{...} for square roots, \sqrt[3]{...} for cube roots, and \frac{...}{...} for fractions. Keep prose outside math delimiters, balance every brace, and never write a math command outside a delimiter. In the JSON source text, encode each math-command backslash as \\ so parsing leaves a single backslash. Escape all JSON strings correctly.`;
async function generateAdditionalItems(chapter, type, count, previous = [], modelOverride = "auto") {
  const isBiology = chapter.subject === "Botany" || chapter.subject === "Zoology";
  const level = isBiology ? "NEET" : "JEE";
  const cards = type === "cards";
  const recentItems = previous;
  const prompt = cards
    ? cardPrompt(chapter, count, recentItems, [], level)
    : quizPrompt(chapter, count, recentItems, [], level);
  const exclusions = recentItems.map((item) => cards ? { topic: item.topic, front: item.front, back: item.back } : { topic: item.topic, question: item.question });
  const instructions = `Use Google Search grounding to verify this chapter against multiple trustworthy resources. Generate exactly ${count} new JEE-level ${cards ? "flashcards" : "four-option quiz questions"}. Every topic must start with "JEE ·". DO NOT repeat, rephrase, or duplicate any existing question or flashcard below. Generate 100% brand-new concepts, numericals, and angles of testing. Existing items: ${JSON.stringify(exclusions)}.\n\n${prompt}\n\nUse correctly delimited LaTeX for math, especially square and cube roots. Return only the supplied JSON schema.`;
  const content = await requestAssistantTask("recall", [
    { role: "system", content: RECALL_SYSTEM_PROMPT },
    { role: "user", content: instructions }
  ], {
    googleSearch: true,
    json: true,
    responseSchema: (cards ? CARD_SCHEMA : QUIZ_SCHEMA).schema,
    maxTokens: cards ? 3500 : 7000,
    modelOverride
  });
  const items = readItems(content);
  const clean = cards
    ? validateCards(items, count, previous, chapter, [], false).slice(0, count)
    : validateQuizzes(items, count, previous, chapter, [], false).slice(0, count);
  if (!clean.length) throw new Error("The response only contained duplicate or incomplete items. Try generating again.");
  if (clean.some((item) => !item.topic.startsWith(`${level} ·`))) {
    throw new Error("The generated items did not include the required JEE topic labels. Try again.");
  }
  return clean;
}
const RECALL_RESEARCH_PROMPT = "Research CBSE/JEE study material using multiple authoritative web resources. Report verified facts, equations, definitions, and misconceptions. Never invent sources or URLs. Return a concise research note for a later question-writing step; do not create questions or flashcards.";
async function researchChapter(chapter, level, modelOverride = "auto") {
  return requestAssistantTask("recall", [
    { role: "system", content: RECALL_RESEARCH_PROMPT },
    { role: "user", content: `Search multiple web resources for ${level}-level ${chapter.subject} material on "${chapter.name}" (${chapter.unit}). Return concise verified facts, equations, definitions, and common misconceptions. Do not write questions.` }
  ], { googleSearch: true, maxTokens: 2000, modelOverride });
}
async function generateInBatches(chapter, type, total = 20, previous = [], level = "JEE", research = "", avoidConcepts = [], modelOverride = "auto") {
  const generated = [...previous];
  const targetCount = previous.length + total;
  const batchSize = 5;
  const schema = type === "cards" ? CARD_SCHEMA.schema : QUIZ_SCHEMA.schema;
  while (generated.length < targetCount) {
    const amount = Math.min(batchSize, targetCount - generated.length);
    const cards = type === "cards";
    const basePrompt = cards ? cardPrompt(chapter, amount, generated, avoidConcepts, level) : quizPrompt(chapter, amount, generated, avoidConcepts, level);
    const prompt = `Generate exactly ${amount} new ${level}-level ${cards ? "flashcards" : "four-option quiz questions"} for ${chapter.name} (${chapter.subject}, ${chapter.unit}). Use this research as factual grounding:\n${research}\n\n${basePrompt}\n\nEvery item's topic must begin with "${level} ·". DO NOT repeat, rephrase, or duplicate existing items. Generate only brand-new concepts, numericals, and angles of testing. Use valid, delimited LaTeX for every mathematical expression and encode JSON strings correctly.`;
    let clean = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2 && !clean; attempt += 1) {
      try {
        const content = await requestAssistantTask("recall", [
          { role: "system", content: RECALL_SYSTEM_PROMPT },
          { role: "user", content: attempt ? `${prompt}\nRetry: output exactly ${amount} complete, unique items and nothing else.` : prompt }
        ], { json: true, responseSchema: schema, maxTokens: 6500, modelOverride });
        const parsed = readItems(content);
        clean = cards ? validateCards(parsed, amount, generated, chapter, avoidConcepts) : validateQuizzes(parsed, amount, generated, chapter, avoidConcepts);
      } catch (error) {
        lastError = error;
      }
    }
    if (!clean) throw new Error(`Recall generation failed: ${lastError?.message || "The response was incomplete."}`);
    generated.push(...clean);
  }
  return generated;
}
async function generateDeck(chapter, modelOverride = "auto") {
  if (chapter.subject === "Botany" || chapter.subject === "Zoology") {
    const research = await researchChapter(chapter, "NEET", modelOverride);
    const cards = await generateInBatches(chapter, "cards", 20, [], "NEET", research, [], modelOverride);
    const avoid = cards.map(({ topic, front, back }) => ({ topic, front, back }));
    const quizzes = await generateInBatches(chapter, "quizzes", 20, [], "NEET", research, avoid, modelOverride);
    return { schemaVersion: DECK_VERSION, source: "ai-generated", chapter: { id: chapter.id, name: chapter.name, subject: chapter.subject, unit: chapter.unit }, cards, quizzes };
  }
  const cbseResearch = await researchChapter(chapter, "CBSE", modelOverride);
  const jeeResearch = await researchChapter(chapter, "JEE", modelOverride);
  const cards = await generateInBatches(chapter, "cards", 10, [], "CBSE", cbseResearch, [], modelOverride);
  const jeeCards = await generateInBatches(chapter, "cards", 20, cards, "JEE", jeeResearch, [], modelOverride);
  const cardsToAvoid = jeeCards.map(({ topic, front, back }) => ({ topic, front, back }));
  const quizzes = await generateInBatches(chapter, "quizzes", 10, [], "CBSE", cbseResearch, cardsToAvoid, modelOverride);
  const jeeQuizzes = await generateInBatches(chapter, "quizzes", 20, quizzes, "JEE", jeeResearch, cardsToAvoid, modelOverride);
  return { schemaVersion: DECK_VERSION, source: "ai-generated", chapter: { id: chapter.id, name: chapter.name, subject: chapter.subject, unit: chapter.unit }, cards: jeeCards, quizzes: jeeQuizzes };
}
function downloadRecallJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function ChapterPicker({ selection, onSelection, chapters, onChangeClass }) {
  const [chapterSearch, setChapterSearch] = useState("");
  const { subjects } = useSubjectMode();
  const { subject, classLevel } = selection;
  const chapterList = useMemo(() => chapters.filter((chapter) => chapter.subject === subject && assignedClass(chapter) === classLevel).filter((chapter) => chapter.name.toLowerCase().includes(chapterSearch.toLowerCase())), [chapters, subject, classLevel, chapterSearch]);
  return /* @__PURE__ */ jsx("div", { className: "memory-picker", children: [
    /* @__PURE__ */ jsx("div", { className: "memory-steps", children: [
      /* @__PURE__ */ jsx("span", { className: subject ? "complete" : "", children: [
        "01 ",
        /* @__PURE__ */ jsx("small", { children: "Subject" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 145,
          columnNumber: 82
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 145,
        columnNumber: 35
      }, this),
      /* @__PURE__ */ jsx("i", {}, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 145,
        columnNumber: 111
      }, this),
      /* @__PURE__ */ jsx("span", { className: classLevel ? "complete" : "", children: [
        "02 ",
        /* @__PURE__ */ jsx("small", { children: "Class" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 145,
          columnNumber: 165
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 145,
        columnNumber: 115
      }, this),
      /* @__PURE__ */ jsx("i", {}, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 145,
        columnNumber: 192
      }, this),
      /* @__PURE__ */ jsx("span", { className: selection.chapterId ? "complete" : "", children: [
        "03 ",
        /* @__PURE__ */ jsx("small", { children: "Chapter" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 145,
          columnNumber: 255
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 145,
        columnNumber: 196
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 145,
      columnNumber: 5
    }, this),
    !subject ? /* @__PURE__ */ jsx(Fragment, { children: [
      /* @__PURE__ */ jsx("h2", { children: "Choose a subject" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 146,
        columnNumber: 19
      }, this),
      /* @__PURE__ */ jsx("div", { className: "memory-choice-grid", children: subjects.map((item) => /* @__PURE__ */ jsx("button", { onClick: () => onSelection({ ...selection, subject: item, classLevel: null, chapterId: null }), children: [
        /* @__PURE__ */ jsx("span", { children: item === "Physics" ? "P" : item === "Chemistry" ? "C" : item === "Botany" ? "B" : item === "Zoology" ? "Z" : "M" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 146,
          columnNumber: 219
        }, this),
        /* @__PURE__ */ jsx("strong", { children: item }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 146,
          columnNumber: 293
        }, this),
        /* @__PURE__ */ jsx(ChevronRight, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 146,
          columnNumber: 316
        }, this)
      ] }, item, true, {
        fileName: "<stdin>",
        lineNumber: 146,
        columnNumber: 104
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 146,
        columnNumber: 44
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 146,
      columnNumber: 17
    }, this) : !classLevel ? /* @__PURE__ */ jsx(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: "memory-picker-title", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "eyebrow", children: subject }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 147,
            columnNumber: 67
          }, this),
          /* @__PURE__ */ jsx("h2", { children: "Choose your class" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 147,
            columnNumber: 103
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 147,
          columnNumber: 62
        }, this),
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 147,
        columnNumber: 25
      }, this),
      /* @__PURE__ */ jsx("div", { className: "memory-class-grid", children: ["11", "12"].map((item) => /* @__PURE__ */ jsx("button", { onClick: () => onSelection({ ...selection, classLevel: item, chapterId: null }), children: [
        /* @__PURE__ */ jsx("span", { children: ["Botany", "Zoology"].includes(subject) ? "NEET PREPARATION" : "JEE PREPARATION" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 147,
          columnNumber: 456
        }, this),
        /* @__PURE__ */ jsx("strong", { children: [
          "Class ",
          item
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 147,
          columnNumber: 484
        }, this),
        /* @__PURE__ */ jsx(ChevronRight, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 147,
          columnNumber: 513
        }, this)
      ] }, item, true, {
        fileName: "<stdin>",
        lineNumber: 147,
        columnNumber: 356
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 147,
        columnNumber: 293
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 147,
      columnNumber: 23
    }, this) : /* @__PURE__ */ jsx(Fragment, { children: [
      React.createElement("button", { type: "button", className: "memory-change-class", onClick: onChangeClass, children: "Change class" }),
      /* @__PURE__ */ jsx("span", { className: "memory-chapter-count", children: [chapterList.length, " chapters"] }, void 0, true, {
        fileName: "memory-recall.js",
        lineNumber: 148,
        columnNumber: 180
      }, this),
      /* @__PURE__ */ jsx("label", { className: "memory-chapter-search", children: [
        /* @__PURE__ */ jsx(BookOpen, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 148,
          columnNumber: 272
        }, this),
        /* @__PURE__ */ jsx("input", { value: chapterSearch, onChange: (event) => setChapterSearch(event.target.value), placeholder: `Find a ${subject.toLowerCase()} chapter\u2026` }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 148,
          columnNumber: 293
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 148,
        columnNumber: 231
      }, this),
      /* @__PURE__ */ jsx("div", { className: "memory-chapter-list", children: chapterList.map((chapter) => /* @__PURE__ */ jsx("button", { onClick: () => onSelection({ ...selection, chapterId: chapter.id }), children: [
        /* @__PURE__ */ jsx("span", { className: "memory-choice-icon", children: chapter.unit.slice(0, 1) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 148,
          columnNumber: 608
        }, this),
        /* @__PURE__ */ jsx("span", { children: [
          /* @__PURE__ */ jsx("strong", { children: chapter.name }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 148,
            columnNumber: 684
          }, this),
          /* @__PURE__ */ jsx("small", { children: chapter.unit }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 148,
            columnNumber: 715
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 148,
          columnNumber: 678
        }, this),
        /* @__PURE__ */ jsx(ChevronRight, { size: 14 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 148,
          columnNumber: 751
        }, this)
      ] }, chapter.id, true, {
        fileName: "<stdin>",
        lineNumber: 148,
        columnNumber: 514
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 148,
        columnNumber: 447
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 148,
      columnNumber: 11
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 144,
    columnNumber: 10
  }, this);
}
function FlashcardMode({ deck, progress, onProgress, onSaveDeck }) {
  const h = React.createElement;
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [exitDirection, setExitDirection] = useState(0);
  const [entryDirection, setEntryDirection] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState(0);
  const [ratingPulse, setRatingPulse] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ front: "", back: "" });
  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);
  const dragFrameRef = useRef(0);
  const swipeAdvanceTimeoutRef = useRef(null);
  const pendingDragXRef = useRef(0);
  const frontContentRef = useRef(null);
  const backContentRef = useRef(null);
  const cards = deck.cards || [];
  const index = Math.min(progress.flashIndex || 0, Math.max(0, cards.length - 1));
  const card = cards[index];
  const gotIt = progress.gotIt || [];
  const missed = progress.missed || [];

  useEffect(() => {
    setFlipped(false);
    setDragX(0);
    setExitDirection(0);
    setRatingFeedback(0);
  }, [index]);
  useEffect(() => {
    if (frontContentRef.current) frontContentRef.current.scrollTop = 0;
    if (backContentRef.current) backContentRef.current.scrollTop = 0;
  }, [index, flipped]);
  useEffect(() => () => {
    if (dragFrameRef.current) window.cancelAnimationFrame(dragFrameRef.current);
    if (swipeAdvanceTimeoutRef.current) window.clearTimeout(swipeAdvanceTimeoutRef.current);
  }, []);

  if (!card) return h("div", { className: "recall-loading", children: "Your flashcards will appear here." });
  const navigateCard = (next, direction) => {
    if (swipeAdvanceTimeoutRef.current) return;
    const clamped = Math.max(0, Math.min(cards.length - 1, next));
    setFlipped(false);
    setDragX(0);
    setExitDirection(0);
    setEntryDirection(-direction);
    onProgress({ ...progress, flashIndex: clamped, seen: [...new Set([...(progress.seen || []), index])] });
    window.requestAnimationFrame(() => setEntryDirection(0));
  };
  const rateCard = (direction, waitForSwipe = false) => {
    if (swipeAdvanceTimeoutRef.current) return;
    setFlipped(false);
    setDragX(0);
    setExitDirection(waitForSwipe ? direction : 0);
    setEntryDirection(waitForSwipe ? 0 : -direction);
    setRatingFeedback(direction);
    setRatingPulse(direction);
    window.setTimeout(() => setRatingPulse(0), 460);
    const nextGot = new Set(gotIt);
    const nextMissed = new Set(missed);
    nextGot.delete(index);
    nextMissed.delete(index);
    (direction > 0 ? nextGot : nextMissed).add(index);
    const advance = () => {
      swipeAdvanceTimeoutRef.current = null;
      setExitDirection(0);
      setEntryDirection(-direction);
      onProgress({
        ...progress,
        flashIndex: index + 1 === cards.length ? 0 : index + 1,
        seen: [...new Set([...(progress.seen || []), index])],
        gotIt: [...nextGot],
        missed: [...nextMissed]
      });
      window.requestAnimationFrame(() => setEntryDirection(0));
    };
    if (waitForSwipe) swipeAdvanceTimeoutRef.current = window.setTimeout(advance, 520);
    else advance();
  };
  const onPointerDown = (event) => {
    if (swipeAdvanceTimeoutRef.current) return;
    if (event.button !== undefined && event.button !== 0) return;
    gestureRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      gesture.moved = true;
      event.preventDefault();
      pendingDragXRef.current = dx;
      if (!dragFrameRef.current) {
        dragFrameRef.current = window.requestAnimationFrame(() => {
          dragFrameRef.current = 0;
          setDragX(pendingDragXRef.current);
        });
      }
    }
  };
  const onPointerUp = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    gestureRef.current = null;
    if (dragFrameRef.current) window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = 0;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.moved) suppressClickRef.current = true;
    if (gesture.moved && Math.abs(dx) >= 90 && Math.abs(dx) > Math.abs(dy)) rateCard(dx > 0 ? 1 : -1, true);
    else {
      setDragX(0);
      if (gesture.moved) window.setTimeout(() => { suppressClickRef.current = false; }, 180);
    }
  };
  const saveEditedCard = () => {
    onSaveDeck({ ...deck, cards: cards.map((entry, cardIndex) => cardIndex === index ? { ...entry, ...draft } : entry) });
    setEditing(false);
  };
  const rotation = Math.max(-8, Math.min(8, dragX / 22));
  const feedbackDirection = Math.abs(dragX) > 25 ? Math.sign(dragX) : ratingFeedback;
  const label = feedbackDirection > 0 ? "Got it" : feedbackDirection < 0 ? "Missed · You’ll get it next time" : "";
  return h("div", { className: "flashcard-engine", children: [
    h("div", { className: "recall-progress-row", children: [h("span", { children: card.topic || "Chapter flashcards" }), h("span", { children: `${index + 1} / ${cards.length}` })] }),
    h("div", { className: "recall-progress-track", children: h("i", { style: { width: `${(index + 1) / cards.length * 100}%` } }) }),
    h("div", { className: "flashcard-stage", children: [
      h("button", { type: "button", className: "flashcard-menu-trigger", "aria-label": "Flashcard menu", "aria-expanded": menuOpen, onClick: () => setMenuOpen((value) => !value), children: h(MoreVertical, { size: 20 }) }),
      menuOpen && h("div", { className: "flashcard-menu", children: h("button", { type: "button", onClick: () => { setDraft({ front: card.front || "", back: card.back || "" }); setEditing(true); setMenuOpen(false); }, children: "Edit" }) }),
      h("button", {
        type: "button",
        className: `flashcard-scene ${flipped ? "flipped" : ""} ${exitDirection ? `swipe-exit-${exitDirection > 0 ? "right" : "left"}` : ""}`,
        style: { transform: `translateX(${exitDirection ? exitDirection * (window.innerWidth || 900) : entryDirection ? entryDirection * 42 : dragX}px) rotate(${exitDirection ? exitDirection * 12 : entryDirection ? 0 : rotation}deg)`, transition: exitDirection ? "transform .32s cubic-bezier(.2,.7,.2,1)" : entryDirection || dragX ? "none" : "transform .32s cubic-bezier(.2,.7,.2,1)" },
        onClick: () => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } if (!menuOpen && !editing) setFlipped((value) => !value); },
        onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => { gestureRef.current = null; if (dragFrameRef.current) window.cancelAnimationFrame(dragFrameRef.current); dragFrameRef.current = 0; setDragX(0); },
        "aria-label": flipped ? "Show question" : "Flip to answer",
        children: [
          h("div", { className: "flashcard-inner", children: [
            h("div", { className: "flashcard-face flashcard-front", children: [h("small", { children: "QUESTION" }), h("div", { className: "card-content", ref: frontContentRef, children: h(MathText, { className: "recall-math-text", legacy: true, children: card.front }) }), card.image && h("img", { className: "recall-reference-image", src: card.image, alt: card.topic || "Flashcard reference", loading: "lazy" }), h("span", { className: "flip-hint", children: "See answer" })] }),
            h("div", { className: "flashcard-face flashcard-back", children: [h("small", { children: "QUICK RECALL" }), h("div", { className: "card-content", ref: backContentRef, children: h(MathText, { className: "recall-math-text", legacy: true, children: card.back }) }), card.image && h("img", { className: "recall-reference-image", src: card.image, alt: card.topic || "Flashcard reference", loading: "lazy" }), h("span", { className: "flip-hint", children: "See question" })] })
          ] }),
          label && h("span", { className: `flashcard-swipe-label ${dragX > 0 ? "is-got-it" : "is-missed"}`, children: label })
        ]
      }),
    ] }),
    h("div", { className: "flashcard-controls", children: [
      h("button", { type: "button", className: "flashcard-nav-button", onClick: () => navigateCard(index - 1, 1), disabled: index === 0, "aria-label": "Previous flashcard", children: h(ChevronLeft, { size: 25, strokeWidth: 2.6 }) }),
      h("button", { type: "button", className: `flashcard-rating-pill flashcard-count-missed ${ratingPulse < 0 ? "is-pulsing" : ""}`, title: "Mark this card missed", "aria-label": `Mark missed, ${missed.length} missed cards`, onClick: () => rateCard(-1), children: [h(X, { size: 22, strokeWidth: 2.4 }), h("span", { children: missed.length })] }),
      h("button", { type: "button", className: `flashcard-rating-pill flashcard-count-got ${ratingPulse > 0 ? "is-pulsing" : ""}`, title: "Mark this card mastered", "aria-label": `Mark mastered, ${gotIt.length} mastered cards`, onClick: () => rateCard(1), children: [h("span", { children: gotIt.length }), h(Check, { size: 23, strokeWidth: 2.7 })] }),
      h("button", { type: "button", className: "flashcard-nav-button", onClick: () => navigateCard(index + 1 === cards.length ? 0 : index + 1, -1), "aria-label": index + 1 === cards.length ? "Restart flashcards" : "Next flashcard", children: h(ChevronRight, { size: 25, strokeWidth: 2.6 }) })
    ] }),
    editing && h("div", { className: "overlay flashcard-edit-overlay", onMouseDown: (event) => { if (event.target === event.currentTarget) setEditing(false); }, children: h("section", { className: "modal flashcard-edit-modal", role: "dialog", "aria-modal": "true", "aria-label": "Edit flashcard", children: [
      h("header", { className: "modal-header", children: [h("h2", { children: "Edit flashcard" }), h("button", { className: "icon-button", type: "button", "aria-label": "Close edit dialog", onClick: () => setEditing(false), children: h(X, { size: 18 }) })] }),
      h("label", { className: "flashcard-edit-field", children: [h("span", { children: "Question" }), h("textarea", { value: draft.front, onChange: (event) => setDraft((value) => ({ ...value, front: event.target.value })) })] }),
      h("label", { className: "flashcard-edit-field", children: [h("span", { children: "Answer" }), h("textarea", { value: draft.back, onChange: (event) => setDraft((value) => ({ ...value, back: event.target.value })) })] }),
      h("footer", { className: "flashcard-edit-actions", children: [h("button", { className: "button", type: "button", onClick: () => setEditing(false), children: "Cancel" }), h("button", { className: "button primary", type: "button", onClick: saveEditedCard, children: [h(Pencil, { size: 14 }), " Save"] })] })
    ] }) })
  ] });
}
function QuizMode({ deck, progress, onProgress }) {
  const h = React.createElement;
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const quizzes = deck.quizzes || [];
  const index = Math.min(progress.quizIndex || 0, Math.max(0, quizzes.length - 1));
  const question = quizzes[index];
  const answers = progress.answers || {};
  const picked = answers[index];
  useEffect(() => { setExplanationOpen(false); setShowHint(false); }, [index]);
  if (!question) return h("div", { className: "recall-loading", children: "Your quiz will appear here." });
  const hintText = typeof question.hint === "string" ? question.hint.trim() : "";
  const choose = (option) => {
    if (picked === void 0) onProgress({ ...progress, answers: { ...answers, [index]: option } });
  };
  const next = () => onProgress({ ...progress, quizIndex: index + 1 === quizzes.length ? 0 : index + 1 });
  const score = Object.entries(answers).filter(([questionIndex, answer]) => deck.quizzes[Number(questionIndex)]?.correctIndex === answer).length;
  const fullExplanation = question.fullExplanation?.trim() || question.solution?.trim() || question.explanation?.trim() || quizSolutionText(question);
  return h("div", { className: "quiz-engine", children: [
    h("div", { className: "recall-progress-row", children: [h("span", { children: `Chapter quiz · ${score} correct` }), h("span", { children: `${index + 1} / ${quizzes.length}` })] }),
    h("div", { className: "recall-progress-track", children: h("i", { style: { width: `${(index + 1) / quizzes.length * 100}%` } }) }),
    h("div", { className: "quiz-question", children: [
      h("span", { children: question.topic || `QUESTION ${String(index + 1).padStart(2, "0")}` }),
      h("div", { className: "quiz-question-text", children: h(MathText, { className: "recall-math-text", legacy: true, children: question.question }) }),
      question.image && h("img", { className: "recall-reference-image quiz-reference-image", src: question.image, alt: question.topic || "Quiz reference", loading: "lazy" })
    ] }),
    h("div", { className: "quiz-options", children: question.options.map((option, optionIndex) => {
      const selected = picked === optionIndex;
      const correct = optionIndex === question.correctIndex;
      const showRationale = picked !== void 0;
      const stateClass = picked === void 0 ? "" : correct ? "correct" : selected ? "incorrect" : "";
      return h("article", { key: optionIndex, className: `quiz-option ${stateClass} ${selected ? "selected" : ""}`, children: [
        h("button", { className: "quiz-option-pick", onClick: () => choose(optionIndex), disabled: picked !== void 0, children: [
          h("span", { className: "quiz-option-letter", children: String.fromCharCode(65 + optionIndex) }),
          h("div", { className: "quiz-option-text", children: h(MathText, { className: "recall-math-text", legacy: true, children: option }) }),
          picked !== void 0 && correct && h(Check, { size: 15 }),
          picked !== void 0 && selected && !correct && h("span", { className: "not-quite-badge", children: "Your answer" })
        ] }),
        showRationale && h("div", { className: `quiz-option-rationale ${correct ? "is-correct" : selected ? "is-selected-wrong" : ""}`, children: [
          h("strong", { children: correct ? "Right answer" : selected ? "Your answer" : "Why this option doesn’t fit" }),
          h(MathText, { className: "recall-math-text", legacy: true, children: String(question.optionExplanations?.[optionIndex] || (correct ? question.explanation : "Review the chapter concept and compare this choice with the correct relation.")).replace(/^correct:\s*/i, "") })
        ] })
      ] });
    }) }),
    h("div", { className: "quiz-footer", children: [
      h("span", { children: picked === void 0 ? "Choose one answer." : "Your answer is saved." }),
      h("div", { className: "recall-nav-controls", children: [
        h("button", { className: "button", onClick: () => onProgress({ ...progress, quizIndex: Math.max(0, index - 1) }), disabled: index === 0, children: [h(ChevronLeft, { size: 14 }), " Previous"] }),
        Object.keys(answers).length > 0 && h("button", { className: "quiz-reset", onClick: () => onProgress({ ...progress, quizIndex: 0, answers: {} }), children: [h(RotateCcw, { size: 12 }), " Restart quiz"] }),
        h("button", { className: "button primary", onClick: next, children: [index + 1 === quizzes.length ? "Finish quiz" : "Next question", " ", h(ChevronRight, { size: 14 })] })
      ] })
    ] }),
    h("div", { className: "quiz-explain-bottom", children: [
      h("div", { className: "quiz-hint-control", children: [
        h("button", { type: "button", className: "quiz-hint-toggle", "aria-expanded": showHint, disabled: !hintText, onClick: () => setShowHint((value) => !value), children: [h(Lightbulb, { size: 15 }), "Hint"] }),
        showHint && hintText && h("div", { className: "quiz-hint-copy", children: h(MathText, { className: "recall-math-text", legacy: true, children: hintText }) })
      ] }),
      picked !== void 0 && h(Fragment, { children: [
        h("button", { type: "button", className: "button quiz-explain-button", "aria-expanded": explanationOpen, onClick: () => setExplanationOpen((value) => !value), children: [h(Sparkles, { size: 15 }), explanationOpen ? "Hide explanation" : "Explain"] }),
        explanationOpen && h("section", { className: "quiz-full-solution", "aria-live": "polite", children: [
        h("strong", { children: "Complete explanation" }),
        h(MathText, { className: "recall-math-text", legacy: true, children: fullExplanation })
        ] })
      ] })
    ] })
  ] });
}
function MemoryNavigation({ selection, chapter, onSelection, onUpdateSelection }) {
  if (!selection.subject) return null;
  const changeSubject = () => onSelection({ subject: null, classLevel: null, chapterId: null });
  const actions = [React.createElement("button", { type: "button", key: "subject", onClick: changeSubject, children: "Change subject" })];
  if (chapter) actions.push(React.createElement("button", {
    type: "button",
    key: "chapter",
    onClick: () => onUpdateSelection({ ...selection, chapterId: null }),
    "aria-label": "Change chapter",
    children: ["Change chapter", React.createElement(X, { size: 13, "aria-hidden": true, key: "close" })]
  }));
  return React.createElement("div", { className: "memory-nav-glass", role: "group", "aria-label": "Recall navigation", children: actions });
}
function MemoryRecall({ state, chapters: passedChapters = [], onSelection, onSaveDeck, onSaveProgress, onUpdateSelection, modelPrefs = DEFAULT_MODEL_PREFERENCES }) {
  const { isNeetMode, subjects } = useSubjectMode();
  const [mode, setMode] = useState("flashcards");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [retry, setRetry] = useState(0);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateType, setGenerateType] = useState("flashcards");
  const [generateQuantity, setGenerateQuantity] = useState(2);
  const [addingMore, setAddingMore] = useState(false);
  const selection = state.memorySelection || { subject: null, classLevel: null, chapterId: null };
  const chapters = useMemo(() => isNeetMode ? passedChapters : [...SYLLABUS.advanced.filter((chapter2) => !(state.deletedChapterIds || []).includes(chapter2.id)), ...state.customChapters || []], [state.deletedChapterIds, state.customChapters, isNeetMode, passedChapters]);
  useEffect(() => {
    if (selection.subject && !subjects.includes(selection.subject)) onSelection({ subject: null, classLevel: null, chapterId: null });
  }, [isNeetMode]);
  const chapter = chapters.find((item) => item.id === selection.chapterId);
  const savedDeck = chapter ? state.memoryDecks?.[chapter.id] : null;
  const isBiologyChapter = chapter?.subject === "Botany" || chapter?.subject === "Zoology";
  const recallPath = masterRecallPath(chapter, selection.classLevel);
  const deck = savedDeck?.schemaVersion === DECK_VERSION && ["master-json", "ai-generated"].includes(savedDeck.source) && hasDistinctCardSides(savedDeck.cards) && Array.isArray(savedDeck.quizzes) && hasNoChapterPrefixes(savedDeck, chapter) ? savedDeck : null;
  const progress = chapter ? state.memoryProgress?.[chapter.id] || { flashIndex: 0, seen: [], quizIndex: 0, answers: {} } : null;
  useEffect(() => {
    if (!chapter || localStorage.getItem("apexjee-recall-quiz") !== chapter.id) return;
    localStorage.removeItem("apexjee-recall-quiz");
    setMode("quiz");
    setReviewOpen(true);
  }, [chapter?.id]);
  useEffect(() => {
    if (!reviewOpen) return void 0;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") setReviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [reviewOpen]);
  useEffect(() => {
    let active = true;
    if (!chapter || deck) {
      setGenerating(false);
      setGenerationError("");
      return void 0;
    }
    setGenerating(true);
    setGenerationError("");
    (async () => {
      try {
        if (!recallPath) throw new Error("No master recall database is available for this subject.");
        const bundled = normalizeBundledDeck(await fetchMasterRecall(recallPath), chapter);
        if (!bundled) throw new Error("Bundled recall set has an unexpected format.");
        if (!hasDistinctCardSides(bundled.cards) || !Array.isArray(bundled.quizzes) || bundled.quizzes.length < (isBiologyChapter ? 1 : 20) || !hasNoChapterPrefixes(bundled, chapter)) throw new Error("Bundled recall set is incomplete.");
        if (!active) return;
        onSaveDeck(chapter.id, { ...bundled, schemaVersion: DECK_VERSION, source: "master-json" });
        if (savedDeck?.schemaVersion !== DECK_VERSION || !state.memoryProgress?.[chapter.id]) {
          onSaveProgress(chapter.id, { flashIndex: 0, seen: [], quizIndex: 0, answers: {} });
        }
      } catch (error) {
        if (recallPath) {
          if (active) setGenerationError(error.message || "The bundled flashcard and quiz data could not be loaded.");
          return;
        }
        try {
          const nextDeck = await generateDeck(chapter, resolveAIModel("recall", modelPrefs));
          if (!active) return;
          persistGeneratedDeck(nextDeck);
          onSaveProgress(chapter.id, { flashIndex: 0, seen: [], quizIndex: 0, answers: {} });
        } catch (error) {
          if (active) setGenerationError(error.message || "Could not create this chapter\u2019s recall set.");
        }
      } finally {
        if (active) setGenerating(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [chapter?.id, deck, recallPath, selection.classLevel, retry]);
  const saveProgress = (next) => onSaveProgress(chapter.id, next);
  const generateMore = async () => {
    if (!chapter || !deck) return;
    setAddingMore(true);
    setGenerationError("");
    try {
      runRecallMathSelfTest();
      const isCards = generateType === "flashcards";
      const listKey = isCards ? "cards" : "quizzes";
      const additions = await generateAdditionalItems(chapter, isCards ? "cards" : "quizzes", generateQuantity, deck[listKey] || [], resolveAIModel("recall", modelPrefs));
      const updatedDeck = { ...deck, [listKey]: [...(deck[listKey] || []), ...additions], source: "ai-generated" };
      persistGeneratedDeck(updatedDeck);
      setGenerateOpen(false);
    } catch (error) {
      setGenerationError(error.message || "Could not generate new recall items.");
    } finally {
      setAddingMore(false);
    }
  };
  const persistGeneratedDeck = (nextDeck) => {
    onSaveDeck(chapter.id, nextDeck);
  };
  const exportCurrentChapter = () => {
    if (!chapter || !deck) return;
    const slug = chapter.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadRecallJson(`apex-${slug}-recall.json`, { schemaVersion: deck.schemaVersion, chapter: { id: chapter.id, name: chapter.name, subject: chapter.subject, unit: chapter.unit }, cards: deck.cards, quizzes: deck.quizzes });
  };
  return /* @__PURE__ */ jsx("section", { className: "memory-view", children: [
    /* @__PURE__ */ jsx("div", { className: "memory-heading", children: [
      /* @__PURE__ */ jsx("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "eyebrow", children: "ACTIVE RECALL \xB7 FLASHCARDS & QUIZ" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 297,
          columnNumber: 42
        }, this),
        /* @__PURE__ */ jsx("h1", { children: "Memory & Recall" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 297,
          columnNumber: 102
        }, this),
        /* @__PURE__ */ jsx("p", { children: "Study a chapter with focused questions and quick explanations." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 297,
          columnNumber: 126
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 297,
        columnNumber: 37
      }, this),
      /* @__PURE__ */ jsx(MemoryNavigation, { selection, chapter, onSelection, onUpdateSelection }, void 0, false, {
        fileName: "memory-recall.js",
        lineNumber: 297,
        columnNumber: 201
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 297,
      columnNumber: 5
    }, this),
    !chapter ? /* @__PURE__ */ jsx(ChapterPicker, { selection, onSelection, chapters, onChangeClass: () => onSelection({ ...selection, classLevel: null, chapterId: null }) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 299,
      columnNumber: 17
    }, this) : /* @__PURE__ */ jsx("div", { className: "memory-study", children: [
      /* @__PURE__ */ jsx("div", { className: "memory-selected-chapter", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("h2", { children: chapter.name }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 300,
            columnNumber: 156
          }, this),
          /* @__PURE__ */ jsx("span", { children: [
            chapter.subject,
            " \xB7 Class ",
            selection.classLevel || assignedClass(chapter),
            " \xB7 ",
            chapter.unit
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 300,
            columnNumber: 179
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 300,
          columnNumber: 48
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 300,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "memory-mode-toggle", children: [
        /* @__PURE__ */ jsx("button", { className: mode === "flashcards" ? "active" : "", onClick: () => { setMode("flashcards"); setReviewOpen(true); }, children: [
          /* @__PURE__ */ jsx(FlashcardsIcon, { size: 18 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 301,
            columnNumber: 139
          }, this),
          " Start Flashcards ",
          /* @__PURE__ */ jsx("small", { children: deck?.cards.length ?? "\u2014" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 301,
            columnNumber: 172
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 301,
          columnNumber: 43
        }, this),
        /* @__PURE__ */ jsx("button", { className: mode === "quiz" ? "active" : "", onClick: () => { setMode("quiz"); setReviewOpen(true); }, children: [
          /* @__PURE__ */ jsx(CircleHelp, { size: 14 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 301,
            columnNumber: 307
          }, this),
          " Start Quiz ",
          /* @__PURE__ */ jsx("small", { children: deck?.quizzes.length ?? "\u2014" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 301,
            columnNumber: 336
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 301,
          columnNumber: 223
        }, this),
        deck && /* @__PURE__ */ jsx(Fragment, { children: [
          /* @__PURE__ */ jsx("button", { className: "button", disabled: addingMore, onClick: generateMore, children: addingMore ? "Generating…" : "Generate More" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 301,
            columnNumber: 400
          }, this),
          /* @__PURE__ */ jsx("button", { className: "button", onClick: exportCurrentChapter, children: [
            /* @__PURE__ */ jsx(Download, { size: 13 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 301,
              columnNumber: 545
            }, this),
            " Export JSON"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 301,
            columnNumber: 487
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 301,
          columnNumber: 398
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 301,
        columnNumber: 7
      }, this),
      generating && /* @__PURE__ */ jsx("div", { className: "recall-generating", children: [
        /* @__PURE__ */ jsx("span", {}, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 302,
          columnNumber: 57
        }, this),
        "Loading chapter flashcards and quiz questions…"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 302,
        columnNumber: 22
      }, this),
      generationError && /* @__PURE__ */ jsx("div", { className: "recall-error", role: "alert", children: [
        /* @__PURE__ */ jsx("p", { children: generationError }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 303,
          columnNumber: 70
        }, this),
        /* @__PURE__ */ jsx("button", { className: "button", onClick: () => setRetry((value) => value + 1), children: "Try again" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 303,
          columnNumber: 94
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 303,
        columnNumber: 27
      }, this),
      null
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 299,
      columnNumber: 104
    }, this),
    reviewOpen && chapter && /* @__PURE__ */ jsx("div", { className: "recall-review-overlay", role: "dialog", "aria-modal": "true", "aria-label": mode === "flashcards" ? `Flashcard review: ${chapter.name}` : `Quiz review: ${chapter.name}`, children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "recall-review-exit", onClick: () => setReviewOpen(false), children: "Exit review ❌" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 305,
        columnNumber: 12
      }, this),
      /* @__PURE__ */ jsx("div", { className: "recall-review-content", children: [
        /* @__PURE__ */ jsx("div", { className: "recall-review-heading", children: [
          /* @__PURE__ */ jsx("span", { children: mode === "flashcards" ? "FLASHCARD REVIEW" : "QUIZ REVIEW" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 306,
            columnNumber: 14
          }, this),
          /* @__PURE__ */ jsx("h1", { children: chapter.name }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 306,
            columnNumber: 92
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 12
        }, this),
        generating && /* @__PURE__ */ jsx("div", { className: "recall-generating", children: [
          /* @__PURE__ */ jsx("span", {}, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 307,
            columnNumber: 44
          }, this),
          "Preparing your review…"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 307,
          columnNumber: 12
        }, this),
        generationError && /* @__PURE__ */ jsx("div", { className: "recall-error", role: "alert", children: [
          /* @__PURE__ */ jsx("p", { children: generationError }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 308,
            columnNumber: 55
          }, this),
          /* @__PURE__ */ jsx("button", { className: "button", onClick: () => setRetry((value) => value + 1), children: "Try again" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 308,
            columnNumber: 95
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 308,
          columnNumber: 12
        }, this),
        deck && (mode === "flashcards" ? /* @__PURE__ */ jsx(FlashcardMode, { deck, progress, onProgress: saveProgress, onSaveDeck: (nextDeck) => onSaveDeck(chapter.id, nextDeck) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 309,
          columnNumber: 19
        }, this) : /* @__PURE__ */ jsx(QuizMode, { deck, progress, onProgress: saveProgress }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 309,
          columnNumber: 96
        }, this))
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 306,
        columnNumber: 10
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 305,
      columnNumber: 8
    }, this),
    generateOpen && /* @__PURE__ */ jsx("div", { className: "overlay", onMouseDown: (event) => {
      if (event.target === event.currentTarget) setGenerateOpen(false);
    }, children: /* @__PURE__ */ jsx("section", { className: "modal narrow", role: "dialog", "aria-modal": "true", "aria-label": "Generate more recall items", children: [
      /* @__PURE__ */ jsx("header", { className: "modal-header", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("h2", { children: "Generate more" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 306,
            columnNumber: 286
          }, this),
          /* @__PURE__ */ jsx("p", { children: [
            "Add original chapter content for ",
            chapter?.name,
            "."
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 306,
            columnNumber: 308
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 281
        }, this),
        /* @__PURE__ */ jsx("button", { className: "close-button", onClick: () => setGenerateOpen(false), children: /* @__PURE__ */ jsx(X, { size: 16 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 445
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 373
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 306,
        columnNumber: 248
      }, this),
      /* @__PURE__ */ jsx("div", { className: "field", children: [
        /* @__PURE__ */ jsx("span", { className: "field-label", children: "Type" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 500
        }, this),
        /* @__PURE__ */ jsx("div", { className: "pill-group", children: [
          /* @__PURE__ */ jsx("button", { className: `pill-choice ${generateType === "flashcards" ? "selected" : ""}`, onClick: () => setGenerateType("flashcards"), children: "Flashcards" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 306,
            columnNumber: 569
          }, this),
          /* @__PURE__ */ jsx("button", { className: `pill-choice ${generateType === "quizzes" ? "selected" : ""}`, onClick: () => setGenerateType("quizzes"), children: "Quiz questions" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 306,
            columnNumber: 719
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 541
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 306,
        columnNumber: 477
      }, this),
      /* @__PURE__ */ jsx("div", { className: "field", children: [
        /* @__PURE__ */ jsx("span", { className: "field-label", children: "Quantity" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 902
        }, this),
        /* @__PURE__ */ jsx("div", { className: "pill-group", children: [2, 3].map((quantity) => /* @__PURE__ */ jsx("button", { className: `pill-choice ${generateQuantity === quantity ? "selected" : ""}`, onClick: () => setGenerateQuantity(quantity), children: quantity }, quantity, false, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 998
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 947
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 306,
        columnNumber: 879
      }, this),
      generationError && /* @__PURE__ */ jsx("p", { className: "upload-error", children: generationError }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 306,
        columnNumber: 1197
      }, this),
      /* @__PURE__ */ jsx("div", { className: "modal-footer", children: [
        /* @__PURE__ */ jsx("button", { className: "button", onClick: () => setGenerateOpen(false), children: "Cancel" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 1277
        }, this),
        /* @__PURE__ */ jsx("button", { className: "button primary", disabled: addingMore, onClick: generateMore, children: addingMore ? "Generating\u2026" : "Generate" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 306,
          columnNumber: 1358
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 306,
        columnNumber: 1247
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 306,
      columnNumber: 142
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 306,
      columnNumber: 22
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 296,
    columnNumber: 10
  }, this);
}
var stdin_default = MemoryRecall;
export {
  stdin_default as default
};
