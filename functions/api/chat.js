export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages (Production)." }, 500);

    const body = await request.json().catch(() => ({}));
    const message = (body?.message || "").trim();
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message) return json({ error: "Missing message" }, 400);

    const system =
      "You are Philly GPT, a practical civic helper for Philadelphia. " +
      "Give step-by-step next actions and what info to gather. " +
      "Suggest official sources (City of Philadelphia, 311, SEPTA) when relevant. " +
      "Not affiliated with any government. If it’s an emergency, tell them to call 911.\n\n" +
      "IMPORTANT OUTPUT RULES:\n" +
      "- Output MUST be plain text only.\n" +
      "- Do NOT use Markdown (no #, *, -, bullets, bold, italics, code blocks).\n" +
      "- Do NOT use lists with symbols. If you need steps, write: 'Step 1:', 'Step 2:' etc.\n" +
      "- Keep formatting clean: short paragraphs, readable spacing.";

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
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        input,
        temperature: 0.4,
        max_output_tokens: 500,
      }),
    });

    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}

    if (!r.ok) {
      const err = data?.error?.message || `OpenAI error (${r.status})`;
      return json({ error: err }, 502);
    }

    const reply = extractText(data) || "No response text returned.";
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
