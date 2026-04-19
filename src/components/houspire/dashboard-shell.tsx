"use client";

// DashboardShell — client-side wrapper that renders the titlebar + sidebar +
// content area. Sidebar is context-aware (tracks active project and room
// based on URL), so we need it client-side. Server components pass the
// authenticated user in for the future avatar / sign-out menu.

import React, { useMemo } from "react";
import { useParams, usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AppTitleBar, Sidebar, Breadcrumb } from "./shell";
import { DATA } from "./data";

export const DashboardShell: React.FC<{
  user: User;
  children: React.ReactNode;
}> = ({ children }) => {
  const params = useParams<{ id?: string; roomId?: string }>();
  const pathname = usePathname();

  const project = useMemo(() => {
    if (!params?.id) return null;
    return DATA.projects.find(p => p.id === params.id) ?? null;
  }, [params?.id]);

  const room = useMemo(() => {
    if (!project || !params?.roomId) return null;
    return project.rooms.find(r => r.id === params.roomId) ?? null;
  }, [project, params?.roomId]);

  const breadcrumb: Breadcrumb[] = useMemo(() => {
    const crumbs: Breadcrumb[] = [];
    if (pathname?.startsWith("/dashboard") || pathname === "/") {
      crumbs.push({ label: "Projects", href: "/dashboard" });
    } else if (pathname?.startsWith("/projects") && project) {
      crumbs.push({ label: "Projects", href: "/dashboard" });
      crumbs.push({ label: project.name, href: `/projects/${project.id}` });
      if (room) {
        crumbs.push({ label: room.label });
      }
    } else if (pathname?.startsWith("/library")) {
      crumbs.push({ label: "Library" });
    } else if (pathname?.startsWith("/styles")) {
      crumbs.push({ label: "Style DNA" });
    } else if (pathname?.startsWith("/exports")) {
      crumbs.push({ label: "Exports" });
    } else if (pathname?.startsWith("/api-keys")) {
      crumbs.push({ label: "API & Webhooks" });
    }
    return crumbs;
  }, [pathname, project, room]);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", width: "100vw",
      background: "var(--surface-0)", color: "var(--text-0)",
      overflow: "hidden",
    }}>
      <AppTitleBar breadcrumb={breadcrumb} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar project={project} activeRoomId={room?.id ?? null} />
        <main style={{ flex: 1, minWidth: 0, overflow: "auto", background: "var(--surface-0)" }}>
          {children}
        </main>
      </div>
    </div>
  );
};
