# NDF VAULT — Handoff pour Claude Code

Date : 2026-11-14 · Projet : `ndf-vault/` · Stack : Next.js 16.4.6, React 19, TypeScript, Tailwind v4, Radix, Lucide, Phosphor, PDF.js, pdf-lib, @noble/hashes · Tests : Vitest, Playwright

## 1. Objectif

Construire **NDF Vault** (« The New Drago Family — Production & Document Management »), une application web de gestion de fichiers pour NDF5 Productions. Le brief complet est dans `docs/brief.txt` et les trois captures de référence dans `docs/reference/` :

| Fichier | Rôle |
|---|---|
| `image-1-file-table.webp` | Table de fichiers avancée (onglets, statuts, menu trois-points, pagination) |
| `image-2-preview-modal.webp` | Modal de preview de document (vignettes, zoom, barre d'outils) |
| `image-3-dashboard.jpg` | Dashboard principal et sidebar (référence visuelle principale) |

Ces trois captures viennent d'applications tierces : elles sont ignorées par git (`docs/reference/` dans `.gitignore`) et ne sont donc pas dans le dépôt. Les redemander à l'utilisateur si le dossier est vide.

## 1 bis. Contexte ajouté le 2026-11-14 : le Vault est une data room pour invités

L'utilisateur a fourni un plan (« NDF5 Vault — Virtual Data Room Plan », confidentiel, **ne pas le mettre dans le dépôt**). Ce qu'il change pour le produit :

- **Public visé** : des invités externes (talents et agents, producteurs, studios, financiers, partenaires), en plus de l'administrateur. Expérience simple, une action par écran, utilisable au téléphone, en français et en anglais.
- **Index numéroté** : dossiers 00 à 10 (Start Here, Saga Overview, Screenplays, Story Development, Production, Business and Finance, Legal and Chain of Title, Talent and Packaging, To Sign, Signed, Q&A), chacun avec un accès par défaut. **Déjà appliqué** dans `sample-data.ts` (`Folder.index`, `Folder.access`) ; l'accès n'est qu'un libellé « Planned access » tant que la connexion des invités n'existe pas.
- **Niveaux d'accès** : 0 public, 1 invité (Terms of Access à accepter), 2 affaires (NDA), 3 deal room privée par contrepartie.
- **Fonctions attendues côté invité** : connexion par code envoyé par courriel, écran Terms of Access, « What's new », filigrane personnel (nom, société, courriel, date) sur chaque page, consultation seule par défaut, date d'expiration et révocation, bouton « Ask a question », documents à signer et copies signées.
- **Côté administrateur** : invitations, groupes, journal « qui a ouvert quoi, quand ».
- **Backend** : le plan recommande Cloudflare (Access, Workers/Pages, R2, D1) plutôt que Supabase, et de servir le Vault hors de ce dépôt public. Le brief d'origine disait Supabase : **à faire confirmer par l'utilisateur avant la phase 2**. L'interface ne nomme plus aucun fournisseur.
- **Aucun vrai document dans ce dépôt**, jamais : il est public.
- Le plan évoque un habillage sombre pour l'espace invité ; l'utilisateur a par ailleurs demandé de coller aux trois captures claires. **L'interface reste claire** tant qu'il n'a pas tranché.

## 2. Consignes de l'utilisateur (à respecter)

- **Étape par étape.** Finir **toute l'interface d'abord**, la faire valider, et seulement ensuite coder les grosses fonctions (upload, IndexedDB, PDF.js, Supabase).
- **Logo et watermark NDF5** partout où c'est pertinent (déjà intégrés, voir section 5).
- **Écrire dans le chat pendant le travail** : donner l'avancement au fur et à mesure, ne pas rester silencieux jusqu'à la fin.
- Répondre **en français**. **L'interface est en français** (demande du 2026-11-14, vocabulaire québécois : téléverser, courriel). Le code, les noms de fichiers et les commits restent en anglais américain.
- **Ne rien inventer** : pas de chiffres financiers, de contrats, d'approbations ou de contenu de documents. Tout contenu d'exemple est étiqueté « Sample ».
- **Ne jamais écrire les titres des parties des films NDF** dans l'interface ou les données. Utiliser seulement « FS1 Film Part 1 », « FS1 Film Part 2 », etc.
- Pas de bouton mort ni de fausse action : ce qui n'est pas branché doit le dire clairement (voir `notReady()` dans le store).
- Tables : fond blanc sur toutes les lignes, pas de zébrures ; fond gris seulement sur la ligne d'en-tête.

## 3. État actuel

**Interface en français, vraies fonctions, protection par phrase secrète, tests automatisés, page hébergée.** `npx tsc --noEmit`, `npm run build`, `npm test` (200 tests unitaires) et `npm run test:e2e` (119 tests dans un vrai navigateur) passent.

### Sécurité (2026-11-14)

Tout est local : le Vault n'a pas encore de serveur. La protection couvre donc **ce qui est stocké sur l'appareil**, pas l'accès des invités (section 1 bis).

| Fonction | Où | Notes |
|---|---|---|
| Chiffrement au repos | `src/lib/crypto.ts`, `src/lib/db.ts` | Phrase secrète → **scrypt** (N = 2^16, r = 8, p = 2 : 64 Mio de mémoire par essai, réglage recommandé par l'OWASP ; implémentation auditée `@noble/hashes`) → clé qui enveloppe une clé de données AES-GCM 256 bits aléatoire et **non extractible** (`KeyEnvelope` v2). Les Vaults protégés par une version antérieure (enveloppe v1, PBKDF2 600 000 itérations) s'ouvrent toujours et **passent à scrypt d'eux-mêmes au premier déverrouillage** (`isLegacyEnvelope`, `db.unlock`). Une enveloppe qui demande plus de travail ou de mémoire que ce code n'en écrirait est refusée (`envelopeKdf`, `UnsupportedEnvelopeError`). Le code de récupération, déjà aléatoire sur 120 bits, garde PBKDF2 : l'étirer n'apporterait rien. Chaque enregistrement (état et chaque original) est chiffré avec un nonce aléatoire de 96 bits et son emplacement comme données associées (`"state"`, `` `blob:<id>` ``) : un enregistrement déplacé ou échangé ne se déchiffre pas |
| Écran de verrouillage | `components/security/LockScreen.tsx` | Tant que le Vault est verrouillé, **rien de déchiffré n'est monté** : `VaultProvider` rend seulement l'écran (`Boot` : `loading` → `locked` → `ready`). Aucun nom de fichier ou de dossier n'y apparaît |
| Délai après erreurs | `LockScreen.delayFor`, `Meta.failed` | Rien avant 3 erreurs, puis 5, 10, 20, 30 s. Le compteur est sur disque (`lastFailedAt`) : recharger la page ne l'efface pas |
| Verrouillage | store `lockNow`, effet d'auto-verrouillage dans `store.tsx` | Bouton dans la barre du haut et dans Réglages ; automatique après inactivité (réglable, 15 min par défaut), y compris quand l'onglet revient au premier plan après le délai. Chaque verrouillage est écrit au journal juste avant que la clé soit oubliée, en disant s'il était manuel ou automatique |
| Phrase redemandée | `db.verifyPassphrase`, `ExportVaultDialog`, `ResetDialog`, `RestoreDialog` | Dans un Vault protégé, la phrase secrète est redemandée avant ce qui sort le contenu de la protection ou l'efface : export ZIP complet (non chiffré), réinitialisation, restauration d'une sauvegarde. Un Vault non protégé n'est pas interrogé |
| Écran de confidentialité | `security/PrivacyVeil.tsx`, `Persisted.privacy` | Option (désactivée par défaut) : le contenu est masqué dès que la fenêtre n'est plus active. Le voile se met au-dessus de tout, visionneuse comprise |
| Phrase proposée | `crypto.generatePassphrase`, `security/parts.tsx` (`NewPassphrase`) | « Proposer une phrase forte » : cinq groupes de trois syllabes tirés au hasard (`vafomo-jegonu-…`), environ 93 bits. Elle remplit le premier champ ; le second reste à retaper, pour prouver qu'elle a été notée. Copie possible, effacée du presse-papiers une minute plus tard (aussi pour le code de récupération) |
| Session ouverte | store `judge`, `MAX_STRIKES`, `REAUTH_MS`, `UnlockDocDialog` | Cinq phrases secrètes refusées d'affilée dans une session (dialogues d'export, de réinitialisation, de protection…) **verrouillent le Vault**. Un document en haute protection redemande la phrase secrète si elle n'a pas été donnée depuis cinq minutes |
| Activer, changer, désactiver | `components/security/SecurityDialogs.tsx` | Phrase de 10 caractères minimum, indicateur de force (`passphraseStrength`, il faut au moins « Moyenne »), case « j'ai compris qu'elle ne peut pas être récupérée ». Changer la phrase ré-enveloppe la clé sans re-chiffrer les fichiers |
| Conversion reprenable | `db.convertAll`, `Meta.pending` | Chiffrer ou déchiffrer tout le Vault est idempotent : un enregistrement se lit selon sa forme (`{enc}` ou `Blob`), donc une conversion interrompue reste lisible et reprend au déverrouillage suivant |
| Code de récupération | `crypto.createRecovery`, `recoverEnvelope`, `db.createRecoveryCode`, `db.recoverWithCode`, `security/parts.tsx` (`RecoveryCodeCard`) | 24 caractères en base 32 sans lettres ambiguës (120 bits), remis **une seule fois** à l'activation de la protection. C'est une deuxième enveloppe de la même clé de données (`Meta.recovery`) : le code n'est jamais stocké. Sur l'écran de verrouillage, « Phrase secrète oubliée ? » demande le code et une nouvelle phrase ; le code utilisé est **remplacé** par un nouveau. Un mauvais code compte comme une tentative échouée (même délai). Remplaçable dans Réglages avec la phrase secrète |
| Phrase et code perdus | `LockScreen` (mode `wipe`) → `db.wipeEverything` | Seule issue : taper `EFFACER` pour tout effacer |
| Sauvegarde chiffrée | `src/lib/backup.ts`, store `createBackup`, `restoreBackup`, `BackupDialog`, `RestoreDialog` | Un fichier `.ndfvault` : tout l'état et tous les originaux (versions comprises), chiffrés sous une phrase choisie pour la sauvegarde. Seuls la date et les paramètres de dérivation sont en clair ; noms, tailles et ordre sont dans le manifeste chiffré, et chaque enregistrement est lié à sa position. La restauration **remplace** le Vault : tout est déchiffré une première fois avant de toucher à quoi que ce soit, l'état restauré passe par `validateState` (formes vérifiées, noms nettoyés, références réparées, boucles de dossiers coupées), puis la session est remontée (`reload`) |
| Empreintes et intégrité | `sha256Hex`, store `readOriginal`, `auditVault`, `AuditDialog` | SHA-256 calculé au téléversement, revérifié à **chaque** ouverture et téléchargement. Un original altéré est refusé (`altered`) et consigné dans le journal de sécurité. Bloc « Empreinte SHA-256 » (copier, vérifier) dans Modifier les détails. Réglages → « Intégrité des fichiers » vérifie **tous** les originaux, versions comprises, et liste ceux qui sont altérés ou introuvables |
| Contrôle du contenu | `uploads.detectContent`, `inspectUpload`, `office.inspectOffice` | Les premiers octets doivent correspondre à l'extension (un exécutable renommé en `.pdf` est refusé). Exécutables et binaires inconnus refusés. Un fichier Office doit être un vrai conteneur du bon type (un ZIP quelconque renommé `.docx` est refusé) et **sans macros ni contrôles ActiveX**. 100 Mo par fichier. Doublons signalés par empreinte |
| Lecture défensive des fichiers Office | `src/lib/unzip.ts`, `src/lib/xml.ts`, `src/lib/office.ts` | Écrits pour l'aperçu, sans librairie. ZIP : nombre d'entrées plafonné, jamais plus de 24 Mo décompressés par partie ni 96 Mo par document quelle que soit la taille annoncée (bombe de décompression), somme de contrôle vérifiée. XML : toute déclaration `<!DOCTYPE` est refusée (donc ni entités externes ni expansion exponentielle), profondeur et nombre de nœuds plafonnés, analyse en une seule passe (pas d'expression régulière à temps quadratique). Les liens externes d'un document ne sont jamais suivis. Tout ce qui sort est du texte, affiché par React : rien ne peut agir comme du balisage |
| Noms sûrs | `format.sanitizeName` | Retire caractères de contrôle, marques de direction (usurpation `‮`), séparateurs de chemin, points en tête ; 120 caractères maximum. Appliqué aux fichiers, dossiers et projets |
| Exports sûrs | `src/lib/csv.ts`, `src/lib/zip.ts` | CSV : les cellules commençant par `= + - @` sont neutralisées (injection de formules). ZIP : chemins nettoyés segment par segment (pas de `..`, pas de chemin absolu), noms en double numérotés |
| Filigrane personnel | `lib/stamp.ts`, `brand/Brand.tsx` (`PersonalWatermark`) | « Nom · Société · courriel · date, heure · Confidentiel – NDF5 » sur chaque page consultée, et **incrusté dans le fichier** avec « Télécharger avec filigrane » (PDF via pdf-lib, images via canvas) |
| Journal de sécurité | `ActivityItem.kind = "security"` | Activation, changement et retrait de la protection, création, remplacement et utilisation du code de récupération, sauvegardes créées et restaurées, déverrouillages (avec le nombre d'essais refusés avant), fichiers altérés. Onglet « Sécurité » dans Activité, export CSV. Les verrouillages eux-mêmes ne sont pas consignés |
| Stockage durable | `db.requestPersistence`, Réglages → Stockage | Demande au navigateur de ne pas évincer les données |

**Limites à dire à l'utilisateur, sans les enjoliver :** la protection vaut contre quelqu'un qui accède à l'appareil ou au profil du navigateur pendant que le Vault est verrouillé. Elle ne protège pas d'un logiciel malveillant sur une session déverrouillée, ni ne remplace l'authentification des invités, les permissions par dossier et le journal côté serveur, qui restent à construire. Sans la phrase secrète **et** sans le code de récupération, le contenu est irrécupérable. Le code de récupération vaut la phrase secrète : il ne doit pas rester sur l'appareil.

### Protection des documents (2026-11-15)

Demande de l'utilisateur : rendre un document « impossible à hacker », même par des professionnels qui lisent le code, et flouter les photos prises au téléphone. **Ce n'est pas réalisable et il ne faut jamais le lui promettre** : ce qu'un écran affiche, un appareil photo le capture, et tout ce qui s'exécute dans le navigateur peut y être observé. Ce qui a été construit freine la copie, n'en montre qu'un fragment à la fois et désigne son auteur. La vraie garantie viendra du serveur : un invité ne recevra jamais le fichier d'origine, seulement des pages rendues côté serveur avec le filigrane incrusté.

| Fonction | Où | Notes |
|---|---|---|
| Niveaux de protection | `src/lib/protection.ts`, `VaultFile.protection`, store `setProtection`, `ProtectionDialog`, menu du fichier → « Protection » | `standard`, `view` (consultation seule) et `high` (haute protection). Monter un niveau est libre ; **le baisser dans un Vault protégé demande la phrase secrète**. Niveau par défaut des nouveaux fichiers dans Réglages (`Persisted.defaultProtection`). Cadenas à côté du nom dans les tables |
| Consultation seule | store `downloadFile`, `downloadVersion`, `exportEntries` | Téléchargement, téléchargement filigrané, versions et export ZIP refusés (le fichier est laissé de côté et le message le dit) ; la tentative va au journal de sécurité. La sauvegarde chiffrée, elle, contient tout |
| Visionneuse durcie | `PreviewModal` (`guarded`) | Pas de sélection, de copie, de clic droit, de glisser-déposer ; Ctrl/Cmd + S, P, C, A, X avalés ; filigrane personnel imposé même si le réglage est éteint ; voile de confidentialité imposé quand la fenêtre n'est plus active |
| Filigrane dans les pixels | `protection.bakeWatermark`, `PdfPage` (`bake`), `BakedImage` | Pour un document protégé, le filigrane est dessiné **dans le canevas** (PDF et images), plus dans un élément posé par-dessus : le retirer de l'arbre de la page ne suffit plus. Une image protégée n'a jamais d'URL `blob:` : elle n'existe que dessinée. Les aperçus texte et Office gardent un filigrane en surimpression (limite connue) |
| Lecture protégée | `Fence` dans `PreviewModal`, styles `.fence-*` dans `globals.css` | Le document est flouté sauf une bande (19 % de la hauteur, 104 à 190 px) qui suit le pointeur ou le doigt, et entièrement quand ni l'un ni l'autre n'est dessus. Une photo ne capture que quelques lignes. Imposée au niveau `high`, proposée par un bouton pour tout document. Les vignettes sont masquées dans ce mode. La bande se déplace par variable CSS, sans re-rendu React |
| Code de consultation | `protection.consultationCode`, `PreviewState.code`, `ActivityItem.code` | Chaque ouverture d'un vrai document reçoit un code (`K7Q-2M9`) imprimé dans le filigrane et écrit au journal. Activité → recherche : taper le code lu sur une photo retrouve l'ouverture (qui, quand, quel document). Colonne dans l'export CSV |
| Capture d'écran | effet `PrintScreen` dans `PreviewModal`, store `reportCapture` | La touche ne peut pas être bloquée : sur un document protégé elle couvre le document 4 s, tente de vider le presse-papiers et écrit l'événement au journal avec le code de consultation |
| Impression | `@media print` dans `globals.css` | Tout est masqué à l'impression |
| Effacement après tentatives | `Meta.wipeAfter`, `db.setWipeAfter`, `db.refuse` | Option (éteinte par défaut) : après 10 phrases ou codes refusés d'affilée, `wipeEverything`. L'écran de verrouillage annonce le nombre de tentatives restantes. Minimum de 3 imposé par `setWipeAfter` |
| Verrouillage d'urgence | effet dans `store.tsx` | Trois appuis sur Échap en 1,2 s verrouillent, où que l'on soit (écouté en phase de capture) |
| Bilan de sécurité | `SettingsView` (`checks`), `Persisted.lastBackupAt`, `lastAuditAt` | Six points (protection, code de récupération, verrouillage ≤ 15 min, sauvegarde et intégrité de moins de 30 jours, stockage durable), chacun avec son état et le bouton qui le règle |

**À surveiller pour la suite :** la recherche dans le contenu montre des extraits de tous les documents, protégés compris. C'est correct pour le propriétaire, pas pour un futur invité : à restreindre par niveau d'accès quand le serveur existera.

### Comme un gestionnaire de fichiers familier (2026-11-15)

Demande de l'utilisateur : que l'application ressemble à Dropbox dans ses gestes, pour qu'on s'y retrouve.

| Geste | Où | Notes |
|---|---|---|
| Glisser un fichier vers un dossier | `src/lib/dnd.ts`, `components/files/drop.ts` (`useFolderDrop`), lignes de `FileTable`, tuiles de `FileGrid` | Cibles : dossiers de la barre latérale et tuiles de sous-dossiers (`data-drop-folder`). Glisser un fichier d'une sélection emporte toute la sélection. Même annulation que « Déplacer ». Un dépôt sur le dossier d'origine ne fait rien |
| Clic droit | `FileContextMenu`, `FileMenuItems` dans `FileTable.tsx` | Le même menu que le bouton « ⋯ », écrit une seule fois pour les deux (`MenuKit`) |
| Vue grille ou liste | `components/files/view-mode.tsx`, `FileGrid.tsx`, `ExplorerToolbar` | Choix gardé dans `localStorage` (`ndf-vault-view`). Vignettes pour les images **non protégées** seulement : une image protégée n'apparaît que dans la visionneuse. La corbeille reste en liste |
| Téléverser un dossier entier | `uploads.pickedFromInput`, `pickedFromDrop`, `UploadCheck.path`, store `uploadFiles` | Bouton « Choisir un dossier » ou dépôt d'un dossier (sur le dialogue ou n'importe où). Les sous-dossiers sont retrouvés ou créés sous la destination ; fichiers système (`.DS_Store`, `Thumbs.db`, `~$…`) écartés ; 1000 fichiers et 12 niveaux au plus |
| Noms en double | store `uploadFiles` (`freeName`) | Un deuxième « Notes.txt » dans le même dossier devient « Notes (2).txt » |
| Corbeille de 30 jours | `VaultFile.deletedAt`, `BIN_DAYS`, effet dans `store.tsx`, `FilesView` | Un fichier supprimé reste 30 jours, puis est effacé à l'ouverture du Vault, original, versions et index compris (entrée au journal). Bandeau explicatif et bouton « Vider la corbeille » |
| Espace utilisé | `StorageMeter` dans `Shell.tsx` | Jauge au pied de la barre latérale, d'après l'estimation du navigateur |

Pas fait, parce que cela demande le serveur : liens de partage, demandes de fichiers, commentaires entre personnes.

### Fonctions réelles

| Fonction | Où | Notes |
|---|---|---|
| Téléversement | `UploadDialog` dans `Dialogs.tsx`, `src/lib/uploads.ts` | Plusieurs fichiers, glisser-déposer dans le dialogue **ou n'importe où dans la fenêtre** (`useWindowDrop` dans `Shell.tsx`), vérification asynchrone (format, taille, contenu, doublon) |
| Stockage persistant | `src/lib/db.ts` | IndexedDB (`ndf-vault` : `state`, `blobs`, et `meta` en clair pour l'état de la protection). Rien ne quitte l'appareil. `SCHEMA = 4` ; `migrate()` accepte encore le schéma 3 |
| Sauvegarde immédiate | `saveNow()` dans `store.tsx` | File d'écritures ordonnée, déclenchée à chaque changement et à `pagehide`. **Ne pas remettre de délai (debounce)** : un rechargement juste après un téléversement perdait la liste des fichiers |
| Téléchargement | `saveToDisk` dans `uploads.ts` | Capacité `downloads` de l'hébergeur quand elle existe, sinon téléchargement normal. Les fichiers d'exemple n'ont pas d'original et le disent |
| Aperçu réel | `viewer/PreviewModal.tsx`, `viewer/pdf.ts`, `viewer/OfficePreview.tsx` | PDF (PDF.js sur le fil principal), images, TXT, CSV |
| Aperçu Office | `src/lib/office.ts`, `viewer/OfficePreview.tsx` | **Aperçu simplifié, annoncé comme tel à l'écran** : le contenu, pas la mise en page. Word : titres (d'après la feuille de styles du document, donc aussi « Titre 1 » d'un Word français), gras, italique, souligné, listes, tableaux, sauts de page ; le texte supprimé en suivi des modifications est écarté. Excel : feuilles en onglets, valeurs et derniers résultats des formules, dates et pourcentages, 300 lignes × 40 colonnes par feuille ; **les feuilles masquées sont montrées et signalées**. PowerPoint : diapositives dans l'ordre du diaporama, titres, puces et niveaux, **notes du présentateur et diapositives masquées signalées**. Non reproduits : images, graphiques, en-têtes, zones de texte, cellules fusionnées |
| Recherche dans le contenu | `src/lib/search.ts`, `src/lib/extract.ts`, index dans `store.tsx` (`textIndex`, `searchContent`), `CommandPalette` | Le texte des PDF (PDF.js), des fichiers Word, Excel, PowerPoint (notes comprises) et des fichiers texte est lu en arrière-plan, un document à la fois, puis gardé sous `t-<id du fichier>` à côté des originaux, **chiffré comme eux**. Recherche sans tenir compte de la casse ni des accents, tous les mots exigés, extrait avec le passage trouvé ; le résultat ouvre le document à la bonne page, diapositive ou feuille. Seul un original qui correspond à son empreinte est indexé. L'index suit les nouvelles versions et disparaît avec le fichier. Pas de reconnaissance de caractères : un PDF numérisé n'a pas de texte |
| Historique des versions | `VersionsDialog`, store `addVersion`, `restoreVersion`, `deleteVersion`, `downloadVersion` | Même format exigé, version identique refusée (empreinte), anciennes versions téléchargeables, restaurables, supprimables |
| Dossiers | `FolderMenu` dans `views/shared.tsx`, `selectors.folderRules` | Renommer, déplacer, supprimer, exporter en ZIP. Règles : racine intouchable ; dossiers numérotés 00–10 renommables mais ni déplaçables ni supprimables ; dossier d'un projet non supprimable ; un dossier non vide (fichiers archivés ou supprimés compris) ne se supprime pas. Une action bloquée reste au menu et dit pourquoi |
| Projets | `ProjectMenu`, `EditProjectDialog` | Modifier (nom, code, période, résumé), archiver, restaurer ; onglets Actifs / Archivés |
| Exports | store `exportZip`, `exportVault`, `exportJournal` | Sélection ou dossier en ZIP ; Vault complet en ZIP avec `manifeste.json` (empreintes) ; journal en CSV |
| Profil | Réglages → Profil | Nom, société, courriel : alimentent le filigrane personnel |
| Suppression définitive, réinitialisation | store `purgeFiles`, `resetVault` | Avec confirmation. La réinitialisation garde la protection (`db.clearData`) |
| Visite guidée | `src/components/Tour.tsx` | 8 étapes avec « Compris », dont « Protégez le Vault ». Clé `localStorage` `ndf-vault-tour-done`. Cibles : attribut `data-tour` |

### Tests

| Suite | Commande | Contenu |
|---|---|---|
| Unitaires (200) | `npm test` | `tests/unit/` : `crypto` (dérivation, mauvaise phrase, altération, échange d'emplacements, force), `db` (protection, verrouillage, conversion interrompue, migration, compteur d'erreurs) avec `fake-indexeddb`, `recovery` (code, récupération, remplacement, tentatives), `backup` (aller-retour, rien en clair, fichier altéré, enregistrements échangés, validation de l'état restauré), `uploads` (octets magiques, exécutables déguisés, faux fichiers Office, macros), `unzip` (bombe de décompression, somme de contrôle, archives tronquées), `xml` (DOCTYPE refusé, entrées hostiles en temps linéaire), `office` (Word, Excel, PowerPoint, limites), `search` (casse et accents, extraits, limites), `protection` (niveaux, codes, filigrane dessiné, effacement après tentatives), `familiar` (glisser-déposer, dossiers téléversés, corbeille), `format` (noms), `csv` (injection de formules), `zip` (chemins, CRC), `rules` (règles de dossiers, routes, texte du filigrane) |
| Navigateur (119) | `npm run test:e2e` | `tests/e2e/` : dérivation de clé, phrase proposée, redemande de la phrase et verrouillage après refus (`passphrase`), gestes familiers (`familiar` : glisser-déposer, clic droit, grille, dossier entier, doublons, corbeille, jauge), protection des documents (consultation seule, filigrane dans les pixels, lecture protégée, code de consultation, touche de capture, effacement, verrouillage d'urgence, bilan), visite guidée, fichiers, téléversement, aperçus Office, recherche dans le contenu, vérification d'intégrité, actions sensibles, journal des verrouillages, écran de confidentialité, versions, dossiers et projets, exports, sécurité (rien en clair sur disque, écran de verrouillage muet, délai, verrouillage automatique, original altéré…), code de récupération, sauvegarde et restauration (dont la restauration dans un second profil de navigateur, comme sur un autre appareil), téléphone |

`npm run test:e2e` reconstruit d'abord `dist/` puis sert ce dossier (`scripts/serve-dist.mjs`, port 4173) : les tests s'exécutent sur **la page réellement publiée**, pas sur le serveur de développement. `tests/e2e/helpers.ts` contient les aides (`openVault`, `upload`, `protect` qui rend le code de récupération, `noteRecoveryCode`, `unlock`, `diskDump`, `tamperFirstOriginal`, `readZip`…). `tests/fixtures/office.ts` fabrique de vrais fichiers Word, Excel et PowerPoint compressés, pour les deux suites.

### Page hébergée

`npm run build:page` produit `dist/ndf-vault.html` : toute l'app en un seul fichier (JS via esbuild depuis `standalone/main.tsx`, CSS via la CLI Tailwind, police en data URI), au format attendu par un Artifact claude.ai (pas de `<html>`/`<head>`). `dist/preview.html` est le même contenu dans un document complet, pour l'ouvrir en local. Contraintes de cet hébergeur à respecter dans le code : pas d'impression, téléchargements seulement via `claude.use("downloads")`, routage par `#nom` simple.

### Fichiers

| Fichier | Contenu |
|---|---|
| `src/lib/types.ts` | `VaultFile` (avec `sha256`, `versions`), `FileVersion`, `Folder`, `Project`, `Profile`, `ActivityItem`, `Route`, statuts |
| `src/lib/sample-data.ts` | 42 fichiers d'exemple en français, index numéroté 00–10 (PB1/PB2 et FS1–FS5 sous 04 Production), projets PB1/PB2, 5 services, activité |
| `src/lib/crypto.ts`, `db.ts`, `backup.ts`, `uploads.ts`, `unzip.ts`, `xml.ts`, `office.ts`, `search.ts`, `extract.ts`, `protection.ts`, `dnd.ts`, `pdf.ts`, `stamp.ts`, `csv.ts`, `zip.ts` | Voir les tableaux ci-dessus |
| `src/lib/format.ts` | Dates et tailles à la française, `KIND_LABEL`, `STATUS_LABEL`, `count()`, `sanitizeName` |
| `src/lib/selectors.ts` | `activeFiles`, tris, `fileCategory`, `folderRules` |
| `src/lib/routes.ts` | `routeToHash`, `hashToRoute` |
| `src/lib/store.tsx` | `VaultProvider` (démarrage, verrouillage) → `VaultSession` (tout l'état) ; `useVault()` : routage, toasts, dialogues, aperçu, mutations, sécurité, exports |
| `src/components/brand/` | Logo NDF5 vectorisé, `VaultLockup`, `AppWatermark`, `PageWatermark`, `PersonalWatermark` |
| `src/components/ui.tsx`, `dialog-kit.tsx` | Boutons, onglets, badges… ; `Modal`, `Field`, `Note`, `Toggle`, `PassphraseInput` |
| `src/components/security/` | `LockScreen` (déverrouiller, récupérer, effacer), `SecurityDialogs` (`ProtectDialog`, `PassphraseDialog`, `UnprotectDialog`, `RecoveryDialog`, `BackupDialog`, `RestoreDialog`, `AuditDialog`, `ExportVaultDialog`), `parts.tsx` (pièces sans état du Vault, utilisables quand il est verrouillé), `PrivacyVeil` |
| `src/components/Shell.tsx` | Sidebar, topbar (verrou, aide), tiroir mobile, dépôt de fichiers sur toute la fenêtre |
| `src/components/files/` | `FileTable` (complète, compacte, corbeille, actions groupées, menu partagé avec le clic droit), `FileGrid`, `view-mode`, `drop`, `Explorer` (filtres, recherche) |
| `src/components/Dialogs.tsx` | Tous les dialogues de fichiers, dossiers et projets, `ToastHost` |
| `src/components/viewer/` | `PreviewModal`, `OfficePreview` (le chargeur PDF est dans `src/lib/pdf.ts`) |
| `src/components/CommandPalette.tsx`, `Tour.tsx` | Recherche globale ⌘K / Ctrl+K / « / » ; visite guidée |
| `src/views/` | `Home`, `FilesView`, `FolderView`, `ProjectsView`, `ProjectView`, `ActivityView`, `SettingsView`, `shared.tsx` |

### Choix faits pendant la vérification (à confirmer par l'utilisateur)

- **Colonnes de la table complète selon la largeur** : les 8 colonnes à partir de 1420 px ; à 1280 px, le type passe dans la deuxième ligne du nom pour que les noms restent lisibles ; le bouton de téléchargement avec texte apparaît à partir de 1600 px.
- **Watermark de l'espace de travail** réduit à 230 px : en grand il recouvrait les lignes de la table. Opacité 0,035, désactivable dans Réglages.
- **« Épingler à l'accueil »** ajouté au menu trois-points ; 3 fichiers épinglés dans les données d'exemple, comme sur l'image 3.
- **Police et icônes refaites après retour de l'utilisateur** : Geist medium et icônes pleines, voir section 6.
- **Arborescence du brief remplacée par l'index 00–10 du plan** (section 1 bis).
- **La protection est proposée, pas imposée** : le Vault s'ouvre sans phrase secrète tant que l'utilisateur ne l'active pas (visite guidée, bouton bouclier, Réglages).

### Suite prévue

Le serveur : authentification des invités par code, permissions par dossier et par niveau (0 à 3), Terms of Access et NDA, journal « qui a ouvert quoi » côté serveur, expiration et révocation, questions, signature. Fournisseur à confirmer avec l'utilisateur (section 1 bis).

## 4. Architecture et décisions

- **Une seule page, vues pilotées par l'état.** `route` vit dans le store et se synchronise avec `location.hash`. Noms de hash simples : `#home`, `#files`, `#projects`, `#private`, `#shared`, `#favorites`, `#recent`, `#archived`, `#activity`, `#preferences`, `#project-<id>`, `#folder-<id>`. La vue Settings s'appelle `preferences` dans le code (le hash `#settings` est réservé par l'hébergeur d'aperçu).
- **Le store est la seule couture vers la persistance.** Les composants n'appellent que `useVault()`. Pour le serveur, brancher le nouveau stockage derrière les mutations du store (ou extraire une interface `VaultRepository`), sans toucher aux composants.
- **Lire l'état stocké, pas l'état du rendu, dans une action qui en suit une autre.** `ProtectDialog` appelle `enableProtection` puis `createRecoveryCode` dans le même geste : la seconde fonction vient encore du rendu précédent, où le Vault n'était pas protégé. Elle interroge donc `db.readMeta()`. Même piège pour toute action enchaînée.
- **Après une restauration, la session en mémoire est périmée** : `frozen` bloque ses sauvegardes et `reload()` en remonte une nouvelle sur ce qui est stocké.
- **Deux étages dans le store** : `VaultProvider` gère le démarrage et le verrouillage ; `VaultSession` (remonté avec une nouvelle `key` à chaque déverrouillage) porte l'état déchiffré. Verrouiller démonte la session : rien de déchiffré ne survit en mémoire React.
- **La clé de données ne vit qu'en mémoire** (`dataKey` dans `db.ts`, non extractible) et disparaît au verrouillage ou au rechargement.
- **Retirés plutôt que simulés** : imprimer et chercher dans le document (boutons enlevés de la visionneuse), créer un document ou un tableur dans l'app (cartes remplacées par Téléverser et Visite guidée).
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
| Police | Geist variable (locale, `--font-geist`), base 14 px / 20 px ; libellés de navigation et noms en graisse 500, élément actif en 600 |
| Icônes | Deux familles, par rôle. **Objets et navigation** (sidebar, fichiers, dossiers, cartes d'action) : Phosphor en `weight="fill"`, dans une tuile `bg-fill` sans bordure, comme l'image 3. **Actions** (barres d'outils, menus, boutons) : Lucide en contour, comme les images 1 et 2 |
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
- **Ne pas combiner `hidden` (ou une autre classe `display`) avec `Button` / `IconButton`** : ils posent déjà `inline-flex`, qui l'emporte. Utiliser `max-sm:hidden`, `max-md:hidden`, ou un `<span>` englobant.
- Dossiers et projets partagent des identifiants (`pb1`, `pb2`) : préfixer toute clé React qui mélange les deux.
- `@phosphor-icons/react` 2.x : les composants portent le suffixe `Icon` (`HouseIcon`, `FolderIcon`…).
- Le serveur de production s'appelle `next-server` : `pkill -f "next start"` ne le tue pas. Vérifier que le port est libre avant de relancer, sinon on regarde l'ancienne version.
- `lucide-react` est en v1.x : vérifier qu'une icône existe avant de l'importer (toutes celles déjà utilisées ont été vérifiées).
- `FileTable` : les seuils de colonnes tiennent compte des 264 px de sidebar (`sm`, `md`, `min-[1140px]`, `xl`, `min-[1420px]`, `min-[1600px]`). Les revoir si la sidebar ou les marges changent.
- Pour un aperçu statique hébergé (export `output: "export"`), les chemins `/_next/...` sont absolus : prévoir un `assetPrefix` ou un post-traitement.
- **Après `next dev`, faire `rm -rf .next` avant `next build`**, sinon la feuille de style peut être périmée.
- **Styles globaux dans `@layer base`** : une règle CSS hors couche l'emporte sur toutes les classes utilitaires de Tailwind v4.
- **Playwright est épinglé à 1.63.0**, la version du Chromium préinstallé. Ne pas lancer `playwright install`.
- **Tests : locale UTF-8 obligatoire pour le navigateur.** Sans elle, un téléchargement au nom accentué s'appelle « download ». `playwright.config.ts` force `C.UTF-8` quand l'environnement n'en a pas.
- **Pas d'expression régulière sur du contenu venu d'un fichier sans borne de longueur.** Un motif comme `[^=]+\s*=` ou `\[[^\]]*\]` prend un temps quadratique sur une entrée piégée et gèle la page. `xml.ts` lit les attributs en une passe ; `classifyFormat` tronque son entrée. Les tests `hostile input` le vérifient au chronomètre.
- **Le premier déverrouillage d'un ancien Vault est plus long** : il ré-enveloppe la clé avec scrypt. Dans les tests, une enveloppe PBKDF2 à faible coût (`createEnvelope(phrase, 1000)`) n'est pas mise à niveau, pour qu'ils restent rapides.
- **Lire une entrée de dossier déposé tout de suite** : `webkitGetAsEntry()` doit être appelé dans le gestionnaire de dépôt, avant tout `await` ; le navigateur vide le dépôt dès que le gestionnaire rend la main (`pickedFromDrop`).
- **Tests : l'arbre des dossiers et la jauge d'espace sont dans `<aside>`, pas dans la navigation principale.**
- **Tests : plusieurs boutons portent le même nom dans Réglages** depuis le bilan de sécurité (« Activer », « Vérifier », « Sauvegarder ») : cibler le panneau voulu (`[data-checkup]`) ou prendre `.last()`.
- **Tests : `row(page, "Entente")` attrape aussi un fichier d'exemple** (« Modèle d'entente… ») : choisir des noms de test qui n'existent pas dans les données d'exemple.
- **Un dialogue Radix ouvert coupe les clics sur le reste de la page** (`pointer-events: none` sur `body`). Tout ce qui doit rester cliquable par-dessus un dialogue sans en faire partie (le voile de confidentialité) doit poser `pointer-events-auto`.
- **Tests : ne pas mesurer un élément pendant son animation d'ouverture** (`animate-rise` change sa taille pendant 200 ms) ; utiliser `expect.poll`.
- **Tests : attendre la fin d'une action qui navigue** (la réinitialisation revient à l'accueil) avant de changer de vue, sinon la navigation de l'app passe après celle du test.
- **Tests de verrouillage automatique** : avec l'horloge simulée de Playwright le verrou tombe environ 2 s après l'échéance ; utiliser des attentes avec délai (`expect.poll`, `toBeVisible({ timeout })`), pas une vérification immédiate.
- **`crypto.getRandomValues` refuse plus de 65 536 octets** par appel : générer les gros tampons de test autrement.
- **Tests téléphone** : utiliser un profil d'appareil (`devices["Pixel 7"]`), pas seulement une petite fenêtre, sinon le survol de la souris est émulé et les clics tombent sur les boutons de survol.

## 8. Commandes

```bash
npm install
npm run dev         # http://localhost:3000
npx tsc --noEmit    # doit rester sans erreur
npm run build       # build Next.js
npm run build:page  # dist/ndf-vault.html (page hébergée) et dist/preview.html
npm test            # tests unitaires (Vitest)
npm run test:e2e    # reconstruit la page puis lance les tests navigateur (Playwright)
npm run test:all    # les deux
```

## 9. Prompt de démarrage pour Claude Code

```
Lis HANDOFF.md en entier, puis docs/brief.txt. Lis aussi AGENTS.md et les guides
Next concernés dans node_modules/next/dist/docs/.

L'interface est en français. Fonctionnent déjà : téléversement, stockage chiffré dans
le navigateur (phrase secrète, verrouillage, code de récupération), sauvegarde chiffrée
et restauration, aperçus (PDF, images, texte, Word, Excel, PowerPoint), recherche dans
le contenu, vérification d'intégrité, protection des documents (consultation seule,
lecture protégée, filigrane incrusté, code de consultation), gestes d'un gestionnaire
de fichiers (glisser-déposer, clic droit, grille, dossier entier, corbeille de 30 jours),
versions,
dossiers, projets, exports, filigrane personnel, journal de sécurité, visite guidée,
et deux suites de tests.
Demande à l'utilisateur ses ajustements après son essai sur PC, puis la suite :
l'accès des invités et le serveur (fournisseur à confirmer, voir section 1 bis).

Après chaque changement : npx tsc --noEmit, npm test, npm run test:e2e.
Toute nouvelle fonction arrive avec ses tests.
Écris-moi l'avancement dans le chat pendant que tu travailles, en français.
```
