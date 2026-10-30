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

async function transcription(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  try {
    const body = bodyOf(req);
    if (bodySize(body) > 22 * 1024 * 1024) return json(res, 413, { error: "Audio file is too large." });
    const audio = String(body.audio || "");
    const match = audio.match(/^data:([^;,]+)(?:;[^;,=]+(?:=[^;,]*)?)*;base64,([\s\S]+)$/);
    if (!match || match[2].length > 21_000_000) return json(res, 400, { error: "Audio data is invalid." });
    const mimeType = String(body.mimeType || match[1] || "audio/webm").replace(/[^\w+./-]/g, "");
    const groqKeys = (Array.isArray(body.groqKeys) ? body.groqKeys : []).map((key) => String(key || "").trim()).filter((key) => key.length >= 10 && key.length <= 512).slice(0, 20);
    if (!groqKeys.length && process.env.GROQ_API_KEY?.trim()) groqKeys.push(process.env.GROQ_API_KEY.trim());
    const geminiKeys = (Array.isArray(body.geminiKeys) ? body.geminiKeys : []).map((key) => String(key || "").trim()).filter((key) => key.length >= 10 && key.length <= 512).slice(0, 20);
    if (!geminiKeys.length && process.env.GEMINI_API_KEY?.trim()) geminiKeys.push(process.env.GEMINI_API_KEY.trim());
    if (!groqKeys.length && !geminiKeys.length) return json(res, 503, { error: "Voice transcription needs a Groq or Gemini API key. Add one in Settings." });
    const rotationStart = Number(body.keyRotationStart), now = Date.now();
    if (groqKeys.length && body.model !== "gemini-3.5-transcribe") {
      const activeIndex = rotationStart > 0 && rotationStart <= now ? Math.floor((now - rotationStart) / 30000) % groqKeys.length : Math.floor(now / 30000) % groqKeys.length;
      const rotated = groqKeys.map((_, offset) => groqKeys[(activeIndex + offset) % groqKeys.length]);
      const mime = match[1] || mimeType;
      const extension = ({ "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm" })[mime] || "webm";
      for (const key of rotated) {
        const form = new FormData();
        form.append("file", new Blob([Buffer.from(match[2], "base64")], { type: mime }), `recording.${extension}`);
        form.append("model", ["whisper-large-v3", "whisper-large-v3-turbo"].includes(body.model) ? body.model : "whisper-large-v3-turbo");
        form.append("response_format", "json");
        const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && typeof payload.text === "string" && payload.text.trim()) return json(res, 200, { transcript: payload.text.trim() });
        if (response.status >= 400 && response.status < 500 && ![401, 403, 408, 425, 429].includes(response.status)) break;
      }
    }
    if (!geminiKeys.length) return json(res, 502, { error: "Groq transcription could not complete this audio. Check the key or audio file and try again." });
    const activeIndex = rotationStart > 0 && rotationStart <= now ? Math.floor((now - rotationStart) / 30000) % geminiKeys.length : Math.floor(now / 30000) % geminiKeys.length;
    const rotated = geminiKeys.map((_, offset) => geminiKeys[(activeIndex + offset) % geminiKeys.length]);
    let lastError = "Voice transcription is unavailable.";
    for (const key of rotated) {
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
      lastError = payload.error?.message || `Voice transcription failed (${response.status}).`;
      if (response.status >= 400 && response.status < 500 && ![401, 403, 408, 425, 429].includes(response.status)) break;
    }
    return json(res, 502, { error: lastError });
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
    const keysFrom = (value, fallback) => (Array.isArray(value) ? value : []).map((key) => String(key || "").trim()).filter((key) => key.length >= 10 && key.length <= 512).slice(0, 20).length
      ? value.map((key) => String(key || "").trim()).filter((key) => key.length >= 10 && key.length <= 512).slice(0, 20)
      : fallback ? [fallback] : [];
    const groqKeys = keysFrom(body.groqKeys, process.env.GROQ_API_KEY?.trim());
    const geminiKeys = keysFrom(body.geminiKeys, process.env.GEMINI_API_KEY?.trim());
    const requestedSpeechModel = String(body.model || "");
    const useGemini = requestedSpeechModel.startsWith("gemini-") || (!groqKeys.length && geminiKeys.length);
    const speechModel = useGemini ? "gemini-3.8-flash-tts" : "canopylabs/orpheus-v1-english";
    const keys = useGemini ? geminiKeys : groqKeys;
    if (!keys.length) return json(res, 503, { error: `Read aloud needs a ${speechModel.startsWith("canopylabs/") ? "Groq" : "Gemini"} API key. Add one in Settings.` });
    const rotationStart = Number(body.keyRotationStart);
    const now = Date.now();
    const start = rotationStart > 0 && rotationStart <= now ? Math.floor((now - rotationStart) / 30000) % keys.length : Math.floor(now / 30000) % keys.length;
    const rotated = keys.map((_, offset) => keys[(start + offset) % keys.length]);
    let lastStatus = 0, lastMessage = "The speech service returned no audio.";
    for (const key of rotated) {
      try {
        if (speechModel.startsWith("canopylabs/")) {
          const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
            method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: speechModel, input: text, voice: "hannah", response_format: "wav" })
          });
          if (response.ok) return json(res, 200, { audioBase64: Buffer.from(await response.arrayBuffer()).toString("base64"), mimeType: "audio/wav" });
          lastStatus = response.status;
          const problem = await response.json().catch(() => ({}));
          lastMessage = problem.error?.message || `Groq speech request failed (${response.status}).`;
        } else {
          const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
            method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({ model: speechModel, input: [{ type: "user_input", content: [{ type: "text", text }] }], response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: "Kore" }] } })
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            const audio = data.output_audio || (data.steps || []).flatMap((step) => step.content || []).find((part) => part.type === "audio");
            if (audio?.data) return json(res, 200, { audioBase64: audio.data, mimeType: audio.mime_type || audio.mimeType || "audio/wav" });
          }
          lastStatus = response.status;
          lastMessage = data.error?.message || "Gemini returned no audio.";
        }
      } catch (error) { lastMessage = String(error?.message || "Speech provider could not be reached."); }
      if (lastStatus >= 400 && lastStatus < 500 && ![401, 403, 408, 425, 429].includes(lastStatus)) break;
    }
    return json(res, 502, { error: lastMessage });
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
