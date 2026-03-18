// M20 — Smart Staging Public SDK Types
// TypeScript type definitions for the Smart Staging REST API.
// Third-party developers import these types when integrating with Smart Staging.

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

/** Standard Smart Staging API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  /** Machine-readable error code */
  code?: string
  meta: {
    org_id?: string
    /** UUID for tracing this specific request */
    request_id: string
    /** ISO 8601 timestamp */
    timestamp: string
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** A virtual staging generation run */
export interface GenerationRun {
  run_id: string
  room_id: string
  /** Current lifecycle state */
  status: 'queued' | 'processing' | 'quality_check' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  /** Available once status = 'completed' */
  result?: GenerationResult
}

/** The output image(s) from a completed generation run */
export interface GenerationResult {
  result_id: string
  run_id: string
  /** Signed or public URL for the full-resolution output image */
  image_url: string
  /** Optional lower-resolution preview */
  thumbnail_url?: string
  result_type:
    | 'render_to_photo'
    | 'lighting'
    | 'final'
    | 'fitout'
    | 'furniture'
    | 'exterior'
  /** Additional result metadata (model versions used, quality metrics, etc.) */
  metadata: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/** An AI-generated improvement suggestion for a staged render */
export interface RenderSuggestion {
  suggestion_id: string
  run_id: string
  room_id: string
  /** Design category this suggestion targets */
  category:
    | 'composition'
    | 'lighting'
    | 'color_palette'
    | 'furniture'
    | 'decor'
    | 'material'
    | 'scale'
    | 'photography'
    | 'style'
  /** Short human-readable label, e.g. "Add corner plant" */
  title: string
  /** Full explanation of the suggestion */
  description: string
  /** AI confidence in this suggestion, 0.0 – 1.0 */
  confidence: number
  /** Expected visual impact if applied */
  impact: 'low' | 'medium' | 'high'
  /** Current workflow state */
  status: 'pending' | 'accepted' | 'rejected' | 'applied' | 'failed'
}

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

/** Quality assessment report for a completed generation */
export interface QualityReport {
  run_id: string
  /** Weighted composite score, 0.0 – 1.0 */
  overall_score: number
  /** Letter grade derived from overall_score */
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  /** False if any critical failure (e.g. sacred_zone < 0.95 or overall < 0.60) */
  passed: boolean
  scores: {
    /** Structural similarity index (higher = better) */
    photorealism: number
    composition: number
    lighting: number
    color_harmony: number
    /** Must remain ≥ 0.95 — doors, windows, columns must not be altered */
    sacred_zone: number
  }
  /** True if the result should be manually reviewed by a human */
  needs_review: boolean
}

// ---------------------------------------------------------------------------
// Rooms & Projects
// ---------------------------------------------------------------------------

/** A project room that can be virtually staged */
export interface Room {
  room_id: string
  project_id: string
  room_type:
    | 'living_room'
    | 'bedroom'
    | 'dining_room'
    | 'kitchen'
    | 'bathroom'
    | 'office'
    | 'hallway'
    | 'other'
  name: string
  status: string
  created_at?: string
}

// ---------------------------------------------------------------------------
// Generation options
// ---------------------------------------------------------------------------

/** Options passed when triggering a generation */
export interface GenerationOptions {
  /** Override the design style (e.g. 'contemporary', 'scandinavian') */
  style?: string
  /** Skip specific pipeline stages */
  skip_stages?: Array<'fitout' | 'furniture' | 'lighting' | 'harmonize' | 'exterior'>
  /** Job priority — high is processed first in batch queues */
  priority?: 'high' | 'normal' | 'low'
  /** Time-of-day lighting preset */
  time_of_day?: 'golden_hour' | 'midday' | 'twilight' | 'evening' | 'overcast' | 'night'
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** Payload delivered to a registered webhook endpoint */
export interface WebhookEvent<T = unknown> {
  event: WebhookEventType
  /** ISO 8601 timestamp */
  timestamp: string
  org_id: string
  payload: T
}

/** All event types that can be subscribed to via webhooks */
export type WebhookEventType =
  | 'generation.completed'
  | 'generation.failed'
  | 'quality.passed'
  | 'quality.failed'
  | 'suggestions.ready'
  | 'edit.completed'

// ---------------------------------------------------------------------------
// SDK client configuration
// ---------------------------------------------------------------------------

/** Configuration for the Smart Staging SDK client */
export interface SmartStagingConfig {
  /** API key starting with sk_live_ (production) or sk_test_ (sandbox) */
  apiKey: string
  /** Override the API base URL (defaults to https://api.smart-staging.app) */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 300 000) */
  timeout?: number
}

// ---------------------------------------------------------------------------
// SDK client (type contract — implementation is a separate npm package)
// ---------------------------------------------------------------------------

/**
 * Smart Staging SDK Client
 *
 * @example
 * ```ts
 * import { SmartStagingClient } from '@smart-staging/sdk'
 *
 * const client = new SmartStagingClient({ apiKey: 'sk_live_...' })
 *
 * // Trigger generation
 * const run = await client.generate(roomId, { style: 'contemporary' })
 *
 * // Poll until complete
 * let result = await client.getResult(run.run_id)
 * while (result.status !== 'completed') {
 *   await new Promise(r => setTimeout(r, 5000))
 *   result = await client.getResult(run.run_id)
 * }
 *
 * console.log(result.result?.image_url)
 * ```
 */
export class SmartStagingClient {
  constructor(_config: SmartStagingConfig) {
    throw new Error('SmartStagingClient is a type stub. Install @smart-staging/sdk for the implementation.')
  }

  // Generation
  generate(_roomId: string, _options?: GenerationOptions): Promise<GenerationRun> { throw new Error('Not implemented') }
  getResult(_runId: string): Promise<GenerationRun> { throw new Error('Not implemented') }

  // Suggestions
  getSuggestions(_roomId: string): Promise<RenderSuggestion[]> { throw new Error('Not implemented') }
  acceptSuggestion(_suggestionId: string): Promise<GenerationRun> { throw new Error('Not implemented') }
  rejectSuggestion(_suggestionId: string): Promise<void> { throw new Error('Not implemented') }

  // Rooms
  listRooms(_options?: { limit?: number; offset?: number }): Promise<Room[]> { throw new Error('Not implemented') }

  // Webhooks
  registerWebhook(_url: string, _events: WebhookEventType[]): Promise<{ webhook_id: string; signing_secret: string }> { throw new Error('Not implemented') }
  deleteWebhook(_webhookId: string): Promise<void> { throw new Error('Not implemented') }

  // Quality
  getQualityReport(_runId: string): Promise<QualityReport> { throw new Error('Not implemented') }
}
