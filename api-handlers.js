const MAX_KEYS_PER_PROVIDER = 8;

function json(res, status, payload, headers = {}) {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  return res.status(status).json(payload);
}

function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return {};
}

function bodySize(body) {
  try { return Buffer.byteLength(JSON.stringify(body)); } catch { return Infinity; }
}

function normalizeKeys(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).flatMap((entry) => String(typeof entry === "string" ? entry : entry?.key || "").split(/[\n,]+/)).map((key) => key.trim()).filter(Boolean))].slice(0, MAX_KEYS_PER_PROVIDER);
}

function providerKeys(userKeys, environmentKey) {
  const saved = normalizeKeys(userKeys);
  return saved.length ? saved : normalizeKeys(environmentKey);
}

function rotationOrder(keys) {
  const start = Math.floor(Date.now() / 30000) % keys.length;
  return keys.map((_, offset) => keys[(start + offset) % keys.length]);
}

async function transcription(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  try {
    const body = bodyOf(req);
    if (bodySize(body) > 22 * 1024 * 1024) return json(res, 413, { error: "Audio file is too large." });
    const audio = String(body.audio || "");
    const match = audio.match(/^data:([^;,]+);base64,([\s\S]+)$/);
    if (!match || match[2].length > 21_000_000) return json(res, 400, { error: "Audio data is invalid." });
    const mimeType = String(body.mimeType || match[1] || "audio/webm").replace(/[^\w+./-]/g, "");
    const keys = rotationOrder(providerKeys(body.geminiApiKeys, process.env.GEMINI_API_KEY));
    if (!keys.length) return json(res, 503, { error: "Voice transcription is unavailable. Configure GEMINI_API_KEY." });
    for (const key of keys) {
      try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ inlineData: { mimeType: match[1] || mimeType, data: match[2] } }] }],
            generationConfig: { audioTranscriptionConfig: { diarization: true, wordTimestamp: true } }
          })
        });
        const payload = await response.json().catch(() => ({}));
        const transcript = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || part.audioTranscription?.text || "").join(" ").trim();
        if (response.ok && transcript) return json(res, 200, { transcript });
      } catch { /* Try the next configured key. */ }
    }
    return json(res, 502, { error: "Voice transcription is unavailable." });
  } catch {
    return json(res, 500, { error: "Voice transcription request failed." });
  }
}

async function speech(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  try {
    const body = bodyOf(req);
    const text = String(body.text || "").trim().slice(0, 8000);
    if (!text) return json(res, 400, { error: "Text is required." });
    const keys = rotationOrder(providerKeys(body.geminiApiKeys, process.env.GEMINI_API_KEY));
    if (!keys.length) return json(res, 503, { error: "Read aloud is unavailable. Configure GEMINI_API_KEY." });
    let lastError = "Gemini returned no audio.";
    for (const key of keys) {
      try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            model: "gemini-3.8-flash-lite-tts",
            input: [{ type: "user_input", content: [{ type: "text", text }] }],
            response_format: { type: "audio" },
            generation_config: { speech_config: [{ voice: "Aoede" }] }
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastError = data.error?.message || `Gemini speech request failed (${response.status}).`;
          continue;
        }
        const audio = data.output_audio
          || data.steps?.flatMap((step) => step.content || []).find((part) => part.type === "audio")
          || data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
        const audioBase64 = audio?.data || audio?.inlineData?.data;
        if (typeof audioBase64 === "string" && audioBase64) {
          return json(res, 200, { audioBase64, mimeType: audio.mime_type || audio.mimeType || audio.inlineData?.mimeType || "audio/wav" });
        }
        lastError = "Invalid audio response from Gemini.";
      } catch (error) { lastError = error?.message || lastError; }
    }
    return json(res, 502, { error: lastError });
  } catch {
    return json(res, 500, { error: "Gemini speech request failed." });
  }
}

function cleanMetadata(value) {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim().slice(0, 180);
}

async function imageSearch(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
  const query = String(req.query?.q || "").trim().slice(0, 180);
  if (!query) return json(res, 400, { error: "A search query is required." });
  try {
    const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
    for (const [key, value] of Object.entries({ action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "12", prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "1200", format: "json", formatversion: "2" })) endpoint.searchParams.set(key, value);
    const response = await fetch(endpoint, { headers: { Accept: "application/json", "User-Agent": "ApexStudyAssistant/1.0 (educational image search)" } });
    if (!response.ok) return json(res, 502, { error: "Image search is unavailable." });
    const payload = await response.json();
    const pages = Array.isArray(payload.query?.pages) ? payload.query.pages : [];
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
        return [{
          url: url.href,
          title: String(page.title || "Wikimedia Commons image").replace(/^File:/, "").replace(/_/g, " "),
          pageUrl: image.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/^File:/, "").replace(/ /g, "_"))}`,
          license: cleanMetadata(image.extmetadata?.LicenseShortName?.value)
        }];
      } catch { return []; }
    }).slice(0, 8);
    if (!images.length) return json(res, 404, { error: "No suitable illustration was found." });
    return json(res, 200, { images }, { "Cache-Control": "public, max-age=3600" });
  } catch {
    return json(res, 502, { error: "Image search is unavailable." });
  }
}

export { transcription, speech, imageSearch };
