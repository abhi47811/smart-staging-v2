import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Exclude:
     *   - _next/static, _next/image (Next.js internals)
     *   - favicon.ico and common static asset extensions
     *   - /api/* routes (auth handled inside each route via service-role key;
     *     middleware auth would redirect server-to-server calls to /login)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
