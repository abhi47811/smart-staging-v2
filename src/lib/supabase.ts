/**
 * Smart Staging v2 — Supabase client factory
 * Three client modes: browser (anon key + RLS), server (anon + user JWT),
 * service-role (bypasses RLS for API routes).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Browser client — respects RLS */
export function createBrowserClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

/** Server-side client for API routes using service role (bypasses RLS) */
export function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })
}

/** API route client authenticated as the calling user */
export function createUserClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice(7)
}

/** Get authenticated Supabase client from request — throws if no token */
export function getAuthClient(req: Request): SupabaseClient {
  const token = extractBearerToken(req)
  if (!token) throw new Error('Unauthorized')
  return createUserClient(token)
}

export { SUPABASE_URL }
