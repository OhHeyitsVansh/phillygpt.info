export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages Secrets (Production)." }, 500);

    const body = await request.json().catch(() => ({}));
    const message = (body?.message || "").trim();
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message) return json({ error: "Missing message" }, 400);

    const system =
      "You are Philly GPT, a practical civic helper for Philadelphia. " +
      "Give step-by-step next actions and what info to gather. " +
      "Suggest official sources (City of Philadelphia, 311, SEPTA) when relevant. " +
      "Not affiliated with any government. If it’s an emergency, tell them to call 911.\n\n" +
      "OUTPUT RULES:\n" +
      "Return plain text only. No Markdown. No bullets with symbols. No headings. " +
      "If you need steps, use: Step 1:, Step 2:, etc.";

    const trimmed = history
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12);

    const input = [
      { role: "system", content: system },
      ...trimmed,
      { role: "user", content: message },
    ];

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        input,
        temperature: 0.4,
        max_output_tokens: 600,
      }),
    });

    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}

    if (!r.ok) {
      const err = data?.error?.message || `OpenAI error (${r.status})`;
      return json({ error: err }, 502);
    }

    let reply = extractText(data) || "No response text returned.";
    reply = stripMarkdown(reply);

    return json({ reply }, 200);
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}

function extractText(resp) {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();
  const out = resp?.output;
  if (!Array.isArray(out)) return "";
  let t = "";
  for (const item of out) {
    const c = item?.content;
    if (!Array.isArray(c)) continue;
    for (const part of c) {
      if (part?.type === "output_text" && typeof part?.text === "string") t += part.text;
    }
  }
  return t.trim();
}

// Strong server-side sanitizer (removes #, **, bullets, etc.)
function stripMarkdown(text) {
  let t = String(text || "");

  // [text](url) -> text (url)
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)");

  // Headings like ### Title
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Blockquotes
  t = t.replace(/^\s*>\s?/gm, "");

  // Bullets: -, *, +, •
  t = t.replace(/^\s*([-*+]|•)\s+/gm, "");

  // Bold/italics/code markers
  t = t.replace(/\*\*(.*?)\*\*/g, "$1");
  t = t.replace(/\*(.*?)\*/g, "$1");
  t = t.replace(/_{1,3}([^_]+)_{1,3}/g, "$1");
  t = t.replace(/`{1,3}([^`]+)`{1,3}/g, "$1");

  // Horizontal rules
  t = t.replace(/^\s*-{3,}\s*$/gm, "");

  // Cleanup extra blank lines
  t = t.replace(/\r/g, "");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
