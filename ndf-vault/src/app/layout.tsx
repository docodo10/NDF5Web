import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geist = localFont({
  src: "./fonts/geist-latin-wght-normal.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NDF Vault",
  description: "The New Drago Family — Production & Document Management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <head>
        {/*
          Baseline Content-Security-Policy for the static build. The app is fully
          self-contained: no third-party scripts, no outbound requests, local
          fonts only. 'unsafe-inline' is required for the framework's inline
          bootstrap and styles in a static export (no nonce is available).
          frame-ancestors, HSTS and X-Frame-Options are header-only and must be
          set at the host (Cloudflare) — see SECURITY.md.
        */}
        {/* Production only: React's dev build uses eval(), which a script-src without
            'unsafe-eval' would block. Production React never calls eval(). */}
        {process.env.NODE_ENV === "production" && (
          <meta
            httpEquiv="Content-Security-Policy"
            content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'"
          />
        )}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
