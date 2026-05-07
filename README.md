# Solar SiteIQ

**Malaysia Large-Scale Solar & REZ Site Screening Tool**

Solar SiteIQ is a geospatial intelligence platform for screening 50 MW+ utility-scale solar, BESS, and Renewable Energy Zone (REZ) sites across the four northern states of Peninsular Malaysia: **Perak, Kedah, Penang, and Perlis**.

---

## Features

### Hex Grid Screening Map
- **H3 resolution-6 hexagonal grid** (~36 km² per tile) covering all four northern states
- Each tile pre-scored across seven dimensions and colour-coded red → amber → green
- Toggle hex grid on/off; switch between **dark** and **satellite** (ESRI World Imagery) basemaps
- Per-tile estimated solar capacity (MW) based on land use type, usable fraction, and 4.5 MW/km² density
- Offshore/sea tiles are excluded; inland water bodies (Temenggor reservoir, ex-mining ponds) are retained as floating solar (FPV) candidates

### Seven Scoring Dimensions

| # | Dimension | Weight |
|---|---|---|
| 1 | Solar Resource Potential | 25% |
| 2 | Grid Interconnection | 20% |
| 3 | Land Suitability | 20% |
| 4 | Land Availability | 10% |
| 5 | Climatic Conditions | 10% |
| 6 | Road Access | 8% |
| 7 | Environmental & Social | 7% |

Weighted composite → **Go** (≥ 70) / **Conditional Go** (45–69) / **Avoid** (< 45)

### Top-25 REZ Candidates
- Dashed outlines on the top 25 highest-scoring hex tiles
- Colour-coded by tier: **green** (rank 1–5) · **cyan** (6–15) · **amber** (16–25)
- Tooltip shows rank, composite score, estimated capacity, land type, and GHI

### Infrastructure Layers (toggle on/off)
- **Transmission lines** — live OSM-fetched TNB 500/275/132 kV lines with glow effect; falls back to static data offline
- **Substations** — TNB 132 kV+ substations with voltage and headroom tooltips
- All layers off by default for fast initial load; OSM data cached 24 h in IndexedDB

### Industrial Zones & Technology Parks
- 30 zones across all four states, toggle on/off
- Colour-coded by type: Technology Park (cyan) · Free Industrial Zone (orange) · Industrial Estate (purple) · Special Economic Zone (green)
- Includes NCER-designated zones: KHTP, Silver Valley Technology Park (Perak), Kedah Rubber City, KSTP (Bukit Kayu Hitam), Chuping Valley Industrial Area (Perlis)

### AI-Powered Site Analysis
- Click any hex tile or drop a pin to open the **Solar Workflow Panel**
- Eight structured AI workflows: Solar Resource · Grid Interconnection · Land Suitability · Land Availability · Climate Risk · Road Access · Env & Social · Site Suitability
- Streaming JSON-first analysis with per-metric results and risk flags
- Configure any OpenAI-compatible LLM endpoint via the Settings modal

### Dashboard
- KPI cards: total screened area, Go / Conditional tile counts, estimated buildable capacity (GW)
- State-by-state breakdown with individual capacity estimates
- Top-10 highest-scoring tiles table with per-dimension scores

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Map | Leaflet + React-Leaflet |
| Hex grid | Uber H3 (`h3-js`) resolution 6 |
| Basemaps | CARTO Dark Matter · ESRI World Imagery |
| Grid data | Overpass API (OpenStreetMap) with IndexedDB cache |
| Styling | Tailwind CSS |
| LLM | Provider-agnostic streaming (OpenAI-compatible) |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build
```

### LLM Configuration
Open the **Settings** gear (top-right of the map) and enter:
- API endpoint (e.g. `https://api.openai.com/v1`)
- API key
- Model name (e.g. `gpt-4o`)

Any OpenAI-compatible provider works (OpenAI, Anthropic via proxy, Groq, local Ollama, etc.).

---

## Coverage Area

| State | Key zones screened |
|---|---|
| **Perlis** | Chuping Valley, MADA paddy fringe, Wang Kelian forest reserve |
| **Kedah** | MADA paddy scheme (North & South), Baling/Sik idle agri, rubber belt, Ulu Muda forest |
| **Penang** | Seberang Prai agri, Kulim–Penang border idle land, Batu Kawan corridor |
| **Perak** | Kinta Valley, Grik idle agri, Titiwangsa forest, Temenggor reservoir (FPV), Bidor–Tapah oil palm |

---

## Capacity Estimation Methodology

Each H3 tile's buildable solar capacity is estimated as:

> **Estimated MW = tile area (36.13 km²) × usable land fraction × 4.5 MW/km²**

Usable land fraction by land use type:

| Land use | Fraction | Rationale |
|---|---|---|
| Idle agricultural | 70% | Minimal competing use |
| Rubber estate | 50% | Some processing facilities present |
| Mixed agriculture | 40% | Mix of crops and farm infrastructure |
| Oil palm | 25% | Active plantation with mills |
| Paddy | 10% | Actively farmed MADA irrigation scheme |
| Water (FPV) | 15% | Floating solar potential |
| Urban | 3% | Rooftop / car-park solar only |
| Forest / protected | 0% | Not developable |

---

## Data Sources

- **GHI estimates** — regional averages derived from SOLARGIS northern Malaysia data
- **Grid infrastructure** — TNB transmission lines and substations via OpenStreetMap Overpass API
- **Land use zones** — encoded from MADA, Jabatan Pertanian, JPS, and state land office data
- **Flood risk** — DID flood hazard map approximations
- **Industrial zones** — NCER, MIDA, Invest Kedah, Invest Perak published data

---

## Project Structure

```
src/
├── components/
│   ├── HexGridLayer.tsx          # H3 hex tile rendering
│   ├── REZClusters.tsx           # Top-25 REZ candidate outlines
│   ├── SolarWorkflowPanel.tsx    # AI workflow trigger panel
│   ├── DimensionSelector.tsx     # Score dimension switcher
│   ├── TileScoreLegend.tsx       # Map legend
│   └── StateFilter.tsx           # State filter pills
├── pages/
│   ├── SolarMapView.tsx          # Main screening map
│   └── SolarDashboard.tsx        # KPI dashboard
├── data/
│   ├── northernMyTransmissionLines.ts
│   ├── northernMySubstations.ts
│   ├── solarZones.ts             # Land use zone polygons
│   └── industrialZones.ts        # Tech parks & industrial estates
└── utils/
    ├── hexGrid.ts                # H3 tile generation & scoring
    ├── solarScoring.ts           # Dimension scoring functions
    ├── solarPrompts.ts           # AI workflow prompts
    ├── ghi.ts                    # GHI estimation by region
    └── overpass.ts               # OSM Overpass API fetcher
```

---

## License

MIT
