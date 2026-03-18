// Style DNA helpers for M16 (Multi-Variant & Style Intelligence)
// Provides extraction, application, comparison, and variation generation.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StyleDNAData {
  color_palette: {
    dominant: string[]   // hex colors
    secondary: string[]
    accent: string[]
    warmth: 'warm' | 'cool' | 'neutral'
  }
  material_vocabulary: Array<{
    material_id: string
    usage: string        // floor, walls, furniture, etc.
    frequency: number    // 0-1 how often used
  }>
  furniture_language: {
    primary_style: string
    substyle: string
    era_range: string
    proportion_preference: 'compact' | 'standard' | 'generous'
    density: 'minimal' | 'moderate' | 'rich'
  }
  photography_mood: {
    color_grading: string
    lighting_style: string
    grain_level: number
    contrast_preference: 'soft' | 'medium' | 'punchy'
  }
  cultural_elements: string[]
  spatial_density: number  // 0-1
}

export interface StyleComparison {
  compatible: boolean
  conflicts: string[]        // list of conflicting aspects
  similarity_score: number   // 0-1
}

export interface VariationParam {
  variant_index: number
  style_override?: string
  palette_shift?: string    // 'warmer', 'cooler', 'bolder', 'muted'
  density_override?: string // 'minimal', 'moderate', 'rich'
  description: string       // human-readable description of this variant
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!match) return null
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  }
}

function colorWarmth(hexColors: string[]): 'warm' | 'cool' | 'neutral' {
  let totalWarmth = 0
  let count = 0
  for (const hex of hexColors) {
    const rgb = hexToRgb(hex)
    if (!rgb) continue
    // Warm = more red/yellow, Cool = more blue
    totalWarmth += (rgb.r - rgb.b) / 255
    count++
  }
  if (count === 0) return 'neutral'
  const avg = totalWarmth / count
  if (avg > 0.1) return 'warm'
  if (avg < -0.1) return 'cool'
  return 'neutral'
}

function colorDistance(hex1: string, hex2: string): number {
  const a = hexToRgb(hex1)
  const b = hexToRgb(hex2)
  if (!a || !b) return 1
  const dr = (a.r - b.r) / 255
  const dg = (a.g - b.g) / 255
  const db = (a.b - b.b) / 255
  return Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3)
}

function shiftColor(hex: string, shift: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  let { r, g, b } = rgb
  switch (shift) {
    case 'warmer':
      r = Math.min(255, r + 15)
      b = Math.max(0, b - 10)
      break
    case 'cooler':
      b = Math.min(255, b + 15)
      r = Math.max(0, r - 10)
      break
    case 'bolder':
      // Increase saturation — push channels away from grey
      { const avg = (r + g + b) / 3
        r = Math.min(255, Math.max(0, Math.round(r + (r - avg) * 0.3)))
        g = Math.min(255, Math.max(0, Math.round(g + (g - avg) * 0.3)))
        b = Math.min(255, Math.max(0, Math.round(b + (b - avg) * 0.3))) }
      break
    case 'muted':
      // Decrease saturation — push channels toward grey
      { const avg2 = (r + g + b) / 3
        r = Math.round(r + (avg2 - r) * 0.3)
        g = Math.round(g + (avg2 - g) * 0.3)
        b = Math.round(b + (avg2 - b) * 0.3) }
      break
  }
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ---------------------------------------------------------------------------
// extractStyleDNA
// ---------------------------------------------------------------------------

/**
 * Extract Style DNA from a completed generation's design brief, results,
 * and scene context. In mock mode this extracts directly from brief_data;
 * in production this would also use CLIP embeddings and VLM descriptions.
 */
export function extractStyleDNA(
  brief: Record<string, unknown>,
  results: Array<Record<string, unknown>>,
  sceneContext: Record<string, unknown>
): StyleDNAData {
  const briefData = (brief.brief_data ?? brief) as Record<string, unknown>

  // --- Color palette ---
  const colorPalette = briefData.color_palette as Record<string, unknown> | undefined
  let dominant: string[] = []
  let secondary: string[] = []
  let accent: string[] = []

  if (colorPalette) {
    const domEntry = colorPalette.dominant as Record<string, unknown> | undefined
    const secEntry = colorPalette.secondary as Record<string, unknown> | undefined
    const accEntry = colorPalette.accent as Record<string, unknown> | undefined
    if (domEntry?.hex) dominant = [domEntry.hex as string]
    if (secEntry?.hex) secondary = [secEntry.hex as string]
    if (accEntry?.hex) accent = [accEntry.hex as string]
  }

  const allColors = [...dominant, ...secondary, ...accent]
  const warmth = colorWarmth(allColors)

  // --- Material vocabulary ---
  const materialsPalette = briefData.materials_palette as Record<string, string> | undefined
  const materialVocab: StyleDNAData['material_vocabulary'] = []
  if (materialsPalette) {
    for (const [usage, materialId] of Object.entries(materialsPalette)) {
      materialVocab.push({
        material_id: materialId,
        usage,
        frequency: usage === 'floor' || usage === 'walls' ? 0.9 : 0.5,
      })
    }
  }

  // Enrich from scene context material detections
  const materialDetections = (sceneContext.materialDetections ?? []) as Array<Record<string, unknown>>
  for (const det of materialDetections) {
    const existing = materialVocab.find((m) => m.material_id === det.detected_material)
    if (!existing) {
      materialVocab.push({
        material_id: (det.detected_material as string) ?? 'unknown',
        usage: (det.surface_type as string) ?? 'general',
        frequency: (det.confidence_score as number) ?? 0.5,
      })
    }
  }

  // --- Furniture language ---
  const style = briefData.style as Record<string, unknown> | undefined
  const furniturePlan = (briefData.furniture_plan ?? []) as Array<Record<string, unknown>>
  const density = furniturePlan.length <= 3 ? 'minimal' : furniturePlan.length <= 6 ? 'moderate' : 'rich'

  const furnitureLanguage: StyleDNAData['furniture_language'] = {
    primary_style: (style?.primary as string) ?? 'modern',
    substyle: (style?.substyle as string) ?? 'contemporary',
    era_range: (style?.era as string) ?? '2020s',
    proportion_preference: 'standard',
    density,
  }

  // --- Photography mood ---
  const photography = briefData.photography as Record<string, unknown> | undefined
  const photographyMood: StyleDNAData['photography_mood'] = {
    color_grading: (photography?.color_grading as string) ?? 'warm_natural',
    lighting_style: 'natural',
    grain_level: (photography?.grain_intensity as number) ?? 0.3,
    contrast_preference: 'medium',
  }

  // Enrich lighting style from scene context
  const lighting = sceneContext.lightingAnalysis as Record<string, unknown> | undefined
  if (lighting) {
    const colorTemp = lighting.color_temperature_k as number | undefined
    if (colorTemp) {
      photographyMood.lighting_style = colorTemp > 5000 ? 'cool_daylight' : 'warm_ambient'
    }
  }

  // --- Cultural elements ---
  const culturalElements: string[] = []
  const accessories = (briefData.accessories ?? []) as Array<Record<string, unknown>>
  for (const acc of accessories) {
    if (acc.style) culturalElements.push(acc.style as string)
  }

  // --- Spatial density ---
  const spatialDensity = furniturePlan.length / 10  // Normalize: 10 items = max density

  return {
    color_palette: { dominant, secondary, accent, warmth },
    material_vocabulary: materialVocab,
    furniture_language: furnitureLanguage,
    photography_mood: photographyMood,
    cultural_elements: [...new Set(culturalElements)],
    spatial_density: Math.min(1, spatialDensity),
  }
}

// ---------------------------------------------------------------------------
// applyStyleDNA
// ---------------------------------------------------------------------------

/**
 * Constrain a design brief with Style DNA, overriding palette, materials,
 * and style fields to maintain cross-room consistency.
 */
export function applyStyleDNA(
  dna: StyleDNAData,
  baseBrief: Record<string, unknown>
): Record<string, unknown> {
  const brief = JSON.parse(JSON.stringify(baseBrief)) as Record<string, unknown>

  // Override style
  if (brief.style && typeof brief.style === 'object') {
    const style = brief.style as Record<string, unknown>
    style.primary = dna.furniture_language.primary_style
    style.substyle = dna.furniture_language.substyle
    style.era = dna.furniture_language.era_range
  }

  // Override color palette using DNA dominant/secondary/accent
  if (dna.color_palette.dominant.length > 0) {
    const cp = (brief.color_palette ?? {}) as Record<string, unknown>
    if (dna.color_palette.dominant[0]) {
      cp.dominant = { hex: dna.color_palette.dominant[0], pct: 60 }
    }
    if (dna.color_palette.secondary[0]) {
      cp.secondary = { hex: dna.color_palette.secondary[0], pct: 30 }
    }
    if (dna.color_palette.accent[0]) {
      cp.accent = { hex: dna.color_palette.accent[0], pct: 10 }
    }
    brief.color_palette = cp
  }

  // Override materials palette from DNA vocabulary
  const matPalette = (brief.materials_palette ?? {}) as Record<string, string>
  for (const mat of dna.material_vocabulary) {
    if (mat.usage in matPalette) {
      matPalette[mat.usage] = mat.material_id
    }
  }
  brief.materials_palette = matPalette

  // Override photography settings
  if (brief.photography && typeof brief.photography === 'object') {
    const photo = brief.photography as Record<string, unknown>
    photo.color_grading = dna.photography_mood.color_grading
    photo.grain_intensity = dna.photography_mood.grain_level
  }

  return brief
}

// ---------------------------------------------------------------------------
// compareStyles
// ---------------------------------------------------------------------------

/**
 * Compare two Style DNAs for compatibility and conflicts.
 * Returns a similarity score (0-1) and a list of specific conflicts.
 */
export function compareStyles(
  dna1: StyleDNAData,
  dna2: StyleDNAData
): StyleComparison {
  const conflicts: string[] = []
  let similaritySum = 0
  let weightSum = 0

  // Compare warmth (weight: 2)
  const warmthMatch = dna1.color_palette.warmth === dna2.color_palette.warmth
  if (!warmthMatch) {
    conflicts.push(`Color warmth mismatch: ${dna1.color_palette.warmth} vs ${dna2.color_palette.warmth}`)
    similaritySum += 0
  } else {
    similaritySum += 2
  }
  weightSum += 2

  // Compare dominant colors (weight: 3)
  if (dna1.color_palette.dominant[0] && dna2.color_palette.dominant[0]) {
    const dist = colorDistance(dna1.color_palette.dominant[0], dna2.color_palette.dominant[0])
    const colorSim = 1 - dist
    similaritySum += colorSim * 3
    if (dist > 0.4) {
      conflicts.push(`Dominant color divergence (distance: ${dist.toFixed(2)})`)
    }
  }
  weightSum += 3

  // Compare primary style (weight: 3)
  const styleMatch = dna1.furniture_language.primary_style.toLowerCase() ===
    dna2.furniture_language.primary_style.toLowerCase()
  if (styleMatch) {
    similaritySum += 3
  } else {
    conflicts.push(
      `Style mismatch: ${dna1.furniture_language.primary_style} vs ${dna2.furniture_language.primary_style}`
    )
  }
  weightSum += 3

  // Compare era (weight: 1)
  const eraMatch = dna1.furniture_language.era_range === dna2.furniture_language.era_range
  if (eraMatch) {
    similaritySum += 1
  } else {
    conflicts.push(`Era mismatch: ${dna1.furniture_language.era_range} vs ${dna2.furniture_language.era_range}`)
  }
  weightSum += 1

  // Compare density (weight: 2)
  const densityMatch = dna1.furniture_language.density === dna2.furniture_language.density
  if (densityMatch) {
    similaritySum += 2
  } else {
    conflicts.push(
      `Density mismatch: ${dna1.furniture_language.density} vs ${dna2.furniture_language.density}`
    )
  }
  weightSum += 2

  // Compare photography mood (weight: 2)
  const gradingMatch = dna1.photography_mood.color_grading === dna2.photography_mood.color_grading
  const contrastMatch = dna1.photography_mood.contrast_preference === dna2.photography_mood.contrast_preference
  const moodScore = (gradingMatch ? 1 : 0) + (contrastMatch ? 1 : 0)
  similaritySum += moodScore
  if (!gradingMatch) {
    conflicts.push(
      `Color grading mismatch: ${dna1.photography_mood.color_grading} vs ${dna2.photography_mood.color_grading}`
    )
  }
  weightSum += 2

  // Compare material overlap (weight: 2)
  const mats1 = new Set(dna1.material_vocabulary.map((m) => m.material_id))
  const mats2 = new Set(dna2.material_vocabulary.map((m) => m.material_id))
  const intersection = [...mats1].filter((m) => mats2.has(m)).length
  const union = new Set([...mats1, ...mats2]).size
  const matSim = union > 0 ? intersection / union : 1
  similaritySum += matSim * 2
  if (matSim < 0.3) {
    conflicts.push(`Low material overlap (${(matSim * 100).toFixed(0)}% Jaccard similarity)`)
  }
  weightSum += 2

  const similarity_score = weightSum > 0 ? similaritySum / weightSum : 0

  return {
    compatible: conflicts.length <= 1 && similarity_score > 0.6,
    conflicts,
    similarity_score: Math.round(similarity_score * 100) / 100,
  }
}

// ---------------------------------------------------------------------------
// generateVariationParams
// ---------------------------------------------------------------------------

/**
 * Generate diverse variation parameters for N variants.
 * Each variant gets a different combination of style shift, palette shift,
 * and density to ensure meaningful diversity.
 */
export function generateVariationParams(
  count: number,
  baseBrief: Record<string, unknown>
): VariationParam[] {
  const briefData = (baseBrief.brief_data ?? baseBrief) as Record<string, unknown>
  const baseStyle = briefData.style as Record<string, unknown> | undefined
  const primaryStyle = (baseStyle?.primary as string) ?? 'modern'

  // Variation strategies — cycle through these for diversity
  const paletteShifts = ['warmer', 'cooler', 'bolder', 'muted'] as const
  const densityOptions = ['minimal', 'moderate', 'rich'] as const

  // Style companions — related but distinct styles to try
  const styleCompanions: Record<string, string[]> = {
    modern: ['scandinavian', 'minimalist', 'mid-century modern', 'industrial'],
    scandinavian: ['minimalist', 'modern', 'japandi', 'coastal'],
    minimalist: ['japandi', 'scandinavian', 'modern', 'wabi-sabi'],
    'mid-century modern': ['modern', 'retro', 'art deco', 'bohemian'],
    luxury: ['transitional', 'art deco', 'classic', 'hollywood regency'],
    industrial: ['modern', 'loft', 'urban', 'minimalist'],
    traditional: ['transitional', 'classic', 'french country', 'english'],
    bohemian: ['eclectic', 'mid-century modern', 'global', 'maximalist'],
  }

  const companions = styleCompanions[primaryStyle.toLowerCase()] ??
    styleCompanions.modern

  const params: VariationParam[] = []

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      // First variant: faithful to base brief, no overrides
      params.push({
        variant_index: 0,
        description: `Base design — ${primaryStyle} style as specified`,
      })
      continue
    }

    const paletteShift = paletteShifts[(i - 1) % paletteShifts.length]
    const densityOverride = densityOptions[(i - 1) % densityOptions.length]
    const styleOverride = i <= companions.length ? companions[i - 1] : undefined

    const descParts: string[] = []
    if (styleOverride) descParts.push(`${styleOverride} style`)
    descParts.push(`${paletteShift} palette`)
    descParts.push(`${densityOverride} furnishing`)

    params.push({
      variant_index: i,
      style_override: styleOverride,
      palette_shift: paletteShift,
      density_override: densityOverride,
      description: `Variant ${i + 1} — ${descParts.join(', ')}`,
    })
  }

  return params
}

// ---------------------------------------------------------------------------
// applyVariationToBrief (internal helper used by the variants API route)
// ---------------------------------------------------------------------------

/**
 * Apply a single VariationParam to a base brief, producing a variant brief.
 * If a StyleDNAData is also provided, it takes precedence for constrained fields.
 */
export function applyVariationToBrief(
  baseBrief: Record<string, unknown>,
  variation: VariationParam,
  styleDna?: StyleDNAData
): Record<string, unknown> {
  let brief = JSON.parse(JSON.stringify(baseBrief)) as Record<string, unknown>

  // Apply Style DNA first (if provided) — this sets the "base constraints"
  if (styleDna) {
    brief = applyStyleDNA(styleDna, brief)
  }

  // Apply variation overrides on top
  if (variation.style_override) {
    const style = (brief.style ?? {}) as Record<string, unknown>
    style.primary = variation.style_override
    brief.style = style
  }

  if (variation.palette_shift) {
    const cp = brief.color_palette as Record<string, unknown> | undefined
    if (cp) {
      const domObj = cp.dominant as Record<string, unknown> | undefined
      const secObj = cp.secondary as Record<string, unknown> | undefined
      const accObj = cp.accent as Record<string, unknown> | undefined
      if (domObj?.hex) domObj.hex = shiftColor(domObj.hex as string, variation.palette_shift)
      if (secObj?.hex) secObj.hex = shiftColor(secObj.hex as string, variation.palette_shift)
      if (accObj?.hex) accObj.hex = shiftColor(accObj.hex as string, variation.palette_shift)
    }
  }

  if (variation.density_override) {
    // Adjust furniture plan length based on density
    const furniturePlan = (brief.furniture_plan ?? []) as unknown[]
    const targetCounts: Record<string, number> = {
      minimal: 3,
      moderate: 5,
      rich: 8,
    }
    const target = targetCounts[variation.density_override] ?? furniturePlan.length
    if (furniturePlan.length > target) {
      brief.furniture_plan = furniturePlan.slice(0, target)
    }
  }

  return brief
}
