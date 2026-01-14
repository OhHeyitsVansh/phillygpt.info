// functions/api/chat.js

export async function onRequestOptions() {
  // Preflight (safe even if not needed)
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages env vars" }, 500);
    }

    // Parse JSON body
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    // Accept either:
    // 1) { message: "hello" }  (simple)
    // 2) { messages: [{ role, content }, ...] }  (recommended)
    const rawMessage = typeof body?.message === "string" ? body.message : "";
    const rawMessages = Array.isArray(body?.messages) ? body.messages : null;

    const model = (env.OPENAI_MODEL || "gpt-5").trim();

    const instructions =
      "You are PhillyGPT, a friendly Philadelphia tour guide. " +
      "Write clean plain text only (no markdown). " +
      "If you list items, use 1) 2) 3). " +
      "Do not invent business hours, addresses, prices, or events. " +
      "Be neighborhood-aware and realistic with travel time. " +
      "If key details are missing (time window, starting point, vibe, budget), ask ONE short follow-up question.";

    let input;

    if (rawMessages && rawMessages.length) {
      input = rawMessages
        .filter(
          (m) =>
            m &&
            typeof m.role === "string" &&
            typeof m.content === "string" &&
            (m.role === "user" || m.role === "assistant")
        )
        .map((m) => ({ role: m.role, content: String(m.content) }))
        .slice(-24);
    } else {
      const userText = String(rawMessage || "").trim();
      if (!userText) {
        return json(
          { text: "Tell me your time window, vibe, budget, and where you’re starting from (ex: City Hall)." },
          200
        );
      }
      input = [{ role: "user", content: userText }];
    }

    const payload = {
      model,
      instructions,
      input,
      max_output_tokens: 650
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // Read once
    const raw = await resp.text();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: "OpenAI returned non-JSON", details: raw.slice(0, 500) }, 502);
    }

    if (!resp.ok) {
      return json(
        {
          error: "OpenAI error",
          status: resp.status,
          details: data?.error || data || raw.slice(0, 500)
        },
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
  // Sometimes present directly
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  // Otherwise traverse output items
  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item?.content)) {
      // Response content is often [{type:"output_text", text:"..."}]
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

  // Hard-strip markdown-ish characters
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
