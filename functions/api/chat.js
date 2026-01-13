// /functions/api/chat.js
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages Secrets." }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    // Minimal validation
    if (!messages.length) {
      return json({ error: "No messages provided." }, 400);
    }

    // Use a strong model name as requested (if your account has access).
    // If this exact name isn't available on your account, switch to one you do have.
    const model = "gpt-5";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg =
        data?.error?.message ||
        `OpenAI request failed (${resp.status})`;
      return json({ error: msg }, 500);
    }

    const reply =
      data?.choices?.[0]?.message?.content?.toString?.() || "";

    return json({ reply }, 200);
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
