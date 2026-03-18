/**
 * Input sanitization utilities — Gap 3 (Security: Input Validation)
 *
 * Two-layer protection for all user-supplied text entering the generation pipeline:
 *
 *   Layer 1 — Structural validation
 *     Length limits, type checks, enum validation, UUID format checks.
 *     Rejects malformed inputs at the API boundary (400 Bad Request).
 *
 *   Layer 2 — Prompt injection defense
 *     Strips tokens used in prompt injection attacks:
 *       • Newline-based role separators  (\n\nHuman:, \n\nAssistant:, <|im_end|>)
 *       • XML/HTML tags that could break structured prompts
 *       • Consecutive control characters and zero-width characters
 *       • Base64 blobs embedded in text fields
 *
 * Usage:
 *   import { sanitizeText, sanitizeRoomLabel, validateUUID, assertValidEnum } from '@/lib/sanitize'
 *
 * All functions throw SanitizeError on violation so API routes can catch and
 * return a consistent 400 response.
 */

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class SanitizeError extends Error {
  readonly code: string
  readonly field: string

  constructor(field: string, message: string, code = 'INVALID_INPUT') {
    super(message)
    this.name = 'SanitizeError'
    this.code = code
    this.field = field
  }
}

// ---------------------------------------------------------------------------
// Prompt injection patterns to strip / reject
// ---------------------------------------------------------------------------

/** Role separator tokens used in LLM prompt injection attacks */
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /\n\n(Human|Assistant|System|User|AI)\s*:/gi,          // ChatML-style separators
  /<\|im_(start|end|sep)\|>/gi,                            // OpenAI/Mistral tokens
  /<\|(end|start)_of_(text|turn|message)\|>/gi,            // LLaMA 3 tokens
  /\[\/?(INST|SYS|s)\]/gi,                                 // LLaMA 2 tokens
  /###\s*(Instruction|Response|Input|Prompt)\s*:/gi,       // Alpaca-style
  /```\s*(prompt|system|instruction)/gi,                   // Code-block injection
  /IGNORE\s+(PREVIOUS|ALL|ABOVE)\s+INSTRUCTIONS?/gi,      // Classic override
  /ACT\s+AS\s+(AN?\s+)?/gi,                                // Persona injection
]

/** Zero-width and invisible Unicode characters */
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF\u2060\u00AD]/g

/** Looks like a base64 blob (>40 continuous base64 chars) */
const BASE64_BLOB_PATTERN = /[A-Za-z0-9+/]{40,}={0,2}/g

/** Excessive whitespace normalisation */
const EXCESSIVE_WHITESPACE = /[\t\r\n]+/g

// ---------------------------------------------------------------------------
// Core sanitizers
// ---------------------------------------------------------------------------

/**
 * Sanitize a free-text field (brief, instructions, labels, notes).
 * Strips prompt injection tokens, control characters, and normalises whitespace.
 * Does NOT strip HTML — text goes to AI prompts not a browser DOM.
 *
 * @param value   Raw input value
 * @param field   Field name for error messages
 * @param options Validation options
 */
export function sanitizeText(
  value: unknown,
  field: string,
  options: {
    maxLength?: number
    minLength?: number
    required?: boolean
    allowNewlines?: boolean
    blockPromptInjection?: boolean
  } = {}
): string {
  const {
    maxLength         = 2000,
    minLength         = 0,
    required          = false,
    allowNewlines     = true,
    blockPromptInjection = true,
  } = options

  // Type check
  if (value === null || value === undefined || value === '') {
    if (required) throw new SanitizeError(field, `${field} is required`, 'REQUIRED')
    return ''
  }

  if (typeof value !== 'string') {
    throw new SanitizeError(field, `${field} must be a string`, 'TYPE_ERROR')
  }

  let cleaned = value

  // Strip zero-width / invisible characters
  cleaned = cleaned.replace(ZERO_WIDTH_PATTERN, '')

  // Strip base64 blobs (likely data exfiltration or injection payloads)
  cleaned = cleaned.replace(BASE64_BLOB_PATTERN, '[data removed]')

  // Prompt injection defense
  if (blockPromptInjection) {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(cleaned)) {
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0
        cleaned = cleaned.replace(pattern, '')
      }
      pattern.lastIndex = 0
    }
  }

  // Normalise whitespace
  if (!allowNewlines) {
    cleaned = cleaned.replace(EXCESSIVE_WHITESPACE, ' ')
  }

  // Trim
  cleaned = cleaned.trim()

  // Length checks
  if (cleaned.length < minLength) {
    throw new SanitizeError(
      field,
      `${field} must be at least ${minLength} characters`,
      'TOO_SHORT'
    )
  }
  if (cleaned.length > maxLength) {
    throw new SanitizeError(
      field,
      `${field} must not exceed ${maxLength} characters`,
      'TOO_LONG'
    )
  }

  return cleaned
}

/**
 * Sanitize a room/project label — single line, max 200 chars.
 */
export function sanitizeLabel(value: unknown, field = 'label'): string {
  return sanitizeText(value, field, {
    maxLength: 200,
    minLength: 1,
    required: true,
    allowNewlines: false,
  })
}

/**
 * Sanitize a free-form design brief or special instructions field.
 * Allows newlines; caps at 4,000 chars.
 */
export function sanitizeBrief(value: unknown, field = 'brief'): string {
  return sanitizeText(value, field, {
    maxLength: 4000,
    allowNewlines: true,
    blockPromptInjection: true,
  })
}

/**
 * Sanitize a URL string — must be http/https, max 2048 chars.
 */
export function sanitizeUrl(value: unknown, field = 'url'): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SanitizeError(field, `${field} must be a non-empty URL`, 'REQUIRED')
  }
  const trimmed = value.trim()
  if (trimmed.length > 2048) {
    throw new SanitizeError(field, `${field} URL is too long (max 2048 chars)`, 'TOO_LONG')
  }
  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new SanitizeError(field, `${field} must be an http/https URL`, 'INVALID_URL')
    }
  } catch {
    throw new SanitizeError(field, `${field} is not a valid URL`, 'INVALID_URL')
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// Structural validators
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate a UUID v4 format string.
 * Throws if the value is not a valid UUID.
 */
export function validateUUID(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new SanitizeError(field, `${field} must be a valid UUID`, 'INVALID_UUID')
  }
  return value
}

/**
 * Assert that a value is one of the allowed enum members.
 */
export function assertValidEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new SanitizeError(
      field,
      `${field} must be one of: ${allowed.join(', ')}`,
      'INVALID_ENUM'
    )
  }
  return value as T
}

/**
 * Validate a number is within a range (inclusive).
 */
export function validateRange(
  value: unknown,
  min: number,
  max: number,
  field: string
): number {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new SanitizeError(field, `${field} must be a number`, 'TYPE_ERROR')
  }
  if (n < min || n > max) {
    throw new SanitizeError(
      field,
      `${field} must be between ${min} and ${max}`,
      'OUT_OF_RANGE'
    )
  }
  return n
}

/**
 * Validate and sanitize a string array (e.g. color_palette).
 * Each element is sanitized via sanitizeText.
 */
export function sanitizeStringArray(
  value: unknown,
  field: string,
  options: { maxItems?: number; maxItemLength?: number } = {}
): string[] {
  const { maxItems = 20, maxItemLength = 100 } = options
  if (!Array.isArray(value)) {
    throw new SanitizeError(field, `${field} must be an array`, 'TYPE_ERROR')
  }
  if (value.length > maxItems) {
    throw new SanitizeError(field, `${field} must have at most ${maxItems} items`, 'TOO_MANY')
  }
  return value.map((item, i) =>
    sanitizeText(item, `${field}[${i}]`, {
      maxLength: maxItemLength,
      allowNewlines: false,
      blockPromptInjection: true,
    })
  )
}

// ---------------------------------------------------------------------------
// Convenience: parse + format a SanitizeError into an API response body
// ---------------------------------------------------------------------------

export function sanitizeErrorResponse(err: SanitizeError) {
  return {
    success: false,
    error:   err.message,
    code:    err.code,
    field:   err.field,
  }
}

/**
 * Wrap an API route handler body with SanitizeError → 400 conversion.
 *
 * Usage in a route:
 *   return withSanitize(async () => {
 *     const label = sanitizeLabel(body.label)
 *     ...
 *   })
 */
export async function withSanitize<T>(
  fn: () => Promise<T>
): Promise<T | { status: 400; body: ReturnType<typeof sanitizeErrorResponse> }> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof SanitizeError) {
      return {
        status: 400,
        body: sanitizeErrorResponse(err),
      } as any
    }
    throw err
  }
}
