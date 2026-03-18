/**
 * Smart Staging v2 — Supabase server clients (Next.js App Router)
 *
 * TWO CLIENTS — choose the right one:
 *
 * createClient()    → service role key, bypasses RLS, no cookies.
 *                     Use in: /api/generate, /api/quality, /api/edit, all pipeline routes.
 *                     Called server-to-server from Supabase Edge Functions.
 *
 * createUIClient()  → anon key + cookie session, respects RLS, reads user from JWT.
 *                     Use in: (dashboard) layout, page server components, any UI that
 *                     needs auth.getUser() to return the real logged-in user.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Pipeline client (service role, no cookies) ───────────────────────────────
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    }
  )
}

// ─── UI client (anon key + cookie session) ────────────────────────────────────
export async function createUIClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookie writes are a no-op here.
            // Middleware handles session refresh so this is safe to ignore.
          }
        },
      },
    }
  )
}
