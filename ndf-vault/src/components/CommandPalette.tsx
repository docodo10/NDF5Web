"use client";

import clsx from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import { CornerDownLeft, Search } from "lucide-react";
import { FolderIcon, KanbanIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import { count, formatDate, folderLabel, KIND_LABEL } from "@/lib/format";
import { fileMatches } from "./files/Explorer";
import { FileIcon } from "./files/FileTable";
import { Kbd } from "./ui";

interface Result {
  key: string;
  group: string;
  icon: ReactNode;
  title: string;
  meta: string;
  run: () => void;
}

export function CommandPalette() {
  const v = useVault();
  const { paletteOpen, setPaletteOpen } = v;
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K anywhere, and "/" when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setCursor(0);
    }
  }, [paletteOpen]);

  const results = useMemo<Result[]>(() => {
    const needle = q.trim().toLowerCase();
    const live = v.files.filter((f) => !f.deleted);
    const files = (needle ? live.filter((f) => fileMatches(f, needle, v.folders, v.projects)) : [...live].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))).slice(0, needle ? 8 : 5);
    const folders = v.folders.filter((d) => d.parentId && (!needle || `${d.name} ${d.code ?? ""}`.toLowerCase().includes(needle))).slice(0, needle ? 5 : 0);
    const projects = v.projects.filter((p) => !needle || `${p.name} ${p.code} ${p.period}`.toLowerCase().includes(needle));
    const ids = files.map((f) => f.id);
    return [
      ...files.map<Result>((f) => ({
        key: `file-${f.id}`,
        group: needle ? "Fichiers" : "Fichiers récents",
        icon: <FileIcon kind={f.kind} size={32} />,
        title: `${f.name}.${f.ext}`,
        meta: `${KIND_LABEL[f.kind]} · ${v.folders.find((d) => d.id === f.folderId)?.name ?? ""} · ${formatDate(f.modifiedAt)}`,
        run: () => v.openPreview(f.id, ids),
      })),
      ...folders.map<Result>((d) => ({
        key: `folder-${d.id}`,
        group: "Dossiers",
        icon: (
          <span className="flex size-8 items-center justify-center rounded-lg bg-fill text-neutral-700">
            <FolderIcon weight="fill" className="size-[17px]" />
          </span>
        ),
        title: folderLabel(d),
        meta: "Dossier",
        run: () => v.navigate({ view: "folder", id: d.id }),
      })),
      ...projects.map<Result>((p) => ({
        key: `project-${p.id}`,
        group: "Projets",
        icon: (
          <span className="flex size-8 items-center justify-center rounded-lg bg-fill text-neutral-700">
            <KanbanIcon weight="fill" className="size-[17px]" />
          </span>
        ),
        title: `${p.name} (${p.code})`,
        meta: p.period,
        run: () => v.navigate({ view: "project", id: p.id }),
      })),
    ];
  }, [q, v]);

  const active = Math.min(cursor, Math.max(0, results.length - 1));
  const choose = (r: Result) => {
    setPaletteOpen(false);
    r.run();
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!paletteOpen) return null;
  let lastGroup = "";
  return (
    <Dialog.Root open onOpenChange={setPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] animate-fade bg-neutral-900/20 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-[81] flex max-h-[70vh] w-[calc(100vw-32px)] max-w-[600px] -translate-x-1/2 animate-pop flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-modal focus:outline-none"
        >
          <Dialog.Title className="sr-only">Rechercher dans NDF Vault</Dialog.Title>
          <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line px-4">
            <Search className="size-[18px] shrink-0 text-neutral-400" strokeWidth={1.75} />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor(Math.min(results.length - 1, active + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor(Math.max(0, active - 1));
                } else if (e.key === "Enter" && results[active]) {
                  e.preventDefault();
                  choose(results[active]);
                }
              }}
              placeholder="Nom, dossier, projet, type, étiquette, responsable ou date"
              aria-label="Rechercher dans NDF Vault"
              className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-ink placeholder:text-neutral-400"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div ref={listRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
            {results.length === 0 && <p className="px-3 py-10 text-center text-[13px] text-neutral-500">Aucun résultat pour « {q} ».</p>}
            {results.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <div key={r.key}>
                  {header && <p className="px-2.5 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">{header}</p>}
                  <button
                    type="button"
                    data-active={i === active}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => choose(r)}
                    className={clsx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-100", i === active && "bg-fill")}
                  >
                    {r.icon}
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{r.title}</span>
                      <span className="block truncate text-[12px] text-neutral-500">{r.meta}</span>
                    </span>
                    {i === active && <CornerDownLeft className="size-4 shrink-0 text-neutral-400" strokeWidth={1.75} />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="hidden h-10 shrink-0 items-center gap-4 border-t border-hair px-4 text-[12px] text-neutral-500 sm:flex">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> Naviguer
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> Ouvrir
            </span>
            <span className="ml-auto">
              {count(results.length, "résultat")}
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
