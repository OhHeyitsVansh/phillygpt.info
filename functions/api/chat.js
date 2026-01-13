// /functions/api/chat.js
export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages Secrets." }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!messages.length) {
      return json({ error: "No messages provided." }, 400);
    }

    // Optional Cloudflare Text Variable: OPENAI_MODEL = gpt-5
    const model = env.OPENAI_MODEL || "gpt-5";

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: messages,
        max_output_tokens: 520,
        temperature: 0.5,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg = data?.error?.message || `OpenAI request failed (${resp.status}).`;
      return json({ error: msg }, 500);
    }

    const reply = (typeof data?.output_text === "string" && data.output_text.trim())
      ? data.output_text.trim()
      : extractFromOutput(data);

    return json({ reply: reply || "No response returned." }, 200);
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
}

function extractFromOutput(data) {
  const out = data?.output;
  if (!Array.isArray(out)) return "";
  let text = "";
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") {
        text += c.text;
      }
    }
  }
  return text.trim();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
