// /chat.js
(() => {
  const $ = (id) => document.getElementById(id);

  const messagesEl = $("messages");
  const inputEl = $("input");
  const sendBtn = $("sendBtn");
  const clearBtn = $("clearBtn");
  const yearEl = $("year");
  const weatherValue = $("weatherValue");
  const weatherMini = $("weatherMini");
  const quickPrompts = $("quickPrompts");
  const quickCard = $("quickCard");
  const notesCard = $("notesCard");

  yearEl.textContent = new Date().getFullYear();

  // Collapse bottom panels on small screens by default (fixes iPhone layout)
  const setPanelsByWidth = () => {
    const mobile = window.innerWidth <= 760;
    if (mobile) {
      quickCard.removeAttribute("open");
      notesCard.removeAttribute("open");
    } else {
      quickCard.setAttribute("open", "open");
      notesCard.setAttribute("open", "open");
    }
  };
  setPanelsByWidth();
  window.addEventListener("resize", setPanelsByWidth);

  // Local storage chat history
  const STORAGE_KEY = "phillygpt_chat_v1";
  let history = [];

  function saveHistory() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-30)));
  }
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      history = raw ? JSON.parse(raw) : [];
    } catch {
      history = [];
    }
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function stripMarkdown(text) {
    if (!text) return "";
    let t = String(text);

    // Remove common markdown tokens
    t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "")); // keep code content, drop fences
    t = t.replace(/`([^`]+)`/g, "$1");
    t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");      // headings
    t = t.replace(/^\s{0,3}>\s?/gm, "");           // blockquotes
    t = t.replace(/\*\*(.*?)\*\*/g, "$1");         // bold
    t = t.replace(/\*(.*?)\*/g, "$1");             // italics
    t = t.replace(/__([^_]+)__/g, "$1");
    t = t.replace(/_([^_]+)_/g, "$1");

    // Links: [text](url) -> text
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

    // List markers: "- " "* " "1. " -> "• "
    t = t.replace(/^\s*[-*]\s+/gm, "• ");
    t = t.replace(/^\s*\d+\.\s+/gm, "• ");

    // Remove stray leading markdown chars on lines
    t = t.replace(/^\s*[*#]+\s*/gm, "");

    // Clean up
    t = t.replace(/\n{3,}/g, "\n\n").trim();

    return t;
  }

  function addMessage(role, text) {
    const row = document.createElement("div");
    row.className = "msgRow" + (role === "user" ? " user" : "");

    if (role !== "user") {
      const av = document.createElement("div");
      av.className = "avatar";
      av.textContent = "PG";
      row.appendChild(av);
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble" + (role === "user" ? " user" : "");
    bubble.textContent = stripMarkdown(text);
    row.appendChild(bubble);

    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function autosize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  inputEl.addEventListener("input", () => autosize(inputEl));

  // Send on Enter (Shift+Enter for new line)
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  sendBtn.addEventListener("click", send);
  clearBtn.addEventListener("click", () => {
    history = [];
    saveHistory();
    messagesEl.innerHTML = "";
    seedWelcome();
  });

  quickPrompts.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-prompt]");
    if (!btn) return;
    inputEl.value = btn.getAttribute("data-prompt") || "";
    autosize(inputEl);
    inputEl.focus();
  });

  function seedWelcome() {
    addMessage(
      "assistant",
      "Welcome to Philly.\n\nTell me:\n• How much time you’ve got (1–3 hours, half day, full day)\n• Your vibe (history, art, food, nightlife, chill)\n• Budget (cheap / mid / splurge)\n• Where you’re starting (or a neighborhood)\n\nI’ll give you a clean, step-by-step plan with stops, timing, and how to get around."
    );
  }

  async function send() {
    const msg = inputEl.value.trim();
    if (!msg) return;

    inputEl.value = "";
    autosize(inputEl);
    addMessage("user", msg);

    history.push({ role: "user", content: msg });
    saveHistory();

    // Loading bubble
    const loadingRow = document.createElement("div");
    loadingRow.className = "msgRow";
    loadingRow.innerHTML = `<div class="avatar">PG</div><div class="bubble">Thinking…</div>`;
    messagesEl.appendChild(loadingRow);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: history.slice(-12) }),
      });

      const data = await res.json();
      loadingRow.remove();

      if (!res.ok) {
        addMessage("assistant", data?.error || "Sorry — something went wrong.");
        return;
      }

      const reply = stripMarkdown(data.reply || "");
      addMessage("assistant", reply);

      history.push({ role: "assistant", content: reply });
      saveHistory();
    } catch (err) {
      loadingRow.remove();
      addMessage("assistant", "Network error. Please try again.");
    }
  }

  // Restore history
  loadHistory();
  if (history.length === 0) {
    seedWelcome();
  } else {
    // Re-render past messages (simple)
    history.forEach((m) => addMessage(m.role === "assistant" ? "assistant" : "user", m.content));
  }

  // Weather (no API key): Open-Meteo
  const PHILLY = { lat: 39.9526, lon: -75.1652, tz: "America/New_York" };

  const weatherCodeToText = (code) => {
    // Open-Meteo weather codes (simplified)
    const map = {
      0: "Clear",
      1: "Mostly clear",
      2: "Partly cloudy",
      3: "Cloudy",
      45: "Fog",
      48: "Rime fog",
      51: "Light drizzle",
      53: "Drizzle",
      55: "Heavy drizzle",
      61: "Light rain",
      63: "Rain",
      65: "Heavy rain",
      71: "Light snow",
      73: "Snow",
      75: "Heavy snow",
      80: "Light showers",
      81: "Showers",
      82: "Heavy showers",
      95: "Thunderstorm",
      96: "Thunderstorm + hail",
      99: "Thunderstorm + heavy hail",
    };
    return map[code] || "Weather";
  };

  async function loadWeather() {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${PHILLY.lat}&longitude=${PHILLY.lon}` +
        `&current=temperature_2m,weather_code,wind_speed_10m` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
        `&timezone=${encodeURIComponent(PHILLY.tz)}`;

      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();

      const temp = Math.round(j?.current?.temperature_2m);
      const code = j?.current?.weather_code;
      const wind = Math.round(j?.current?.wind_speed_10m);

      const label = `${temp}°F · ${weatherCodeToText(code)} · Wind ${wind} mph`;
      weatherValue.textContent = label;
      weatherMini.textContent = `Weather: ${label}`;
    } catch {
      weatherValue.textContent = "Weather unavailable";
      weatherMini.textContent = "";
    }
  }

  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000); // refresh every 10 min
})();
