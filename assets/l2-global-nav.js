(() => {
  const sections = [
    ['saga','The Saga','La Saga'], ['story','Story','Histoire'],
    ['locations','The Drago World','Le monde des Drago'], ['characters','Characters','Personnages'],
    ['timeline','Timeline','Chronologie'], ['production','Production','Production'],
    ['business','Business & Finance','Affaires et finance'], ['talent','Talent & Representatives','Talents et représentants'],
    ['creator','Creator','Créateur'], ['contact','Contact','Contact']
  ];

  const nextRoutes = {
    'saga-l2.html': [['Story','Histoire','../index.html#story'],['The Drago World','Le monde des Drago','../index.html#locations']],
    'story-l2.html': [['The Drago World','Le monde des Drago','../index.html#locations'],['Characters','Personnages','../index.html#characters']],
    'locations-l2.html': [['Characters','Personnages','../index.html#characters'],['Timeline','Chronologie','../index.html#timeline']],
    'characters-l2.html': [['Timeline','Chronologie','../index.html#timeline'],['Production','Production','../index.html#production']],
    'timeline-l2.html': [['Production','Production','../index.html#production'],['Business & Finance','Affaires et finance','../index.html#business']],
    'production-l2.html': [['Business & Finance','Affaires et finance','../index.html#business'],['Talent & Representatives','Talents et représentants','../index.html#talent']],
    'business-finance-l2.html': [['Talent & Representatives','Talents et représentants','../index.html#talent'],['Creator','Créateur','../index.html#creator']],
    'talent-reps-l2.html': [['Creator','Créateur','../index.html#creator'],['Contact','Contact','../index.html#contact']],
    'creator-l2.html': [['Contact','Contact','../index.html#contact'],['The Saga','La Saga','../index.html#saga']],
    'vault-l2.html': [['Business & Finance','Affaires et finance','../index.html#business'],['Talent & Representatives','Talents et représentants','../index.html#talent']]
  };

  const backAnchors = {
    'saga-l2.html':'saga', 'story-l2.html':'story', 'locations-l2.html':'locations',
    'characters-l2.html':'characters', 'timeline-l2.html':'timeline', 'production-l2.html':'production',
    'business-finance-l2.html':'business', 'talent-reps-l2.html':'talent',
    'creator-l2.html':'creator', 'vault-l2.html':'business'
  };

  const pageName = location.pathname.split('/').pop().toLowerCase();
  const currentLang = () => (new URLSearchParams(location.search).get('lang') || localStorage.getItem('ndf_lang') || document.documentElement.lang || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const withLang = path => {
    const [base, anchor] = path.split('#');
    return `${base}${base.includes('?') ? '&' : '?'}lang=${currentLang()}${anchor ? `#${anchor}` : ''}`;
  };
  const homeUrl = anchor => `../index.html?lang=${currentLang()}${anchor ? `#${anchor}` : ''}`;

  function stickyHeader() {
    return [...document.querySelectorAll('header')].find(h => /sticky/.test(h.className)) || document.querySelector('header');
  }

  function makeLogoHome(header) {
    const logo = [...header.querySelectorAll('img')].find(img => /ndf/i.test(`${img.alt} ${img.src}`));
    if (!logo) return;
    let link = logo.closest('a');
    if (!link) {
      link = document.createElement('a');
      logo.parentNode.insertBefore(link, logo);
      link.appendChild(logo);
    }
    link.href = homeUrl('');
    link.setAttribute('aria-label', currentLang() === 'fr' ? 'Retour en haut de la page d’accueil' : 'Return to the top of the Home Page');
  }

  function languageControl(header) {
    const inner = header.querySelector('#lang-btn, #langLabel');
    if (inner) return inner.closest('button, a') || inner;
    return [...header.querySelectorAll('button,a')].find(el => /^(EN|FR)$/.test(el.textContent.trim()));
  }

  function makeMenu(header) {
    if (header.querySelector('.l2-global-menu')) return;
    const langControl = languageControl(header);
    if (!langControl || !langControl.parentNode) return;
    const details = document.createElement('details');
    details.className = 'l2-global-menu';
    details.innerHTML = '<summary><span class="l2-global-menu-icon" aria-hidden="true"></span></summary><nav class="l2-global-menu-panel"></nav>';
    langControl.parentNode.insertBefore(details, langControl);
    details.querySelector('summary').setAttribute('aria-label', currentLang() === 'fr' ? 'Naviguer sur la page d’accueil' : 'Navigate the Home Page');
    details.querySelector('.l2-global-menu-panel').addEventListener('click', () => details.removeAttribute('open'));
    document.addEventListener('click', event => { if (!details.contains(event.target)) details.removeAttribute('open'); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') details.removeAttribute('open'); });
  }

  function updateMenu(header) {
    const isFr = currentLang() === 'fr';
    const details = header.querySelector('.l2-global-menu');
    if (!details) return;
    details.querySelector('summary').setAttribute('aria-label', isFr ? 'Naviguer sur la page d’accueil' : 'Navigate the Home Page');
    details.querySelector('.l2-global-menu-panel').innerHTML = sections.map(([anchor,en,fr]) => `<a href="${homeUrl(anchor)}">${isFr ? fr : en}</a>`).join('');
  }

  function normalizeHomeLabels() {
    const isFr = currentLang() === 'fr';
    const backLink = document.getElementById('backLink');
    if (backLink) {
      backLink.href = homeUrl(backAnchors[pageName] || '');
      const backLabel = backLink.querySelector('[data-i18n="back"], [data-l2-back-label]');
      if (backLabel) backLabel.textContent = isFr ? 'Retour' : 'Back';
    }
    ['mainLinkTop','mainLink'].forEach(id => {
      const link = document.getElementById(id);
      if (!link) return;
      const label = link.querySelector('[data-i18n], span');
      if (label) label.textContent = isFr ? 'Accueil' : 'Home Page';
      link.href = homeUrl('');
      link.setAttribute('aria-label', isFr ? 'Retour à la page d’accueil' : 'Back to Home Page');
    });
    document.querySelectorAll('[data-i18n="main"], [data-i18n="open_main"]').forEach(el => { el.textContent = isFr ? 'Accueil' : 'Home Page'; });
    document.querySelectorAll('[data-i18n="top_home"]').forEach(el => {
      el.textContent = isFr ? 'Accueil' : 'Home Page';
      const link = el.closest('a');
      if (link) { link.href = homeUrl(''); link.setAttribute('aria-label', isFr ? 'Retour à la page d’accueil' : 'Back to Home Page'); }
    });
    document.querySelectorAll('[data-i18n="loc_btn_back"]').forEach(el => { el.textContent = isFr ? 'Retour à la page d’accueil' : 'Back to Home Page'; });
  }

  function hideOldBottomNavigation() {
    document.querySelectorAll('section#next').forEach(section => {
      const controls = [...section.querySelectorAll('a,button')];
      if (!controls.length) return;
      const group = controls[0].closest('nav, .grid, .flex');
      if (group && controls.every(control => group.contains(control))) group.style.setProperty('display','none','important');
      else controls.forEach(control => { control.style.setProperty('display','none','important'); });
    });
    const labelsByPage = {
      'timeline-l2.html':['Explore the World'],
      'production-l2.html':['View timeline'],
      'creator-l2.html':['Open Main site']
    };
    (labelsByPage[pageName] || []).forEach(text => {
      const control = [...document.querySelectorAll('a,button')].find(el => el.textContent.trim() === text);
      if (!control) return;
      const group = control.closest('nav, .grid, .flex') || control.parentElement;
      if (group) group.style.setProperty('display','none','important');
    });
  }

  function makeBottomNavigation() {
    if (document.querySelector('.l2-global-next')) return;
    const routes = nextRoutes[pageName];
    const footer = document.querySelector('footer');
    if (!routes) return;
    const section = document.createElement('section');
    section.className = 'l2-global-next';
    section.setAttribute('aria-label', 'Continue exploring');
    if (footer) footer.parentNode.insertBefore(section, footer);
    else document.body.appendChild(section);
    section.dataset.routes = JSON.stringify(routes);
  }

  function updateBottomNavigation() {
    const section = document.querySelector('.l2-global-next');
    if (!section) return;
    const isFr = currentLang() === 'fr';
    const routes = JSON.parse(section.dataset.routes);
    section.setAttribute('aria-label', isFr ? 'Poursuivre l’exploration' : 'Continue exploring');
    section.innerHTML = `<div class="l2-global-next-inner"><p class="l2-global-next-kicker">${isFr ? 'Poursuivre l’exploration' : 'Continue Exploring'}</p><div class="l2-global-next-grid">${routes.map(([en,fr,path]) => `<a class="l2-global-next-link" href="${withLang(path)}"><span class="l2-global-next-label">${isFr ? fr : en}</span></a>`).join('')}</div></div>`;
  }

  function updateAll() {
    const header = stickyHeader();
    if (!header) return;
    makeLogoHome(header);
    makeMenu(header);
    updateMenu(header);
    normalizeHomeLabels();
    updateBottomNavigation();
  }

  function init() {
    const header = stickyHeader();
    if (!header) return;
    hideOldBottomNavigation();
    makeBottomNavigation();
    updateAll();
    const langControl = languageControl(header);
    if (langControl) langControl.addEventListener('click', () => setTimeout(updateAll, 0));
    new MutationObserver(updateAll).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] });
    setTimeout(updateAll, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
