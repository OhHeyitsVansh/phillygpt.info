// /functions/api/chat.js

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    // Parse request JSON safely
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    // Accept either:
    // 1) { message: "hi" }   (your original frontend)
    // 2) { messages: [{role, content}, ...] } (recommended, keeps context)
    const rawMessage = typeof body?.message === "string" ? body.message : "";
    const rawMessages = Array.isArray(body?.messages) ? body.messages : null;

    // System instructions for the assistant (Responses API supports instructions)
    // Note: keep it short and strict to reduce hallucinations.
    const instructions =
      "You are PhillyGPT, a friendly Philadelphia tour guide. " +
      "Write clean plain text (no markdown). " +
      "If listing items, use 1) 2) 3). " +
      "Do not invent business hours, addresses, prices, or events. " +
      "Be neighborhood-aware and realistic with travel time. " +
      "If key details are missing (time window, starting point, vibe, budget), ask 1 short follow-up question.";

    // Choose model (gpt-5 family is valid; you can set env.OPENAI_MODEL to gpt-5.2 / gpt-5-mini, etc.) :contentReference[oaicite:1]{index=1}
    const model = (env.OPENAI_MODEL || "gpt-5").trim();

    // Build "input" for Responses API
    // If messages array provided, we use it (role/content). Otherwise, fall back to single message.
    let input;

    if (rawMessages && rawMessages.length) {
      input = rawMessages
        .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: String(m.content) }))
        .slice(-24); // keep last N turns so you don't blow context
    } else {
      const userText = String(rawMessage || "").trim();
      if (!userText) {
        return json(
          { text: "Tell me your time window, your vibe (food/history/art/nightlife), and where you’re starting from." },
          200
        );
      }
      input = [{ role: "user", content: userText }];
    }

    const payload = {
      model,
      instructions,        // preferred for system behavior :contentReference[oaicite:2]{index=2}
      input,               // can be string or array of role/content :contentReference[oaicite:3]{index=3}
      max_output_tokens: 600
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const dataText = await resp.text(); // read once
    let data;
    try {
      data = JSON.parse(dataText);
    } catch {
      return json({ error: `OpenAI returned non-JSON: ${dataText.slice(0, 300)}` }, 502);
    }

    if (!resp.ok) {
      return json(
        { error: `OpenAI error: ${resp.status}`, details: data?.error || dataText?.slice(0, 500) },
        500
      );
    }

    const text = extractOutputText(data);
    return json({ text: clean(text) }, 200);
  } catch (e) {
    return json({ error: "Server error", details: String(e?.message || e) }, 500);
  }
}

// --- helpers ---

function extractOutputText(data) {
  // Some responses include output_text directly
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  // Otherwise traverse output messages
  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item?.content)) {
      const chunk = item.content.find(
        (c) => (c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string"
      );
      if (chunk?.text) return chunk.text;
    }
  }

  return "Sorry — I couldn’t generate a response.";
}

function clean(text) {
  let t = String(text ?? "");
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