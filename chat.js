// /chat.js
(() => {
  const messagesEl = document.getElementById("messages");
  const formEl = document.getElementById("chatForm");
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const clearBtn = document.getElementById("clearBtn");
  const weatherTextEl = document.getElementById("weatherText");

  const WELCOME = [
    "Welcome to Philly.",
    "",
    "Tell me when you’re visiting, what you’re into (food, museums, history, nightlife, sports), your budget, and where you’re starting from.",
    "I’ll suggest a clean plan with smart stops and realistic travel time.",
  ].join("\n");

  function stripMarkdown(text = "") {
    // Make output clean: remove common markdown tokens and bullets
    let t = String(text);

    // Remove code fences/backticks
    t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""));
    t = t.replace(/`+/g, "");

    // Remove heading markers, emphasis markers
    t = t.replace(/^#{1,6}\s+/gm, "");
    t = t.replace(/\*\*(.*?)\*\*/g, "$1");
    t = t.replace(/\*(.*?)\*/g, "$1");
    t = t.replace(/_(.*?)_/g, "$1");

    // Remove blockquote markers
    t = t.replace(/^\s*>\s?/gm, "");

    // Remove list markers like "- ", "* ", "1. "
    t = t.replace(/^\s*[-*]\s+/gm, "");
    t = t.replace(/^\s*\d+\.\s+/gm, "");

    // Collapse excessive blank lines
    t = t.replace(/\n{3,}/g, "\n\n");

    return t.trim();
  }

  function addMessage(role, text) {
    const row = document.createElement("div");
    row.className = `msg ${role}`;

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = role === "assistant" ? "PG" : "You";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = stripMarkdown(text);

    if (role === "assistant") row.appendChild(badge);
    row.appendChild(bubble);

    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setBusy(isBusy) {
    sendBtn.disabled = isBusy;
    inputEl.disabled = isBusy;
    sendBtn.textContent = isBusy ? "…" : "Send";
  }

  function autosize() {
    inputEl.style.height = "auto";
    const next = Math.min(inputEl.scrollHeight, 140);
    inputEl.style.height = `${next}px`;
  }

  async function loadWeather() {
    try {
      const url =
        "https://api.open-meteo.com/v1/forecast" +
        "?latitude=39.9526&longitude=-75.1652" +
        "&current=temperature_2m,weather_code,wind_speed_10m" +
        "&temperature_unit=fahrenheit&wind_speed_unit=mph" +
        "&timezone=America%2FNew_York";

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Weather request failed");
      const data = await res.json();

      const temp = Math.round(data?.current?.temperature_2m);
      const wind = Math.round(data?.current?.wind_speed_10m);
      const code = data?.current?.weather_code;

      const desc = weatherCodeToText(code);
      weatherTextEl.textContent = `${temp}°F · ${desc} · Wind ${wind} mph`;
    } catch {
      weatherTextEl.textContent = "Weather unavailable";
    }
  }

  function weatherCodeToText(code) {
    // Simplified mapping (Open-Meteo weather codes)
    const c = Number(code);
    if ([0].includes(c)) return "Clear";
    if ([1, 2].includes(c)) return "Partly cloudy";
    if ([3].includes(c)) return "Cloudy";
    if ([45, 48].includes(c)) return "Fog";
    if ([51, 53, 55, 56, 57].includes(c)) return "Drizzle";
    if ([61, 63, 65, 66, 67].includes(c)) return "Rain";
    if ([71, 73, 75, 77].includes(c)) return "Snow";
    if ([80, 81, 82].includes(c)) return "Showers";
    if ([95, 96, 99].includes(c)) return "Thunderstorms";
    return "Conditions";
  }

  function resetChat() {
    messagesEl.innerHTML = "";
    addMessage("assistant", WELCOME);
  }

  async function sendMessage(userText) {
    const text = userText.trim();
    if (!text) return;

    addMessage("user", text);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || "Something went wrong. Please try again.";
        addMessage("assistant", msg);
        return;
      }

      addMessage("assistant", data?.reply || "No response.");
    } catch {
      addMessage("assistant", "Network error. Please try again.");
    } finally {
      setBusy(false);
      inputEl.focus();
    }
  }

  // Events
  inputEl.addEventListener("input", autosize);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = inputEl.value;
    inputEl.value = "";
    autosize();
    sendMessage(val);
  });

  clearBtn.addEventListener("click", resetChat);

  document.getElementById("chips").addEventListener("click", (e) => {
    const btn = e.target.closest("button.chip");
    if (!btn) return;
    inputEl.value = btn.textContent;
    autosize();
    inputEl.focus();
  });

  // Init
  resetChat();
  autosize();
  loadWeather();
  // Refresh weather occasionally
  setInterval(loadWeather, 10 * 60 * 1000);
})();
