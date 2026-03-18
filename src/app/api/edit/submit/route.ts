// /api/edit/submit — Edit submission wrapper.
//
// The base /api/edit route requires an existing generation.edit_history row (edit_id).
// This wrapper handles the full "Apply suggestion" flow in one call:
//   1. Infers action from parameter_changes
//   2. Inserts the edit_history row (status: pending)
//   3. Calls /api/edit to execute the edit
//   4. Marks the source suggestion as 'applied' (if suggestion_id provided)
//   5. Returns the result
//
// Called by SuggestionApplyButton client component.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  validateUUID,
  sanitizeText,
  assertValidEnum,
  sanitizeStringArray,
  SanitizeError,
  sanitizeErrorResponse,
} from '@/lib/sanitize'

export const maxDuration = 120

// ---------------------------------------------------------------------------
// Action inference
// ---------------------------------------------------------------------------

/**
 * Derive an edit action name from the suggestion's parameter_changes keys.
 * The edit engine's switch statement handles: swap, move, resize,
 * material_change, color_change, style_change, remove, add.
 */
function inferAction(parameterChanges: Record<string, unknown>): string {
  const keys = Object.keys(parameterChanges)
  if (keys.includes('add_elements'))   return 'add'
  if (keys.includes('remove_elements')) return 'remove'
  if (keys.includes('swap'))            return 'swap'
  if (keys.includes('material'))        return 'material_change'
  if (keys.includes('new_material'))    return 'material_change'
  if (keys.includes('color'))           return 'color_change'
  if (keys.includes('new_color'))       return 'color_change'
  if (keys.includes('move'))            return 'move'
  if (keys.includes('resize'))          return 'resize'
  // lighting, style, photography, composition tweaks → style_change
  return 'style_change'
}

// ---------------------------------------------------------------------------
// POST /api/edit/submit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()

    // Gap 3 — structural + injection validation
    const room_id         = validateUUID(body.room_id, 'room_id')
    const suggestion_id   = body.suggestion_id ? validateUUID(body.suggestion_id, 'suggestion_id') : undefined
    const run_id          = body.run_id         ? validateUUID(body.run_id, 'run_id')             : undefined
    const original_prompt = body.original_prompt
      ? sanitizeText(body.original_prompt, 'original_prompt', { maxLength: 2000, blockPromptInjection: true })
      : undefined
    const source          = body.source
      ? assertValidEnum(body.source, ['suggestion', 'manual'] as const, 'source')
      : undefined
    const target_elements = body.target_elements
      ? sanitizeStringArray(body.target_elements, 'target_elements', { maxItems: 50, maxItemLength: 200 })
      : undefined

    const parameter_changes: Record<string, unknown> = body.parameter_changes
    if (!parameter_changes || typeof parameter_changes !== 'object') {
      return NextResponse.json({ error: 'parameter_changes is required' }, { status: 400 })
    }

    // ── 1. Infer action and build the edit_command ──────────────────────────
    const action = inferAction(parameter_changes)

    const editCommand = {
      action,
      target_query: original_prompt ?? `Apply ${action}`,
      target_elements: target_elements ?? [],
      parameters: parameter_changes,
      confidence: 0.9,
      source: source ?? (suggestion_id ? 'suggestion' : 'manual'),
      suggestion_id: suggestion_id ?? null,
    }

    // ── 2. Insert into generation.edit_history ─────────────────────────────
    const { data: editRow, error: insertError } = await supabase
      .schema('generation')
      .from('edit_history')
      .insert({
        room_id,
        run_id: run_id ?? null,
        edit_command: editCommand,
        original_prompt: original_prompt ?? null,
        action,
        target_elements: target_elements ?? [],
        scope: (target_elements?.length ?? 0) === 0 ? 'room' : 'single_element',
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !editRow) {
      return NextResponse.json(
        { error: `Failed to create edit record: ${insertError?.message ?? 'unknown'}` },
        { status: 500 }
      )
    }

    const editId = editRow.id as string

    // ── 3. Execute via /api/edit (internal fetch) ──────────────────────────
    // Use the request host to build the absolute URL (required for server-to-server calls in Next.js)
    const host = request.headers.get('host') ?? 'localhost:3000'
    const protocol = host.startsWith('localhost') ? 'http' : 'https'
    const editUrl = `${protocol}://${host}/api/edit`

    const editRes = await fetch(editUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward cookies so the Supabase auth session is preserved
        cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ edit_id: editId, room_id }),
    })

    const editData = await editRes.json()

    if (!editRes.ok) {
      // Edit execution failed — mark history row as failed and return
      await supabase
        .schema('generation')
        .from('edit_history')
        .update({ status: 'failed' })
        .eq('id', editId)

      return NextResponse.json(
        { error: editData.error ?? `Edit execution failed (${editRes.status})` },
        { status: 500 }
      )
    }

    // ── 4. Mark suggestion as applied ─────────────────────────────────────
    if (suggestion_id) {
      await supabase
        .schema('quality')
        .from('render_suggestions')
        .update({ status: 'applied' })
        .eq('id', suggestion_id)
    }

    // ── 5. Return ──────────────────────────────────────────────────────────
    return NextResponse.json({
      status: 'completed',
      edit_id: editId,
      room_id,
      action,
      result: editData,
    })
  } catch (err) {
    if (err instanceof SanitizeError) {
      return NextResponse.json(sanitizeErrorResponse(err), { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Edit submission failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
