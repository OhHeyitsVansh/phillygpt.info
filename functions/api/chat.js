export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
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

Output rules (mandatory):
- Return plain text only.
- Do NOT use markdown or formatting symbols (no #, no *, no backticks, no bullet characters).
- No headings. No hashtags.
- Keep it clean with short paragraphs.
- If you list steps, use simple numbering like "1) ... 2) ...".
- Ask one short follow-up question only when needed (neighborhood/cross-street).

Safety:
- For emergencies direct to 911.
- For time-sensitive details, point users to official sources.
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
        max_output_tokens: 550,
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

  // Remove markdown-y bits to ensure clean output.
  t = t.replace(/`+/g, "");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/\*\*/g, "");
  t = t.replace(/\*/g, "");
  t = t.replace(/__/g, "");
  t = t.replace(/_/g, "");
  t = t.replace(/^\s{0,3}>\s?/gm, "");
  t = t.replace(/^\s*[-•]\s+/gm, "");

  // Also remove common "•" and stray "#"
  t = t.replace(/[•#]/g, "");

  // Trim and normalize spacing
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
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
