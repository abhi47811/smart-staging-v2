// M19 — Pipeline Infrastructure: Cache, Model Registry, Budget & Telemetry Helpers
// Pure utilities used across the generation pipeline for A/B model selection,
// budget enforcement, room locking, and observability telemetry.

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry {
  key: string
  value: unknown
  hit_at: string
  expires_at: string
  size_bytes: number
}

export interface ModelSelection {
  model_name: string
  version: string
  replicate_model_id: string | null
  config: Record<string, unknown>
  is_ab_test: boolean
  ab_test_id?: string
  variant?: 'model_a' | 'model_b'
}

export interface BudgetCheck {
  allowed: boolean
  remaining_usd: number | null
  warning: boolean
  reason?: string
}

export interface TelemetryEvent {
  run_id: string
  stage_name: string
  event_type: 'start' | 'complete' | 'error' | 'retry' | 'fallback' | 'cache_hit' | 'cache_miss'
  duration_ms?: number
  gpu_memory_peak_mb?: number
  model_version?: string
  cache_hit?: boolean
  cost_usd?: number
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Default model registry fallbacks
// Used when no DB entry exists for a model name.
// ---------------------------------------------------------------------------

const MODEL_DEFAULTS: Record<string, Omit<ModelSelection, 'is_ab_test'>> = {
  flux_pro: {
    model_name: 'flux_pro',
    version: '1.1-pro',
    replicate_model_id: 'black-forest-labs/flux-1.1-pro',
    config: { guidance_scale: 7.5, num_inference_steps: 28 },
  },
  controlnet_depth: {
    model_name: 'controlnet_depth',
    version: '1.0',
    replicate_model_id: 'xlabs-ai/flux-dev-controlnet',
    config: { conditioning_scale: 0.8 },
  },
  ic_light: {
    model_name: 'ic_light',
    version: '1.0',
    replicate_model_id: 'zsxkib/ic-light-background',
    config: {},
  },
  real_esrgan: {
    model_name: 'real_esrgan',
    version: '4x',
    replicate_model_id: 'nightmareai/real-esrgan',
    config: { scale: 4 },
  },
  clip: {
    model_name: 'clip',
    version: 'vit-l-14',
    replicate_model_id: 'openai/clip',
    config: {},
  },
}

// ---------------------------------------------------------------------------
// Cache key generation (djb2 hash — deterministic, no external deps)
// ---------------------------------------------------------------------------

function djb2Hash(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
    h = h >>> 0 // keep as unsigned 32-bit
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * Generate a stable cache key for a generation stage result.
 * Sorting params ensures { a: 1, b: 2 } and { b: 2, a: 1 } produce the same key.
 */
export function generateCacheKey(
  roomId: string,
  briefId: string,
  stageName: string,
  params?: Record<string, unknown>
): string {
  const paramStr = params ? JSON.stringify(Object.fromEntries(Object.entries(params).sort())) : ''
  const raw = `${stageName}:${roomId}:${briefId}:${paramStr}`
  return `${stageName}_${djb2Hash(raw)}`
}

// ---------------------------------------------------------------------------
// Model registry + A/B test routing
// ---------------------------------------------------------------------------

/**
 * Get the active model for a given model name and pipeline stage.
 * Checks for live A/B tests and assigns variants deterministically.
 * Falls back to hardcoded defaults if no DB entry exists.
 */
export async function getActiveModel(
  supabase: SupabaseClient,
  modelName: string,
  stageName: string
): Promise<ModelSelection> {
  // Fetch active registry entry
  const { data: registry } = await supabase
    .schema('generation')
    .from('model_registry')
    .select('*')
    .eq('model_name', modelName)
    .eq('status', 'active')
    .limit(1)
    .single()

  const base = registry
    ? {
        model_name: registry.model_name as string,
        version: registry.version as string,
        replicate_model_id: registry.replicate_model_id as string | null,
        config: (registry.config ?? {}) as Record<string, unknown>,
      }
    : (MODEL_DEFAULTS[modelName] ?? {
        model_name: modelName,
        version: 'unknown',
        replicate_model_id: null,
        config: {},
      })

  // Check for active A/B test on this stage
  const { data: abTest } = await supabase
    .schema('generation')
    .from('ab_tests')
    .select('*')
    .eq('stage_name', stageName)
    .eq('status', 'active')
    .lt('samples_collected', 'samples_target')
    .limit(1)
    .single()

  if (!abTest) {
    return { ...base, is_ab_test: false }
  }

  // Assign variant: deterministic split based on current timestamp parity
  const variant: 'model_a' | 'model_b' =
    Date.now() % 100 < (abTest.traffic_split_pct as number) ? 'model_a' : 'model_b'

  // Increment samples_collected (best effort)
  supabase
    .schema('generation')
    .from('ab_tests')
    .update({ samples_collected: (abTest.samples_collected as number) + 1 })
    .eq('id', abTest.id)
    .then(() => {})

  // Fetch the variant's model from registry
  const variantModelId = variant === 'model_a' ? abTest.model_a_id : abTest.model_b_id
  const { data: variantModel } = await supabase
    .schema('generation')
    .from('model_registry')
    .select('*')
    .eq('id', variantModelId)
    .single()

  if (variantModel) {
    return {
      model_name: variantModel.model_name as string,
      version: variantModel.version as string,
      replicate_model_id: variantModel.replicate_model_id as string | null,
      config: (variantModel.config ?? {}) as Record<string, unknown>,
      is_ab_test: true,
      ab_test_id: abTest.id as string,
      variant,
    }
  }

  return { ...base, is_ab_test: true, ab_test_id: abTest.id as string, variant }
}

// ---------------------------------------------------------------------------
// Budget enforcement
// ---------------------------------------------------------------------------

/**
 * Check if a generation is within the organization's monthly spend budget.
 * Returns allowed=true if no budget is configured.
 */
export async function checkBudget(
  supabase: SupabaseClient,
  orgId: string,
  estimatedCostUsd: number
): Promise<BudgetCheck> {
  const { data: budget } = await supabase
    .schema('core')
    .from('org_budgets')
    .select('*')
    .eq('org_id', orgId)
    .single()

  if (!budget) return { allowed: true, remaining_usd: null, warning: false }

  const limit = budget.monthly_limit_usd as number | null
  if (!limit) return { allowed: true, remaining_usd: null, warning: false }

  const spent = (budget.current_month_spend as number) ?? 0
  const remaining = limit - spent
  const projectedSpend = spent + estimatedCostUsd
  const warnThreshold = limit * ((budget.warning_threshold_pct as number) / 100)

  if (projectedSpend > limit) {
    return {
      allowed: false,
      remaining_usd: remaining,
      warning: true,
      reason: `Monthly budget of $${limit.toFixed(2)} would be exceeded. Spent: $${spent.toFixed(2)}, Estimated: $${estimatedCostUsd.toFixed(2)}.`,
    }
  }

  return {
    allowed: true,
    remaining_usd: remaining - estimatedCostUsd,
    warning: projectedSpend >= warnThreshold,
  }
}

// ---------------------------------------------------------------------------
// Room locking (prevents concurrent edits / generations)
// ---------------------------------------------------------------------------

/**
 * Acquire a lock on a room before starting generation or editing.
 * Returns true if the lock was acquired, false if the room is already locked.
 */
export async function acquireRoomLock(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
  lockType: 'exclusive' | 'shared' = 'exclusive'
): Promise<boolean> {
  // Check for an existing non-expired lock
  const { data: existing } = await supabase
    .schema('core')
    .from('room_locks')
    .select('locked_by, lock_type, expires_at')
    .eq('room_id', roomId)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (existing) {
    // Exclusive lock blocks everything
    if (existing.lock_type === 'exclusive') return false
    // Shared lock blocks new exclusive locks
    if (lockType === 'exclusive') return false
    // Shared + shared is OK — proceed
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error } = await supabase
    .schema('core')
    .from('room_locks')
    .upsert({
      room_id: roomId,
      locked_by: userId,
      lock_type: lockType,
      acquired_at: new Date().toISOString(),
      expires_at: expiresAt,
    })

  return !error
}

/**
 * Release a room lock held by a specific user.
 */
export async function releaseRoomLock(
  supabase: SupabaseClient,
  roomId: string,
  userId: string
): Promise<void> {
  await supabase
    .schema('core')
    .from('room_locks')
    .delete()
    .eq('room_id', roomId)
    .eq('locked_by', userId)
}

// ---------------------------------------------------------------------------
// Telemetry (fire-and-forget, never blocks the pipeline)
// ---------------------------------------------------------------------------

/**
 * Log a pipeline telemetry event. Fire-and-forget — errors are swallowed
 * so telemetry never causes generation failures.
 */
export function logTelemetry(
  supabase: SupabaseClient,
  event: TelemetryEvent
): void {
  supabase
    .schema('generation')
    .from('pipeline_telemetry')
    .insert({
      run_id: event.run_id,
      stage_name: event.stage_name,
      event_type: event.event_type,
      duration_ms: event.duration_ms ?? null,
      gpu_memory_peak_mb: event.gpu_memory_peak_mb ?? null,
      model_version: event.model_version ?? null,
      cache_hit: event.cache_hit ?? false,
      cost_usd: event.cost_usd ?? null,
      metadata: event.metadata ?? {},
    })
    .then(() => {})
    .catch(() => {})
}
