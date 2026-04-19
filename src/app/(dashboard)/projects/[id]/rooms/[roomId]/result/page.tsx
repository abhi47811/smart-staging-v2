// /projects/[id]/rooms/[roomId]/result — Generation result view. The source
// design treats "Export" as the final tab inside the unified room workspace
// (screens-room.jsx), so this route simply opens RoomWorkspace pinned to the
// export tab instead of rendering a separate result screen. Supabase
// pipeline (pipeline_runs, generation_results, signed URLs) is untouched —
// it will be re-wired into RoomWorkspace via a single data fetch.

import { notFound } from "next/navigation";
import { RoomWorkspace } from "@/components/houspire/screens-room";
import { DATA } from "@/components/houspire/data";

export default async function RoomResultPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id, roomId } = await params;

  // TODO(supabase-wire): replace DATA lookup with a server-side fetch of
  // core.rooms + generation.pipeline_runs + generation.generation_results
  // (joined with storage signed URLs) and hydrate RoomWorkspace with the
  // real export payload.
  const project = DATA.projects.find((p) => p.id === id);
  if (!project) notFound();
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) notFound();

  return <RoomWorkspace project={project} room={room} initialTab="export" />;
}
