"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { CloudArrowUpIcon, CompassIcon, FolderIcon, HouseIcon, LifebuoyIcon, LockKeyIcon, MagnifyingGlassIcon, RowsIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVault } from "@/lib/store";
import { Ndf5Mark } from "./brand/Brand";
import { Button } from "./ui";

interface Step {
  /** `data-tour` name of the element to spotlight; null for the centered welcome card. */
  target: string | null;
  icon: PhosphorIcon;
  title: string;
  text: string;
  /** The element lives in the sidebar, which must be open to show it. */
  sidebar?: boolean;
  /** Spotlight only the top of a tall element. */
  maxHeight?: number;
}

const STEPS: Step[] = [
  {
    target: null,
    icon: CompassIcon,
    title: "Bienvenue dans NDF Vault",
    text: "Votre espace pour classer, consulter et protéger les documents de la saga. Voici l’essentiel en quelques étapes, en une minute.",
  },
  {
    target: "nav",
    icon: HouseIcon,
    title: "Vos vues",
    text: "Retrouvez vos fichiers d’un clic : tous, privés, partagés, favoris, récents ou archivés. Les projets et l’activité sont ici aussi.",
    sidebar: true,
  },
  {
    target: "folders",
    icon: FolderIcon,
    title: "L’index du Vault",
    text: "Tout est rangé dans des dossiers numérotés de 00 à 10. Cliquez sur un dossier pour l’ouvrir, ou sur + pour en créer un.",
    sidebar: true,
    maxHeight: 330,
  },
  {
    target: "search",
    icon: MagnifyingGlassIcon,
    title: "Recherche globale",
    text: "Cherchez par nom, dossier, projet, type, étiquette ou date. Le raccourci Ctrl + K (⌘ K sur Mac) l’ouvre de partout.",
  },
  {
    target: "actions",
    icon: CloudArrowUpIcon,
    title: "Ajoutez vos documents",
    text: "Téléversez des PDF, fichiers Office, images ou textes. Vous pouvez aussi les glisser n’importe où dans la fenêtre. Ils restent dans ce navigateur.",
  },
  {
    target: "table",
    icon: RowsIcon,
    title: "Vos fichiers",
    text: "Cliquez sur un fichier pour l’ouvrir dans la visionneuse. Le menu ⋮ au bout de la ligne permet de renommer, déplacer, partager, télécharger ou archiver.",
    maxHeight: 250,
  },
  {
    target: "lock",
    icon: LockKeyIcon,
    title: "Protégez le Vault",
    text: "Ajoutez une phrase secrète : tout ce qui est stocké est alors chiffré, et le Vault se verrouille seul après une période d’inactivité.",
  },
  {
    target: "help",
    icon: LifebuoyIcon,
    title: "Besoin d’un rappel ?",
    text: "Ce bouton relance la visite à tout moment. Bonne exploration !",
  },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6;
const GAP = 14;

function measure(step: Step): Rect | null {
  if (!step.target) return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`));
  const el = els.find((e) => e.getClientRects().length > 0);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.max(8, r.left - PAD);
  const y = Math.max(8, r.top - PAD);
  const right = Math.min(vw - 8, r.right + PAD);
  let bottom = Math.min(vh - 8, r.bottom + PAD);
  if (step.maxHeight) bottom = Math.min(bottom, y + step.maxHeight);
  if (right - x < 8 || bottom - y < 8) return null;
  return { x, y, w: right - x, h: bottom - y };
}

/** Where the card goes: beside the spotlight when there is room, otherwise centered or docked. */
function place(rect: Rect | null, card: { w: number; h: number }): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(16, Math.min(vw - card.w - 16, x));
  const clampY = (y: number) => Math.max(16, Math.min(vh - card.h - 16, y));
  if (!rect) return { left: clampX((vw - card.w) / 2), top: clampY((vh - card.h) / 2) };
  if (vw < 640) {
    // Phone: dock the card at the opposite edge from the spotlight.
    const below = rect.y + rect.h / 2 < vh / 2;
    return { left: 16, top: below ? Math.max(rect.y + rect.h + GAP, vh - card.h - 16) : 16 };
  }
  if (rect.x + rect.w + GAP + card.w <= vw - 16) return { left: rect.x + rect.w + GAP, top: clampY(rect.y) };
  if (rect.y + rect.h + GAP + card.h <= vh - 16) return { left: clampX(rect.x + rect.w / 2 - card.w / 2), top: rect.y + rect.h + GAP };
  if (rect.y - GAP - card.h >= 16) return { left: clampX(rect.x + rect.w / 2 - card.w / 2), top: rect.y - GAP - card.h };
  if (rect.x - GAP - card.w >= 16) return { left: rect.x - GAP - card.w, top: clampY(rect.y) };
  return { left: clampX(rect.x + rect.w / 2 - card.w / 2), top: clampY(vh - card.h - 24) };
}

export function Tour() {
  const { tourOpen, endTour, setSidebarOpen } = useVault();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useEffect(() => {
    if (tourOpen) setI(0);
  }, [tourOpen]);

  const sync = useCallback(() => setRect(measure(step)), [step]);

  // Bring the target on screen, then follow it through resizes, scrolling and the drawer animation.
  useEffect(() => {
    if (!tourOpen) return;
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    if (step.sidebar) setSidebarOpen(true);
    else if (mobile) setSidebarOpen(false);

    const frame = requestAnimationFrame(() => {
      const el = step.target ? Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)).find((e) => e.getClientRects().length > 0) : null;
      const main = document.getElementById("vault-main");
      if (el && main?.contains(el)) {
        const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
        main.scrollTo({ top: Math.max(0, top - 120) });
      }
      sync();
    });
    const settle = setTimeout(sync, 260);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [tourOpen, step, sync, setSidebarOpen]);

  useLayoutEffect(() => {
    if (!tourOpen || !card.current) return;
    setPos(place(rect, { w: card.current.offsetWidth, h: card.current.offsetHeight }));
  }, [tourOpen, rect, i]);

  // Focus sits on the card itself, so no button wears a focus ring until the keyboard is used.
  useEffect(() => {
    if (tourOpen) card.current?.focus({ preventScroll: true });
  }, [tourOpen, i]);

  const finish = useCallback(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
    endTour();
  }, [endTour, setSidebarOpen]);
  const next = useCallback(() => (last ? finish() : setI((n) => n + 1)), [last, finish]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!tourOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || (e.key === "Enter" && document.activeElement === card.current)) next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourOpen, finish, next, back]);

  if (!tourOpen) return null;

  const welcome = step.target === null;
  const Icon = step.icon;
  // With no target on screen the whole page is dimmed and the card is centered.
  const hole = rect ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0 };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      {/* Blocks the app underneath while the tour is running. */}
      <div className="fixed inset-0 z-[100]" />
      <div
        aria-hidden
        className="pointer-events-none fixed z-[101] rounded-xl transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, boxShadow: `0 0 0 200vmax rgb(10 10 10 / 0.5)${rect ? ", 0 0 0 2px rgb(255 255 255 / 0.9)" : ""}` }}
      />
      <div
        ref={card}
        tabIndex={-1}
        className={clsx(
          "fixed z-[102] rounded-2xl border border-line bg-white shadow-modal outline-none transition-[left,top,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          welcome ? "w-[min(440px,calc(100vw-32px))] p-7 text-center" : "w-[min(360px,calc(100vw-32px))] p-5",
          pos ? "opacity-100" : "opacity-0",
        )}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
      >
        {welcome ? (
          <>
            <Ndf5Mark className="mx-auto h-7 w-auto text-brand" />
            <h2 id="tour-title" className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-ink">
              {step.title}
            </h2>
            <p id="tour-text" className="mx-auto mt-2 max-w-[340px] text-[14px] leading-[22px] text-neutral-600">
              {step.text}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button variant="primary" className="!h-10 w-full !text-[14px]" onClick={next}>
                Commencer la visite
                <ArrowRight className="size-4" strokeWidth={2} />
              </Button>
              <Button variant="ghost" className="w-full" onClick={finish}>
                Passer
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
                <Icon weight="fill" className="size-[18px]" />
              </span>
              <button type="button" onClick={finish} aria-label="Fermer la visite" className="-mr-1.5 -mt-1.5 flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors duration-150 hover:bg-fill hover:text-ink">
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <h2 id="tour-title" className="mt-3.5 text-[16px] font-semibold tracking-[-0.01em] text-ink">
              {step.title}
            </h2>
            <p id="tour-text" className="mt-1.5 text-[13.5px] leading-[21px] text-neutral-600">
              {step.text}
            </p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5" aria-label={`Étape ${i} sur ${STEPS.length - 1}`}>
                {STEPS.slice(1).map((_, k) => (
                  <span key={k} className={clsx("h-1.5 rounded-full transition-all duration-300", k + 1 === i ? "w-5 bg-ink" : k + 1 < i ? "w-1.5 bg-neutral-400" : "w-1.5 bg-neutral-200")} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {i > 1 && (
                  <Button size="sm" variant="ghost" onClick={back} aria-label="Étape précédente" className="!px-2">
                    <ArrowLeft className="size-4" strokeWidth={1.75} />
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={next} className="!px-3.5">
                  {last ? (
                    <>
                      <Check className="size-4" strokeWidth={2} /> Terminer
                    </>
                  ) : (
                    "Compris"
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
