"use client";

import { Activity, Clapperboard, Files, FolderOpen, FolderSearch, Landmark, LayoutDashboard, Scale, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import type { FileStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { USERS } from "@/lib/sample-data";
import { activeFiles, byModifiedDesc, CATEGORY_LABEL, fileCategory, type ProjectCategory } from "@/lib/selectors";
import { count } from "@/lib/format";
import { localized, t } from "@/lib/i18n";
import { ExplorerToolbar, useFileFilters } from "@/components/files/Explorer";
import { FileTable } from "@/components/files/FileTable";
import { Avatar, Button, Chip, EmptyState, PageHeader, SegmentedTabs, StatusBadge, type TabItem } from "@/components/ui";
import { ActivityList, Breadcrumbs, ProjectMenu, SectionTitle, UploadButton } from "./shared";

type Tab = "overview" | "files" | "financial" | "production" | "legal" | "team" | "activity";

// A function, so that the labels follow the language at the time they are drawn.
const tabs = (): TabItem<Tab>[] => [
  { id: "overview", label: t("Aperçu", "Overview"), icon: LayoutDashboard },
  { id: "files", label: t("Fichiers", "Files"), icon: Files },
  { id: "financial", label: t("Documents financiers", "Financial documents"), icon: Landmark },
  { id: "production", label: "Production", icon: Clapperboard },
  { id: "legal", label: t("Juridique", "Legal"), icon: Scale },
  { id: "team", label: t("Équipe", "Team"), icon: Users },
  { id: "activity", label: t("Activité", "Activity"), icon: Activity },
];

const CATEGORY_EMPTY: Record<"financial" | "production" | "legal", string> = localized({
  financial: ["Les fichiers du dossier 05 Affaires et finances liés à ce projet apparaissent ici.", "Files from the 05 Business and Finance folder linked to this project appear here."],
  production: [
    "Les fichiers des dossiers 02 Scénarios, 03 Développement de l’histoire, 04 Production et 07 Talents et packaging apparaissent ici.",
    "Files from the 02 Screenplays, 03 Story Development, 04 Production and 07 Talent and Packaging folders appear here.",
  ],
  legal: ["Les fichiers du dossier 06 Juridique et chaîne de titres liés à ce projet apparaissent ici.", "Files from the 06 Legal and Chain of Title folder linked to this project appear here."],
});

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-xs">
      <h3 className="mb-3 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children, onClick }: { label: ReactNode; children: ReactNode; onClick?: () => void }) {
  const cls = "flex h-9 w-full items-center justify-between gap-4 border-t border-hair text-[13px] first:border-t-0";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} -mx-2 w-[calc(100%+16px)] rounded-md px-2 text-left transition-colors duration-150 hover:bg-subtle`}>
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium tabular-nums text-ink">{children}</span>
    </button>
  ) : (
    <div className={cls}>
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium tabular-nums text-ink">{children}</span>
    </div>
  );
}

export function ProjectView({ id }: { id: string }) {
  const v = useVault();
  const project = v.projects.find((p) => p.id === id);
  const [tab, setTab] = useState<Tab>("overview");

  const files = useMemo(() => activeFiles(v.files).filter((f) => f.projectId === id), [v.files, id]);
  const byCategory = useMemo(() => {
    const out: Record<ProjectCategory, typeof files> = { financial: [], production: [], legal: [], other: [] };
    for (const f of files) out[fileCategory(f, v.folders, v.projects)].push(f);
    return out;
  }, [files, v.folders, v.projects]);

  const tabFiles = tab === "financial" || tab === "production" || tab === "legal" ? byCategory[tab] : files;
  const filters = useFileFilters(tabFiles);
  const activity = useMemo(() => v.activity.filter((a) => a.projectId === id), [v.activity, id]);

  if (!project) {
    return (
      <div className="rounded-xl border border-line bg-white">
        <EmptyState icon={FolderSearch} title={t("Projet introuvable", "Project not found")} hint={t("Ce projet n’existe pas ou a été retiré.", "This project does not exist or has been removed.")} />
        <div className="-mt-8 flex justify-center pb-12">
          <Button onClick={() => v.navigate({ view: "projects" })}>{t("Voir tous les projets", "View all projects")}</Button>
        </div>
      </div>
    );
  }

  const team = USERS.map((u) => ({ user: u, count: files.filter((f) => f.ownerId === u.id).length })).filter((t) => t.count > 0);
  const statusCount = (s: FileStatus) => files.filter((f) => f.status === s).length;
  const recent = [...files].sort(byModifiedDesc).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("Tous les projets", "All projects"), onClick: () => v.navigate({ view: "projects" }) }, { label: project.code }]} />}
        title={project.name}
        description={project.archived ? t(`${project.period} · Projet archivé`, `${project.period} · Archived project`) : project.period}
        actions={
          <>
            <Button icon={FolderOpen} onClick={() => v.navigate({ view: "folder", id: project.folderId })}>
              {t("Ouvrir le dossier", "Open folder")}
            </Button>
            <UploadButton folderId={project.folderId} />
            <ProjectMenu project={project} />
          </>
        }
      />

      <SegmentedTabs<Tab> label={t("Sections du projet", "Project sections")} items={tabs()} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={t("À propos", "About")}>
              <p className="mb-3 text-[13px] leading-[19px] text-neutral-600">{project.summary}</p>
              <Row label="Code">{project.code}</Row>
              <Row label={t("Période", "Period")}>{project.period}</Row>
              <Row label={t("Années", "Years")}>
                {project.storyYears.length > 0 ? (
                  <span className="flex gap-1.5">
                    {project.storyYears.map((y) => (
                      <Chip key={y}>{y}</Chip>
                    ))}
                  </span>
                ) : (
                  <span className="font-normal text-neutral-400">{t("Non défini", "Not set")}</span>
                )}
              </Row>
            </Card>

            <Card title="Documents">
              <Row label={t("Tous les fichiers", "All files")} onClick={() => setTab("files")}>
                {files.length}
              </Row>
              {(["financial", "production", "legal"] as const).map((c) => (
                <Row key={c} label={CATEGORY_LABEL[c]} onClick={() => setTab(c)}>
                  {byCategory[c].length}
                </Row>
              ))}
              {byCategory.other.length > 0 && <Row label={CATEGORY_LABEL.other}>{byCategory.other.length}</Row>}
            </Card>

            <Card title={t("Statuts", "Statuses")}>
              {STATUSES.filter((s) => s !== "Archived").map((s) => (
                <Row key={s} label={<StatusBadge status={s} />}>
                  {statusCount(s)}
                </Row>
              ))}
            </Card>
          </div>

          <section className="space-y-3">
            <SectionTitle
              aside={
                files.length > recent.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setTab("files")}>
                    {t(`Voir les ${count(files.length, "fichier")}`, `View all ${count(files.length, "file")}`)}
                  </Button>
                ) : undefined
              }
            >
              {t("Modifiés récemment", "Recently modified")}
            </SectionTitle>
            <FileTable
              variant="compact"
              files={recent}
              footer={false}
              emptyTitle={t("Aucun fichier dans ce projet", "No files in this project")}
              emptyHint={t("Liez un fichier à ce projet dans Modifier les détails, ou téléversez-en un.", "Link a file to this project in Edit details, or upload one.")}
            />
          </section>
        </div>
      )}

      {(tab === "files" || tab === "financial" || tab === "production" || tab === "legal") && (
        <div className="space-y-4">
          <ExplorerToolbar
            hideProject
            filters={filters}
            left={
              <p className="text-[13px] text-neutral-500">
                <span className="font-medium tabular-nums text-ink">{t(count(filters.filtered.length, "fichier"), count(filters.filtered.length, "file"))}</span>
                {tab !== "files" && <span> · {CATEGORY_LABEL[tab]}</span>}
              </p>
            }
          />
          <FileTable
            key={tab}
            files={filters.filtered}
            emptyTitle={
              tabFiles.length === 0
                ? tab === "files"
                  ? t("Aucun fichier dans ce projet", "No files in this project")
                  : t(`${CATEGORY_LABEL[tab]} : rien pour l’instant`, `${CATEGORY_LABEL[tab]}: nothing yet`)
                : t("Aucun fichier ne correspond", "No files match")
            }
            emptyHint={
              tabFiles.length === 0
                ? tab === "files"
                  ? t("Liez un fichier à ce projet dans Modifier les détails, ou téléversez-en un.", "Link a file to this project in Edit details, or upload one.")
                  : CATEGORY_EMPTY[tab]
                : t("Effacez la recherche ou réinitialisez les filtres.", "Clear the search or reset the filters.")
            }
          />
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-subtle">
                  <th scope="col" className="h-11 px-4 text-left text-[12.5px] font-medium text-neutral-500">
                    {t("Service", "Department")}
                  </th>
                  <th scope="col" className="hidden h-11 px-3 text-left text-[12.5px] font-medium text-neutral-500 sm:table-cell">
                    {t("Rôle", "Role")}
                  </th>
                  <th scope="col" className="h-11 w-[120px] px-4 text-right text-[12.5px] font-medium text-neutral-500">
                    {t("Fichiers du projet", "Project files")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map(({ user, count }) => (
                  <tr key={user.id} className="h-[60px] border-t border-hair">
                    <td className="px-4">
                      <div className="flex items-center gap-3">
                        <Avatar user={user} size={32} />
                        <span className="text-[13.5px] font-medium text-ink">{user.name}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 text-[13px] text-neutral-600 sm:table-cell">{user.role}</td>
                    <td className="px-4 text-right text-[13px] tabular-nums text-neutral-700">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {team.length === 0 && <EmptyState icon={Users} title={t("Aucun contributeur", "No contributors")} hint={t("Les services qui ajoutent des fichiers à ce projet apparaissent ici.", "Departments that add files to this project appear here.")} />}
          </div>
          <p className="text-[12.5px] text-neutral-500">
            {t(
              "Services d’exemple, listés parce qu’ils possèdent des fichiers de ce projet. La gestion des membres et des permissions arrivera avec la connexion des invités.",
              "Sample departments, listed because they own files in this project. Member and permission management will come with guest sign-in.",
            )}
          </p>
        </div>
      )}

      {tab === "activity" && <ActivityList
          items={activity}
          emptyTitle={t("Aucune activité pour ce projet", "No activity for this project")}
          emptyHint={t("Les changements apportés aux fichiers de ce projet s’afficheront ici.", "Changes made to this project’s files will show here.")}
        />}
    </div>
  );
}
