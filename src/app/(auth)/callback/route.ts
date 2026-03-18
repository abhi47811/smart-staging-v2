import { NextResponse } from 'next/server'
import { createUIClient } from '@/lib/supabase/server'

/**
 * OAuth / magic-link callback.
 *
 * MUST use createUIClient() (cookie-based SSR client), NOT createClient()
 * (service-role). The service-role client has no cookie jar, so exchangeCodeForSession
 * would succeed server-side but never write the session token back to the browser,
 * leaving every subsequent page thinking the user is unauthenticated.
 *
 * Also bootstraps a personal organization for brand-new users on first login,
 * so they immediately satisfy the org_id FK requirement on core.projects.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createUIClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check whether this user already has an org (returning user or dev restart)
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: existingMembership } = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (!existingMembership) {
          // New user — auto-create a personal workspace org
          const emailPrefix = (user.email ?? user.id)
            .split('@')[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .slice(0, 30)

          const slug = `${emailPrefix}-${Date.now()}`
          const orgName = user.email
            ? `${user.email.split('@')[0]}'s workspace`
            : 'My Workspace'

          const { data: org } = await supabase
            .schema('core')
            .from('organizations')
            .insert({ name: orgName, slug })
            .select('id')
            .single()

          if (org) {
            await supabase
              .from('org_members')
              .insert({ org_id: org.id, user_id: user.id, role: 'owner' })
          }
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
