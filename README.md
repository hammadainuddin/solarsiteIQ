# DC SiteIQ — Southeast Asia Data Centre Site Intelligence

A browser-based site intelligence platform for evaluating data centre locations across Southeast Asia. Drop a pin anywhere on the map, run AI-powered workflow analyses, and get structured investment verdicts backed by real-time web search.

---

## Features

### Map & Layers
- Interactive map of **47 operational and pipeline data centres** across MY, SG, ID, TH, VN, PH, MM, KH
- Transmission line overlays, substation markers, fibre node markers
- Country filter (MY · SG · ID · TH · PH · VN), layer toggles, heatmap view
- Click any DC bubble to open a detailed intelligence dossier

### Location Workflow Analysis
Drop a pin anywhere in SEA and run six AI-powered analyses:

| Workflow | What it covers |
|---|---|
| **Power Infrastructure** | Grid operator, nearest substation, connection voltage, headroom, timeline, N-1 redundancy |
| **Carbon & Generation Mix** | Grid emission factor, renewable share, PPA options and pricing |
| **Load Competition** | Market zone, existing/pipeline supply, rack rates, hyperscaler demand |
| **Connectivity** | RTT latency to SG/HK/TK, submarine cables, IXP presence, fibre diversity |
| **Environmental Risk** | Flood, seismic, water stress, cyclone exposure |
| **Site Suitability** | Weighted composite score (0–100) across all five dimensions |

Each analysis is backed by **live web search** and produces a structured result card with score, verdict, key metrics, findings, and an executive summary paragraph.

### AI Assistant
Multi-turn chat assistant with full context awareness — knows the DC roster, live map state, active workflow, and DCF model results. Uses web search for real-time infrastructure news.

### Financial Model (DCF)
- Configurable 50–200 MW greenfield data centre model
- Inputs: rack rate, PUE, power cost, WACC, equity %, debt structure, BYOP solar
- Outputs: Equity IRR, Project IRR, NPV, payback period, DSCR, EBITDA margin
- Built-in On-Grid and BYOP (solar + battery) scenarios

### Scorecard & Benchmarks
Country-level benchmarks across power, connectivity, land, regulation, and climate dimensions with peer comparison charts.

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| Map | Leaflet + React Leaflet |
| Charts | Recharts |
| Icons | Lucide React |
| LLM | Google Generative AI SDK + OpenAI-compatible fetch |

---

## Supported LLM Providers

Configure your LLM via the gear icon in the sidebar. No environment variables required — credentials are stored in `localStorage`.

| Provider | Web Search |
|---|---|
| Google Gemini (gemini-2.5-flash, gemini-2.0-flash, …) | Google Search grounding |
| OpenAI (gpt-4o, gpt-4.1, …) | — |
| OpenRouter (any model via `openrouter.ai/api/v1`) | `plugins:[{id:"web"}]` |
| Groq, Mistral, Ollama, any OpenAI-compatible endpoint | Provider-dependent |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/hammadainuddin/seadcss.git
cd seadcss

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
# → http://localhost:5173

# 4. Configure your LLM
# Click the gear icon (⚙) in the bottom-left sidebar.
# Select your provider, enter your API key and model name, then save.
```

No `.env` file is needed. The app works fully offline for map browsing and financial modelling; only the AI features require an API key.

---

## Build & Deploy

```bash
npm run build   # outputs to dist/
npm run preview # preview the production build locally
```

The output is a fully static SPA — deploy the `dist/` folder to any static host (Vercel, Netlify, GitHub Pages, S3 + CloudFront).

---

## Project Structure

```
src/
├── components/       # UI panels and modals
│   ├── AssistantPanel.tsx
│   ├── LocationWorkflowPanel.tsx
│   ├── WorkflowAnalysisPanel.tsx
│   ├── WorkflowResultCard.tsx
│   ├── SettingsModal.tsx
│   └── …
├── pages/            # Top-level route views
│   ├── MapView.tsx
│   ├── Dashboard.tsx
│   ├── FinancialView.tsx
│   └── ScorecardView.tsx
├── data/             # Static SEA DC dataset and infrastructure layers
│   ├── dcDatabase.ts
│   ├── infraLayers.ts
│   └── transmissionLines.ts
├── utils/            # LLM client, spatial context, prompts, financial model
│   ├── llmClient.ts
│   ├── llmConfig.ts
│   ├── spatialContext.ts
│   ├── locationPrompts.ts
│   └── …
├── hooks/
│   └── useWorkflowAnalysis.ts
├── context/
│   └── AppContext.tsx
└── types/
    └── index.ts
```

---

## Geographic Coverage

Malaysia · Singapore · Indonesia · Thailand · Vietnam · Philippines · Myanmar · Cambodia · Laos · Brunei

Reverse geocoding via [Nominatim / OpenStreetMap](https://nominatim.openstreetmap.org) ensures accurate country, state, and district identification before any AI analysis.

---

## License

MIT
