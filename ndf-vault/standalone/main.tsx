import { createRoot } from "react-dom/client";
import { VaultApp } from "@/app/VaultApp";

// Entry for the self-contained build (one HTML page, no server): same app, mounted directly.
const el = document.getElementById("vault-root");
if (el) createRoot(el).render(<VaultApp />);
