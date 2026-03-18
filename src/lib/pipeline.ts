// Pipeline management helpers for generation.pipeline_runs and generation.pipeline_stages
// All operations target the `generation` schema.

import { SupabaseClient } from '@supabase/supabase-js'

type PipelineRunType = 'full' | 'scene_only' | 'generation_only' | 'refinement'
type PipelineStatus = 'running' | 'completed' | 'failed' | 'cancelled'
type StageStatus = 'running' | 'completed' | 'failed' | 'skipped'

interface PipelineRun {
  id: string
  room_id: string
  run_type: PipelineRunType
  status: PipelineStatus
  started_at: string
}

interface PipelineStage {
  id: string
  run_id: string
  stage_name: string
  status: StageStatus
  started_at: string
}

/**
 * Create a new pipeline run record.
 */
export async function createPipelineRun(
  supabase: SupabaseClient,
  roomId: string,
  runType: PipelineRunType
): Promise<PipelineRun> {
  const { data, error } = await supabase
    .schema('generation')
    .from('pipeline_runs')
    .insert({
      room_id: roomId,
      run_type: runType,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create pipeline run: ${error.message}`)
  return data as PipelineRun
}

/**
 * Create a new pipeline stage record within a run.
 */
export async function createPipelineStage(
  supabase: SupabaseClient,
  runId: string,
  stageName: string
): Promise<PipelineStage> {
  const { data, error } = await supabase
    .schema('generation')
    .from('pipeline_stages')
    .insert({
      run_id: runId,
      stage_name: stageName,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create pipeline stage: ${error.message}`)
  return data as PipelineStage
}

/**
 * Update a stage's status, optional metrics, and output artifacts.
 */
export async function updateStageStatus(
  supabase: SupabaseClient,
  stageId: string,
  status: StageStatus,
  metrics?: Record<string, unknown>,
  outputArtifacts?: Record<string, unknown>
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    completed_at: status === 'running' ? null : new Date().toISOString(),
  }
  if (metrics !== undefined) updates.metrics = metrics
  if (outputArtifacts !== undefined) updates.output_artifacts = outputArtifacts

  const { error } = await supabase
    .schema('generation')
    .from('pipeline_stages')
    .update(updates)
    .eq('id', stageId)

  if (error) throw new Error(`Failed to update pipeline stage: ${error.message}`)
}

/**
 * Mark a pipeline run as completed and calculate total duration.
 */
export async function completePipelineRun(
  supabase: SupabaseClient,
  runId: string,
  status: 'completed' | 'cancelled' = 'completed'
): Promise<void> {
  // Fetch the run to calculate duration
  const { data: run, error: fetchError } = await supabase
    .schema('generation')
    .from('pipeline_runs')
    .select('started_at')
    .eq('id', runId)
    .single()

  if (fetchError) throw new Error(`Failed to fetch pipeline run: ${fetchError.message}`)

  const startedAt = new Date(run.started_at).getTime()
  const durationMs = Date.now() - startedAt

  const { error } = await supabase
    .schema('generation')
    .from('pipeline_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    })
    .eq('id', runId)

  if (error) throw new Error(`Failed to complete pipeline run: ${error.message}`)
}

/**
 * Mark a pipeline run as failed with error details.
 */
export async function failPipelineRun(
  supabase: SupabaseClient,
  runId: string,
  errorMessage: string,
  errorStage: string
): Promise<void> {
  // Fetch the run to calculate duration
  const { data: run, error: fetchError } = await supabase
    .schema('generation')
    .from('pipeline_runs')
    .select('started_at')
    .eq('id', runId)
    .single()

  const durationMs = fetchError
    ? null
    : Date.now() - new Date(run.started_at).getTime()

  const { error } = await supabase
    .schema('generation')
    .from('pipeline_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      error_message: errorMessage,
      error_stage: errorStage,
    })
    .eq('id', runId)

  if (error) throw new Error(`Failed to update pipeline run as failed: ${error.message}`)
}
