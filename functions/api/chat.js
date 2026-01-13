// /functions/api/chat.js
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages secrets." }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const message = String(body?.message || "").trim();
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return json({ error: "Missing message." }, 400);
    }

    const model = env.OPENAI_MODEL || "gpt-5.2";

    const instructions =
      "You are Philly GPT, a friendly local tour guide for Philadelphia.\n" +
      "Goal: help visitors plan what to do (food, neighborhoods, museums, walking routes, timing, and transit tips).\n" +
      "Style rules:\n" +
      "- Output PLAIN TEXT ONLY. No markdown. Do not use #, *, backticks, or formatting.\n" +
      "- Keep it clean and easy to skim.\n" +
      "- Prefer short sections and simple bullets using the '•' character.\n" +
      "- Ask 1–2 quick questions only if needed; otherwise propose a plan.\n" +
      "- Be practical: include approximate timing, distances/areas, and a SEPTA/ride/walk suggestion.\n" +
      "- Avoid unsafe advice and do not request sensitive personal information.\n";

    // Build a small transcript for continuity (plain text)
    const trimmed = history.slice(-10).map((m) => {
      const role = m?.role === "assistant" ? "Assistant" : "User";
      const content = String(m?.content || "").replace(/\s+/g, " ").trim();
      return `${role}: ${content}`;
    });

    const input =
      (trimmed.length ? trimmed.join("\n") + "\n" : "") +
      `User: ${message}\nAssistant:`;

    const payload = {
      model,
      input,
      instructions,
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        "OpenAI request failed.";
      return json({ error: msg }, resp.status);
    }

    const reply = extractOutputText(data) || "Sorry — I couldn’t generate a response.";
    return json({ reply }, 200);
  } catch (e) {
    return json({ error: "Server error." }, 500);
  }
}

function extractOutputText(data) {
  // New Responses API commonly provides output_text
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  // Fallback: walk output array
  const out = data?.output;
  if (Array.isArray(out)) {
    let text = "";
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") {
            text += c.text;
          }
        }
      }
    }
    return text.trim();
  }

  return "";
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
