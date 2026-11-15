"use client";

import clsx from "clsx";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  FileArchive,
  FolderInput,
  History,
  Inbox,
  Lock,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Share2,
  ShieldCheck,
  SquarePen,
  Stamp,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { ArticleIcon, FilePdfIcon, FileTextIcon, GridFourIcon, ImageIcon, PresentationChartIcon, TableIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useVault } from "@/lib/store";
import { PROTECTION_LABEL } from "@/lib/protection";
import type { FileKind, VaultFile } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { USERS } from "@/lib/sample-data";
import { count, formatDate, formatSize, fullName, KIND_LABEL, STATUS_LABEL } from "@/lib/format";
import { Avatar, Button, Checkbox, EmptyState, IconButton, StatusBadge } from "../ui";
import { MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from "./menu-styles";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

const KIND_ICON: Record<FileKind, PhosphorIcon> = {
  pdf: FilePdfIcon,
  docx: FileTextIcon,
  xlsx: GridFourIcon,
  pptx: PresentationChartIcon,
  txt: ArticleIcon,
  csv: TableIcon,
  image: ImageIcon,
};

/** Objects (files, folders) use a filled glyph in a soft tile; actions keep outlined icons. */
export function FileIcon({ kind, size = 36 }: { kind: FileKind; size?: number }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className="flex shrink-0 items-center justify-center rounded-lg bg-fill text-neutral-700" style={{ width: size, height: size }}>
      <Icon weight="fill" style={{ width: Math.round(size * 0.53), height: Math.round(size * 0.53) }} />
    </span>
  );
}

/* ----------------------------------------------------------------- Row menu */

export function RowMenu({ file, listIds, vertical }: { file: VaultFile; listIds: string[]; vertical?: boolean }) {
  const v = useVault();
  const item = (Icon: IconType, label: string, onSelect: () => void, danger?: boolean) => (
    <Dropdown.Item className={clsx(MENU_ITEM, danger && "!text-red-600 data-[highlighted]:!bg-red-50")} onSelect={onSelect}>
      <Icon className={clsx("size-4", danger ? "text-red-500" : "text-neutral-500")} strokeWidth={1.75} />
      {label}
    </Dropdown.Item>
  );
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        {vertical ? (
          <IconButton icon={EllipsisVertical} label={`Actions pour ${fullName(file)}`} variant="ghost" size="sm" className="data-[state=open]:bg-fill data-[state=open]:text-ink" />
        ) : (
          <IconButton icon={Ellipsis} label={`Actions pour ${fullName(file)}`} round size="sm" className="data-[state=open]:bg-fill" />
        )}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} collisionPadding={12} className={MENU_CONTENT} onClick={(e) => e.stopPropagation()}>
          {file.deleted ? (
            <>
              {item(Eye, "Aperçu", () => v.openPreview(file.id, listIds))}
              <Dropdown.Separator className={MENU_SEPARATOR} />
              {item(RotateCcw, "Restaurer", () => v.restoreFiles([file.id]))}
              {item(Trash2, "Supprimer définitivement", () => v.openDialog({ type: "purge", fileIds: [file.id] }), true)}
            </>
          ) : (
            <>
              {item(ExternalLink, "Ouvrir", () => v.openPreview(file.id, listIds, true))}
              {item(Eye, "Aperçu", () => v.openPreview(file.id, listIds))}
              {!file.archived && (file.pinned ? item(PinOff, "Désépingler", () => v.togglePinned(file.id)) : item(Pin, "Épingler à l’accueil", () => v.togglePinned(file.id)))}
              <Dropdown.Separator className={MENU_SEPARATOR} />
              {item(Pencil, "Renommer", () => v.openDialog({ type: "rename", fileId: file.id }))}
              {item(SquarePen, "Modifier les détails", () => v.openDialog({ type: "details", fileId: file.id }))}
              {item(FolderInput, "Déplacer", () => v.openDialog({ type: "move", fileIds: [file.id] }))}
              {item(Copy, "Copier", () => v.copyFile(file.id))}
              {item(Share2, "Partager", () => v.openDialog({ type: "share", fileId: file.id }))}
              {item(Download, "Télécharger", () => void v.downloadFile(file.id))}
              {!file.sample && !file.protection && (file.kind === "pdf" || file.kind === "image") && item(Stamp, "Télécharger avec filigrane", () => void v.downloadFile(file.id, { stamped: true }))}
              {!file.sample && item(ShieldCheck, "Protection", () => v.openDialog({ type: "protection", fileIds: [file.id] }))}
              {item(History, "Historique des versions", () => v.openDialog({ type: "versions", fileId: file.id }))}
              <Dropdown.Separator className={MENU_SEPARATOR} />
              {file.archived ? item(RotateCcw, "Restaurer", () => v.restoreFiles([file.id])) : item(Archive, "Archiver", () => v.archiveFiles([file.id]))}
              {item(Trash2, "Supprimer", () => v.openDialog({ type: "delete", fileIds: [file.id] }), true)}
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/* --------------------------------------------------------------- Pagination */

function pageWindow(page: number, total: number): (number | "…")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, Math.min(page - 1, total - 3));
  const to = Math.min(total - 1, from + 2);
  if (from > 2) out.push("…");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
}

function Pagination({ page, pages, total, from, to, rows, rowOptions, setPage, setRows }: { page: number; pages: number; total: number; from: number; to: number; rows: number; rowOptions: number[]; setPage: (p: number) => void; setRows: (n: number) => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex items-center gap-5 text-[13px] text-neutral-500">
        <p>
          Affichage de <span className="font-medium text-ink">{total ? `${from}–${to}` : 0}</span> sur <span className="font-medium text-ink">{total}</span>
        </p>
        <label className="hidden items-center gap-2 sm:flex">
          Lignes par page
          <span className="relative">
            <select
              value={rows}
              onChange={(e) => setRows(Number(e.target.value))}
              className="h-8 appearance-none rounded-lg border border-line bg-white pl-2.5 pr-7 text-[13px] font-medium text-ink shadow-xs focus-visible:border-neutral-400"
            >
              {rowOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-neutral-500" strokeWidth={1.75} />
          </span>
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Précédent
        </Button>
        <div className="hidden items-center gap-1 px-1 md:flex">
          {pageWindow(page, pages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="w-6 text-center text-neutral-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? "page" : undefined}
                onClick={() => setPage(p)}
                className={clsx(
                  "size-9 rounded-lg text-[13px] font-medium tabular-nums transition-colors duration-150",
                  p === page ? "border border-line bg-white text-ink shadow-xs" : "text-neutral-500 hover:bg-fill hover:text-ink",
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>
        <Button variant="primary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Suivant
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Bulk bar */

function BulkBar({ ids, clear, trash }: { ids: string[]; clear: () => void; trash?: boolean }) {
  const v = useVault();
  const act = (fn: () => void) => () => {
    fn();
    clear();
  };
  const btn = "inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-[12.5px] font-medium text-white/90 transition-colors duration-150 hover:bg-white/10 hover:text-white";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div role="toolbar" aria-label="Actions groupées" className="pointer-events-auto flex max-w-full animate-rise items-center gap-1 overflow-x-auto rounded-xl bg-ink p-1.5 pl-4 shadow-modal">
        <span className="mr-2 whitespace-nowrap text-[12.5px] font-medium text-white">{count(ids.length, "sélectionné")}</span>
        <span className="mr-1 h-5 w-px bg-white/15" />
        {trash ? (
          <>
            <button type="button" className={btn} onClick={act(() => v.restoreFiles(ids))}>
              <RotateCcw className="size-4" strokeWidth={1.75} /> Restaurer
            </button>
            <button type="button" className={btn} onClick={() => v.openDialog({ type: "purge", fileIds: ids })}>
              <Trash2 className="size-4" strokeWidth={1.75} /> Supprimer définitivement
            </button>
          </>
        ) : (
          <>
            <button type="button" className={btn} onClick={act(() => void v.exportZip(ids, "ndf-vault-selection"))}>
              <FileArchive className="size-4" strokeWidth={1.75} /> Exporter (ZIP)
            </button>
            <button type="button" className={btn} onClick={() => v.openDialog({ type: "move", fileIds: ids })}>
              <FolderInput className="size-4" strokeWidth={1.75} /> Déplacer
            </button>
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <button type="button" className={btn}>
                  Statut <ChevronDown className="size-3.5" strokeWidth={2} />
                </button>
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content side="top" sideOffset={10} className={MENU_CONTENT}>
                  {STATUSES.map((s) => (
                    <Dropdown.Item key={s} className={MENU_ITEM} onSelect={act(() => v.setStatus(ids, s))}>
                      {STATUS_LABEL[s]}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
            <button type="button" className={btn} onClick={act(() => v.archiveFiles(ids))}>
              <Archive className="size-4" strokeWidth={1.75} /> Archiver
            </button>
            <button type="button" className={btn} onClick={() => v.openDialog({ type: "delete", fileIds: ids })}>
              <Trash2 className="size-4" strokeWidth={1.75} /> Supprimer
            </button>
          </>
        )}
        <button type="button" aria-label="Effacer la sélection" className={clsx(btn, "ml-1 !px-2")} onClick={clear}>
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Table */

type SortKey = "name" | "kind" | "project" | "owner" | "modifiedAt" | "status" | "size";

interface Column {
  key: SortKey;
  label: string;
  className: string;
}

const FULL_COLUMNS: Column[] = [
  { key: "name", label: "Nom du fichier", className: "" },
  { key: "kind", label: "Type", className: "hidden w-[104px] min-[1420px]:table-cell" },
  { key: "project", label: "Projet", className: "hidden w-[84px] md:table-cell" },
  { key: "owner", label: "Téléversé par", className: "hidden w-[170px] xl:table-cell" },
  { key: "modifiedAt", label: "Modifié le", className: "hidden w-[124px] md:table-cell" },
  { key: "status", label: "Statut", className: "hidden w-[104px] sm:table-cell" },
  { key: "size", label: "Taille", className: "hidden w-[92px] min-[1140px]:table-cell" },
];

const COMPACT_COLUMNS: Column[] = [
  { key: "name", label: "Nom du fichier", className: "" },
  { key: "project", label: "Projet", className: "hidden w-[110px] md:table-cell" },
  { key: "owner", label: "Téléversé par", className: "hidden w-[220px] xl:table-cell" },
  { key: "modifiedAt", label: "Modifié le", className: "hidden w-[140px] sm:table-cell" },
];

export function FileTable({
  files,
  variant = "full",
  defaultRows,
  trash,
  footer = true,
  emptyTitle = "Aucun fichier pour l’instant",
  emptyHint = "Les fichiers de cette vue apparaîtront ici.",
}: {
  files: VaultFile[];
  variant?: "full" | "compact";
  defaultRows?: number;
  /** Deleted-files list: rows only offer Preview and Restore. */
  trash?: boolean;
  /** Set to false to hide pagination (short summary lists). */
  footer?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const v = useVault();
  const compact = variant === "compact";
  const columns = compact ? COMPACT_COLUMNS : FULL_COLUMNS;
  const rowOptions = compact ? [7, 14, 28] : [10, 20, 50];
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "modifiedAt", dir: -1 });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(defaultRows ?? rowOptions[0]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const projectCode = useMemo(() => new Map(v.projects.map((p) => [p.id, p.code])), [v.projects]);
  const folderName = useMemo(() => new Map(v.folders.map((f) => [f.id, f.name])), [v.folders]);
  const users = useMemo(() => new Map(USERS.map((u) => [u.id, u])), []);

  const sorted = useMemo(() => {
    const val = (f: VaultFile): string | number => {
      switch (sort.key) {
        case "name":
          return f.name.toLowerCase();
        case "kind":
          return KIND_LABEL[f.kind];
        case "project":
          return f.projectId ? (projectCode.get(f.projectId) ?? "") : "~";
        case "owner":
          return users.get(f.ownerId)?.name ?? "";
        case "status":
          return STATUSES.indexOf(f.status);
        case "size":
          return f.size;
        default:
          return f.modifiedAt;
      }
    };
    return [...files].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [files, sort, projectCode, users]);

  const pages = Math.max(1, Math.ceil(sorted.length / rows));
  const current = Math.min(page, pages);
  const visible = sorted.slice((current - 1) * rows, current * rows);
  const listIds = useMemo(() => sorted.map((f) => f.id), [sorted]);

  // Drop selections that are no longer in this list; reset to page 1 when the list changes size.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(files.map((f) => f.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [files]);
  useEffect(() => setPage(1), [files.length, rows]);

  const allOnPage = visible.length > 0 && visible.every((f) => selected.has(f.id));
  const someOnPage = visible.some((f) => selected.has(f.id));
  const togglePage = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of visible) {
        if (on) next.add(f.id);
        else next.delete(f.id);
      }
      return next;
    });
  const toggleOne = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const th = "h-11 whitespace-nowrap px-3 text-left text-[12.5px] font-medium text-neutral-500";
  const td = "px-3 align-middle";

  return (
    <div>
      <div data-tour="table" className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-subtle">
              <th scope="col" className="w-11 pl-4 pr-1 text-left">
                <Checkbox checked={allOnPage} indeterminate={!allOnPage && someOnPage} onChange={togglePage} label="Sélectionner tous les fichiers de la page" />
              </th>
              {columns.map((c) => {
                const on = sort.key === c.key;
                const SortIcon = !on ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
                return (
                  <th key={c.key} scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={clsx(th, c.className)}>
                    <button
                      type="button"
                      onClick={() => setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.key === "modifiedAt" || c.key === "size" ? -1 : 1 }))}
                      className={clsx("-mx-1.5 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors duration-150 hover:bg-neutral-200/50 hover:text-ink", on && "text-ink")}
                    >
                      {c.label}
                      <SortIcon className={clsx("size-3.5", on ? "text-ink" : "text-neutral-400")} strokeWidth={1.75} />
                    </button>
                  </th>
                );
              })}
              <th scope="col" className={clsx(th, compact ? "w-12" : trash ? "w-[52px]" : "w-[52px] sm:w-[96px] min-[1600px]:w-[190px]", "pr-4 text-right")}>
                <span className={compact ? "sr-only" : ""}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
              const owner = users.get(f.ownerId)!;
              const isSel = selected.has(f.id);
              return (
                <tr
                  key={f.id}
                  onClick={() => v.openPreview(f.id, listIds)}
                  className={clsx("group h-[60px] cursor-pointer border-t border-hair transition-colors duration-150", isSel ? "bg-subtle" : "hover:bg-subtle/70")}
                >
                  <td className="w-11 pl-4 pr-1">
                    <Checkbox checked={isSel} onChange={(on) => toggleOne(f.id, on)} label={`Sélectionner ${fullName(f)}`} />
                  </td>
                  <td className={clsx(td, "max-w-0")}>
                    <div className="flex items-center gap-3">
                      <FileIcon kind={f.kind} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              v.openPreview(f.id, listIds);
                            }}
                            title={fullName(f)}
                            className="truncate text-left text-[13.5px] font-medium text-ink underline-offset-2 hover:underline"
                          >
                            {f.name}
                          </button>
                          {f.protection && (
                            <span data-protected={f.protection} title={PROTECTION_LABEL[f.protection]} className="inline-flex shrink-0 text-neutral-500">
                              <Lock aria-label={PROTECTION_LABEL[f.protection]} className="size-3.5" strokeWidth={2} />
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={f.favorite ? `Retirer ${f.name} des favoris` : `Ajouter ${f.name} aux favoris`}
                            aria-pressed={f.favorite}
                            onClick={(e) => {
                              e.stopPropagation();
                              v.toggleFavorite(f.id);
                            }}
                            className={clsx(
                              "flex h-6 shrink-0 items-center justify-center overflow-hidden rounded-md hover:bg-neutral-200/60",
                              // Takes no room until the row is hovered, so long names keep their space.
                              f.favorite ? "w-6 text-ink" : "w-0 text-neutral-400 focus-visible:w-6 group-hover:w-6",
                            )}
                          >
                            <Star className="size-3.5" strokeWidth={1.75} fill={f.favorite ? "currentColor" : "none"} />
                          </button>
                        </div>
                        <p className="truncate text-[12.5px] text-neutral-500">
                          {compact ? (
                            <>
                              {formatSize(f.size)} · {f.ext}
                            </>
                          ) : (
                            <>
                              <span className="min-[1420px]:hidden">
                                {f.ext.toUpperCase()} · <span className="min-[1140px]:hidden">{formatSize(f.size)} · </span>
                              </span>
                              {folderName.get(f.folderId) ?? "—"}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  {!compact && <td className={clsx(td, "hidden text-[13px] text-neutral-700 min-[1420px]:table-cell")}>{KIND_LABEL[f.kind]}</td>}
                  <td className={clsx(td, "hidden text-[13px] md:table-cell")}>
                    {f.projectId ? <span className="font-medium text-neutral-700">{projectCode.get(f.projectId)}</span> : <span className="text-neutral-400">—</span>}
                  </td>
                  <td className={clsx(td, "hidden xl:table-cell")}>
                    <div className="flex items-center gap-2.5">
                      <Avatar user={owner} size={30} />
                      <div className="min-w-0 leading-tight">
                        <p className="truncate text-[13px] font-medium text-ink">{owner.name}</p>
                        <p className="truncate text-[12px] text-neutral-500">{owner.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className={clsx(td, "whitespace-nowrap text-[13px] text-neutral-600", compact ? "hidden sm:table-cell" : "hidden md:table-cell")}>{formatDate(f.modifiedAt)}</td>
                  {!compact && (
                    <td className={clsx(td, "hidden sm:table-cell")}>
                      <StatusBadge status={f.status} />
                    </td>
                  )}
                  {!compact && <td className={clsx(td, "hidden whitespace-nowrap text-[13px] tabular-nums text-neutral-600 min-[1140px]:table-cell")}>{formatSize(f.size)}</td>}
                  <td className="pl-2 pr-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {!compact && !trash && (
                        <>
                          <span className="hidden min-[1600px]:block">
                            <Button variant="soft" size="sm" icon={Download} onClick={() => void v.downloadFile(f.id)}>
                              Télécharger
                            </Button>
                          </span>
                          <span className="max-sm:hidden min-[1600px]:hidden">
                            <IconButton icon={Download} label={`Télécharger ${fullName(f)}`} variant="soft" size="sm" onClick={() => void v.downloadFile(f.id)} />
                          </span>
                        </>
                      )}
                      <RowMenu file={f} listIds={listIds} vertical={compact} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <EmptyState icon={Inbox} title={emptyTitle} hint={emptyHint} />}
      </div>

      {footer && <Pagination page={current} pages={pages} total={sorted.length} from={(current - 1) * rows + 1} to={Math.min(current * rows, sorted.length)} rows={rows} rowOptions={rowOptions} setPage={setPage} setRows={setRows} />}

      {selected.size > 0 && <BulkBar ids={[...selected]} clear={() => setSelected(new Set())} trash={trash} />}
    </div>
  );
}
