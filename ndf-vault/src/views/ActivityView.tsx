"use client";

import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import { CURRENT_USER_ID } from "@/lib/sample-data";
import { PageHeader, SampleNotice, TextTabs, type TabItem } from "@/components/ui";
import { ActivityList } from "./shared";

type Who = "all" | "mine";

export function ActivityView() {
  const { activity } = useVault();
  const [who, setWho] = useState<Who>("all");
  const mine = useMemo(() => activity.filter((a) => a.userId === CURRENT_USER_ID), [activity]);

  const items: TabItem<Who>[] = [
    { id: "all", label: "Toute l’activité", count: activity.length },
    { id: "mine", label: "Mon activité", count: mine.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Activité" description="L’historique des changements dans le Vault." actions={<SampleNotice />} />
      <TextTabs<Who> label="Portée de l’activité" items={items} value={who} onChange={setWho} />
      <div className="max-w-[880px]">
        <ActivityList items={who === "all" ? activity : mine} emptyHint="Renommez, déplacez, archivez ou copiez un fichier : ce sera consigné ici." />
      </div>
    </div>
  );
}
