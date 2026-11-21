"use client";

import { Pin, PinOff, Plus } from "lucide-react";
import { CloudArrowUpIcon, CompassIcon, FolderIcon, KanbanIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import { activeFiles, byCreatedDesc, byModifiedDesc } from "@/lib/selectors";
import { formatSize } from "@/lib/format";
import { t } from "@/lib/i18n";
import { ExplorerToolbar, useFileFilters, type KindGroup } from "@/components/files/Explorer";
import { DueChip } from "@/components/files/DueChip";
import { FileIcon, FileTable } from "@/components/files/FileTable";
import { dueOf } from "@/lib/due";
import { PageHeader, SampleNotice, SegmentedTabs, TextTabs, type TabItem } from "@/components/ui";
import { kindTabs, SectionTitle } from "./shared";

type Scope = "recent" | "modified" | "shared" | "all";

// A function, so that the labels follow the language at the time they are drawn.
const scopes = (): TabItem<Scope>[] => [
  { id: "recent", label: t("Ajouts récents", "Recently added") },
  { id: "modified", label: t("Modifiés récemment", "Recently modified") },
  { id: "shared", label: t("Partagés avec moi", "Shared with me") },
  { id: "all", label: t("Tous les fichiers", "All files") },
];

const RECENT_COUNT = 14;

function ActionCard({ icon: Icon, label, hint, onClick }: { icon: PhosphorIcon; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-[104px] flex-col justify-between rounded-xl border border-line bg-white p-3.5 text-left shadow-xs transition-colors duration-150 hover:border-neutral-300 hover:bg-subtle"
    >
      <span className="flex items-start justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-fill text-neutral-700 transition-colors duration-150 group-hover:bg-neutral-200/70">
          <Icon weight="fill" className="size-[19px]" />
        </span>
        <Plus className="size-4 text-neutral-400 transition-colors duration-150 group-hover:text-ink" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[12.5px] text-neutral-500">{hint}</span>
      </span>
    </button>
  );
}

export function Home() {
  const v = useVault();
  const active = useMemo(() => activeFiles(v.files), [v.files]);
  const [scope, setScope] = useState<Scope>("recent");

  const scoped = useMemo(() => {
    switch (scope) {
      case "recent":
        return [...active].sort(byCreatedDesc).slice(0, RECENT_COUNT);
      case "modified":
        return [...active].sort(byModifiedDesc).slice(0, RECENT_COUNT);
      case "shared":
        return active.filter((f) => f.sharedWithMe);
      default:
        return active;
    }
  }, [active, scope]);

  const filters = useFileFilters(scoped);
  const pinned = useMemo(() => active.filter((f) => f.pinned).sort(byModifiedDesc), [active]);
  const pinnedIds = pinned.map((f) => f.id);
  // Dates that are past or within two months, the most pressing first.
  const dated = useMemo(
    () =>
      active
        .map((f) => ({ f, due: dueOf(f.dueAt) }))
        .filter((x) => x.due !== null && x.due.days <= 60)
        .sort((a, b) => a.due!.days - b.due!.days)
        .slice(0, 6),
    [active],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("Bienvenue dans NDF Vault", "Welcome to NDF Vault")}
        description={t("The New Drago Family — gestion des documents et de la production", "The New Drago Family — document and production management")}
        actions={<SampleNotice />}
      />

      <section aria-label={t("Actions rapides", "Quick actions")} data-tour="actions" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <ActionCard icon={CloudArrowUpIcon} label={t("Téléverser", "Upload")} hint="PDF, Office, images" onClick={() => v.openDialog({ type: "upload", folderId: null })} />
        <ActionCard icon={FolderIcon} label={t("Nouveau dossier", "New folder")} hint={t("Dans l’index du Vault", "In the Vault index")} onClick={() => v.openDialog({ type: "newFolder", parentId: "root" })} />
        <ActionCard icon={KanbanIcon} label={t("Nouveau projet", "New project")} hint={t("Un espace par production", "One workspace per production")} onClick={() => v.openDialog({ type: "newProject" })} />
        <ActionCard icon={CompassIcon} label={t("Visite guidée", "Guided tour")} hint={t("Le tour en une minute", "The tour in one minute")} onClick={v.startTour} />
      </section>

      {dated.length > 0 && (
        <section className="space-y-3" aria-label={t("Échéances", "Due dates")}>
          <SectionTitle>{t("Échéances", "Due dates")}</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dated.map(({ f }) => (
              <li key={f.id}>
                <button type="button" onClick={() => v.openInfo(f.id)} className="flex min-h-[60px] w-full items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2 text-left shadow-xs transition-colors duration-150 hover:border-neutral-300 hover:bg-subtle">
                  <FileIcon kind={f.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{f.name}</span>
                    <span className="block truncate text-[12.5px] text-neutral-500">{f.dueLabel ?? t("Échéance", "Due date")}</span>
                  </span>
                  <DueChip dueAt={f.dueAt} label={f.dueLabel} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle>{t("Explorateur de fichiers", "File explorer")}</SectionTitle>

        <ExplorerToolbar
          left={<SegmentedTabs<KindGroup> label={t("Type de fichier", "File type")} items={kindTabs(false)} value={filters.state.kind} onChange={(kind) => filters.setState((s) => ({ ...s, kind }))} />}
          filters={filters}
        />

        {pinned.length > 0 ? (
          <ul aria-label={t("Fichiers épinglés", "Pinned files")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pinned.map((f) => (
              <li key={f.id} className="group relative flex h-[60px] items-center gap-3 rounded-[10px] border border-line bg-white pl-3 pr-2 shadow-xs transition-colors duration-150 hover:border-neutral-300">
                <FileIcon kind={f.kind} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => v.openPreview(f.id, pinnedIds)}
                    className="block max-w-full truncate text-left text-[13.5px] font-medium text-ink before:absolute before:inset-0 before:rounded-[10px] before:content-['']"
                  >
                    {f.name}
                  </button>
                  <p className="truncate text-[12.5px] text-neutral-500">
                    {formatSize(f.size)} · {f.ext}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={t(`Désépingler ${f.name}`, `Unpin ${f.name}`)}
                  title={t("Désépingler", "Unpin")}
                  onClick={() => v.togglePinned(f.id)}
                  className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors duration-150 hover:bg-fill hover:text-ink"
                >
                  <Pin className="size-4 group-hover:hidden" strokeWidth={1.75} />
                  <PinOff className="hidden size-4 group-hover:block" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[10px] border border-dashed border-line bg-subtle px-4 py-3.5 text-[13px] text-neutral-500">
            {t(
              <>
                Aucun fichier épinglé. Choisissez <span className="font-medium text-neutral-700">Épingler à l’accueil</span> dans le menu d’un fichier pour le garder ici.
              </>,
              <>
                No pinned files. Choose <span className="font-medium text-neutral-700">Pin to Home</span> in a file’s menu to keep it here.
              </>,
            )}
          </p>
        )}

        <TextTabs<Scope> label={t("Portée", "Scope")} items={scopes()} value={scope} onChange={setScope} />

        <FileTable
          variant="compact"
          files={filters.filtered}
          emptyTitle={t("Aucun fichier ne correspond", "No files match")}
          emptyHint={t("Essayez un autre type, effacez la recherche ou réinitialisez les filtres.", "Try another type, clear the search or reset the filters.")}
        />
      </section>
    </div>
  );
}
