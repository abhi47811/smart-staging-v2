/**
 * Smart Staging v2 — Replicate API helper
 *
 * BLOCKER FIX: Replicate output URLs expire in ~1 hour.
 * Every call to runReplicateAndPersist() immediately downloads the output
 * and uploads it to Supabase Storage for a permanent, non-expiring URL.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const REPLICATE_BASE = 'https://api.replicate.com/v1'
const STORAGE_BUCKET = 'pipeline'

export interface ReplicateInput {
  [key: string]: unknown
}

export interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output: string[] | null
  error: string | null
  metrics?: { predict_time?: number }
}

// ─── Model version IDs (configurable via env) ────────────────────────────────
export const MODELS = {
  // M04/M05 — Scene Understanding
  DEPTH_ANYTHING_V2: process.env.REPLICATE_MODEL_DEPTH ?? 'depth-anything/depth-anything-v2',
  GROUNDED_SAM2: process.env.REPLICATE_MODEL_SAM ?? 'idea-research/grounded-sam-2',
  // M07 — Render-to-Photo
  CONTROLNET_STAGING: process.env.REPLICATE_MODEL_CONTROLNET ?? 'stability-ai/stable-diffusion-img2img',
  CONTROLNET_INPAINT: process.env.REPLICATE_MODEL_INPAINT ?? 'stability-ai/stable-diffusion-inpainting',
  // M10 — Fitout Generation
  SDXL_INPAINT: process.env.REPLICATE_MODEL_SDXL ?? 'stability-ai/sdxl',
  // Quality / Post-processing
  REAL_ESRGAN: process.env.REPLICATE_MODEL_UPSCALE ?? 'nightmareai/real-esrgan',
  CLIP_FEATURES: process.env.REPLICATE_MODEL_CLIP ?? 'andreasjansson/clip-features',
} as const

// ─── Core runner ─────────────────────────────────────────────────────────────
async function startPrediction(model: string, input: ReplicateInput): Promise<ReplicatePrediction> {
  const apiKey = process.env.REPLICATE_API_KEY ?? process.env.REPLICATE_API_TOKEN
  if (!apiKey) throw new Error('REPLICATE_API_KEY is not configured')

  // Model can be "owner/name" or "owner/name:version-hash"
  const hasVersion = model.includes(':')
  const url = hasVersion
    ? `${REPLICATE_BASE}/predictions`
    : `${REPLICATE_BASE}/models/${model}/predictions`

  const body: Record<string, unknown> = { input }
  if (hasVersion) body.version = model.split(':')[1]

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${apiKey}`,
      Prefer: 'wait', // Ask Replicate for synchronous response (up to 60s)
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Replicate start prediction failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<ReplicatePrediction>
}

async function pollUntilDone(id: string, maxWaitMs = 600_000): Promise<ReplicatePrediction> {
  const apiKey = process.env.REPLICATE_API_KEY ?? process.env.REPLICATE_API_TOKEN!
  const deadline = Date.now() + maxWaitMs
  let interval = 2000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval))
    interval = Math.min(interval * 1.5, 10_000) // exponential back-off, cap at 10s

    const res = await fetch(`${REPLICATE_BASE}/predictions/${id}`, {
      headers: { Authorization: `Token ${apiKey}` },
    })
    const pred: ReplicatePrediction = await res.json()

    if (pred.status === 'succeeded' || pred.status === 'failed' || pred.status === 'canceled') {
      return pred
    }
  }

  // Best-effort cancel on timeout
  try {
    await fetch(`${REPLICATE_BASE}/predictions/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}` },
    })
  } catch { /* ignore */ }

  throw new Error(`Replicate prediction ${id} timed out after ${maxWaitMs}ms`)
}

/** Run a Replicate model synchronously — blocks until complete */
export async function runReplicate(
  model: string,
  input: ReplicateInput
): Promise<ReplicatePrediction> {
  const pred = await startPrediction(model, input)

  if (pred.status === 'succeeded') return pred
  if (pred.status === 'failed' || pred.status === 'canceled') {
    throw new Error(`Replicate prediction ${pred.status}: ${pred.error ?? 'unknown'}`)
  }

  const final = await pollUntilDone(pred.id)
  if (final.status !== 'succeeded') {
    throw new Error(`Replicate prediction ${final.status}: ${final.error ?? 'unknown'}`)
  }
  return final
}

// ─── Storage persistence — Blocker #1 Fix ────────────────────────────────────
/**
 * Download a (soon-to-expire) Replicate output URL and persist to Supabase Storage.
 * Returns the permanent public URL.
 */
export async function persistOutputUrl(
  supabase: SupabaseClient,
  replicateUrl: string,
  storagePath: string,
  bucket = STORAGE_BUCKET
): Promise<string> {
  const res = await fetch(replicateUrl)
  if (!res.ok) {
    throw new Error(`Failed to download Replicate output (${res.status}): ${replicateUrl}`)
  }

  const contentType = res.headers.get('content-type') ?? 'image/png'
  const buffer = await res.arrayBuffer()

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType, upsert: true })

  if (error) throw new Error(`Supabase Storage upload failed [${storagePath}]: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath)
  return publicUrl
}

/**
 * Run Replicate + immediately persist ALL outputs to Supabase Storage.
 * This is the primary function to use — it fixes URL expiration.
 * Returns { prediction, permanentUrls } where permanentUrls never expire.
 */
export async function runReplicateAndPersist(
  supabase: SupabaseClient,
  model: string,
  input: ReplicateInput,
  storageBasePath: string,
  bucket = STORAGE_BUCKET
): Promise<{ prediction: ReplicatePrediction; permanentUrls: string[] }> {
  const prediction = await runReplicate(model, input)

  if (!prediction.output?.length) {
    throw new Error(`Replicate model ${model} returned no output images`)
  }

  // Persist all output images concurrently
  const permanentUrls = await Promise.all(
    prediction.output.map((url, i) =>
      persistOutputUrl(supabase, url, `${storageBasePath}_${i}.png`, bucket)
    )
  )

  return { prediction, permanentUrls }
}

// ─── ReplicateClient class ──────────────────────────────────────────────────────
/**
 * Class wrapper around the functional Replicate API helpers.
 * Imported by generation.ts so it can call createPrediction / waitForPrediction / runModel.
 */
export class ReplicateClient {
  /** Start a prediction and return its ID. version param is accepted but ignored (use model:sha format). */
  async createPrediction(
    model: string,
    _version: string,
    input: ReplicateInput
  ): Promise<{ id: string }> {
    const pred = await startPrediction(model, input)
    return { id: pred.id }
  }

  /** Poll until the prediction is done and return the full prediction object. */
  async waitForPrediction(id: string, maxWaitMs = 600_000): Promise<ReplicatePrediction> {
    return pollUntilDone(id, maxWaitMs)
  }

  /** Run a model synchronously — blocks until succeeded or throws. */
  async runModel(
    model: string,
    _version: string,
    input: ReplicateInput
  ): Promise<unknown> {
    const pred = await runReplicate(model, input)
    return pred.output
  }
}
