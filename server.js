const MAX_BODY_BYTES = 9 * 1024 * 1024;
const MAX_MESSAGES = 20;
const MAX_TEXT_LENGTH = 10_000;

function normalizeMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MESSAGES) return null;
  const messages = [];
  for (const entry of value) {
    if (!entry || !["system", "user", "assistant"].includes(entry.role)) return null;
    const source = Array.isArray(entry.content) ? entry.content : [entry.content];
    if (source.length > 5) return null;
    const content = [];
    for (const part of source) {
      if (typeof part === "string") {
        content.push(part.slice(0, MAX_TEXT_LENGTH));
      } else if (part?.type === "text" && typeof part.text === "string") {
        content.push({ type: "text", text: part.text.slice(0, MAX_TEXT_LENGTH) });
      } else if (part?.type === "image_url" && typeof part.image_url?.url === "string") {
        const url = part.image_url.url;
        if (url.length > 2_500_000 || !/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(url)) return null;
        content.push({ type: "image_url", image_url: { url } });
      } else {
        return null;
      }
    }
    messages.push({ role: entry.role, content: Array.isArray(entry.content) ? content : content[0] ?? "" });
  }
  return messages;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/assistant") return new Response("Not found", { status: 404 });
    if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });

    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        return Response.json({ error: "Your message or attachment is too large. Try a smaller file." }, { status: 413 });
      }
      let body;
      try { body = JSON.parse(rawBody || "{}"); }
      catch { return Response.json({ error: "That assistant request could not be read. Please try again." }, { status: 400 }); }
      const messages = normalizeMessages(body.messages);
      if (!messages) return Response.json({ error: "That assistant request or image attachment could not be read. Please try again." }, { status: 400 });

      const completion = await env.AI.chat({
        messages,
        ...(body.json === true ? { json: true } : {})
      });
      const answer = typeof completion?.content === "string" ? completion.content.trim() : "";
      if (!answer) return Response.json({ error: "The assistant returned an empty reply. Please try again." }, { status: 502 });
      return Response.json({ answer, provider: "Apex Assistant" });
    } catch (error) {
      const message = String(error?.message || "");
      console.error("[assistant] request failed:", message.slice(0, 240));
      const status = /rate.?limit|too many requests|quota/i.test(message) ? 429 : 502;
      return Response.json({ error: status === 429
        ? "The assistant is busy right now. Please wait a moment and try again."
        : "The assistant could not complete that request. Please try again." }, { status });
    }
  }
};
