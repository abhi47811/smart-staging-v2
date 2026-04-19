// /projects/[id] — Project detail. Visuals ported pixel-perfect from
// handoff/screens-projects.jsx (ProjectDetailScreen). Currently resolves
// the project from DATA mock so the ported chrome renders against the
// exact seed used in the handoff; the existing Supabase pipeline
// (rooms/uploads tables, RLS, signed URLs) stays intact for the room
// workspace downstream. Wiring DATA → real projects table is tracked
// separately — see TODO below.

import { notFound } from "next/navigation";
import { ProjectDetailScreen } from "@/components/houspire/screens-projects";
import { DATA } from "@/components/houspire/data";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // TODO(supabase-wire): replace DATA lookup with a server-side fetch of
  // core.projects by id (joined with rooms + uploads for thumbnails) and
  // pass the hydrated Project shape into ProjectDetailScreen.
  const project = DATA.projects.find(p => p.id === id);
  if (!project) notFound();

  return <ProjectDetailScreen project={project} />;
}
