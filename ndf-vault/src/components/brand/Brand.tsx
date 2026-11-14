import { NDF5_FULL, NDF5_MARK } from "./logo-paths";

/** The NDF5 mark ("NDF5" only), traced from the official logo. Color follows `currentColor`. */
export function Ndf5Mark({ className, title = "NDF5" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={`0 0 ${NDF5_MARK.w} ${NDF5_MARK.h}`} className={className} role="img" aria-label={title}>
      <path fill="currentColor" fillRule="evenodd" d={NDF5_MARK.d} />
    </svg>
  );
}

/** The full "NDF5 PRODUCTIONS" lockup. Color follows `currentColor`. */
export function Ndf5Logo({ className, title = "NDF5 Productions" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={`0 0 ${NDF5_FULL.w} ${NDF5_FULL.h}`} className={className} role="img" aria-label={title}>
      <path fill="currentColor" fillRule="evenodd" d={NDF5_FULL.d} />
    </svg>
  );
}

/** Sidebar lockup: red NDF5 mark + VAULT wordmark. */
export function VaultLockup() {
  return (
    <span className="flex items-center gap-2.5">
      <Ndf5Mark className="h-[18px] w-auto text-brand" />
      <span className="h-4 w-px bg-neutral-300" aria-hidden />
      <span className="text-[13px] font-semibold tracking-[0.18em] text-ink">VAULT</span>
    </span>
  );
}

/** Very faint logo behind the main content area. */
export function AppWatermark() {
  return (
    <div aria-hidden className="pointer-events-none absolute bottom-5 right-7 z-0 select-none text-ink opacity-[0.035]">
      <Ndf5Logo className="h-auto w-[min(230px,34vw)]" title="" />
    </div>
  );
}

/** Diagonal watermark laid over a document page. */
export function PageWatermark() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Sized from the page, so it fits a sample page, a real PDF page or an image alike. */}
      <div className="w-[68%] -rotate-[32deg] text-ink opacity-[0.05]">
        <Ndf5Logo className="h-auto w-full" title="" />
      </div>
    </div>
  );
}

/** Who is looking and when, repeated across a page: the personal watermark of a data room. */
export function PersonalWatermark({ text }: { text: string }) {
  return (
    <div aria-hidden data-personal-watermark className="pointer-events-none absolute inset-0 select-none overflow-hidden [container-type:inline-size]">
      <div className="absolute left-[-25%] top-[-25%] flex h-[150%] w-[150%] -rotate-[28deg] flex-col justify-around text-ink opacity-[0.1]">
        {Array.from({ length: 7 }, (_, i) => (
          <p key={i} className="whitespace-nowrap text-center font-semibold" style={{ fontSize: "1.5cqw", paddingLeft: `${(i % 2) * 16}%` }}>
            {text}&emsp;·&emsp;{text}
          </p>
        ))}
      </div>
    </div>
  );
}
