import { redirect } from 'next/navigation'
import { createUIClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Must use the cookie-based UI client — the service-role client has no session
  // and auth.getUser() always returns null, causing an infinite redirect loop.
  const supabase = await createUIClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar user={user} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
