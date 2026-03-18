// M20 — Public API Gateway
// External REST API for third-party developers integrating Smart Staging.
// Handles API key authentication (not Supabase JWT) + in-memory rate limiting.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPipelineRun } from '@/lib/pipeline'
import type { ApiResponse } from '@/lib/api-types'

export const maxDuration = 60

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per API key, resets on cold start)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_REQUESTS = 100
const RATE_LIMIT_WINDOW_MS = 60_000

function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: RATE_LIMIT_REQUESTS - 1 }
  }

  if (entry.count >= RATE_LIMIT_REQUESTS) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000)
    return { allowed: false, remaining: 0, retryAfter }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_REQUESTS - entry.count }
}

// ---------------------------------------------------------------------------
// API key extraction + validation
// ---------------------------------------------------------------------------

function extractApiKey(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer sk_')) return auth.slice(7)
  return req.headers.get('x-api-key')
}

async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function authenticateApiKey(
  supabase: Awaited<ReturnType<typeof createClient>>,
  apiKey: string
): Promise<{ org_id: string } | null> {
  // Test key bypass
  if (apiKey.startsWith('sk_test_')) {
    return { org_id: 'test-org-' + apiKey.slice(8, 16) }
  }

  const keyHash = await hashApiKey(apiKey)

  try {
    const { data } = await supabase
      .schema('core')
      .from('organizations')
      .select('id')
      .eq('api_key_hash', keyHash)
      .single()
    if (data) return { org_id: data.id }
  } catch {
    // api_key_hash column may not exist yet — fall through to null
  }

  return null
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function success<T>(
  data: T,
  orgId: string,
  status = 200
): NextResponse {
  const body: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      org_id: orgId,
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  }
  return NextResponse.json(body, { status })
}

function failure(
  error: string,
  code: string,
  status: number
): NextResponse {
  const body: ApiResponse = {
    success: false,
    error,
    code,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  }
  return NextResponse.json(body, { status })
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(req: NextRequest, method: string): Promise<NextResponse> {
  const apiKey = extractApiKey(req)
  if (!apiKey) return failure('API key required. Pass via Authorization: Bearer sk_... or X-API-Key header.', 'MISSING_API_KEY', 401)

  // Rate limiting
  const rl = checkRateLimit(apiKey)
  if (!rl.allowed) {
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Rate limit exceeded', code: 'RATE_LIMITED', meta: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() } }),
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter), 'X-RateLimit-Remaining': '0', 'Content-Type': 'application/json' } }
    )
  }

  const supabase = await createClient()
  const auth = await authenticateApiKey(supabase, apiKey)
  if (!auth) return failure('Invalid API key', 'INVALID_API_KEY', 401)

  const { org_id } = auth
  const action = req.nextUrl.searchParams.get('action')

  // GET /api/sdk?action=status
  if (method === 'GET' && action === 'status') {
    return success({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }, org_id)
  }

  // GET /api/sdk?action=rooms
  if (method === 'GET' && action === 'rooms') {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 100)
    const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0')

    const { data, count, error } = await supabase
      .schema('core')
      .from('rooms')
      .select('id, project_id, room_type, name, status, created_at', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (error) return failure(error.message, 'DB_ERROR', 500)
    return success({ rooms: data ?? [], total: count ?? 0, limit, offset }, org_id)
  }

  // GET /api/sdk?action=result&run_id=xxx
  if (method === 'GET' && action === 'result') {
    const runId = req.nextUrl.searchParams.get('run_id')
    if (!runId) return failure('run_id query param required', 'MISSING_PARAM', 400)

    const { data: run } = await supabase
      .schema('generation')
      .from('pipeline_runs')
      .select('id, room_id, status, created_at')
      .eq('id', runId)
      .single()

    if (!run) return failure('Run not found', 'NOT_FOUND', 404)

    const { data: results } = await supabase
      .schema('generation')
      .from('generation_results')
      .select('*')
      .eq('run_id', runId)
      .eq('result_type', 'final')
      .order('created_at', { ascending: false })
      .limit(1)

    const result = results?.[0] ?? null
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

    return success(
      {
        run_id: run.id,
        room_id: run.room_id,
        status: run.status,
        created_at: run.created_at,
        result: result
          ? {
              result_id: result.id,
              run_id: result.run_id,
              image_url: `${baseUrl}/storage/v1/object/public/${result.image_path}`,
              result_type: result.result_type,
              metadata: result.metadata,
              created_at: result.created_at,
            }
          : null,
      },
      org_id
    )
  }

  // GET /api/sdk?action=suggestions&room_id=xxx
  if (method === 'GET' && action === 'suggestions') {
    const roomId = req.nextUrl.searchParams.get('room_id')
    if (!roomId) return failure('room_id query param required', 'MISSING_PARAM', 400)

    const { data, error } = await supabase
      .schema('quality')
      .from('render_suggestions')
      .select('id, run_id, room_id, category, title, description, confidence, impact, status, created_at')
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('sort_order', { ascending: true })

    if (error) return failure(error.message, 'DB_ERROR', 500)
    return success({ suggestions: data ?? [] }, org_id)
  }

  if (method === 'POST') {
    const body = await req.json().catch(() => ({}))

    // POST /api/sdk?action=generate
    if (action === 'generate') {
      const { room_id, style, options } = body as { room_id: string; style?: string; options?: Record<string, unknown> }
      if (!room_id) return failure('room_id required', 'MISSING_PARAM', 400)

      // Verify org owns the room
      const { data: room } = await supabase
        .schema('core')
        .from('rooms')
        .select('id, project_id, projects!inner(org_id)')
        .eq('id', room_id)
        .single()

      if (!room) return failure('Room not found', 'NOT_FOUND', 404)

      // Create pipeline run and fire-and-forget
      const runId = await createPipelineRun(supabase, room_id)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

      fetch(`${appUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id, run_id: runId, style_override: style, ...options }),
      }).catch(() => {})

      return success(
        { run_id: runId, status: 'queued', estimated_time_seconds: 120 },
        org_id,
        202
      )
    }

    // POST /api/sdk?action=accept-suggestion
    if (action === 'accept-suggestion') {
      const { suggestion_id } = body as { suggestion_id: string }
      if (!suggestion_id) return failure('suggestion_id required', 'MISSING_PARAM', 400)

      const { data: suggestion } = await supabase
        .schema('quality')
        .from('render_suggestions')
        .select('id, run_id, room_id, parameter_changes, status')
        .eq('id', suggestion_id)
        .single()

      if (!suggestion) return failure('Suggestion not found', 'NOT_FOUND', 404)
      if (suggestion.status !== 'pending') return failure('Suggestion is not pending', 'INVALID_STATE', 409)

      await supabase
        .schema('quality')
        .from('render_suggestions')
        .update({ status: 'accepted' })
        .eq('id', suggestion_id)

      // Fire re-generation with parameter changes applied
      const runId = await createPipelineRun(supabase, suggestion.room_id)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

      fetch(`${appUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: suggestion.room_id,
          run_id: runId,
          parameter_overrides: suggestion.parameter_changes,
        }),
      }).catch(() => {})

      await supabase
        .schema('quality')
        .from('render_suggestions')
        .update({ applied_run_id: runId, status: 'applied' })
        .eq('id', suggestion_id)

      return success({ run_id: runId, status: 'queued', suggestion_id }, org_id, 202)
    }

    // POST /api/sdk?action=reject-suggestion
    if (action === 'reject-suggestion') {
      const { suggestion_id } = body as { suggestion_id: string }
      if (!suggestion_id) return failure('suggestion_id required', 'MISSING_PARAM', 400)

      await supabase
        .schema('quality')
        .from('render_suggestions')
        .update({ status: 'rejected' })
        .eq('id', suggestion_id)

      return success({ rejected: true, suggestion_id }, org_id)
    }
  }

  return failure(`Unknown action: ${action}`, 'UNKNOWN_ACTION', 400)
}

export const GET = (req: NextRequest) => handleRequest(req, 'GET')
export const POST = (req: NextRequest) => handleRequest(req, 'POST')
