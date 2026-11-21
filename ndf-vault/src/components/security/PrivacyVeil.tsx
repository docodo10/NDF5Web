"use client";

import { EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useVault } from "@/lib/store";
import { t } from "@/lib/i18n";

/**
 * The privacy screen: when the setting is on, the vault is covered as soon as
 * its window stops being the active one (another tab, another application, a
 * screen being shared), and uncovered when the person comes back to it.
 */
export function PrivacyVeil() {
  const { privacy: chosen, previewProtection } = useVault();
  // A protected document brings the privacy screen with it, whatever the setting says.
  const privacy = chosen || previewProtection !== "standard";
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (!privacy) {
      setCovered(false);
      return;
    }
    const cover = () => setCovered(true);
    const uncover = () => setCovered(false);
    const onVisibility = () => {
      if (document.hidden) cover();
    };
    window.addEventListener("blur", cover);
    window.addEventListener("focus", uncover);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", cover);
      window.removeEventListener("focus", uncover);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [privacy]);

  if (!privacy || !covered) return null;
  // An open dialog switches pointer events off for the rest of the page: the veil turns them back on for itself,
  // so that it really is what gets the click, whatever is open underneath.
  return (
    <button type="button" data-privacy-veil onClick={() => setCovered(false)} className="pointer-events-auto fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center bg-white/80 px-6 text-center backdrop-blur-2xl">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white">
        <EyeOff className="size-5" strokeWidth={1.75} />
      </span>
      <span className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("Contenu masqué", "Content hidden")}</span>
      <span className="mt-1 max-w-[320px] text-[13.5px] leading-[21px] text-neutral-600">{t("La fenêtre n’est plus active. Cliquez pour reprendre.", "The window is no longer active. Click to resume.")}</span>
    </button>
  );
}
