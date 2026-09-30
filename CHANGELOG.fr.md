# Changelog — dsh-docx-sidebar

## 0.3.0 — 2026-09-29

### Changed

- **Migration de la ligne d'hôtes vers DSH 0.2.0** (`main`, promue depuis `compat/0.2.0`) : `engines.dsh` et le peer `@deepseek-ai/dsh-client-locale` passent de `>=0.1.5-rc.1 <0.2.0-0` à `>=0.2.0-rc.1 <0.2.1-0` (fenêtre rc verrouillée, réévaluation à partir de 0.2.1). Adaptation purement métadonnées — la surface consommée n'est constituée que de callers purs `ctx.get(...)` (avec définitions d'interface locales embarquées) ; 0.2.0-rc.1 est totalement compatible avec l'API de plugins 0.1.7, zéro modification de code. La ligne 0.1.x (0.1.5/0.1.7) reste servie par les branches figées `compat/0.1.7` / `compat/0.1.5` (≤0.2.0).
- Arbre de dépendances actualisé selon la nouvelle ligne, lockfile régénéré ; version/engines de `dsh.plugin.json` alignés sur `package.json`.

### Documentation (2026-09-29 — pas de republication)

- Structuration des branches : `main` promue ligne 0.2.0 (depuis `compat/0.2.0`) ; la ligne d'hôtes 0.1.x est servie par les branches figées `compat/0.1.7` / `compat/0.1.5`. La correspondance npm est inchangée : `dsh-0.2.0` → cette ligne, `dsh-0.1.7` / `dsh-0.1.5` → ligne 0.1.x.
- Installation (cette ligne) : `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`.
- Le README s'est enrichi d'un aperçu d'installation et de compatibilité en cinq langues (de/fr/ru/es/it).

## 0.2.0 — 2026-09-23

Adaptation à la largeur de la barre latérale : la vue de lecture s'échelonne proportionnellement à la largeur du panneau, avec limites haute et basse.

### Added

- **Mise à l'échelle adaptative en largeur** (`src/client/scale.ts` + `useReaderScale.ts`) : un coefficient de rapport est déduit de la largeur du conteneur et écrit dans la variable CSS `--reader-scale`, taille de police racine `13px × scale`, le corps passe entièrement en `em` et suit donc la mise à l'échelle. Largeur de référence : **rapport exactement 1 à 360px** (rendu visuel identique à 0.1.0 en largeur normale), minimum **0.9**, maximum **1.15**.
- **La mise à l'échelle ne s'applique qu'au contenu du document** : titres, paragraphes, listes, code, notes, tables et légendes d'images suivent le rapport ; **la barre d'information, la bannière de disjoncteur et les états de chargement/vide gardent une taille de police fixe** — voir le texte de l'interface changer en tirant le séparateur ressemblerait à une panne, pas à de l'adaptatif.
- **Rapport quantifié à deux décimales** : le glissement du séparateur ne prend effet que par paliers de 0,01, pour éviter une réorganisation à chaque pixel.
- **Largeur non mesurable : repli sur 1** : 0 / négatif / NaN / Infinity (première frame ou remontée d'anomalie) sont toujours rendus à la référence, jamais à une valeur extrême — sinon une police minuscule clignoterait à l'ouverture.
- **Retraits passés en `em`** : le retrait des puces vaut `INDENT_EM = 1.08em`, soit à rapport 1 l'ancien 14px.
- **Plafond des cellules de table 320px → 24.6em** : dans un panneau étroit, les cellules rétrécissent avec lui au lieu de forcer une barre de défilement horizontale.

### Changed

- Les images restent affichées aux dimensions déclarées par le document, plafonnées à la seule largeur du panneau : agrandir une bitmap au-delà de sa taille d'origine pour suivre la taille de police ne fait que la rendre plus floue — de restitution, point du tout.

### Tests

- 5 nouvelles assertions (19 au total) : rapport constant de 1 à la largeur de référence, limites et monotonie, repli sur largeur non mesurable, quantification à deux décimales, alignement du retrait sur l'ancien 14px.

### Packaging

- **Première publication npm** : `dsh-docx-sidebar@0.2.0`, dist-tags `latest` + `dsh-0.1.5` ; 38 files / 75.8 kB, shasum du tarball `1060a5e8bc35e0629cbd59b62d71620bfc5790b0`.
- Champ **`repository`** déclaré, pointant vers `drscrewdriver/dsh-docx-sidebar`. La liste de recensement n'associe le paquet npm au dépôt que si le paquet publié pointe vers lui.
- **Scripts déclarés mais inexistants : complétés** : `publish-npm.ps1` et `migrate-profile.ps1` restaurés depuis un dépôt de la même famille (le premier identique octet pour octet, sans nom de paquet en dur — nom et version lus dans package.json) ; `fixtures` et `report` n'ont aucune implémentation dans ce dépôt, les déclarations sans objet ont été supprimées.

## 0.1.0 — 2026-09-22

Première version : vue de lecture `.docx` (sans restitution de la mise en page), zéro dépendance à l'exécution.

### Added

- **Visionneuse de documents** (`registerFileViewer`, `exts: ['docx','docm']`, `fetchStrategy: 'custom'`) : les octets de l'archive proviennent de la route `/sidebar/file` de l'hôte ; la clôture des chemins d'espace de travail reste du côté de l'hôte.
- **Analyse** (`src/client/docx.ts`) : niveaux de titres déterminés par le **nom** du style dans `styles.xml` (`heading N`), `w:outlineLvl` en secours, plus d'erreur par suffixe numérique d'id (`List1` n'est pas un titre) ; paragraphes et formats en ligne (gras/italique/souligné/monospace/`w:tab`/`w:br`) ; `w:numPr`+`w:ilvl` → retraits de listes ; `w:tbl` → vraies tables (les cellules ne sont plus dupliquées en paragraphes) ; en-têtes/pieds → blocs note étiquetés.
- **Images** : octets extraits de l'archive → URL `blob:` (les images en ligne sont dans le zip, il n'y a pas de route d'hôte à laquelle se référer), libérées par `revokeObjectURL` au déchargement/changement ; formats non rendables comme EMF/WMF/TIFF → espace réservé annoté, jamais de blanc silencieux.
- **Sept voies de disjoncteur** : taille d'archive / décompression cumulée / partie unique (trois portes conteneur) + nombre de blocs / texte par bloc / nombre d'images / image unique. Si le volume d'une image dépasse déjà dans le répertoire, **pas de décompression, saut direct**.
- **Au plus un avertissement par dimension** : le breaker tient en interne un Map par raison, dédoublonnage structurel (un plugin frère a connu des avertissements en double sur une même dimension).
- **Tests** : 14 assertions, fixtures de vrais zips docx construits sur place (CRC32 + répertoire central + vrai PNG), couvrant les chemins d'analyse, les cinq portes et l'intégrité des placeholders zh/en ; code de sortie 0/1.

### Notes

- Volontairement absent : pagination/marges, restitution des polices et des tailles, objets flottants et ancrés, colonnes, marques de révision, commentaires, reconstruction des séquences de numérotation, composition des formules. L'interface affiche en haut « Vue de lecture — pas une restitution de la mise en page ».
- Aucun import mutuel avec `dsh-opensheet-sidebar` (domaine des tables) : les plugins sont auto-contenus ; le code partagé attendra un troisième consommateur avant d'être extrait.
