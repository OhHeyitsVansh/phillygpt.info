export const onRequestOptions = () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
};

export const onRequestPost = async (context) => {
  const { request, env } = context;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing OPENAI_API_KEY on server.",
          status: 500,
          details: "Set OPENAI_API_KEY as an environment variable in Cloudflare Pages."
        }),
        { status: 500, headers }
      );
    }

    const bodyText = await request.text();
    let payload;
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body.",
          status: 400,
          details: "Expected JSON with either { messages } or { message }."
        }),
        { status: 400, headers }
      );
    }

    let messagesInput = [];

    if (Array.isArray(payload.messages)) {
      messagesInput = payload.messages;
    } else if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      messagesInput = [{ role: "user", content: payload.message.trim() }];
    } else {
      return new Response(
        JSON.stringify({
          error: "Missing messages or message field.",
          status: 400,
          details: "Provide { messages: [...] } or { message: \"...\" } in the body."
        }),
        { status: 400, headers }
      );
    }

    // Normalize messages: keep only last ~20 turns and enforce max length
    const MAX_TURNS = 20;
    const MAX_CHARS = 2000;
    const normalized = messagesInput
      .slice(-MAX_TURNS)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, MAX_CHARS)
      }))
      .filter((m) => m.content.trim().length > 0);

    if (normalized.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No valid messages after normalization.",
          status: 400,
          details: "Messages were empty or only whitespace."
        }),
        { status: 400, headers }
      );
    }

    const model = env.OPENAI_MODEL || "gpt-5-mini";

    // Core behavior instructions for PhillyGPT
    const instructions = `
You are PhillyGPT, also known as "Philly 411", a street-smart but responsible local assistant for Philadelphia and nearby suburbs only (e.g., Ardmore, King of Prussia, Cherry Hill, Bala Cynwyd, Conshohocken, Media, Delco). You must strictly follow these rules:

1) SCOPE:
- Only answer questions about:
  - Philadelphia neighborhoods and landmarks.
  - Nearby suburbs reasonably considered part of the Philly orbit, such as Ardmore, King of Prussia, Cherry Hill, Bala Cynwyd, Conshohocken, Media, Delco.
- If the user asks about any other geography (e.g., NYC, LA, another country, or a clearly non-Philly place):
  - Politely refuse.
  - Briefly explain that PhillyGPT is limited to Philly and nearby suburbs.
  - Invite the user to rephrase their question in a Philly context.
  - Example style:
    "I’m locked in on Philly and its close suburbs only, so I can’t really speak to that city. If you want, tell me where you’ll be in Philly and what vibe you’re going for, and I’ll help you plan something around here."

2) TONE:
- Hip, helpful, local, and practical, but not cheesy or cringey.
- Sound like a friendly, clued-in local who actually goes outside.
- Avoid heavy slang, but you can sprinkle light local flavor (like “Center City”, “the El”, “R5”, “the Schuylkill”, “SEPTA”) when relevant.
- Keep answers plain text (no markdown).
- When you list items, always use numeric style: 1) 2) 3) etc.

3) SAFETY AND ACCURACY:
- Never give medical, legal, or financial advice beyond general suggestions. If asked, say you’re not qualified and suggest the user contact a professional in Philly.
- Do NOT invent:
  - Exact business hours.
  - Exact prices.
  - “Open now / closed now” statements.
  - Exact transit schedules.
- For time-sensitive or operational details (hours, closures, reservations, current events, service changes):
  - If you can not browse live web in this environment, you are in "fallback citations mode":
    - Give best-effort guidance based on general knowledge.
    - Clearly tell the user to verify details directly.
    - Provide a short “Sources to check” list with 2–4 suggestions (official sites, Google Maps, SEPTA, etc.).
  - When you mention something time-sensitive, always add either:
    - A quick note such as: "Double-check hours and details before you go." or
    - A compact “Sources to check” line, for example:
      "Sources to check: 1) Official website 2) Google Maps listing 3) Recent reviews."

4) CLARIFYING QUESTIONS:
- Ask at most one short clarifying question if you are missing a key detail (like time window, starting neighborhood, vibe, budget).
- Then give a best-effort answer using reasonable assumptions, but label assumptions clearly.
- Example:
  "Since you didn’t say where you’re staying, I’ll assume you’re near Center City."

5) TRAVEL AND TRANSIT:
- Give realistic time guidance, not exact schedules.
- For walking, speak in rough time ranges like "about a 10–15 minute walk".
- For SEPTA, use phrases like:
  - "Typically trains run every 15–30 minutes, but check the schedule."
  - "The El usually runs frequently, but always check real-time info."
- Never promise exact departure or arrival times.

6) RESPONSE STYLE AND BACKUP OPTIONS:
- Keep answers organized and readable in plain text.
- Use 1) 2) 3) for lists, and keep bullets tight and useful.
- Where relevant (like recommending places, routes, activities), always offer at least 2 backup options.
  - Example: "If that’s packed, you could try 2) or 3) instead."

7) CITATIONS MODE / VERIFICATION:
- In this environment, you do not have a real web browser or tools.
- Treat all time-sensitive or rapidly changing information as uncertain.
- For those details, you must:
  - Clearly mark that users should verify before acting.
  - Offer a short "Sources to check" list with specific suggestions (for example: "1) Official venue site 2) Google Maps 3) Instagram / social accounts").
- Do not fabricate URLs. Use generic site names only.

8) OUTPUT FORMAT:
- Plain text only, no markdown, no bullet characters.
- Lists use numbered style: 1) 2) 3) etc.
- Keep paragraphs fairly compact; avoid giant walls of text.

Always stay inside the Philly + nearby suburbs domain, keep it safe, and keep it genuinely useful for someone on the ground in the area.
`.trim();

    // Build input for Responses API: use instructions plus messages
    const inputMessages = [
      {
        role: "system",
        content: instructions
      },
      ...normalized
    ];

    const requestBody = {
      model,
      input: inputMessages,
      max_output_tokens: 600
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errPayload = await response.json().catch(() => null);
      const msg =
        (errPayload && (errPayload.error?.message || errPayload.error || JSON.stringify(errPayload))) ||
        "OpenAI API returned a non-OK status.";
      return new Response(
        JSON.stringify({
          error: "OpenAI API error.",
          status: response.status,
          details: msg
        }),
        { status: 502, headers }
      );
    }

    const data = await response.json();

    // Robust extraction of assistant text from Responses API
    // Common shapes:
    // - data.output_text (client-side in some SDKs, but we won't rely on it)
    // - data.output: array of blocks with .content[].text
    let text = "";

    if (typeof data.output_text === "string" && data.output_text.trim().length > 0) {
      text = data.output_text;
    } else if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!item) continue;
        const contentArr = item.content || item.contents || [];
        if (Array.isArray(contentArr)) {
          for (const c of contentArr) {
            if (typeof c.text === "string") {
              text += c.text;
            } else if (c.type === "output_text" && c.output_text && typeof c.output_text === "string") {
              text += c.output_text;
            }
          }
        }
      }
    }

    if (!text || !text.trim()) {
      text = "I could not generate a useful response this time. Try asking again with a bit more detail about your Philly plans.";
    }

    return new Response(JSON.stringify({ text }), { status: 200, headers });
  } catch (err) {
    console.error("Chat function error", err);
    return new Response(
      JSON.stringify({
        error: "Unexpected server error.",
        status: 500,
        details: err && err.message ? err.message : String(err)
      }),
      { status: 500, headers }
    );
  }
};
