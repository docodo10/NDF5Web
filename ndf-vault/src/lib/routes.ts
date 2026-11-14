import type { Route } from "./types";

const SIMPLE_VIEWS = ["home", "files", "projects", "private", "shared", "favorites", "recent", "archived", "activity", "preferences"] as const;

/** One plain #name per view: the only form a hosted page can keep in its address. */
export function routeToHash(r: Route): string {
  if (r.view === "project") return `#project-${r.id}`;
  if (r.view === "folder") return `#folder-${r.id}`;
  return `#${r.view}`;
}

export function hashToRoute(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h.startsWith("project-")) return { view: "project", id: h.slice(8) };
  if (h.startsWith("folder-")) return { view: "folder", id: h.slice(7) };
  const simple = SIMPLE_VIEWS.find((v) => v === h);
  return simple ? ({ view: simple } as Route) : { view: "home" };
}
