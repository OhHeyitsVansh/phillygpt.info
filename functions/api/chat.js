// /functions/api/chat.js
export async function onRequestPost({ request, env }) {
  try {
    const { message } = await request.json().catch(() => ({}));

    if (!message || typeof message !== "string") {
      return json({ error: "Missing message." }, 400);
    }

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages Secrets." }, 500);
    }

    // Optional: set OPENAI_MODEL in Cloudflare (recommended). Default to gpt-5.
    const model = (env.OPENAI_MODEL || "gpt-5").trim();

    const system = [
      "You are Philly GPT, a practical, friendly Philadelphia tour guide.",
      "Give clean plain-text answers (no markdown, no bullets with *, #, or numbered lists).",
      "Keep it structured with short paragraphs and simple separators like '—' if needed.",
      "Ask 1–2 quick follow-up questions only when necessary (time, budget, starting point).",
      "Be realistic about travel time and neighborhood grouping.",
      "If asked about emergencies, direct them to call 911.",
    ].join(" ");

    const payload = {
      model,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: message.trim(),
        },
      ],
      max_output_tokens: 650,
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const err = data?.error?.message || "OpenAI API error.";
      return json({ error: err }, 500);
    }

    const reply = (data?.output_text || "").trim() || "No response.";
    return json({ reply }, 200);
  } catch (e) {
    return json({ error: "Server error." }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
