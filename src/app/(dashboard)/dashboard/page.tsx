// /dashboard — Projects list. Visuals ported pixel-perfect from
// handoff/screens-projects.jsx. Currently driven by DATA mock so the new
// chrome lights up end-to-end while we keep the existing Supabase pipeline
// (rooms/uploads tables, RLS, signed URLs) untouched. Wiring DATA →
// real projects table is tracked separately — see TODO below.

import { ProjectsScreen } from "@/components/houspire/screens-projects";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  // TODO(supabase-wire): replace DATA.projects in <ProjectsScreen /> with
  // a server-side fetch of core.projects (joined with rooms count, status
  // counts, updated_at, thumbnails) and pass via props.
  return <ProjectsScreen />;
}
