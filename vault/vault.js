/* vault.js
   Shared Vault logic.
   Put this file beside Vault-L2.html (same folder) or move it to /assets/js/vault.js
   and update the script src accordingly.

   IMPORTANT: change VAULT_PASSWORD before publishing.
*/
(function(){
  const VAULT_PASSWORD = "NDF2026"; // <- set your real password
  const AUTH_KEY = "ndf_auth";

  const i18n = {
    en: {
      top_kicker: "Restricted",
      top_home: "Main",

      auth_title: "Restricted Access",
      auth_sub: "Authorized Partners Only",
      auth_btn: "Authenticate",
      auth_error: "ACCESS DENIED",
      auth_note: "Replace the password string in vault.js before publishing.",

      vault_kicker: "The Vault",
      vault_title: "The Vault",
      vault_sub: "Confidential materials for authorized partners.",
      vault_logout: "Log Out",

      card1_title: "Investment Prospectus",
      card1_desc: "Financial modeling and distribution strategy (example placeholder).",
      card1_action: '<i data-lucide="download" class="w-4 h-4"></i> Download PDF',

      card2_title: "Script: Chapter I",
      card2_desc: "Watermarked draft for review (example placeholder).",
      card2_action: '<i data-lucide="eye" class="w-4 h-4"></i> View Document',

      footer_line: "For industry presentation purposes.<br>© 2026 NDF5 Productions Inc. All rights reserved."
    },
    fr: {
      top_kicker: "Accès",
      top_home: "Accueil",

      auth_title: "Accès restreint",
      auth_sub: "Partenaires autorisés",
      auth_btn: "Authentifier",
      auth_error: "ACCÈS REFUSÉ",
      auth_note: "Remplacez le mot de passe dans vault.js avant publication.",

      vault_kicker: "Le Vault",
      vault_title: "Le Vault",
      vault_sub: "Documents confidentiels pour partenaires autorisés.",
      vault_logout: "Déconnexion",

      card1_title: "Prospectus d’investissement",
      card1_desc: "Modélisation financière et stratégie de distribution (exemple).",
      card1_action: '<i data-lucide="download" class="w-4 h-4"></i> Télécharger le PDF',

      card2_title: "Scénario : Chapitre I",
      card2_desc: "Version filigranée pour consultation (exemple).",
      card2_action: '<i data-lucide="eye" class="w-4 h-4"></i> Voir le document',

      footer_line: "Pour fins de présentation à l’industrie.<br>© 2026 NDF5 Productions Inc. Tous droits réservés."
    }
  };

  let currentLang = "en";

  function $(id){ return document.getElementById(id); }

  function applyI18n(){
    document.documentElement.lang = currentLang;
    const label = $("langLabel");
    if (label) label.textContent = currentLang === "en" ? "FR" : "EN";

    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      const str = i18n[currentLang] && i18n[currentLang][key];
      if (typeof str === "string") el.innerHTML = str;
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function showAuth(){
    const auth = $("auth-modal");
    const vault = $("vault-content");
    if (vault) vault.classList.add("hidden");
    if (!auth) return;
    auth.classList.remove("hidden");
    requestAnimationFrame(() => auth.classList.remove("opacity-0"));
    const pwd = $("password");
    if (pwd) pwd.focus();
  }

  function showVault(){
    const auth = $("auth-modal");
    const vault = $("vault-content");
    if (auth) {
      auth.classList.add("opacity-0");
      setTimeout(() => auth.classList.add("hidden"), 280);
    }
    if (vault) vault.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
  }

  function closeVault(){
    window.location.href = "../Website_NDF.html";
  }

  function handleLogin(e){
    e.preventDefault();
    const input = $("password");
    const err = $("error-msg");
    const val = (input && input.value ? input.value : "").trim();

    if (val && val === VAULT_PASSWORD){
      sessionStorage.setItem(AUTH_KEY, "true");
      if (input) input.value = "";
      if (err) err.classList.add("opacity-0");
      showVault();
      return;
    }

    if (err) {
      err.classList.remove("opacity-0");
      err.animate(
        [{transform:"translateX(0)"},{transform:"translateX(-6px)"},{transform:"translateX(6px)"},{transform:"translateX(0)"}],
        {duration:260}
      );
    }
    if (input) input.value = "";
  }

  function logout(){
    sessionStorage.removeItem(AUTH_KEY);
    window.location.reload();
  }

  function toggleLang(){
    currentLang = currentLang === "en" ? "fr" : "en";
    applyI18n();
  }

  function init(){
    if (window.lucide) window.lucide.createIcons();

    const authed = sessionStorage.getItem(AUTH_KEY) === "true";
    if (authed) showVault();
    else showAuth();

    applyI18n();
  }

  window.NDFVault = {
    init,
    toggleLang,
    handleLogin,
    closeVault,
    logout,

    // helper for other pages (optional):
    go: function(){
      window.location.href = "./Vault-L2.html";
    }
  };

  window.addEventListener("DOMContentLoaded", init);
})();