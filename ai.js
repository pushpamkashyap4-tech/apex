export const AI_MODEL = "openai/gpt-oss-120b";

export const AI_MODELS = [
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", kind: "chat", tags: ["reasoning", "vision", "JSON"] },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", kind: "chat", tags: ["reasoning", "browser search", "JSON"] },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", kind: "chat", tags: ["fast", "browser search", "JSON"] },
  { id: "openai/gpt-oss-safeguard-20b", label: "GPT-OSS Safeguard 20B", kind: "safety", tags: ["safety classification"] },
  { id: "meta-llama/llama-prompt-guard-2-22m", label: "Llama Prompt Guard 2 22M", kind: "safety", tags: ["prompt-injection screening"] },
  { id: "meta-llama/llama-prompt-guard-2-86m", label: "Llama Prompt Guard 2 86M", kind: "safety", tags: ["prompt-injection screening"] },
  { id: "whisper-large-v3", label: "Whisper Large V3", kind: "transcription", tags: ["audio transcription"] },
  { id: "whisper-large-v3-turbo", label: "Whisper Large V3 Turbo", kind: "transcription", tags: ["fast audio transcription"] }
];

export const CHAT_MODELS = AI_MODELS.filter((model) => model.kind === "chat");
export const DEFAULT_MODEL_PREFERENCES = { assistant: "auto", planning: "auto", recall: "auto", transcription: "whisper-large-v3-turbo" };

const ASSISTANT_MODEL_POOLS = {
  search: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  reasoning: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
  general: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
};

function nextAssistantModel(category, preference) {
  const pool = ASSISTANT_MODEL_POOLS[category];
  return preference && preference !== "auto" && pool.includes(preference) ? preference : pool[0];
}

export function resolveAIModel(task, preferences = {}, context = {}) {
  const selected = preferences?.[task];
  if (task === "recall") return "gemini-3.8-flash";
  if (task === "assistant" && context.hasImages) return "gemini-3.8-flash";
  if (task === "assistant") {
    const category = context.needsSearch ? "search" : context.complexReasoning ? "reasoning" : "general";
    return nextAssistantModel(category, selected);
  }
  if (selected && selected !== "auto" && CHAT_MODELS.some((model) => model.id === selected)) return selected;
  if (task === "planning") return "openai/gpt-oss-120b";
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

export async function requestAssistantTask(task, messages, { groqKeys = [], geminiKeys = [], googleSearch = false, json = false, responseSchema, maxTokens = 6000 } = {}) {
  let response;
  try {
    response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, messages, groqApiKeys: groqKeys, geminiApiKeys: geminiKeys, googleSearch, json, responseSchema, maxTokens })
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
