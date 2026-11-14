"use client";

import { useSyncExternalStore } from "react";
import { VaultProvider, useVault } from "@/lib/store";
import { Shell } from "@/components/Shell";
import { Dialogs, ToastHost } from "@/components/Dialogs";
import { PreviewModal } from "@/components/viewer/PreviewModal";
import { CommandPalette } from "@/components/CommandPalette";
import { Tour } from "@/components/Tour";
import { LockScreen } from "@/components/security/LockScreen";
import { VaultLockup } from "@/components/brand/Brand";
import { Home } from "@/views/Home";
import { FilesView } from "@/views/FilesView";
import { FolderView } from "@/views/FolderView";
import { ProjectsView } from "@/views/ProjectsView";
import { ProjectView } from "@/views/ProjectView";
import { ActivityView } from "@/views/ActivityView";
import { SettingsView } from "@/views/SettingsView";

function CurrentView() {
  const { route } = useVault();
  switch (route.view) {
    case "home":
      return <Home />;
    case "files":
    case "private":
    case "shared":
    case "favorites":
    case "recent":
    case "archived":
      return <FilesView key={route.view} mode={route.view} />;
    case "projects":
      return <ProjectsView />;
    case "project":
      return <ProjectView key={route.id} id={route.id} />;
    case "folder":
      return <FolderView key={route.id} id={route.id} />;
    case "activity":
      return <ActivityView />;
    case "preferences":
      return <SettingsView />;
  }
}

const subscribe = () => () => {};

/**
 * Client root. The vault reads `location.hash` for routing and the current
 * date for filters, so nothing but a quiet splash is rendered until the
 * component is running in the browser.
 */
export function VaultApp() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const splash = (
    <div className="flex h-full items-center justify-center bg-white" aria-busy="true" aria-label="Chargement de NDF Vault">
      <span className="opacity-40">
        <VaultLockup />
      </span>
    </div>
  );
  if (!mounted) return splash;

  return (
    <VaultProvider fallback={splash} lockScreen={(props) => <LockScreen {...props} />}>
      <Shell>
        <CurrentView />
      </Shell>
      <PreviewModal />
      <Dialogs />
      <CommandPalette />
      <ToastHost />
      <Tour />
    </VaultProvider>
  );
}
