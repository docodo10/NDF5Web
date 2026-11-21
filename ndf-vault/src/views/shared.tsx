"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, CloudUpload, Ellipsis, FileArchive, FileImage, FileSpreadsheet, FileText, FileType, FolderInput, FolderPlus, History, LayoutGrid, Pencil, Plus, Presentation, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Fragment, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import { pickedFromZip } from "@/lib/uploads";
import { useVault } from "@/lib/store";
import type { ActivityItem, Folder, Project } from "@/lib/types";
import { folderRules } from "@/lib/selectors";
import { USERS } from "@/lib/sample-data";
import { formatDate, formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { journalText } from "@/lib/journal";
import { KIND_GROUPS, type KindGroup } from "@/components/files/Explorer";
import { MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from "@/components/files/menu-styles";
import { Avatar, Button, Chip, EmptyState, IconButton, type TabItem } from "@/components/ui";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/* ---------------------------------------------------------------- Kind tabs */

const KIND_ICON: Record<KindGroup, IconType> = {
  all: LayoutGrid,
  documents: FileType,
  spreadsheets: FileSpreadsheet,
  pdfs: FileText,
  presentations: Presentation,
  images: FileImage,
};

export function kindTabs(withIcons: boolean): TabItem<KindGroup>[] {
  // With icons this sits right above the "View All / My Files" row, so the first tab is named differently.
  return KIND_GROUPS.map((g) => ({ id: g.id, label: withIcons && g.id === "all" ? t("Tous les types", "All types") : g.label, icon: withIcons ? KIND_ICON[g.id] : undefined }));
}

/* -------------------------------------------------------------- Breadcrumbs */

export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label={t("Fil d’Ariane", "Breadcrumb")}>
      <ol className="flex flex-wrap items-center gap-1 text-[13px]">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${i}-${c.label}`}>
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-neutral-300" strokeWidth={2} />}
              <li className="min-w-0">
                {c.onClick && !last ? (
                  <button type="button" onClick={c.onClick} className="-mx-1 rounded px-1 text-neutral-500 transition-colors duration-150 hover:text-ink">
                    {c.label}
                  </button>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-ink" : "text-neutral-500"}>
                    {c.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/* ----------------------------------------------------------- Header actions */

export function UploadButton({ folderId = null }: { folderId?: string | null }) {
  const { openDialog } = useVault();
  return (
    <Button icon={Upload} onClick={() => openDialog({ type: "upload", folderId })}>
      {t("Téléverser", "Upload")}
    </Button>
  );
}

/**
 * Import a ZIP archive: it is unpacked here, in the browser, and its files go
 * through the upload dialog like any others, in the folders the archive had.
 */
function useZipImport(folderId: string | null) {
  const { openDialog, notify } = useVault();
  const input = useRef<HTMLInputElement>(null);
  const element = (
    <input
      ref={input}
      data-zip-input
      type="file"
      accept=".zip,application/zip"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const archive = e.target.files?.[0];
        e.target.value = "";
        if (!archive) return;
        void pickedFromZip(archive).then(
          ({ picked, skipped }) => {
            if (picked.length === 0) return notify(skipped ? t("Rien n’a pu être extrait de cette archive : ses fichiers sont trop volumineux ou illisibles.", "Nothing could be extracted from this archive: its files are too large or unreadable.") : t("Cette archive ne contient aucun fichier.", "This archive contains no files."));
            if (skipped)
              notify(
                t(
                  `${skipped} élément${skipped > 1 ? "s" : ""} de l’archive laissé${skipped > 1 ? "s" : ""} de côté : trop volumineux ou illisible${skipped > 1 ? "s" : ""}.`,
                  `${skipped} ${skipped > 1 ? "items" : "item"} in the archive left out: too large or unreadable.`,
                ),
              );
            openDialog({ type: "upload", folderId, picked });
          },
          () => notify(t("Ce fichier n’est pas une archive ZIP lisible.", "This file is not a readable ZIP archive.")),
        );
      }}
    />
  );
  return { element, open: () => input.current?.click() };
}

/** Black "Ajouter" button with its menu: upload files, new folder. */
export function AddFileMenu({ folderId = "root" }: { folderId?: string }) {
  const { openDialog } = useVault();
  const zip = useZipImport(folderId === "root" ? null : folderId);
  return (
    <>
    {zip.element}
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button variant="primary" icon={Plus}>
          {t("Ajouter", "Add")}
          <ChevronDown className="-mr-1 size-3.5 opacity-70" strokeWidth={2} />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} collisionPadding={12} className={MENU_CONTENT}>
          <Dropdown.Item className={MENU_ITEM} onSelect={() => openDialog({ type: "upload", folderId: folderId === "root" ? null : folderId })}>
            <CloudUpload className="size-4 text-neutral-500" strokeWidth={1.75} /> {t("Téléverser des fichiers", "Upload files")}
          </Dropdown.Item>
          <Dropdown.Item className={MENU_ITEM} onSelect={zip.open}>
            <FileArchive className="size-4 text-neutral-500" strokeWidth={1.75} /> {t("Importer une archive ZIP", "Import a ZIP archive")}
          </Dropdown.Item>
          <Dropdown.Separator className={MENU_SEPARATOR} />
          <Dropdown.Item className={MENU_ITEM} onSelect={() => openDialog({ type: "newFolder", parentId: folderId })}>
            <FolderPlus className="size-4 text-neutral-500" strokeWidth={1.75} /> {t("Nouveau dossier", "New folder")}
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
    </>
  );
}

/** The "⋯" menu of a folder page: rename, move, export, delete. */
export function FolderMenu({ folder, fileIds }: { folder: Folder; fileIds: string[] }) {
  const v = useVault();
  const rules = folderRules(folder, v.folders, v.files, v.projects);
  const icon = "size-4 text-neutral-500";
  const zip = useZipImport(folder.id);
  return (
    <>
    {zip.element}
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <IconButton icon={Ellipsis} label={t("Actions du dossier", "Folder actions")} className="data-[state=open]:bg-fill" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} collisionPadding={12} className={MENU_CONTENT}>
          {/* A blocked action stays in the menu and says why, rather than silently missing. */}
          <Dropdown.Item className={MENU_ITEM} onSelect={() => (rules.renamable ? v.openDialog({ type: "renameFolder", folderId: folder.id }) : v.notify(rules.moveBlocked ?? t("Ce dossier ne peut pas être renommé.", "This folder cannot be renamed.")))}>
            <Pencil className={icon} strokeWidth={1.75} /> {t("Renommer", "Rename")}
          </Dropdown.Item>
          <Dropdown.Item className={MENU_ITEM} onSelect={() => (rules.moveBlocked ? v.notify(rules.moveBlocked) : v.openDialog({ type: "moveFolder", folderId: folder.id }))}>
            <FolderInput className={icon} strokeWidth={1.75} /> {t("Déplacer", "Move")}
          </Dropdown.Item>
          <Dropdown.Item className={MENU_ITEM} onSelect={() => void v.exportZip(fileIds, folder.name)}>
            <FileArchive className={icon} strokeWidth={1.75} /> {t("Exporter en ZIP", "Export as ZIP")}
          </Dropdown.Item>
          <Dropdown.Item className={MENU_ITEM} onSelect={zip.open}>
            <FolderInput className={icon} strokeWidth={1.75} /> {t("Importer une archive ZIP", "Import a ZIP archive")}
          </Dropdown.Item>
          <Dropdown.Separator className={MENU_SEPARATOR} />
          <Dropdown.Item className={`${MENU_ITEM} !text-red-600 data-[highlighted]:!bg-red-50`} onSelect={() => v.openDialog({ type: "deleteFolder", folderId: folder.id })}>
            <Trash2 className="size-4 text-red-500" strokeWidth={1.75} /> {t("Supprimer", "Delete")}
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
    </>
  );
}

/** The "⋯" menu of a project page: edit, archive or restore. */
export function ProjectMenu({ project }: { project: Project }) {
  const v = useVault();
  const icon = "size-4 text-neutral-500";
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <IconButton icon={Ellipsis} label={t("Actions du projet", "Project actions")} className="data-[state=open]:bg-fill" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} collisionPadding={12} className={MENU_CONTENT}>
          <Dropdown.Item className={MENU_ITEM} onSelect={() => v.openDialog({ type: "editProject", projectId: project.id })}>
            <Pencil className={icon} strokeWidth={1.75} /> {t("Modifier le projet", "Edit project")}
          </Dropdown.Item>
          <Dropdown.Item className={MENU_ITEM} onSelect={() => v.setProjectArchived(project.id, !project.archived)}>
            {project.archived ? <ArchiveRestore className={icon} strokeWidth={1.75} /> : <Archive className={icon} strokeWidth={1.75} />}
            {project.archived ? t("Restaurer le projet", "Restore project") : t("Archiver le projet", "Archive project")}
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/* ------------------------------------------------------------ Section title */

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{children}</h2>
      {aside}
    </div>
  );
}

/* ----------------------------------------------------------------- Activity */

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Activity entries grouped by day, newest first. */
export function ActivityList({ items, emptyTitle = t("Aucune activité pour l’instant", "No activity yet"), emptyHint }: { items: ActivityItem[]; emptyTitle?: string; emptyHint?: string }) {
  const { files, projects, openPreview } = useVault();

  const days = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at));
    const out: { day: string; items: ActivityItem[] }[] = [];
    for (const it of sorted) {
      const day = it.at.slice(0, 10);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(it);
      else out.push({ day, items: [it] });
    }
    return out;
  }, [items]);

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white">
        <EmptyState icon={History} title={emptyTitle} hint={emptyHint} />
      </div>
    );
  }

  const today = todayIso();
  const yesterday = todayIso(1);
  const projectCode = new Map(projects.map((p) => [p.id, p.code]));

  return (
    <div className="space-y-6">
      {days.map(({ day, items: dayItems }) => (
        <section key={day}>
          <h3 className="mb-2 flex items-baseline gap-2 text-[12.5px] font-medium text-neutral-500">
            {day === today ? t("Aujourd’hui", "Today") : day === yesterday ? t("Hier", "Yesterday") : formatDate(day)}
            {(day === today || day === yesterday) && <span className="font-normal text-neutral-400">{formatDate(day)}</span>}
          </h3>
          <ul className="overflow-hidden rounded-xl border border-line bg-white">
            {dayItems.map((it, i) => {
              const user = USERS.find((u) => u.id === it.userId);
              // Shown in the language of the interface; a file is matched under the recorded name and under the one shown.
              const said = journalText(it);
              const file = files.find((f) => !f.deleted && (`${f.name}.${f.ext}` === it.target || `${f.name}.${f.ext}` === said.target));
              return (
                <li key={it.id} className={`flex min-h-[56px] items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-hair" : ""}`}>
                  {it.kind === "security" ? (
                    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-ink text-white">
                      <ShieldCheck className="size-4" strokeWidth={1.75} />
                    </span>
                  ) : (
                    user && <Avatar user={user} size={30} />
                  )}
                  <p className="min-w-0 flex-1 text-[13px] leading-[19px] text-neutral-600">
                    <span className="font-medium text-ink">{user?.name ?? t("Quelqu’un", "Someone")}</span> {said.verb}{" "}
                    {file ? (
                      <button type="button" onClick={() => openPreview(file.id)} className="break-words text-left font-medium text-ink underline-offset-2 hover:underline">
                        {said.target}
                      </button>
                    ) : (
                      <span className="break-words font-medium text-ink">{said.target}</span>
                    )}
                  </p>
                  {it.code && (
                    <span data-code title={t("Code de consultation, imprimé dans le filigrane de cette ouverture", "Viewing code, printed in the watermark of this opening")} className="inline-flex">
                      <Chip className="font-mono tracking-wide">{it.code}</Chip>
                    </span>
                  )}
                  {it.kind === "security" && <Chip className="hidden sm:inline-flex">{t("Sécurité", "Security")}</Chip>}
                  {it.projectId && projectCode.has(it.projectId) && <Chip className="hidden sm:inline-flex">{projectCode.get(it.projectId)}</Chip>}
                  <time dateTime={it.at} className="shrink-0 whitespace-nowrap text-[12.5px] tabular-nums text-neutral-400">
                    {formatTime(it.at)}
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
