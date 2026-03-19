import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { NewProjectButton } from '@/components/new-project-modal'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: projects } = await supabase
    .schema('core')
    .from('projects')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        {/* NewProjectButton is a 'use client' island — handles modal + Supabase insert */}
        <NewProjectButton />
      </div>

      {!projects || projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500">No projects yet. Create your first project to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-gray-900">{project.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{project.description || 'No description'}</p>
              <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
                <span>{project.room_count} rooms</span>
                <span>{project.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
