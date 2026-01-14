# PhillyGPT · Philly 411 for Philadelphia

PhillyGPT is a hip, street-smart but safe chatbot focused exclusively on Philadelphia and nearby suburbs. It runs as a static site on Cloudflare Pages with a serverless backend using Cloudflare Pages Functions and the OpenAI Responses API. [web:1]

All responses are plain text and scoped to Philly and close suburbs only. Time‑sensitive info is given with clear verification guidance instead of fake precision. [web:1]

## Features

- Philly‑only scope, with polite refusals for questions outside the Philly orbit.
- Modern, glassy, mobile‑friendly UI with soft gradients and message bubbles.
- Local weather badge using Open‑Meteo current weather for Philadelphia (no API key needed). [web:13]
- Chat history stored in `localStorage` and restored on reload.
- Quick prompt chips for common Philly use cases (day plan, food crawl, museums, SEPTA basics, date night).
- Secure backend calling `https://api.openai.com/v1/responses` with the API key kept server‑side. [web:1][web:8]

## Stack

- Frontend: Vanilla HTML, CSS, JS
- Hosting: Cloudflare Pages
- Backend: Cloudflare Pages Functions
- AI: OpenAI Responses API (`/v1/responses`) with configurable model via `OPENAI_MODEL`. [web:1][web:8]

## File layout

- `/index.html` – main app shell and layout
- `/styles.css` – glassy, responsive styling
- `/chat.js` – client chat logic, weather fetch, local history
- `/functions/api/chat.js` – Cloudflare Pages Function implementing POST `/api/chat`
- `/robots.txt` – optional, basic crawler hints
- `/sitemap.xml` – optional, simple sitemap
- `/favicon.svg` – optional PG icon

## Local development

You can preview the static part locally with any dev server, but the Cloudflare function logic is best tested via `wrangler` or the Cloudflare Pages dev workflow. [web:1]

### 1) Clone the repo

```bash
git clone https://github.com/your-user/phillygpt.info.git
cd phillygpt.info
