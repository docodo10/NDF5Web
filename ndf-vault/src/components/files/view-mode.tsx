"use client";

import clsx from "clsx";
import { LayoutGrid, List } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";

export type ViewMode = "list" | "grid";

const KEY = "ndf-vault-view";

/** List or grid, remembered on this device like any view preference. */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const change = (next: ViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage refused: the choice lasts for this visit */
    }
  };
  return [mode, change];
}

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const options = [
    { id: "list" as const, label: t("Vue en liste", "List view"), Icon: List },
    { id: "grid" as const, label: t("Vue en grille", "Grid view"), Icon: LayoutGrid },
  ];
  return (
    <div role="group" aria-label={t("Affichage", "View")} className="flex h-9 shrink-0 items-center rounded-lg border border-line bg-white p-0.5 shadow-xs">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={mode === id}
          onClick={() => onChange(id)}
          className={clsx("flex size-8 items-center justify-center rounded-md transition-colors duration-150", mode === id ? "bg-fill text-ink" : "text-neutral-500 hover:text-ink")}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}
