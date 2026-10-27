// Vercel serves the production APIs from /api/*.js. This lightweight route
// keeps the preview's existing Wikimedia image search endpoint available.
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers });
}

function keyList(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).flatMap((entry) => String(entry?.key ?? entry ?? "").split(/[\n,]+/)).map((key) => key.trim()).filter(Boolean))].slice(0, 8);
}

function textOf(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.map((part) => typeof part === "string" ? part : String(part?.text || "")).join("").trim();
}

async function assistant(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid assistant request." }, 400); }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return json({ error: "A conversation is required." }, 400);
  const groqKeys = keyList(body.groqApiKeys);
  const geminiKeys = keyList(body.geminiApiKeys);
  if (!groqKeys.length && !geminiKeys.length) return json({ error: "Add a Groq or Gemini API key in Settings." }, 503);
  const hasImages = messages.some((message) => (Array.isArray(message.content) ? message.content : [message.content]).some((part) => part?.type === "image_url"));
  const providers = body.task === "recall" || body.task === "planner" || body.task === "visual" || hasImages || body.googleSearch || body.json
    ? [["gemini", geminiKeys], ["groq", groqKeys]]
    : [["groq", groqKeys], ["gemini", geminiKeys]];
  const system = messages.filter((message) => message.role === "system").map((message) => textOf(message.content)).filter(Boolean).join("\n\n");
  const chatMessages = messages.filter((message) => message.role !== "system");
  const errors = [];
  for (const [provider, keys] of providers) {
    if (!keys.length || (provider === "groq" && hasImages)) continue;
    for (const key of keys) {
      try {
        let response;
        let answer = "";
        if (provider === "groq") {
          response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "openai/gpt-oss-120b",
              messages: [...(system ? [{ role: "system", content: system }] : []), ...chatMessages.map((message) => ({ role: message.role, content: textOf(message.content) }))],
              max_completion_tokens: Math.min(12000, Math.max(512, Number(body.maxTokens) || 6000)),
              temperature: 0.2,
              ...(body.json ? { response_format: { type: "json_object" } } : {})
            })
          });
          const payload = await response.json().catch(() => ({}));
          answer = textOf(payload.choices?.[0]?.message?.content);
          if (!response.ok) throw new Error(payload.error?.message || `Groq request failed (${response.status}).`);
        } else {
          const model = "gemini-3.8-flash";
          const contents = chatMessages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: (Array.isArray(message.content) ? message.content : [message.content]).map((part) => {
              if (part?.type === "image_url") {
                const match = String(part.image_url?.url || "").match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i);
                if (match) return { inlineData: { mimeType: match[1], data: match[2].replace(/\s/g, "") } };
              }
              return { text: typeof part === "string" ? part : String(part?.text || "") };
            })
          }));
          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
              contents,
              generationConfig: { maxOutputTokens: Math.min(16000, Math.max(512, Number(body.maxTokens) || 4096)), temperature: 0.3, ...(body.json ? { responseMimeType: "application/json" } : {}) },
              ...(body.googleSearch ? { tools: [{ google_search: {} }] } : {})
            })
          });
          const payload = await response.json().catch(() => ({}));
          answer = textOf(payload.candidates?.[0]?.content?.parts?.map((part) => part.text || ""));
          if (!response.ok) throw new Error(payload.error?.message || `Gemini request failed (${response.status}).`);
        }
        if (answer) return json({ answer, provider: provider === "gemini" ? "Gemini" : "Groq · openai/gpt-oss-120b" });
        throw new Error(`${provider} returned an empty response.`);
      } catch (error) {
        errors.push(String(error?.message || `${provider} request failed.`).slice(0, 200));
      }
    }
  }
  return json({ error: `The assistant providers could not complete this request. ${errors.join(" ") || "No provider key is configured."}` }, 502);
}

async function imageSearch(request) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
  const query = String(new URL(request.url).searchParams.get("q") || "").trim().slice(0, 180);
  if (!query) return json({ error: "A search query is required." }, 400);
  try {
    const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
    for (const [key, value] of Object.entries({ action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "12", prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "1200", format: "json", formatversion: "2" })) endpoint.searchParams.set(key, value);
    const response = await fetch(endpoint, { headers: { Accept: "application/json", "User-Agent": "ApexStudyAssistant/1.0 (educational image search)" } });
    if (!response.ok) return json({ error: "Image search is unavailable." }, 502);
    const data = await response.json();
    const pages = Array.isArray(data.query?.pages) ? data.query.pages : [];
    const images = pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).flatMap((page) => {
      const image = page.imageinfo?.[0];
      if (!image) return [];
      const candidateUrl = String(image.thumburl || image.url || "");
      const mime = String(image.thumbmime || image.mime || "");
      const supportedImage = /^image\/(?:jpeg|png|webp|gif|svg\+xml)$/i.test(mime)
        || /\.(?:jpe?g|png|webp|gif|svg)(?:[?#]|$)/i.test(candidateUrl);
      if (!supportedImage) return [];
      try {
        const url = new URL(candidateUrl);
        if (url.protocol !== "https:" || !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname.toLowerCase())) return [];
        return [{ url: url.href, title: String(page.title || "Wikimedia Commons image").replace(/^File:/, "").replace(/_/g, " "), pageUrl: image.descriptionurl || "https://commons.wikimedia.org/", license: String(image.extmetadata?.LicenseShortName?.value || "").replace(/<[^>]*>/g, "").slice(0, 180) }];
      } catch { return []; }
    }).slice(0, 8);
    if (!images.length) return json({ error: "No suitable illustration was found." }, 404);
    return json({ images }, 200, { "Cache-Control": "public, max-age=3600" });
  } catch {
    return json({ error: "Image search is unavailable." }, 502);
  }
}

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/api/assistant") return assistant(request);
    if (path === "/api/image-search") return imageSearch(request);
    return json({ error: "Not found." }, 404);
  }
};
