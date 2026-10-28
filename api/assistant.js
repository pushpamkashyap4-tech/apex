// Vercel serverless endpoint. Provider credentials are server-only environment variables.
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
const MAX_BODY_BYTES = 9 * 1024 * 1024;
const SYSTEM_PROMPT = `You are an expert study tutor. Answer clearly, solve study problems accurately, and use valid standard Markdown. Preserve normal spaces between every word and keep prose in ordinary sentences. Keep every mathematical command inside valid LaTeX delimiters; use $...$ inline with ordinary spaces around the delimiters when they touch prose, and put $$ display math on its own lines with a blank line before and after. Never leak raw LaTeX. Do not nest $ delimiters or use \\( \\) inside an already delimited formula; balance every brace and use one consistent delimiter pair per expression. Keep prose outside formulas, use \\text{} for words inside equations, and use inline math for individual variables. Do not wrap equations in \\boxed unless the user explicitly requests a box. Never put Markdown emphasis or list markers inside math.

TABLE RULE: Use standard Markdown pipe tables, with a header, a separator row, and one physical line per data row. Put a blank line before and after each table. Inside table cells, NEVER use $$...$$ or multiline math blocks; use single-dollar inline math $...$ (for example, $\\Delta G = -nFE_{\\text{cell}}$), with spaces around the math delimiters when adjacent to prose. Keep column text concise and do not omit spaces between words.

VISUAL ROUTING — use the matching renderer:
1. Wikipedia, biology, anatomy, and real-world illustrations: emit [WIKI_IMAGE: concise search query] on its own line with a literal unescaped underscore. Never say an image is unavailable.
2. Flowcharts and pathways: emit only a fenced Mermaid block, using flowchart TD or flowchart LR syntax inside the fence.
3. Pure mathematical functions: emit a fenced plot block containing the exact equation, such as \`\`\`plot followed by y = cos(x) and a closing fence.
4. Scientific graphs, conics, parametric curves, and geometry: emit a fenced scientific-plot JSON block with labeled axes and data. Use numeric [x,y] points for scatter plots, polylines for connected curves and polygons, fnType implicit for conics, or parametric x/y functions and a t range. Do not emit chart JSON as ordinary prose or a generic json code block. Prefer structured points and polylines over hand-drawn SVG for plotted figures.
5. Chemistry molecules: emit [SMILES: ...], never ASCII structures.
For free-body diagrams, geometric shapes, coordinate figures, and patterns, use scientific-plot polygon data or a complete labeled SVG. Do not invent local figure identifiers. Keep JSON responses strictly valid when requested. Use spaces after sentence punctuation and between all words; do not concatenate headings, paragraphs, or table rows.`;
const GEMINI_MODELS = {
  "assistant-default": ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"],
  planner: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"],
  recall: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"],
  visual: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]
};
const GEMINI_IMAGE_MODELS = new Set(["gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image", "gemini-3-pro-image", "gemini-2.5-flash-image"]);
const GEMINI_CHAT_MODELS = new Set([...Object.values(GEMINI_MODELS).flat(), "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash"]);

function rotatedKeys(keys, rotationStart = 0) {
  if (!keys.length) return [];
  const now = Date.now();
  const start = Number(rotationStart);
  const index = start > 0 && start <= now ? Math.floor((now - start) / 30000) % keys.length : Math.floor(now / 30000) % keys.length;
  return keys.map((_, offset) => keys[(index + offset) % keys.length]);
}

async function fetchRotating(keys, request, rotationStart = 0) {
  let lastResponse = null;
  let lastError = null;
  for (const key of rotatedKeys(keys, rotationStart)) {
    try {
      const response = await request(key);
      if (response.ok) return { response, error: null };
      lastResponse = response;
      if (response.status >= 400 && response.status < 500 && ![401, 403, 408, 425, 429].includes(response.status)) break;
    } catch (error) {
      lastError = error;
    }
  }
  return { response: lastResponse, error: lastError };
}

function respond(res, status, payload) {
  return res.status(status).json(payload);
}

function requestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return {};
}

function normalizeMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const messages = [];
  for (const entry of value) {
    if (!entry || !["system", "user", "assistant"].includes(entry.role)) return null;
    const parts = Array.isArray(entry.content) ? entry.content : [entry.content];
    if (parts.length > 5) return null;
    const content = [];
    for (const part of parts) {
      if (typeof part === "string") content.push(part.slice(0, 10000));
      else if (part?.type === "image_url" && typeof part.image_url?.url === "string") {
        const url = part.image_url.url;
        if (url.length > 2_500_000 || !/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(url)) return null;
        content.push({ type: "image_url", image_url: { url } });
      } else if (typeof part?.text === "string") content.push({ type: "text", text: part.text.slice(0, 10000) });
      else return null;
    }
    messages.push({ role: entry.role, content: Array.isArray(entry.content) ? content : content[0] ?? "" });
  }
  return messages;
}

function enforceSystemPrompt(messages) {
  const clientInstructions = messages.filter((message) => message.role === "system").map((message) => contentText(message.content)).filter(Boolean).join("\n\n");
  return [
    { role: "system", content: `${SYSTEM_PROMPT}${clientInstructions ? `\n\nTask instructions:\n${clientInstructions}` : ""}` },
    ...messages.filter((message) => message.role !== "system")
  ];
}

function geminiPart(part) {
  if (typeof part === "string") return { text: part };
  if (part?.type === "image_url") {
    const match = String(part.image_url?.url || "").match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([\s\S]+)$/i);
    return match ? { inlineData: { mimeType: match[1], data: match[2].replace(/\s/g, "") } } : { text: "[Image omitted]" };
  }
  return { text: part?.text || "" };
}

function geminiContents(messages) {
  return messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: (Array.isArray(message.content) ? message.content : [message.content]).map(geminiPart)
  }));
}

function providerError(payload, status, provider, networkError) {
  if (!status) return `${provider} could not be reached${networkError ? `: ${String(networkError.message || "network error").slice(0, 120)}` : ""}.`;
  if (status === 429) return `${provider} rate limit reached (${status}).`;
  if (status === 401 || status === 403) return `${provider} rejected a configured API key (${status}).`;
  const detail = payload?.error?.message || payload?.message;
  return typeof detail === "string" && detail.length < 240 ? `${provider}: ${detail}` : `${provider} request failed (${status}).`;
}

function contentText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((part) => typeof part === "string" ? part : part?.text || "").join("").trim();
  return "";
}

function extractJson(value) {
  const raw = String(value || "").replace(/^\uFEFF/, "").replace(/[“”„‟]/g, '"').trim()
    .replace(/^```(?:json|javascript|js)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const repair = (source) => {
    let output = "", quoted = false, escaped = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        output += character;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') { quoted = true; output += character; }
      else if (character === ",") {
        let next = index + 1;
        while (/\s/.test(source[next] || "")) next += 1;
        if (source[next] === "}" || source[next] === "]") continue;
        output += character;
      } else output += character;
    }
    return output;
  };
  const candidates = [raw];
  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== "{" && raw[start] !== "[") continue;
    const stack = [];
    let quoted = false, escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const character = raw[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{" || character === "[") stack.push(character === "{" ? "}" : "]");
      else if (character === "}" || character === "]") {
        if (stack.pop() !== character) break;
        if (!stack.length) { candidates.push(raw.slice(start, index + 1)); break; }
      }
    }
  }
  for (const candidate of candidates) {
    try { return JSON.parse(repair(candidate)); } catch { /* Try the next JSON candidate. */ }
  }
  throw new Error("Provider returned malformed JSON.");
}

async function readProviderResponse(response, provider) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { error: providerError(payload, response.status, provider) };
  const answer = contentText(payload.choices?.[0]?.message?.content);
  return answer ? { answer } : { error: `${provider} returned an empty response.` };
}

async function askGroq(keys, messages, model = "openai/gpt-oss-120b", options = {}) {
  const { response, error } = await fetchRotating(keys, (key) => fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: Math.min(12000, Math.max(512, Number(options.maxTokens) || 6000)),
      reasoning_effort: "medium",
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
      temperature: 0.2
    })
  }), options.keyRotationStart);
  if (!response) return { error: providerError({}, 0, "Groq", error) };
  return readProviderResponse(response, "Groq");
}

async function askGroqWithFallback(keys, messages, options = {}) {
  let lastResult = { error: "Groq did not return a response." };
  const models = options.model ? [options.model] : GROQ_MODELS;
  for (const model of models) {
    const result = await askGroq(keys, messages, model, options);
    if (result.answer) {
      if (options.json) {
        try { return { answer: JSON.stringify(extractJson(result.answer)), model }; }
        catch (error) { lastResult = { error: error.message }; continue; }
      }
      return { ...result, model };
    }
    lastResult = result;
  }
  return lastResult;
}

async function askGeminiImage(keys, messages, model, rotationStart = 0) {
  const text = messages.filter((message) => message.role !== "system").map((message) => contentText(message.content)).join("\n\n").slice(-10000);
  const { response, error } = await fetchRotating(keys, (key) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } })
  }), rotationStart);
  if (!response) return { error: providerError({}, 0, "Gemini image generation", error) };
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { error: providerError(payload, response.status, "Gemini image generation") };
  const parts = payload.candidates?.[0]?.content?.parts || [];
  const image = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const textAnswer = parts.map((part) => part.text || "").filter(Boolean).join("\n").trim();
  const data = image?.inlineData?.data || image?.inline_data?.data;
  const mime = image?.inlineData?.mimeType || image?.inline_data?.mime_type || "image/png";
  if (!data) return { error: textAnswer || "Gemini did not return an image." };
  return { answer: `${textAnswer ? `${textAnswer}\n\n` : ""}![Generated image](data:${mime};base64,${data})` };
}

async function askGemini(keys, messages, useSearch, preferredModel, options = {}) {
  const systemInstruction = messages.find((message) => message.role === "system")?.content || "";
  let lastError = "Gemini did not return a response.";
  const models = preferredModel ? options.strictModel ? [preferredModel] : [preferredModel, ...(GEMINI_MODELS[options.task] || []).filter((model) => model !== preferredModel)] : GEMINI_MODELS[options.task] || GEMINI_MODELS["assistant-default"];
  for (const model of models) {
    const { response, error } = await fetchRotating(keys, (key) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: typeof systemInstruction === "string" ? systemInstruction : "" }] },
        contents: geminiContents(messages),
        generationConfig: {
          maxOutputTokens: Math.min(16000, Math.max(512, Number(options.maxTokens) || (options.json ? 7000 : 4096))),
          temperature: 0.3,
          ...(options.json ? { responseMimeType: "application/json" } : {}),
          ...(options.responseSchema ? { responseJsonSchema: options.responseSchema } : {})
        },
        ...(useSearch ? { tools: [{ google_search: {} }] } : {})
      })
    }), options.keyRotationStart);
    if (!response) { lastError = providerError({}, 0, "Gemini", error); continue; }
    const payload = await response.json().catch(() => ({}));
    const answer = contentText(payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(""));
    if (response.ok && answer) return { answer };
    lastError = response.ok ? "Gemini returned an empty response." : providerError(payload, response.status, "Gemini");
  }
  return { error: lastError };
}

export default async function assistant(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Method not allowed." });
  }
  try {
    const body = requestBody(req);
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) return respond(res, 413, { error: "Your message or attachment is too large. Try a smaller file." });
    const normalizedMessages = normalizeMessages(body.messages);
    if (!normalizedMessages) return respond(res, 400, { error: "That assistant request or image attachment could not be read. Please try again." });
    const messages = enforceSystemPrompt(normalizedMessages);

    const requestKeys = (value, fallback) => {
      const supplied = Array.isArray(value) ? value : [];
      const keys = supplied.map((item) => String(item || "").trim()).filter((item) => item.length >= 10 && item.length <= 512).slice(0, 20);
      return keys.length ? keys : (fallback ? [fallback] : []);
    };
    const groqKeys = requestKeys(body.groqKeys, process.env.GROQ_API_KEY?.trim());
    const geminiKeys = requestKeys(body.geminiKeys, process.env.GEMINI_API_KEY?.trim());
    if (!groqKeys.length && !geminiKeys.length) return respond(res, 503, { error: "Add a Groq or Gemini API key in Settings to use the assistant." });

    const task = ["assistant", "planner", "recall", "visual"].includes(body.task) ? body.task : "assistant";
    const requestedModel = String(body.modelOverride || "auto");
    const exactGroqModel = GROQ_MODELS.includes(requestedModel) ? requestedModel : "";
    const exactGeminiImageModel = GEMINI_IMAGE_MODELS.has(requestedModel) ? requestedModel : "";
    const exactGeminiChatModel = GEMINI_CHAT_MODELS.has(requestedModel) ? requestedModel : "";
    const override = exactGroqModel ? "groq" : exactGeminiImageModel || exactGeminiChatModel ? "gemini" : ({ "gemini-flash": "gemini", "gemini-pro": "gemini", "groq-gpt-oss": "groq", "groq-llama": "groq" })[requestedModel] || "auto";
    if (exactGeminiImageModel) {
      if (!geminiKeys.length) return respond(res, 503, { error: "Add a Gemini API key in Settings to generate images." });
      const result = await askGeminiImage(geminiKeys, messages, exactGeminiImageModel, body.keyRotationStart);
      return result.answer ? respond(res, 200, { answer: result.answer, provider: `Gemini · ${exactGeminiImageModel}` }) : respond(res, 502, { error: result.error || "Gemini image generation failed." });
    }
    const hasImages = messages.some((message) => (Array.isArray(message.content) ? message.content : [message.content]).some((part) => part?.type === "image_url"));
    const preference = hasImages ? ["gemini", "groq"] : ["groq", "gemini"];
    const order = override === "auto" ? preference : [override, ...preference.filter((provider) => provider !== override)];
    const providerKeys = { groq: groqKeys, gemini: geminiKeys };
    const providerOptions = { task, json: body.json === true, responseSchema: body.responseSchema, maxTokens: body.maxTokens, model: exactGroqModel || undefined, keyRotationStart: body.keyRotationStart, strictModel: Boolean(exactGeminiChatModel) };
    const errors = [];
    for (const provider of order) {
      const keys = providerKeys[provider];
      if (!keys.length) continue;
      if (provider === "groq" && hasImages) {
        errors.push("Groq cannot process image attachments; configure a Gemini key for vision questions.");
        continue;
      }
      try {
        let result;
        if (provider === "groq") result = await askGroqWithFallback(keys, messages, providerOptions);
        else if (provider === "gemini") {
          const preferred = exactGeminiChatModel || (override === "gemini-pro" ? "gemini-3.8-flash" : undefined);
          result = await askGemini(keys, messages, body.googleSearch === true, preferred, providerOptions);
        }

        if (result.answer) {
          if (providerOptions.json) {
            try { result.answer = JSON.stringify(extractJson(result.answer)); }
            catch (error) { result = { error: error.message }; }
          }
          if (result.answer) return respond(res, 200, { answer: result.answer, provider: provider === "gemini" ? "Gemini" : `Groq · ${result.model || "GPT-OSS 120B"}` });
        }
        errors.push(result.error || `${provider} did not return a usable response.`);
        console.warn(`[assistant] ${provider} failed: ${errors[errors.length - 1]}`);
      } catch (error) {
        const message = `${provider} request failed: ${String(error?.message || "unknown error").slice(0, 180)}`;
        errors.push(message);
        console.error(`[assistant] ${message}`);
      }
    }
    return respond(res, 502, { error: errors.length ? `The assistant providers could not complete this request. ${[...new Set(errors)].join(" ")}` : "The assistant is temporarily unavailable. Please try again." });
  } catch (error) {
    console.error("[assistant] request failed:", error?.message || error);
    return respond(res, 500, { error: "The assistant request failed. Please try again." });
  }
}
