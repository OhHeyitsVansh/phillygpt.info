// /functions/api/chat.js
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages Secrets (Production)." }, 500);
  }

  const model = env.OPENAI_MODEL || "gpt-5";

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const recent = messages
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-16);

  const system = `
You are Philly GPT, a practical civic helper for Philadelphia.

Mandatory output rules:
- Plain text only.
- No markdown and no formatting symbols: do not use #, *, backticks, or bullet characters.
- No headings. No hashtags.
- Keep it clean: short paragraphs.
- If you list steps, use simple numbering like "1) ... 2) ...".
- Ask at most one short follow-up question only if needed (neighborhood/cross street).

Safety:
- If it sounds like an emergency, tell them to call 911.
- If something is time-sensitive or may change, point them to official sources to verify.
`.trim();

  const input = [
    { role: "system", content: system },
    ...recent.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: 520,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg =
        data?.error?.message ||
        "OpenAI request failed. Check your API key, model name, and billing status.";
      return json({ error: msg }, 500);
    }

    const text = extractText(data);
    const cleaned = stripFormatting(text);

    return json({ reply: cleaned }, 200);
  } catch {
    return json({ error: "Server error contacting OpenAI." }, 500);
  }
}

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") {
            return c.text;
          }
        }
      }
    }
  }
  return "";
}

function stripFormatting(text) {
  let t = String(text || "");

  t = t.replace(/`+/g, "");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/\*\*/g, "").replace(/\*/g, "");
  t = t.replace(/__/g, "").replace(/_/g, "");
  t = t.replace(/^\s{0,3}>\s?/gm, "");
  t = t.replace(/^\s*[-•]\s+/gm, "");
  t = t.replace(/[•#]/g, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function json(obj, status_toggle = 200) {
  return new Response(JSON.stringify(obj), {
    status: status_toggle,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
