# Smart Staging v2 — Frontend

AI-powered virtual staging pipeline for Houspire. Transforms bare-room photos into
photorealistic staged interiors using a multi-stage generation pipeline built on
Next.js, Supabase, Replicate (Flux Pro), and Claude.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Database & Auth | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Image Generation | Replicate — Flux Pro (`black-forest-labs/flux-1.1-pro`) |
| AI / LLM | Anthropic Claude (design briefs, suggestions, quality) |
| Format Conversion | Sharp (optional, production only) |

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# AI model providers
REPLICATE_API_TOKEN=<replicate-token>
ANTHROPIC_API_KEY=<anthropic-key>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional: enable Sharp for real format conversion (production)
# ENABLE_SHARP=true
```

> **Mock mode**: If `REPLICATE_API_TOKEN` is absent or empty, all generation routes
> run in mock mode — they create database records and storage paths but skip real model
> calls. This lets you develop the full pipeline flow without API costs.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Apply database migrations

From the project root (requires Supabase CLI):

```bash
supabase db push
```

Migrations are in `../supabase/migrations/` and create the following schemas:
`core`, `scene`, `generation`, `knowledge`, `assets`, `quality`, `geolocation`.

---

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/callback/      # Supabase auth callback
│   │   └── api/
│   │       ├── analyze/          # Scene analysis (M07)
│   │       ├── auxiliary/        # Declutter / renovate / floor-plan
│   │       ├── design-brief/     # LLM design brief processing
│   │       ├── edit/             # Edit execution (M14)
│   │       │   └── submit/       # Edit submission + validation
│   │       ├── export/           # Export engine (M15)
│   │       ├── generate/         # Full pipeline orchestrator
│   │       │   ├── exterior/     # Geolocation exterior views (M12)
│   │       │   ├── fitout/       # Fitout generation (M10)
│   │       │   ├── furniture/    # Furniture placement (M11)
│   │       │   ├── harmonize/    # Harmonization (M09)
│   │       │   ├── lighting/     # Lighting & shadow (M08)
│   │       │   └── render-to-photo/ # Render-to-photo (M07)
│   │       ├── pipeline/batch/   # Batch pipeline execution
│   │       ├── quality/          # Quality scoring (M18)
│   │       ├── sdk/              # Public SDK endpoint
│   │       ├── suggestions/      # AI design suggestions
│   │       ├── variants/         # Style variants generation
│   │       └── visibility/sync/  # Visibility layer sync
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Browser Supabase client
│   │   │   ├── server.ts         # Server-side client (cookie auth)
│   │   │   └── middleware.ts     # Session refresh middleware
│   │   ├── api-types.ts          # Shared TypeScript interfaces
│   │   ├── cache.ts              # Room locks + telemetry logging
│   │   ├── claude.ts             # Anthropic Claude API client
│   │   ├── editing.ts            # Edit history + influence zone math
│   │   ├── generation.ts         # Scene context, model calls, storage helpers
│   │   ├── hallucination-defense.ts  # M13 hallucination detection
│   │   ├── pipeline.ts           # Pipeline run / stage lifecycle
│   │   ├── quality.ts            # M18 quality scoring logic
│   │   ├── replicate.ts          # Replicate client wrapper
│   │   ├── sanitize.ts           # Input validation + prompt injection defense
│   │   ├── style-dna.ts          # Style DNA extraction
│   │   ├── supabase.ts           # Shared Supabase utilities
│   │   └── visibility.ts         # Visibility layer sync logic
│   └── middleware.ts             # Auth session middleware (Next.js edge)
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## API Routes

All routes accept `POST` with a JSON body and return JSON. Input validation is
handled by `src/lib/sanitize.ts` — invalid UUIDs, unknown enum values, or
injection-pattern text returns `400 Bad Request`.

### Full Pipeline

**`POST /api/generate`**

Runs the complete staging pipeline sequentially:
`render-to-photo → fitout → furniture → exterior → lighting → harmonize`

After completion, fires quality scoring and AI suggestions asynchronously.

| Field | Type | Required | Notes |
|---|---|---|---|
| `room_id` | UUID | ✅ | |
| `run_type` | `full \| scene_only \| generation_only \| refinement` | — | default `full` |
| `skip_stages` | `string[]` | — | stage keys to skip |
| `time_of_day` | `string` | — | passed to lighting stage |

---

### Individual Generation Stages

**`POST /api/generate/render-to-photo`** — M07: converts room sketch/photo to photorealistic render

**`POST /api/generate/fitout`** — M10: applies flooring, wall finishes, ceiling treatments

**`POST /api/generate/furniture`** — M11: places furniture per scene graph

**`POST /api/generate/exterior`** — M12: generates geolocation-accurate window views

**`POST /api/generate/lighting`** — M08: applies lighting, shadows, time-of-day atmosphere

**`POST /api/generate/harmonize`** — M09: final colour harmonisation pass

All individual stage routes accept: `{ room_id: UUID, run_id?: UUID }`

---

### Scene Analysis

**`POST /api/analyze`**

Analyses an uploaded room image, builds the scene graph, detects windows/furniture/materials.

| Field | Type | Required |
|---|---|---|
| `room_id` | UUID | ✅ |

---

### Design Brief

**`POST /api/design-brief`**

Sends a natural-language design prompt through Claude. The `prompt` field is
sanitized against all 9 prompt injection patterns before being embedded in the LLM
system prompt.

| Field | Type | Required | Notes |
|---|---|---|---|
| `room_id` | UUID | ✅ | |
| `prompt` | string | ✅ | max 4000 chars, injection-safe |
| `style_override` | string | — | max 200 chars |
| `budget_tier` | `economy \| mid-range \| premium \| luxury` | — | default `mid-range` |
| `language` | string | — | response language hint |

---

### Interactive Editing

**`POST /api/edit/submit`** — Validates and records an edit command into `generation.edit_history`

| Field | Type | Required |
|---|---|---|
| `room_id` | UUID | ✅ |
| `parameter_changes` | object | ✅ |
| `suggestion_id` | UUID | — |
| `run_id` | UUID | — |
| `original_prompt` | string | — |
| `source` | `suggestion \| manual` | — |
| `target_elements` | `string[]` | — |

**`POST /api/edit`** — M14: executes a recorded edit, updates the scene graph version

| Field | Type | Required |
|---|---|---|
| `edit_id` | UUID | ✅ |
| `room_id` | UUID | ✅ |

---

### Export

**`POST /api/export`** — M15: converts a generation result to a downloadable file

| Field | Type | Required | Notes |
|---|---|---|---|
| `room_id` | UUID | ✅ | |
| `run_id` | UUID | — | uses latest result if omitted |
| `format` | `png \| jpg \| tiff \| pdf \| zip` | — | default `png` |
| `resolution` | `web \| print_a4 \| print_a3 \| original` | — | default `web` |

Returns a 24-hour signed download URL. File conversion uses Sharp in production
(`ENABLE_SHARP=true`); in mock/dev mode the source file is returned as-is.

---

### Auxiliary Operations

**`POST /api/auxiliary`**

| Field | Type | Required |
|---|---|---|
| `room_id` | UUID | ✅ |
| `run_id` | UUID | ✅ |
| `action` | `declutter \| renovate \| floor_plan` | ✅ |

Additional fields per action: `renovate` requires `target_surface` + `new_material_id`;
`floor_plan` accepts `format: svg \| png \| pdf`.

---

### Other Routes

| Route | Purpose |
|---|---|
| `POST /api/quality` | M18: scores a completed pipeline run |
| `POST /api/suggestions` | Generates AI design improvement suggestions |
| `POST /api/variants` | Generates style variant alternatives |
| `POST /api/visibility/sync` | Syncs client visibility layer state |
| `POST /api/pipeline/batch` | Runs multiple room pipelines in sequence |
| `GET /api/sdk` | Public SDK endpoint for third-party integrations |

---

## Database Schemas

All queries use explicit schema prefixes (e.g. `supabase.schema('core').from('rooms')`).

| Schema | Key Tables |
|---|---|
| `core` | `projects`, `rooms`, `uploads`, `exports` |
| `scene` | `scene_graphs`, `masks`, `layers` |
| `generation` | `pipeline_runs`, `pipeline_stages`, `generation_results`, `edit_history` |
| `knowledge` | `design_styles`, `material_catalog`, `furniture_catalog` |
| `assets` | `asset_library`, `asset_tags` |
| `quality` | `quality_scores`, `quality_reports` |
| `geolocation` | `project_locations`, `window_views`, `city_profiles`, `rendered_views` |

---

## Key Libraries

### `src/lib/sanitize.ts`

Two-layer input protection used by all API routes:

- **Layer 1** — structural validation: UUID format, type checks, enum membership, length limits
- **Layer 2** — prompt injection defense: strips 9 classes of LLM role-separator tokens,
  zero-width characters, and base64 blobs

```typescript
import { validateUUID, sanitizeBrief, assertValidEnum, SanitizeError } from '@/lib/sanitize'
```

### `src/lib/generation.ts`

Core generation helpers:

- `fetchSceneContext(supabase, roomId)` — loads project + room + upload + scene graph
- `getReplicateClient()` — returns Replicate client or `null` (mock mode)
- `runWithFallback(replicate, model, fallback, timeoutMs)` — runs a model with fallback
- `storeGenerationResult(...)` — writes to `generation.generation_results`
- `getSignedUrl(supabase, bucket, path, expiresIn)` — creates a signed Storage URL

### `src/lib/pipeline.ts`

Pipeline lifecycle management:

- `createPipelineRun(supabase, roomId, runType)` — creates a run record
- `createPipelineStage(supabase, runId, stageName)` — creates a stage record
- `updateStageStatus(supabase, stageId, status, metadata?)` — updates stage
- `completePipelineRun(supabase, runId)` — marks run as completed
- `failPipelineRun(supabase, runId, message, stage)` — marks run as failed

---

## Input Validation Error Format

All validation errors return `400 Bad Request` with:

```json
{
  "success": false,
  "error": "room_id must be a valid UUID",
  "code": "INVALID_UUID",
  "field": "room_id"
}
```

Possible `code` values: `INVALID_UUID`, `INVALID_ENUM`, `TOO_LONG`, `TOO_SHORT`,
`REQUIRED`, `TYPE_ERROR`, `OUT_OF_RANGE`, `TOO_MANY`, `INVALID_URL`.

---

## Development Notes

- **Mock mode**: remove or unset `REPLICATE_API_TOKEN` to run without Replicate API calls.
  All pipeline stages produce database records; image generation is skipped.
- **Sharp**: format conversion in `/api/export` requires Sharp (`npm install sharp`).
  Set `ENABLE_SHARP=true` to activate. Not required for development.
- **maxDuration**: long-running routes set `export const maxDuration = 300` (5 min) for
  Vercel serverless functions. Adjust for your deployment target.
- **Schema prefix**: all Supabase queries use `.schema('name')` — do not use the default
  public schema for production tables.
