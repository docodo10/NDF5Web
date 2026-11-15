"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import { CURRENT_USER_ID } from "@/lib/sample-data";
import { Button, PageHeader, TextTabs, type TabItem } from "@/components/ui";
import { ActivityList } from "./shared";

type Scope = "all" | "mine" | "security";

export function ActivityView() {
  const { activity, exportJournal } = useVault();
  const [scope, setScope] = useState<Scope>("all");
  const mine = useMemo(() => activity.filter((a) => a.userId === CURRENT_USER_ID), [activity]);
  const security = useMemo(() => activity.filter((a) => a.kind === "security"), [activity]);
  const shown = scope === "all" ? activity : scope === "mine" ? mine : security;

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
      <TextTabs<Scope> label="Portée de l’activité" items={items} value={scope} onChange={setScope} />
      <div className="max-w-[880px]">
        <ActivityList
          items={shown}
          emptyTitle={scope === "security" ? "Aucun événement de sécurité" : "Aucune activité pour l’instant"}
          emptyHint={scope === "security" ? "Les verrouillages, déverrouillages, changements de phrase secrète et fichiers altérés s’afficheront ici." : "Ouvrez, renommez, déplacez ou téléchargez un fichier : ce sera consigné ici."}
        />
      </div>
    </div>
  );
}
