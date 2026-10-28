export const AI_MODEL = "openai/gpt-oss-120b";

export const AI_MODELS = [
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", kind: "chat", tags: ["Groq", "reasoning"] },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", kind: "chat", tags: ["Groq", "fast"] },
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", kind: "chat", tags: ["Groq", "multilingual"] },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", kind: "chat", tags: ["Google", "general"] },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", kind: "chat", tags: ["Google", "fast"] },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", kind: "chat", tags: ["Google", "fast"] },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", kind: "chat", tags: ["Google", "reasoning"] },
  { id: "gemini-pro-latest", label: "Gemini Pro Latest", kind: "chat", tags: ["Google", "reasoning"] },
  { id: "gemini-flash-latest", label: "Gemini Flash Latest", kind: "chat", tags: ["Google", "general"] },
  { id: "gemini-flash-lite-latest", label: "Gemini Flash Lite Latest", kind: "chat", tags: ["Google", "fast"] }
];

export const CHAT_MODELS = AI_MODELS.filter((model) => model.kind === "chat");
// Websim previews provide their own chat runtime and do not run this project's
// Vercel /api functions. Deployed Vercel builds use the same-origin API below.
export async function requestAssistantCompletion(messages, options = {}) {
  const websimChat = globalThis.websim?.chat?.completions;
  if (typeof websimChat?.create === "function") {
    const completion = await websimChat.create({
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      ...(options.json ? { json: true } : {})
    });
    const answer = typeof completion?.content === "string" ? completion.content.trim() : "";
    if (!answer) throw new Error("The assistant returned an empty reply. Please try again.");
    return { answer, provider: "Websim AI" };
  }
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: options.task || "assistant", messages, googleSearch: options.googleSearch, modelOverride: options.modelOverride || "auto", ...getProviderKeys() })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The assistant is temporarily unavailable. Please try again.");
  return result;
}
export async function generateGraph(graphType, parameters = {}) {
  const prompt = typeof parameters.prompt === "string" ? parameters.prompt : JSON.stringify(parameters);
  const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "assistant", modelOverride: parameters.modelOverride || "auto", json: true, ...getProviderKeys(),
      messages: [{ role: "user", content: `Return a graph specification JSON object with title, xAxis {label,domain}, yAxis {label,domain}, and data [{label,color,fn or points}]. Use graphable finite expressions and specify domain restrictions. Type: ${graphType}. Parameters/request: ${prompt}` }] }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Graph generation failed.");
  return JSON.parse(result.answer);
}
export const DEFAULT_MODEL_PREFERENCES = { assistant: "auto", planning: "auto", recall: "auto", transcription: "whisper-large-v3-turbo", speech: "canopylabs/orpheus-v1-english" };

export const API_KEY_STORAGE = "apex-provider-keys-v2";
export function getProviderKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem(API_KEY_STORAGE) || "{}");
    const oldArray = (key) => { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : value ? [value] : []; } catch { const value = localStorage.getItem(key); return value ? [value] : []; } };
    return {
      groqKeys: (Array.isArray(saved.groq) && saved.groq.length ? saved.groq : [...oldArray("apex_groq_keys"), ...oldArray("apexjee-groq-key")]).map((key) => String(key || "").trim()).filter(Boolean),
      geminiKeys: (Array.isArray(saved.gemini) && saved.gemini.length ? saved.gemini : oldArray("apex_gemini_keys")).map((key) => String(key || "").trim()).filter(Boolean),
      keyRotationStart: Number(saved.savedAt) || 0
    };
  } catch { return { groqKeys: [], geminiKeys: [] }; }
}

const ASSISTANT_MODEL_POOLS = {
  search: ["gemini-3.5-flash", "openai/gpt-oss-120b"],
  reasoning: ["gemini-3.1-pro-preview", "openai/gpt-oss-120b"],
  general: ["gemini-3.5-flash-lite", "openai/gpt-oss-20b"]
};

function nextAssistantModel(category, preference) {
  const pool = ASSISTANT_MODEL_POOLS[category];
  return preference && preference !== "auto" && pool.includes(preference) ? preference : pool[0];
}

export function resolveAIModel(task, preferences = {}, context = {}) {
  const selected = preferences?.[task];
  if (task === "assistant" && context.hasImages) return "gemini-3.5-flash";
  if (selected && selected !== "auto" && CHAT_MODELS.some((model) => model.id === selected)) return selected;
  if (task === "assistant") {
    const category = context.needsSearch ? "search" : context.complexReasoning ? "reasoning" : "general";
    return nextAssistantModel(category, selected);
  }
  return AI_MODEL;
}

const QUOTA_STORAGE_KEY = "apex-ai-quota-v1";
const quotaLimits = {
  groq: { tpm: 4800, tpd: 120000 },
  gemini: { tpm: 6000, tpd: 150000 }
};

export function getTokenQuotaEstimate(provider, id) {
  const limits = quotaLimits[provider === "groq" ? "groq" : "gemini"];
  let ledger = {};
  try { ledger = JSON.parse(localStorage.getItem(QUOTA_STORAGE_KEY) || "{}"); } catch {}
  const state = ledger[`${provider}:${id}`] || { usage: [] };
  const now = Date.now();
  const usage = (state.usage || []).filter((entry) => now - entry.at < 86400000);
  return {
    tpm: usage.filter((entry) => now - entry.at < 60000).reduce((sum, entry) => sum + entry.tokens, 0),
    tpd: usage.reduce((sum, entry) => sum + entry.tokens, 0),
    tpmLimit: limits.tpm,
    tpdLimit: limits.tpd
  };
}

export function parseAIJson(content) {
  const raw = String(content || "")
    .replace(/^\uFEFF/, "")
    .replace(/[“”„‟]/g, '"')
    .trim()
    .replace(/^```(?:json|javascript|js)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const repairTrailingCommas = (source) => {
    let output = "";
    let inString = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        output += character;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') { inString = true; output += character; continue; }
      if (character === ",") {
        let next = index + 1;
        while (/\s/.test(source[next] || "")) next += 1;
        if (source[next] === "}" || source[next] === "]") continue;
      }
      output += character;
    }
    return output;
  };
  const candidates = [raw];
  // Search every possible object/array start, so a bracket in conversational
  // preamble cannot hide the actual JSON value that follows it.
  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== "{" && raw[start] !== "[") continue;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const character = raw[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') { inString = true; continue; }
      if (character === "{" || character === "[") stack.push(character === "{" ? "}" : "]");
      else if (character === "}" || character === "]") {
        if (stack.pop() !== character) break;
        if (!stack.length) { candidates.push(raw.slice(start, index + 1)); break; }
      }
    }
  }
  for (const candidate of candidates) {
    try { return JSON.parse(repairTrailingCommas(candidate)); } catch { /* Try the next extracted JSON value. */ }
  }
  throw new Error("The model did not return valid JSON. Please try again.");
}

// Named for call sites that deal directly with model text, while preserving
// parseAIJson for existing planner and recall modules.
export const extractJson = parseAIJson;

export async function requestAssistantTask(task, messages, { googleSearch = false, json = false, responseSchema, maxTokens = 6000, modelOverride = "auto" } = {}) {
  let response;
  try {
    response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, messages, googleSearch, json, responseSchema, maxTokens, modelOverride, ...getProviderKeys() })
    });
  } catch {
    throw new Error("Can’t reach the assistant right now. Check your connection and try again.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `${task} generation failed (${response.status}).`);
  const answer = typeof result.answer === "string" ? result.answer.trim() : "";
  if (!answer) throw new Error(`${task} provider returned an empty response.`);
  // Validate structured output here too, so a malformed server response never
  // reaches the planner or recall UI as if it were a successful generation.
  if (json) parseAIJson(answer);
  return answer;
}
