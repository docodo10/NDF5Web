(function () {
  "use strict";

  const SITE_ORIGIN = "https://www.ndf5.com";
  const localeFromPath = () => /\.fr\.html$/i.test(window.location.pathname) ? "fr" : "en";
  const toFrenchPath = (path) => path.replace(/\.html$/i, ".fr.html");
  const toEnglishPath = (path) => path.replace(/\.fr\.html$/i, ".html");

  const routeMeta = {
    "index.html": {
      en: ["The New Drago Family | NDF5 Productions", "Discover The New Drago Family, an original multi-platform crime saga from NDF5 Productions."],
      fr: ["La Nouvelle Famille Drago | NDF5 Productions", "Découvrez La Nouvelle Famille Drago, une saga criminelle multiplateforme originale de NDF5 Productions."]
    },
    "Saga-L2.html": {
      en: ["The Saga | The New Drago Family", "Explore the dramatic foundations, format, themes and social context of The New Drago Family."],
      fr: ["La saga | La Nouvelle Famille Drago", "Découvrez les fondements dramatiques, le format, les thèmes et le contexte social de La Nouvelle Famille Drago."]
    },
    "Story-L2.html": {
      en: ["Story | The New Drago Family", "Explore the premise, central triangle and five annual chapters of The New Drago Family."],
      fr: ["Histoire | La Nouvelle Famille Drago", "Découvrez la prémisse, le triangle central et les cinq chapitres annuels de La Nouvelle Famille Drago."]
    },
    "Locations-L2.html": {
      en: ["The Drago World | The New Drago Family", "Explore the signature properties, recurring territories and production design of the Drago world."],
      fr: ["Le monde des Drago | La Nouvelle Famille Drago", "Explorez les propriétés signatures, les territoires récurrents et la conception du monde des Drago."]
    },
    "Characters-L2.html": {
      en: ["Characters | The New Drago Family", "Meet the evolving ensemble of family, allies, staff, friends and adversaries in the saga."],
      fr: ["Personnages | La Nouvelle Famille Drago", "Découvrez la distribution évolutive de la famille, des alliés, du personnel, des amis et des adversaires."]
    },
    "Timeline-L2.html": {
      en: ["Timeline | The New Drago Family", "Follow the saga chronology from its 2000s chapters to the world of 2044."],
      fr: ["Chronologie | La Nouvelle Famille Drago", "Suivez la chronologie de la saga, des chapitres des années 2000 jusqu’au monde de 2044."]
    },
    "Production-L2.html": {
      en: ["Production | The New Drago Family", "Explore the production model, creative structure, Montréal hub and premium delivery standards."],
      fr: ["Production | La Nouvelle Famille Drago", "Découvrez le modèle de production, la structure créative, le pôle montréalais et les standards premium."]
    },
    "Business-Finance-L2.html": {
      en: ["Business & Finance | The New Drago Family", "Review the high-level business, financing and franchise strategy for The New Drago Family."],
      fr: ["Affaires et financement | La Nouvelle Famille Drago", "Consultez la stratégie d’affaires, de financement et de franchise de La Nouvelle Famille Drago."]
    },
    "Talent-Reps-L2.html": {
      en: ["Talent & Representatives | The New Drago Family", "Explore the roles, creative intent, production model and collaboration process for talent representatives."],
      fr: ["Talents et représentants | La Nouvelle Famille Drago", "Découvrez les rôles, l’intention créative, le modèle de production et le processus de collaboration."]
    },
    "Creator-L2.html": {
      en: ["Creator | The New Drago Family", "Meet creator and executive producer Dominik Mario Pigeon and explore the intent behind the saga."],
      fr: ["Créateur | La Nouvelle Famille Drago", "Découvrez le créateur et producteur exécutif Dominik Mario Pigeon ainsi que l’intention de la saga."]
    },
    "Vault-L2.html": {
      en: ["Vault | NDF5 Productions", "Controlled access to confidential materials for authorized NDF5 partners."],
      fr: ["Coffre | NDF5 Productions", "Accès contrôlé aux documents confidentiels pour les partenaires autorisés de NDF5."]
    }
  };

  function setLink(rel, hreflang, href) {
    let el = document.head.querySelector(`link[rel="${rel}"]${hreflang ? `[hreflang="${hreflang}"]` : ""}`);
    if (!el) {
      el = document.createElement("link");
      el.rel = rel;
      if (hreflang) el.hreflang = hreflang;
      document.head.appendChild(el);
    }
    el.href = href;
  }

  function setMeta(selector, attr, value) {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement("meta");
      const propertyMatch = selector.match(/meta\[property="([^"]+)"\]/);
      const nameMatch = selector.match(/meta\[name="([^"]+)"\]/);
      if (propertyMatch) el.setAttribute("property", propertyMatch[1]);
      if (nameMatch) el.setAttribute("name", nameMatch[1]);
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  }

  function canonicalPaths() {
    const current = window.location.pathname || "/";
    if (/\/(?:index\.html)?$/i.test(current)) {
      const directory = current.replace(/(?:index\.html)?$/i, "");
      return { english: directory || "/", french: `${directory}index.fr.html` };
    }
    const english = toEnglishPath(current);
    return { english, french: toFrenchPath(english) };
  }

  function rewriteInternalLinks(locale) {
    document.querySelectorAll("a[href]").forEach((anchor) => {
      const raw = anchor.getAttribute("href");
      if (!raw || /^(?:https?:|mailto:|tel:|javascript:|#)/i.test(raw)) return;
      let url;
      try {
        url = new URL(raw, window.location.href);
      } catch (_) {
        return;
      }
      if (url.origin !== window.location.origin || !/\.html$/i.test(url.pathname)) return;
      url.searchParams.delete("lang");
      url.pathname = locale === "fr" ? toFrenchPath(toEnglishPath(url.pathname)) : toEnglishPath(url.pathname);
      anchor.href = `${url.pathname}${url.search}${url.hash}`;
    });
  }

  function applyRouteContract() {
    const locale = localeFromPath();
    const paths = canonicalPaths();
    const legacy = new URLSearchParams(window.location.search).get("lang");

    if ((legacy === "fr" && locale !== "fr") || (legacy === "en" && locale !== "en")) {
      const destination = legacy === "fr" ? paths.french : paths.english;
      window.location.replace(`${destination}${window.location.hash}`);
      return;
    }

    document.documentElement.lang = locale === "fr" ? "fr-CA" : "en-CA";
    try {
      localStorage.setItem("ndf_lang", locale);
    } catch (_) {}

    const englishUrl = `${SITE_ORIGIN}${paths.english}`;
    const frenchUrl = `${SITE_ORIGIN}${paths.french}`;
    setLink("canonical", "", locale === "fr" ? frenchUrl : englishUrl);
    setLink("alternate", "en-CA", englishUrl);
    setLink("alternate", "fr-CA", frenchUrl);
    setLink("alternate", "x-default", englishUrl);

    const fileName = toEnglishPath(paths.english).split("/").pop() || "index.html";
    const meta = routeMeta[fileName] || routeMeta["index.html"];
    const [title, description] = meta[locale];
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", locale === "fr" ? frenchUrl : englishUrl);
    setMeta('meta[property="og:locale"]', "content", locale === "fr" ? "fr_CA" : "en_CA");
    setMeta('meta[property="og:locale:alternate"]', "content", locale === "fr" ? "en_CA" : "fr_CA");

    window.toggleLang = function () {
      try {
        localStorage.setItem("ndf_lang", locale === "fr" ? "en" : "fr");
      } catch (_) {}
      const target = locale === "fr" ? paths.english : paths.french;
      window.location.assign(`${target}${window.location.hash}`);
    };

    const button = document.getElementById("lang-btn");
    if (button) {
      button.textContent = locale === "fr" ? "EN" : "FR";
      button.setAttribute("aria-label", locale === "fr" ? "View English version" : "Voir la version française");
    }

    rewriteInternalLinks(locale);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyRouteContract);
  } else {
    applyRouteContract();
  }
})();
