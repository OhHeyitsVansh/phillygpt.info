export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return makeCorsResponse(204, null);
  }

  if (method === "GET") {
    if (url.pathname.endsWith("/health") || url.searchParams.get("health") === "1") {
      return makeCorsResponse(200, { status: "ok", service: "phillygpt-api" });
    }
    return makeCorsResponse(200, { status: "ok" });
  }

  if (method !== "POST") {
    return makeCorsResponse(405, {
      error: "Method not allowed",
      status: 405,
      details: "Use POST /api/chat for chatting."
    });
  }

  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return makeCorsResponse(500, {
      error: "Missing OpenAI API key",
      status: 500,
      details: "OPENAI_API_KEY is not configured on the server."
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return makeCorsResponse(400, {
      error: "Invalid JSON",
      status: 400,
      details: "Request body must be valid JSON."
    });
  }

  const { messages, message } = body || {};

  let normalizedMessages = [];

  if (Array.isArray(messages)) {
    normalizedMessages = messages
      .filter(m => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role, content: sanitizeContent(m.content) }));
  } else if (typeof message === "string") {
    normalizedMessages = [{ role: "user", content: sanitizeContent(message) }];
  } else {
    return makeCorsResponse(400, {
      error: "Invalid payload",
      status: 400,
      details: "Send either { messages: [...] } or { message: \"...\" }."
    });
  }

  if (normalizedMessages.length === 0) {
    return makeCorsResponse(400, {
      error: "Empty messages",
      status: 400,
      details: "No valid messages found after validation."
    });
  }

  normalizedMessages = normalizedMessages.slice(-40);

  const systemPrompt = buildSystemPrompt();

  const inputMessages = [
    { role: "system", content: systemPrompt },
    ...normalizedMessages
  ];

  const maxTokens = 800;

  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: inputMessages,
        max_output_tokens: maxTokens
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      return makeCorsResponse(openAiResponse.status, {
        error: "OpenAI API error",
        status: openAiResponse.status,
        details: truncate(errorText, 500)
      });
    }

    const data = await openAiResponse.json();
    const assistantText = extractAssistantText(data) || "Sorry, I could not generate a response this time.";

    return makeCorsResponse(200, { text: assistantText });
  } catch (e) {
    return makeCorsResponse(502, {
      error: "Upstream error",
      status: 502,
      details: e instanceof Error ? truncate(e.message, 300) : "Unknown error."
    });
  }
}

function sanitizeContent(text) {
  if (typeof text !== "string") return "";
  let trimmed = text.trim();
  const maxLength = 2000;
  if (trimmed.length > maxLength) {
    trimmed = trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function buildSystemPrompt() {
  return [
    "You are PhillyGPT, a hip, friendly, realistic local tour guide for Philadelphia.",
    "You specialize in food, neighborhoods, museums, and day plans, especially for visitors and locals exploring the city.",
    "",
    "Rules:",
    "1) Always answer in clean plain text. Do not use markdown, bullets, or asterisks. If you need a list, format it as 1) 2) 3) using plain text.",
    "2) Be concise but warm. Use a casual, friendly Philly tone without being cheesy.",
    "3) Be neighborhood-aware and realistic about walking, SEPTA transit, and timing between places. If the user gives a starting point, factor it into your plan. Mention travel time estimates in minutes instead of exact schedules.",
    "4) Do not hallucinate exact hours, prices, or claim something is open right now. Avoid phrases like “they are open until 8pm today” or “this costs 23 dollars.” Instead, say things like “usually open for lunch” or “typically around mid-range pricing” and suggest checking official sources.",
    "5) If the user asks for up-to-date info, like current events, specific closures, or what is open today, explain clearly that you cannot verify live information. Suggest checking official websites, Google Maps, or social accounts. Optionally, you may describe a lightweight “search or citations mode” as something the user can do themselves.",
    "6) Before giving a fully detailed plan, ask exactly one short clarifying question if important context is missing, such as time window, starting area, vibe (chill vs packed, artsy vs sports, family-friendly vs nightlife), or budget. Once you ask that single clarifying question, do not ask more follow-up questions before giving a plan.",
    "7) Focus on neighborhoods like Center City, Old City, Fishtown, South Philly, West Philly, and the Museum District, but feel free to mention other realistic areas if relevant.",
    "8) For itineraries, keep routes logical and walkable or reachable with simple SEPTA routes. Mention when a short rideshare might be easier.",
    "9) Keep outputs reasonably short and skimmable. Use numbered lists 1) 2) 3) for sequences of recommendations.",
    "",
    "Your goal: help the user have a great time in Philadelphia with honest, grounded, and practical suggestions."
  ].join(" ");
}

function extractAssistantText(data) {
  if (!data) return "";

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (Array.isArray(data.output)) {
    const texts = [];
    for (const item of data.output) {
      if (!item) continue;
      if (typeof item === "string") {
        texts.push(item);
      } else if (typeof item.content === "string") {
        texts.push(item.content);
      } else if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (!c) continue;
          if (typeof c === "string") {
            texts.push(c);
          } else if (typeof c.text === "string") {
            texts.push(c.text);
          } else if (c.type === "output_text" && c.output_text && typeof c.output_text.text === "string") {
            texts.push(c.output_text.text);
          }
        }
      } else if (item.type === "output_text" && item.output_text && typeof item.output_text.text === "string") {
        texts.push(item.output_text.text);
      }
    }
    if (texts.length > 0) {
      return texts.join("\n\n").trim();
    }
  }

  if (Array.isArray(data.choices)) {
    const choice0 = data.choices[0];
    if (choice0) {
      if (choice0.message && typeof choice0.message.content === "string") {
        return choice0.message.content;
      }
      if (Array.isArray(choice0.output)) {
        for (const item of choice0.output) {
          if (!item) continue;
          if (typeof item === "string") return item;
          if (typeof item.content === "string") return item.content;
          if (Array.isArray(item.content)) {
            const candidate = item.content.find(c => c && typeof c.text === "string");
            if (candidate) return candidate.text;
          }
        }
      }
    }
  }

  if (data.output && data.output[0] && data.output[0].content && data.output[0].content[0] && typeof data.output[0].content[0].text === "string") {
    return data.output[0].content[0].text;
  }

  return "";
}

function makeCorsResponse(status, jsonBody) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");

  if (status === 204 || jsonBody === null) {
    return new Response(null, { status, headers });
  }

  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(jsonBody), { status, headers });
}

function truncate(text, max) {
  if (typeof text !== "string") return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}
