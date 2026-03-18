// /api/health — liveness probe for Vercel / load balancer health checks.
// vercel.json rewrites GET /health → GET /api/health.
// Returns 200 + basic service info; never throws.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'smart-staging-v2',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'unknown',
    },
    { status: 200 }
  )
}
