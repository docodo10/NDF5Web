# NDF VAULT — Handoff pour Claude Code

Date : 2026-11-14 · Projet : `ndf-vault/` · Stack : Next.js 16.4.6, React 19, TypeScript, Tailwind v4, Radix, Lucide

## 1. Objectif

Construire **NDF Vault** (« The New Drago Family — Production & Document Management »), une application web de gestion de fichiers pour NDF5 Productions. Le brief complet est dans `docs/brief.txt` et les trois captures de référence dans `docs/reference/` :

| Fichier | Rôle |
|---|---|
| `image-1-file-table.webp` | Table de fichiers avancée (onglets, statuts, menu trois-points, pagination) |
| `image-2-preview-modal.webp` | Modal de preview de document (vignettes, zoom, barre d'outils) |
| `image-3-dashboard.jpg` | Dashboard principal et sidebar (référence visuelle principale) |

## 2. Consignes de l'utilisateur (à respecter)

- **Étape par étape.** Finir **toute l'interface d'abord**, la faire valider, et seulement ensuite coder les grosses fonctions (upload, IndexedDB, PDF.js, Supabase).
- **Logo et watermark NDF5** partout où c'est pertinent (déjà intégrés, voir section 5).
- **Écrire dans le chat pendant le travail** : donner l'avancement au fur et à mesure, ne pas rester silencieux jusqu'à la fin.
- Répondre **en français**. Le code, les noms de fichiers, les commits et les textes de l'interface restent **en anglais américain** (« license », pas « licence »).
- **Ne rien inventer** : pas de chiffres financiers, de contrats, d'approbations ou de contenu de documents. Tout contenu d'exemple est étiqueté « Sample ».
- **Ne jamais écrire les titres des parties des films NDF** dans l'interface ou les données. Utiliser seulement « FS1 Film Part 1 », « FS1 Film Part 2 », etc.
- Pas de bouton mort ni de fausse action : ce qui n'est pas branché doit le dire clairement (voir `notReady()` dans le store).
- Tables : fond blanc sur toutes les lignes, pas de zébrures ; fond gris seulement sur la ligne d'en-tête.

## 3. État actuel

`npx tsc --noEmit` passe sans erreur. **Rien n'a encore été compilé ni ouvert dans un navigateur** : aucun `next build`, aucun `next dev`, aucune capture d'écran. Tout ce qui suit est écrit mais non vérifié visuellement.

### Fait (écrit, typé)

| Fichier | Contenu |
|---|---|
| `src/lib/types.ts` | Types `VaultFile`, `Folder`, `Project`, `User`, `ActivityItem`, `Route`, statuts |
| `src/lib/sample-data.ts` | 39 fichiers d'exemple, arborescence NDF SAGA complète, projets PB1/PB2, 5 utilisateurs (des services, pas des personnes), activité |
| `src/lib/format.ts` | Dates, tailles, libellés de type, chemin de dossier, descendants |
| `src/lib/store.tsx` | `VaultProvider` + `useVault()` : état en mémoire, routage par hash, toasts, dialogues, preview, toutes les mutations |
| `src/components/brand/logo-paths.ts` | Logo NDF5 vectorisé (généré, ne pas éditer à la main) |
| `src/components/brand/Brand.tsx` | `Ndf5Mark`, `Ndf5Logo`, `VaultLockup`, `AppWatermark`, `PageWatermark` |
| `src/components/ui.tsx` | `Button`, `IconButton`, `Checkbox`, `Avatar`, `StatusBadge`, `Chip`, `SegmentedTabs`, `TextTabs`, `Kbd`, `PageHeader`, `EmptyState`, `SampleNotice` |
| `src/components/Shell.tsx` | Sidebar (10 entrées + arbre de dossiers repliable), topbar (recherche, cloche, menu compte), tiroir mobile, watermark |
| `src/components/files/FileTable.tsx` | Table (variantes `full` 8 colonnes et `compact`), tri, pagination, sélection, barre d'actions groupées, `RowMenu` (11 actions), `FileIcon` |
| `src/components/files/Explorer.tsx` | `useFileFilters`, `fileMatches`, `FilterButton` (projet, statut, date), `SearchField`, `ExplorerToolbar`, `KIND_GROUPS` |
| `src/components/files/menu-styles.ts` | Classes partagées des menus et popovers |
| `src/components/Dialogs.tsx` | Rename, Edit Details, Move, Share, Version History, Delete, New Folder, New Project, Upload (interface seulement), `ToastHost`, `SwitchRow` |
| `src/components/viewer/PreviewModal.tsx` | Modal de preview : fil d'Ariane, fichier précédent/suivant, plein écran, vignettes avec curseur de taille, zoom, fit width/page, navigation de pages, pages d'exemple avec watermark |
| `src/components/CommandPalette.tsx` | Recherche globale ⌘K / Ctrl+K / « / » avec navigation clavier |
| `src/app/globals.css`, `src/app/layout.tsx` | Tokens Tailwind v4, police Inter locale, métadonnées |

### Pas encore fait (interface, étape en cours)

1. **`src/app/page.tsx` est encore la page par défaut de create-next-app** (elle référence des SVG supprimés de `public/`). À remplacer.
2. **`src/app/VaultApp.tsx`** (composant client racine) : `VaultProvider` → `Shell` → vue selon `route.view`, plus `<Dialogs />`, `<ToastHost />`, `<PreviewModal />`, `<CommandPalette />`. Prévoir un garde « monté » (`useEffect` → `setReady(true)`) pour ne rien rendre au prerender : le routage lit `window.location.hash` et les filtres de date utilisent `new Date()`.
3. **Les vues dans `src/views/`** — aucune n'existe :
   - `Home.tsx` (image 3) : titre « Welcome to NDF Vault », `SampleNotice`, 4 cartes d'action (New Document, New Spreadsheet, New Folder, New Project), section « File explorer » avec filtres par type (`KIND_GROUPS` dans un `SegmentedTabs`) + recherche + Filters, 3 cartes de fichiers épinglés (`pinned`), onglets de portée (`TextTabs` : Recent files, Recently modified, Shared with me, All files), puis `<FileTable variant="compact" />`.
   - `FilesView.tsx` (image 1), réutilisable pour All Files, Private, Shared With Me, Favorites, Recent, Archived : `PageHeader` avec « Upload File » (outline) et « Add File » (noir, menu : New document, New spreadsheet, New folder), `SegmentedTabs` par type, `TextTabs` View All / My Files / Shared Files, `ExplorerToolbar`, `<FileTable />`.
   - Archived : ajouter un second onglet **Deleted** (fichiers `deleted: true`) avec restauration — le dialogue de suppression y renvoie déjà.
   - `FolderView.tsx` : fil d'Ariane (`folderPath`), sous-dossiers en cartes, table des fichiers du dossier.
   - `ProjectsView.tsx` : cartes PB1 / PB2, bouton New Project.
   - `ProjectView.tsx` : `SegmentedTabs` Overview, Files, Financial Documents, Production, Legal, Team, Activity. Catégorie d'un fichier déduite de son dossier racine : `budgets`, `financing`, `plans` → financier ; `screenplays`, `scheduling`, `cast`, dossiers PB/FS → production ; `legal` → légal.
   - `ActivityView.tsx` : liste groupée par jour.
   - `SettingsView.tsx` : interrupteur du watermark (`watermark` / `setWatermark`, avec `SwitchRow`), état du stockage (« Local demo, in memory »), état des étapes.
4. **`next.config.ts`** : encore celui du scaffold (voir section 7).
5. **Vérification visuelle** : lancer, capturer à 1440×900 et en mobile, comparer aux trois références, corriger les écarts.

### Phase 2 — seulement après validation de l'interface

Dans l'ordre : upload réel + glisser-déposer + validation → persistance IndexedDB → téléchargement des originaux → PDF.js dans le modal → aperçus Office → historique de versions → Supabase (Auth, Postgres, Storage privé, URL signées, RLS).

## 4. Architecture et décisions

- **Une seule page, vues pilotées par l'état.** `route` vit dans le store et se synchronise avec `location.hash`. Noms de hash simples : `#home`, `#files`, `#projects`, `#private`, `#shared`, `#favorites`, `#recent`, `#archived`, `#activity`, `#preferences`, `#project-<id>`, `#folder-<id>`. La vue Settings s'appelle `preferences` dans le code (le hash `#settings` est réservé par l'hébergeur d'aperçu).
- **Le store est la seule couture vers la persistance.** Les composants n'appellent que `useVault()`. En phase 2, brancher IndexedDB puis Supabase derrière les mutations du store (ou extraire une interface `VaultRepository`), sans toucher aux composants.
- **État en mémoire pour l'instant** : tout se réinitialise au rechargement. C'est voulu à ce stade et doit rester indiqué dans l'interface.
- **Actions déjà fonctionnelles en mémoire** : favoris, épingler, renommer, modifier les détails, déplacer, copier, archiver, restaurer, supprimer (avec Undo dans le toast), statut en lot, nouveau dossier, nouveau projet, tri, pagination, recherche, filtres.
- **Actions volontairement non branchées** : Download, Print, recherche dans le document, upload réel, New Document, New Spreadsheet. Elles appellent `notReady("…")` qui affiche un toast honnête. Ne pas les simuler.
- **Menu trois-points** : « Open » ouvre le modal en plein écran, « Preview » en fenêtre.
- **Utilisateurs d'exemple** : des services (NDF5 Admin, Production Office, Legal Affairs, Finance Office, Story Department), avatars à initiales. Pas de fausses personnes ni de photos.

## 5. Marque NDF5

- Source : le vrai logo du site, `https://raw.githubusercontent.com/docodo10/NDF5Web/main/assets/home/Logo_NDF5_Red_png_noline.png` (rouge, « NDF5 PRODUCTIONS »).
- Il a été vectorisé avec potrace en chemins SVG dans `logo-paths.ts` : `NDF5_MARK` (« NDF5 » seul) et `NDF5_FULL` (avec « PRODUCTIONS »). La couleur suit `currentColor`.
- Usages : marque rouge + « VAULT » en haut de la sidebar ; logo complet gris pâle en pied de sidebar ; watermark très pâle (opacité 0,035) en bas à droite de la zone de contenu ; watermark en diagonale (opacité 0,05) sur chaque page de document.
- Le rouge `#F51000` (`text-brand`) est **réservé au logo**. Le reste de l'interface est monochrome.

## 6. Design system (extrait des trois captures)

| Élément | Valeur |
|---|---|
| Police | Inter variable (locale, `--font-inter`), base 14 px / 20 px |
| Encre, boutons primaires | `#0A0A0A` (`ink`) |
| Bordures | `#E8E8E8` (`line`), filets de lignes `#F0F0F0` (`hair`) |
| Surfaces | blanc, `#FAFAFA` (`subtle` : sidebar, en-tête de table, barre d'outils), `#F5F5F5` (`fill` : rails d'onglets, survol) |
| Rayons | 6 (items de menu), 8 (contrôles), 10 (cartes, menus), 12 (tables), 16 (modals) |
| Hauteurs | boutons 36 et 32, champs 36, ligne de table 60, en-tête de table 44, topbar 56 |
| Sidebar | 264 px |
| Modal de preview | min(1280 px, 100vw − 64) × min(820 px, 100dvh − 64), barre de titre 64, barre d'outils 48, panneau de vignettes 272 |
| Statuts (contour seulement) | Draft gris, In Review ambre, Approved vert, Final noir, Archived gris pointillé |
| Animations | 150–200 ms (`animate-pop`, `animate-fade`, `animate-rise`) |

Mesures prises dans les références : fond de sidebar `#F6F6F6`–`#F9F9F9`, en-tête de table `#F6F6F6`, bouton noir `#0C0505`, barre d'outils du viewer `#FAFAFA`, fond flouté du modal `#E9E9E9`.

Note de fidélité : on reprend le langage visuel (layout, densité, composants), pas les logos, photos ni textes des captures d'origine. L'accent bleu de l'image 2 est remplacé par l'encre noire.

## 7. Pièges connus

- **Next.js 16.4.6 n'est pas le Next.js habituel.** Lire `AGENTS.md` et le guide concerné dans `node_modules/next/dist/docs/` avant d'écrire du code Next.
- `next.config.ts` (scaffold) active `cacheComponents` et `partialPrefetching`. Lire l'heure courante ou `window` pendant le prerender peut échouer : d'où le garde « monté » dans `VaultApp`.
- Tailwind v4 passe par le loader `@tailwindcss/turbopack` déclaré dans `next.config.ts` ; les tokens sont dans `@theme inline` de `globals.css`, il n'y a pas de `tailwind.config`.
- `lucide-react` est en v1.x : vérifier qu'une icône existe avant de l'importer (toutes celles déjà utilisées ont été vérifiées).
- `PreviewModal` : le zoom « fit » dépend d'un `ResizeObserver` sur le canvas ; à vérifier en vrai navigateur, tout comme le suivi de la page courante au défilement.
- `FileTable` : les colonnes se masquent par breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`). À 1280 px, vérifier que les 8 colonnes tiennent ; le bouton « Download » avec texte n'apparaît qu'à partir de `2xl`.
- Pour un aperçu statique hébergé (export `output: "export"`), les chemins `/_next/...` sont absolus : prévoir un `assetPrefix` ou un post-traitement.

## 8. Commandes

```bash
npm install
npm run dev        # http://localhost:3000
npx tsc --noEmit   # doit rester sans erreur
npm run build
```

## 9. Prompt de démarrage pour Claude Code

```
Lis HANDOFF.md en entier, puis docs/brief.txt et les trois images de docs/reference/.
Lis aussi AGENTS.md et les guides Next concernés dans node_modules/next/dist/docs/.

Continue l'étape « interface » exactement là où elle s'est arrêtée :
1. Remplace src/app/page.tsx et crée src/app/VaultApp.tsx.
2. Crée les vues de src/views/ décrites en section 3, en réutilisant les composants existants.
3. Lance l'app, prends des captures à 1440x900 et en mobile, compare-les aux trois
   références et corrige les écarts visibles.

Ne code pas encore l'upload, IndexedDB, PDF.js ni Supabase : montre-moi d'abord l'interface.
Écris-moi l'avancement dans le chat pendant que tu travailles, en français.
```
