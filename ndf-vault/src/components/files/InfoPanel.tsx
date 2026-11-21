"use client";

import { Download, Eye, History, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import type { VaultFile } from "@/lib/types";
import { CURRENT_USER_ID, USERS } from "@/lib/sample-data";
import { dueOf, today } from "@/lib/due";
import { folderPath, formatDate, formatSize, formatTime, fullName, KIND_LABEL } from "@/lib/format";
import { PROTECTION_LABEL, protectionOf } from "@/lib/protection";
import { INPUT } from "../dialog-kit";
import { Button, Chip, IconButton, StatusBadge } from "../ui";
import { DueChip } from "./DueChip";
import { FileIcon } from "./FileTable";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-hair px-5 py-4">
      <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start justify-between gap-4 py-1 text-[13px]">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

/** The date that matters for the file: an option lapsing, a renewal, a signature expected. */
function DueEditor({ file }: { file: VaultFile }) {
  const { setDue } = useVault();
  const [date, setDate] = useState(file.dueAt ?? "");
  const [label, setLabel] = useState(file.dueLabel ?? "");
  const due = dueOf(file.dueAt);
  const changed = date !== (file.dueAt ?? "") || label.trim() !== (file.dueLabel ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (date) setDue(file.id, date, label);
      }}
    >
      {due && (
        <p className="mb-2.5 flex flex-wrap items-center gap-2 text-[13px] text-neutral-700">
          <DueChip dueAt={file.dueAt} label={file.dueLabel} />
          <span>
            {file.dueLabel ? `${file.dueLabel} · ` : ""}
            {formatDate(file.dueAt!)}
          </span>
        </p>
      )}
      <div className="grid gap-2">
        <label className="block">
          <span className="sr-only">Date de l’échéance</span>
          <input id="due-date" type="date" value={date} min="2000-01-01" max="2100-12-31" onChange={(e) => setDate(e.target.value)} className={INPUT} />
        </label>
        <label className="block">
          <span className="sr-only">Ce que cette date représente</span>
          <input id="due-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Ce que c’est : expiration de l’option, renouvellement…" className={INPUT} />
        </label>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" type="submit" disabled={!date || !changed}>
          {file.dueAt ? "Mettre à jour" : "Fixer l’échéance"}
        </Button>
        {!file.dueAt && !date && (
          <Button size="sm" onClick={() => setDate(today())}>
            Aujourd’hui
          </Button>
        )}
        {file.dueAt && (
          <Button
            size="sm"
            onClick={() => {
              setDue(file.id, null);
              setDate("");
              setLabel("");
            }}
          >
            Retirer
          </Button>
        )}
      </div>
    </form>
  );
}

function Comments({ file }: { file: VaultFile }) {
  const { addComment, deleteComment } = useVault();
  const [text, setText] = useState("");
  const comments = file.comments ?? [];
  return (
    <div>
      {comments.length === 0 ? (
        <p className="text-[13px] text-neutral-500">Aucun commentaire. Laissez une note pour vous ou pour la suite.</p>
      ) : (
        <ul aria-label="Commentaires" className="space-y-2.5">
          {comments.map((c) => (
            <li key={c.id} className="group rounded-[10px] border border-line bg-subtle px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[12px] text-neutral-500">
                  <span className="font-medium text-neutral-700">{c.author}</span> · {formatDate(c.at)}, {formatTime(c.at)}
                </p>
                <IconButton icon={Trash2} label="Supprimer ce commentaire" variant="ghost" size="sm" onClick={() => deleteComment(file.id, c.id)} />
              </div>
              {/* Shown as written: line breaks kept, nothing interpreted. */}
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[19px] text-ink">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addComment(file.id, text);
          setText("");
        }}
      >
        <label className="block">
          <span className="sr-only">Nouveau commentaire</span>
          <textarea id="comment-text" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Écrire un commentaire" className={`${INPUT} h-auto resize-none py-2 leading-5`} />
        </label>
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="primary" type="submit" disabled={!text.trim()}>
            Publier
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * Everything about one file in a panel at the side, as file services have:
 * what it is, the date that matters, comments, and what happened to it.
 */
export function InfoPanel() {
  const v = useVault();
  const { infoFileId, closeInfo } = v;
  const file = infoFileId ? v.files.find((f) => f.id === infoFileId) : undefined;
  const busyElsewhere = v.dialog !== null || v.preview !== null || v.paletteOpen;

  // A file that is gone takes its panel with it.
  useEffect(() => {
    if (infoFileId && !file) closeInfo();
  }, [infoFileId, file, closeInfo]);

  // Escape closes the panel, unless something is open on top of it.
  useEffect(() => {
    if (!file || busyElsewhere) return;
    // A press that already closed a dialog or the viewer is not also a request to close the panel.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeInfo();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, busyElsewhere, closeInfo]);

  if (!file) return null;
  const path = folderPath(v.folders, file.folderId);
  const folder = path[path.length - 1];
  const project = v.projects.find((p) => p.id === file.projectId);
  const owner = USERS.find((u) => u.id === file.ownerId);
  const level = protectionOf(file);
  const name = fullName(file);
  const history = v.activity.filter((a) => a.target === name).slice(0, 8);
  const versions = (file.versions?.length ?? 0) + 1;

  return (
    <aside aria-label="Informations sur le fichier" data-info-panel className="flex w-full max-w-[400px] animate-fade flex-col border-l border-line bg-white max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-[45] max-xl:shadow-modal xl:w-[360px] xl:shrink-0">
      <header className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-5">
        <FileIcon kind={file.kind} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[15px] font-semibold leading-5 text-ink">{name}</h2>
          <p className="mt-0.5 text-[12.5px] text-neutral-500">
            {KIND_LABEL[file.kind]} · {formatSize(file.size)}
            {file.sample ? " · Fichier d’exemple" : ""}
          </p>
        </div>
        <IconButton icon={X} label="Fermer les informations" variant="ghost" size="sm" onClick={closeInfo} />
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          <Button size="sm" icon={Eye} onClick={() => v.openPreview(file.id)}>
            Ouvrir
          </Button>
          {!file.sample && level === "standard" && (
            <Button size="sm" icon={Download} onClick={() => void v.downloadFile(file.id)}>
              Télécharger
            </Button>
          )}
          <Button size="sm" icon={History} onClick={() => v.openDialog({ type: "versions", fileId: file.id })}>
            {versions > 1 ? `${versions} versions` : "Versions"}
          </Button>
        </div>

        <Section title="Détails">
          <dl>
            <Fact label="Emplacement">
              <button
                type="button"
                onClick={() => {
                  closeInfo();
                  v.navigate({ view: "folder", id: file.folderId });
                }}
                className="text-right underline-offset-2 hover:underline"
              >
                {folder ? folder.name : "NDF Vault"}
              </button>
            </Fact>
            {project && <Fact label="Projet">{project.code}</Fact>}
            <Fact label="Statut">
              <StatusBadge status={file.status} />
            </Fact>
            <Fact label="Protection">
              {file.sample ? (
                PROTECTION_LABEL[level]
              ) : (
                <button type="button" onClick={() => v.openDialog({ type: "protection", fileIds: [file.id] })} className="underline-offset-2 hover:underline">
                  {PROTECTION_LABEL[level]}
                </button>
              )}
            </Fact>
            <Fact label="Ajouté le">{formatDate(file.createdAt)}</Fact>
            <Fact label="Modifié le">
              {formatDate(file.modifiedAt)}, {formatTime(file.modifiedAt)}
            </Fact>
            {owner && <Fact label="Par">{owner.name}</Fact>}
            {file.tags.length > 0 && (
              <Fact label="Étiquettes">
                <span className="flex flex-wrap justify-end gap-1">
                  {file.tags.map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </span>
              </Fact>
            )}
            {file.sha256 && (
              <Fact label="Empreinte">
                <span title={file.sha256} className="font-mono text-[12px] font-normal text-neutral-600">
                  {file.sha256.slice(0, 16)}…
                </span>
              </Fact>
            )}
          </dl>
          {file.notes && <p className="mt-2 whitespace-pre-wrap break-words rounded-[10px] bg-subtle px-3 py-2 text-[13px] leading-[19px] text-neutral-700">{file.notes}</p>}
        </Section>

        <Section title="Échéance">
          <DueEditor key={file.id} file={file} />
        </Section>

        <Section title={`Commentaires${file.comments?.length ? ` (${file.comments.length})` : ""}`}>
          <Comments key={file.id} file={file} />
        </Section>

        <Section title="Activité">
          {history.length === 0 ? (
            <p className="text-[13px] text-neutral-500">Rien pour l’instant sur ce fichier.</p>
          ) : (
            <ul aria-label="Activité du fichier" className="space-y-2">
              {history.map((a) => (
                <li key={a.id} className="text-[13px] leading-[19px] text-neutral-600">
                  <span className="font-medium text-ink">{a.userId === CURRENT_USER_ID ? v.profile.name : (USERS.find((u) => u.id === a.userId)?.name ?? "Quelqu’un")}</span> {a.verb.replace(/ :$/, "")}
                  <span className="block text-[12px] text-neutral-400">
                    {formatDate(a.at)}, {formatTime(a.at)}
                    {a.code ? ` · ${a.code}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}
