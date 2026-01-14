// /chat.js
(() => {
  const $ = (id) => document.getElementById(id);

  const messagesEl = $("messages");
  const formEl = $("chatForm");
  const inputEl = $("input");
  const clearBtn = $("clearBtn");
  const weatherValueEl = $("weatherValue");
  const chipsEl = $("chips");

  const STORAGE_KEY = "phillygpt_tourguide_chat_v2";

  function normalizeOutput(text) {
    let t = String(text ?? "");

    // Remove common markdown clutter so the UI stays clean.
    t = t.replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```[\w-]*\n?/g, "").replace(/```/g, "").trim()
    );
    t = t.replace(/^#{1,6}\s+/gm, "");
    t = t.replace(/\*\*(.*?)\*\*/g, "$1");
    t = t.replace(/\*(.*?)\*/g, "$1");
    t = t.replace(/^[-*]\s+/gm, "");
    t = t.replace(/^\d+\.\s+/gm, (m) => m.replace(".", ") "));
    t = t.replace(/\n{3,}/g, "\n\n").trim();

    return t;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, text) {
    const msg = document.createElement("div");
    msg.className = `msg ${role === "user" ? "me" : "bot"}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "You" : "PG";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = normalizeOutput(text);

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();
  }

  function setIntroIfEmpty() {
    const saved = loadMessages();
    if (saved.length) return;

    addMessage(
      "assistant",
      [
        "Welcome to Philly.",
        "",
        "Tell me:",
        "1) how much time you have (2 hours / half day / full day)",
        "2) your vibe (history, food, art, nightlife, family-friendly)",
        "3) your budget (cheap / mid / splurge)",
        "4) where you’re starting (hotel, neighborhood, or landmark)",
        "",
        "I’ll build a simple plan with nearby options and what to do next."
      ].join("\n")
    );
    persistMessages();
  }

  function persistMessages() {
    const items = [];
    messagesEl.querySelectorAll(".msg").forEach((row) => {
      const isMe = row.classList.contains("me");
      const text = row.querySelector(".bubble")?.textContent ?? "";
      items.push({ role: isMe ? "user" : "assistant", text });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function loadMessages() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function restoreMessages() {
    const saved = loadMessages();
    if (!saved.length) return;
    messagesEl.innerHTML = "";
    for (const m of saved) addMessage(m.role, m.text);
  }

  function replaceLastAssistantBubble(text) {
    const bubbles = messagesEl.querySelectorAll(".msg.bot .bubble");
    const lastBubble = bubbles[bubbles.length - 1];
    if (lastBubble) lastBubble.textContent = normalizeOutput(text);
  }

  function buildMessagesForAPI() {
    // Build chat history for the API so the assistant stays consistent
    // Convert {role, text} -> {role, content}
    const saved = loadMessages();
    return saved.slice(-20).map((m) => ({ role: m.role, content: m.text }));
  }

  async function sendMessage(userText) {
    addMessage("user", userText);
    persistMessages();

    addMessage("assistant", "Thinking…");

    try {
      const payload = { messages: buildMessagesForAPI() };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get("content-type") || "";
      const raw = contentType.includes("application/json") ? await res.json() : await res.text();

      if (!res.ok) {
        const details = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
        throw new Error(`API ${res.status}: ${details}`);
      }

      const reply =
        (typeof raw === "object" && raw && (raw.text || raw.reply || raw.message)) ||
        "Sorry — I didn’t get a response.";

      replaceLastAssistantBubble(reply);
      persistMessages();
      scrollToBottom();
    } catch (e) {
      replaceLastAssistantBubble(`Chat error: ${e.message}`);
      persistMessages();
      scrollToBottom();
      console.error(e);
    }
  }

  function autosizeTextarea() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, window.innerHeight * 0.34) + "px";
  }

  async function loadWeather() {
    try {
      // Open-Meteo (no API key). Philadelphia lat/lon
      const url =
        "https://api.open-meteo.com/v1/forecast" +
        "?latitude=39.9526&longitude=-75.1652" +
        "&current=temperature_2m,weather_code,wind_speed_10m" +
        "&temperature_unit=fahrenheit&wind_speed_unit=mph";

      const res = await fetch(url);
      if (!res.ok) throw new Error("weather fetch failed");
      const j = await res.json();

      const temp = Math.round(j?.current?.temperature_2m);
      const code = j?.current?.weather_code;
      const wind = Math.round(j?.current?.wind_speed_10m);

      const desc = weatherLabel(code);
      weatherValueEl.textContent = `${temp}°F · ${desc} · Wind ${wind} mph`;
    } catch {
      weatherValueEl.textContent = "Weather unavailable";
    }
  }

  function weatherLabel(code) {
    // WMO weather codes (simplified)
    const map = new Map([
      [0, "Clear"],
      [1, "Mostly clear"],
      [2, "Partly cloudy"],
      [3, "Cloudy"],
      [45, "Fog"],
      [48, "Fog"],
      [51, "Light drizzle"],
      [53, "Drizzle"],
      [55, "Heavy drizzle"],
      [61, "Light rain"],
      [63, "Rain"],
      [65, "Heavy rain"],
      [71, "Light snow"],
      [73, "Snow"],
      [75, "Heavy snow"],
      [80, "Rain showers"],
      [81, "Rain showers"],
      [82, "Heavy showers"],
      [95, "Thunderstorms"]
    ]);
    return map.get(code) || "Weather";
  }

  // Wire up UI
  window.addEventListener("load", () => {
    restoreMessages();
    setIntroIfEmpty();
    loadWeather();

    autosizeTextarea();
    inputEl.addEventListener("input", autosizeTextarea);

    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = "";
      autosizeTextarea();
      sendMessage(text);
    });

    clearBtn.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      messagesEl.innerHTML = "";
      setIntroIfEmpty();
    });

    chipsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-prompt]");
      if (!btn) return;
      inputEl.value = btn.getAttribute("data-prompt") || "";
      autosizeTextarea();
      inputEl.focus();
    });
  });
})();
