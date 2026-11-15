"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import { CURRENT_USER_ID } from "@/lib/sample-data";
import { normalizeConsultationCode } from "@/lib/protection";
import { fold } from "@/lib/search";
import { SearchField } from "@/components/files/Explorer";
import { Button, PageHeader, TextTabs, type TabItem } from "@/components/ui";
import { ActivityList } from "./shared";

type Scope = "all" | "mine" | "security";

export function ActivityView() {
  const { activity, exportJournal } = useVault();
  const [scope, setScope] = useState<Scope>("all");
  const mine = useMemo(() => activity.filter((a) => a.userId === CURRENT_USER_ID), [activity]);
  const security = useMemo(() => activity.filter((a) => a.kind === "security"), [activity]);
  const [query, setQuery] = useState("");
  const scoped = scope === "all" ? activity : scope === "mine" ? mine : security;
  // A consultation code read off a photo finds the opening it came from, however it is typed.
  const shown = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return scoped;
    const code = normalizeConsultationCode(query);
    return scoped.filter((a) => (code !== null && a.code === code) || fold(`${a.verb} ${a.target} ${a.code ?? ""}`).includes(needle));
  }, [scoped, query]);

  const items: TabItem<Scope>[] = [
    { id: "all", label: "Toute l’activité", count: activity.length },
    { id: "mine", label: "Mon activité", count: mine.length },
    { id: "security", label: "Sécurité", count: security.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activité"
        description="Le journal du Vault : ouvertures, téléchargements, changements et événements de sécurité."
        actions={
          <Button icon={Download} disabled={shown.length === 0} onClick={() => void exportJournal(shown)}>
            Exporter (CSV)
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TextTabs<Scope> label="Portée de l’activité" items={items} value={scope} onChange={setScope} />
        <SearchField value={query} onChange={setQuery} placeholder="Action, fichier ou code de consultation" />
      </div>
      <div className="max-w-[880px]">
        <ActivityList
          items={shown}
          emptyTitle={query.trim() ? "Aucune entrée ne correspond" : scope === "security" ? "Aucun événement de sécurité" : "Aucune activité pour l’instant"}
          emptyHint={query.trim() ? "Vérifiez le code ou essayez un autre mot." : scope === "security" ? "Les verrouillages, déverrouillages, changements de phrase secrète et fichiers altérés s’afficheront ici." : "Ouvrez, renommez, déplacez ou téléchargez un fichier : ce sera consigné ici."}
        />
      </div>
    </div>
  );
}
