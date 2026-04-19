// /projects/[id]/rooms/[roomId] — Room workspace. Visuals ported pixel-perfect
// from handoff/screens-room.jsx (+ screens-generate.jsx / screens-finish.jsx).
// Currently resolves project + room from DATA mock so the ported chrome
// renders against the exact seed used in the handoff; the existing Supabase
// pipeline (rooms/uploads tables, RLS, signed URLs) stays intact for the
// generation backend downstream. Wiring DATA → real core.rooms /
// generation.* tables is tracked separately — see TODO below.

import { notFound } from "next/navigation";
import { RoomWorkspace } from "@/components/houspire/screens-room";
import { DATA } from "@/components/houspire/data";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id, roomId } = await params;

  // TODO(supabase-wire): replace DATA lookup with a server-side fetch of
  // core.rooms joined with core.projects (+ uploads for thumbnail, +
  // generation.pipeline_runs for live status) and pass the hydrated
  // Project / Room shapes into RoomWorkspace.
  const project = DATA.projects.find((p) => p.id === id);
  if (!project) notFound();
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) notFound();

  return <RoomWorkspace project={project} room={room} />;
}
