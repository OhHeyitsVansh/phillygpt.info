// /functions/api/chat.js
export async function onRequestPost({ request, env }) {
  try {
    const { message } = await request.json();

    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const userText = String(message || "").trim();
    if (!userText) return json({ text: "Tell me what you want to do in Philly and where you’re starting." }, 200);

    // Default to GPT-5 (model string per OpenAI docs). :contentReference[oaicite:0]{index=0}
    const model = (env.OPENAI_MODEL || "gpt-5").trim();

    const system =
      "You are Philly GPT, a friendly, practical Philadelphia tour guide. " +
      "Write clean plain text only (no markdown, no bullets with '-' or '*', no headings). " +
      "If listing items, use 1) 2) 3). Keep it concise, specific, and neighborhood-aware. " +
      "Prefer realistic plans (walking + transit), include approximate timing, and give 1–2 food picks near the route. " +
      "If missing details, ask one short follow-up question.";

    const payload = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userText }
      ],
      max_output_tokens: 600
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      return json({ error: `OpenAI error: ${resp.status} ${err}`.trim() }, 500);
    }

    const data = await resp.json();
    const text = extractOutputText(data);
    return json({ text: clean(text) }, 200);
  } catch (e) {
    return json({ error: "Server error", details: String(e?.message || e) }, 500);
  }
}

function extractOutputText(data) {
  // Responses API commonly provides output_text helper in SDKs; in raw JSON we extract from output items.
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item?.content)) {
      const chunk = item.content.find((c) => c?.type === "output_text" && typeof c?.text === "string");
      if (chunk?.text) return chunk.text;
    }
  }
  return "Sorry — I couldn’t generate a response.";
}

function clean(text) {
  let t = String(text ?? "");

  // Hard-strip markdown-ish characters to guarantee clean output
  t = t.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[\w-]*\n?/g, "").replace(/```/g, "").trim()
  );
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/\*\*(.*?)\*\*/g, "$1");
  t = t.replace(/\*(.*?)\*/g, "$1");
  t = t.replace(/^[-*]\s+/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
