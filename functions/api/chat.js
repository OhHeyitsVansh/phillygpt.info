export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY in Cloudflare Pages environment variables (Production/Preview)." }, 500);
    }

    const body = await request.json().catch(() => null);
    const message = body?.message?.toString?.().trim?.();

    if (!message) {
      return json({ error: "No message provided." }, 400);
    }

    // System instruction: force clean plain-text, no markdown (#, *, etc.)
    const systemText = [
      "You are Philly GPT, a civic helper for Philadelphia.",
      "Be friendly and practical, like a helpful local who knows how city services work.",
      "Output rules (must follow):",
      "- Return plain text only (no markdown).",
      "- Do NOT use #, *, backticks, bullets like '-' or '•'.",
      "- If you provide steps, format as 'Step 1:', 'Step 2:' etc.",
      "- Keep it concise, clear, and actionable.",
      "- Encourage users to share neighborhood or nearest cross-streets if relevant.",
      "- If it sounds like an emergency, instruct to call 911.",
    ].join("\n");

    const payload = {
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemText }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: message }]
        }
      ],
      temperature: 0.4
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.error?.message || "OpenAI request failed.";
      return json({ error: msg }, 500);
    }

    const reply = extractText(data) || "Sorry — I couldn’t generate a response.";

    // Final safety cleanup to remove markdown-ish symbols anyway
    const cleaned = stripMarkdownLike(reply);

    return json({ reply: cleaned }, 200);
  } catch (err) {
    return json({ error: "Server error." }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

/**
 * Responses API text extraction:
 * We walk the output array and collect any output_text chunks.
 */
function extractText(resp) {
  const out = resp?.output;
  if (!Array.isArray(out)) return "";

  let text = "";
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (c?.type === "output_text" && typeof c.text === "string") {
        text += c.text;
      }
    }
  }
  return text.trim();
}

function stripMarkdownLike(text) {
  let t = String(text ?? "");

  // Remove headings / emphasis / code markers / bullets
  t = t.replace(/`+/g, "");
  t = t.replace(/\*\*/g, "");
  t = t.replace(/\*/g, "");
  t = t.replace(/__/g, "");
  t = t.replace(/_/g, "");

  // Remove leading markdown patterns per line
  t = t
    .split("\n")
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/g, "")
      .replace(/^\s{0,3}>\s+/g, "")
      .replace(/^\s{0,3}[-•]\s+/g, "")
    )
    .join("\n");

  // Tidy newlines
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}
