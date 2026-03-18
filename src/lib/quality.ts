// M18 — Quality Assurance & Validation Pipeline
// Helper functions and types for quality scoring, grading, input screening,
// structured output description, and regression testing.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityReport {
  run_id: string
  room_id: string
  scores: {
    lpips: number
    clip_iqa: number
    ssim: number
    sacred_zone: number
    photorealism: number
    composition: number
    lighting: number
    material: number
    color_harmony: number
    overall: number
  }
  passed: boolean
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  failure_reasons: string[]
  needs_review: boolean
}

export interface OutputDescription {
  furniture_inventory: Array<{
    type: string
    style: string
    material: string
    position: string
  }>
  style_classification: {
    primary: string
    secondary: string
    era: string
  }
  color_palette: {
    dominant: string
    secondary: string[]
    accent: string[]
  }
  alt_text: string
  summary: string
}

export interface ScreeningResult {
  upload_id: string
  passed: boolean
  checks: Record<string, { passed: boolean; confidence: number; details?: string }>
  blocked_reason?: string
  risk_score: number
}

export interface RegressionReport {
  baseline_id: string
  baseline_name: string
  model_version: string
  test_count: number
  passed: boolean
  metric_comparisons: Record<
    string,
    {
      baseline_avg: number
      current_avg: number
      delta: number
      regression: boolean
    }
  >
  summary: string
}

// ---------------------------------------------------------------------------
// Default weight configuration for quality scoring
// ---------------------------------------------------------------------------

export const DEFAULT_WEIGHTS: Record<string, number> = {
  lpips: 0.10,
  clip_iqa: 0.15,
  ssim: 0.08,
  sacred_zone: 0.20,
  photorealism: 0.15,
  composition: 0.08,
  lighting: 0.08,
  material: 0.06,
  color_harmony: 0.05,
  // Remaining 0.05 acts as headroom — overall is capped at 1.0
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/**
 * Calculate an overall weighted score from individual metric scores.
 * Each score and weight should be in the 0-1 range.
 * Returns a value clamped to [0, 1].
 */
export function calculateOverallScore(
  scores: Record<string, number>,
  weights: Record<string, number> = DEFAULT_WEIGHTS
): number {
  let weightedSum = 0
  let totalWeight = 0

  for (const [metric, weight] of Object.entries(weights)) {
    const score = scores[metric]
    if (score !== undefined && score !== null) {
      weightedSum += score * weight
      totalWeight += weight
    }
  }

  if (totalWeight === 0) return 0
  return Math.min(1, Math.max(0, weightedSum / totalWeight))
}

/**
 * Determine a letter grade from the overall score.
 *   A: >= 0.90
 *   B: >= 0.80
 *   C: >= 0.70
 *   D: >= 0.60
 *   F: < 0.60
 */
export function determineGrade(overall: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (overall >= 0.90) return 'A'
  if (overall >= 0.80) return 'B'
  if (overall >= 0.70) return 'C'
  if (overall >= 0.60) return 'D'
  return 'F'
}

/**
 * Determine failure reasons based on individual metric thresholds.
 *
 * Failure rules:
 *   - Sacred zone < 0.95 -> critical failure
 *   - Overall < 0.70 -> below minimum quality
 *   - Any single metric < 0.50 -> individual metric failure
 */
export function determineFailureReasons(
  scores: Record<string, number>
): string[] {
  const reasons: string[] = []

  // Sacred zone is critical
  if (scores.sacred_zone !== undefined && scores.sacred_zone < 0.95) {
    reasons.push(
      `Sacred zone preservation too low (${scores.sacred_zone.toFixed(3)}). Threshold: 0.95. Structural elements may have been altered.`
    )
  }

  // Overall minimum
  if (scores.overall !== undefined && scores.overall < 0.70) {
    reasons.push(
      `Overall quality score below minimum (${scores.overall.toFixed(3)}). Threshold: 0.70.`
    )
  }

  // Individual metric floor
  const metricNames: Record<string, string> = {
    lpips: 'Perceptual similarity (LPIPS)',
    clip_iqa: 'Image quality (CLIP-IQA)',
    ssim: 'Structural similarity (SSIM)',
    sacred_zone: 'Sacred zone preservation',
    photorealism: 'Photorealism',
    composition: 'Composition',
    lighting: 'Lighting consistency',
    material: 'Material accuracy',
    color_harmony: 'Color harmony',
  }

  for (const [metric, label] of Object.entries(metricNames)) {
    const value = scores[metric]
    if (value !== undefined && value < 0.50) {
      reasons.push(`${label} critically low (${value.toFixed(3)}). Minimum: 0.50.`)
    }
  }

  return reasons
}

/**
 * Determine whether the quality report warrants human review.
 * Marginal passes (grade C) or any detected failure trigger review.
 */
export function needsHumanReview(
  passed: boolean,
  grade: string,
  failureReasons: string[]
): boolean {
  if (!passed) return true
  if (grade === 'C' || grade === 'D') return true
  if (failureReasons.length > 0) return true
  return false
}

// ---------------------------------------------------------------------------
// Output description generation
// ---------------------------------------------------------------------------

/**
 * Generate a structured output description for a completed staging result.
 * In production this would use a VLM (e.g., GPT-4V, Claude Vision) to describe
 * the generated image. In mock mode, it builds a plausible description from
 * the scene context and design brief.
 */
export function generateOutputDescription(
  sceneContext: Record<string, unknown> | null,
  brief: Record<string, unknown> | null,
  _results: Record<string, unknown>[] | null
): OutputDescription {
  // Extract what we can from the brief
  const briefData = (brief?.brief_data ?? brief) as Record<string, unknown> | null
  const style = (briefData?.style as string) ?? 'contemporary'
  const palette = (briefData?.color_palette as string[]) ?? []
  const roomType = (sceneContext?.room_type as string) ?? 'living room'

  // Build a plausible furniture inventory from mock analysis
  const furnitureInventory = buildMockFurnitureInventory(roomType, style)

  const styleClassification = {
    primary: style,
    secondary: deriveSecondaryStyle(style),
    era: deriveEra(style),
  }

  const colorPalette = {
    dominant: palette[0] ?? '#F5F0E8',
    secondary: palette.slice(1, 3).length > 0 ? palette.slice(1, 3) : ['#8B7355', '#C5C5C5'],
    accent: palette.slice(3, 5).length > 0 ? palette.slice(3, 5) : ['#C5A55A'],
  }

  const summary = `${capitalize(style)} ${roomType} staging with ${furnitureInventory.length} furniture pieces`

  const altText = generateAltText({
    furniture_inventory: furnitureInventory,
    style_classification: styleClassification,
    color_palette: colorPalette,
    alt_text: '',
    summary,
  })

  return {
    furniture_inventory: furnitureInventory,
    style_classification: styleClassification,
    color_palette: colorPalette,
    alt_text: altText,
    summary,
  }
}

/**
 * Generate an accessibility-focused alt-text description from a structured
 * output description. Designed for screen readers: concise, descriptive,
 * no visual jargon.
 */
export function generateAltText(description: OutputDescription): string {
  const { furniture_inventory, style_classification, color_palette } = description

  const furnitureList = furniture_inventory
    .slice(0, 5)
    .map((f) => `${f.material} ${f.type}`)
    .join(', ')

  const moreCount = Math.max(0, furniture_inventory.length - 5)
  const moreText = moreCount > 0 ? `, and ${moreCount} more items` : ''

  return (
    `Virtually staged ${style_classification.primary} interior featuring ` +
    `${furnitureList}${moreText}. ` +
    `Color scheme: ${color_palette.dominant} dominant with ` +
    `${color_palette.secondary.join(' and ')} accents. ` +
    `${style_classification.era} era ${style_classification.secondary} influence.`
  )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function deriveSecondaryStyle(primary: string): string {
  const map: Record<string, string> = {
    contemporary: 'minimalist',
    modern: 'mid-century',
    traditional: 'classic',
    minimalist: 'scandinavian',
    scandinavian: 'minimalist',
    industrial: 'urban loft',
    farmhouse: 'rustic',
    coastal: 'hamptons',
    bohemian: 'eclectic',
    'mid-century': 'retro modern',
  }
  return map[primary.toLowerCase()] ?? 'transitional'
}

function deriveEra(primary: string): string {
  const map: Record<string, string> = {
    contemporary: '2020s',
    modern: '2010s-2020s',
    traditional: '1990s-2000s',
    minimalist: '2010s',
    scandinavian: '2010s-2020s',
    industrial: '2000s-2010s',
    farmhouse: '2010s',
    coastal: '2010s-2020s',
    bohemian: '2010s',
    'mid-century': '1950s-1960s inspired',
  }
  return map[primary.toLowerCase()] ?? '2020s'
}

function buildMockFurnitureInventory(
  roomType: string,
  style: string
): OutputDescription['furniture_inventory'] {
  const roomFurniture: Record<string, Array<{ type: string; position: string }>> = {
    'living room': [
      { type: 'sofa', position: 'center' },
      { type: 'coffee table', position: 'center-front' },
      { type: 'armchair', position: 'left' },
      { type: 'side table', position: 'right' },
      { type: 'floor lamp', position: 'corner-left' },
      { type: 'area rug', position: 'center-floor' },
    ],
    bedroom: [
      { type: 'bed', position: 'center-back' },
      { type: 'nightstand', position: 'left' },
      { type: 'nightstand', position: 'right' },
      { type: 'dresser', position: 'wall-right' },
      { type: 'table lamp', position: 'left-surface' },
      { type: 'area rug', position: 'center-floor' },
    ],
    'dining room': [
      { type: 'dining table', position: 'center' },
      { type: 'dining chair', position: 'around-table' },
      { type: 'sideboard', position: 'wall-back' },
      { type: 'pendant light', position: 'above-table' },
      { type: 'area rug', position: 'under-table' },
    ],
    kitchen: [
      { type: 'bar stool', position: 'island' },
      { type: 'pendant light', position: 'above-island' },
      { type: 'decorative bowl', position: 'countertop' },
    ],
    bathroom: [
      { type: 'bath mat', position: 'floor' },
      { type: 'towel rack', position: 'wall' },
      { type: 'storage basket', position: 'corner' },
    ],
    office: [
      { type: 'desk', position: 'center-back' },
      { type: 'office chair', position: 'center' },
      { type: 'bookshelf', position: 'wall-left' },
      { type: 'desk lamp', position: 'desk-surface' },
      { type: 'area rug', position: 'center-floor' },
    ],
  }

  const items = roomFurniture[roomType.toLowerCase()] ?? roomFurniture['living room']

  const styleMaterials: Record<string, string[]> = {
    contemporary: ['engineered wood', 'brushed metal', 'performance fabric', 'glass'],
    modern: ['walnut veneer', 'chrome', 'leather', 'tempered glass'],
    traditional: ['solid oak', 'brass', 'velvet', 'marble'],
    minimalist: ['light ash', 'matte steel', 'linen', 'concrete'],
    scandinavian: ['birch', 'powder-coated steel', 'wool', 'ceramic'],
    industrial: ['reclaimed wood', 'iron', 'distressed leather', 'exposed brick'],
    farmhouse: ['distressed pine', 'wrought iron', 'cotton', 'natural stone'],
    coastal: ['white-washed wood', 'rope', 'linen', 'rattan'],
    bohemian: ['mango wood', 'brass', 'kilim fabric', 'macrame'],
    'mid-century': ['teak', 'polished brass', 'tweed', 'formica'],
  }

  const materials = styleMaterials[style.toLowerCase()] ?? styleMaterials.contemporary

  return items.map((item, i) => ({
    type: item.type,
    style,
    material: materials[i % materials.length],
    position: item.position,
  }))
}
