# dsh-docx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> ⛔ **Ce projet n’est plus maintenu (2026-10-01).** Les versions récentes de l’hôte DSH intègrent un aperçu latéral des documents office ; ce plugin cesse d’être maintenu — aucune publication ultérieure, aucune adaptation aux futures lignes de l’hôte. Les versions publiées restent installables ; pour les hôtes 0.1.x, utilisez les versions des branches figées `compat/0.1.7` / `compat/0.1.5`.

Lecture des `.docx` dans la barre latérale droite de DSH (consommateur de [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)) : niveaux de titres, paragraphes, retraits de listes, **vraies tables**, images en ligne, avec protection par disjoncteur.

> **Ceci est une vue de lecture, pas une restitution de la mise en page.** Cette mention est affichée en haut de l'interface — pas de pagination, aucune restitution des polices, aucun traitement des objets flottants, des colonnes ni des marques de révision. Laisser l'utilisateur croire que des différences de mise en page sont un bug serait pire qu'annoncer clairement les limites de ce qui est possible.

## 1. Ce qui est pris en charge / ce qui ne l'est pas

| Pris en charge | Détails |
|------|------|
| Niveaux de titres | Déterminés par le **nom** du style dans `styles.xml` (`heading 1` → `w:h1`), sans deviner à partir du suffixe numérique de l'id ; `w:outlineLvl` en secours |
| Paragraphes et formats en ligne | Gras, italique, souligné, `w:tab`/`w:br`, monospace (`rStyle`/`rFonts` résolus en monospace) |
| Listes | `w:numPr` + `w:ilvl` → niveaux de retrait (la séquence de numérotation n'est pas reconstruite) |
| Tables | `w:tbl` → `w:tr` → `w:tc`, les paragraphes multiples d'une cellule sont fusionnés ; **elles ne réapparaissent plus comme paragraphes du corps du texte** |
| Images | Octets extraits de l'archive → URL `blob:` (les images en ligne sont dans le zip, il n'y a pas de route d'hôte à laquelle se référer) ; EMF/WMF/TIFF impossibles à rendre → espace réservé annoté |
| En-têtes/pieds de page | Restitués comme blocs note étiquetés, en haut/en bas |
| Formules | Pas de composition ; seul le texte stocké dans le fichier est affiché |

**Non pris en charge** : pagination et marges, restitution des polices et des tailles, objets flottants/ancrés, colonnes, marques de révision (`w:ins`/`w:del`), commentaires, reconstruction des séquences de numérotation, composition des formules.

## 2. Adaptation à la largeur

Le panneau latéral est redimensionnable, la vue de lecture s'échelonne donc avec la largeur — **mais dans des limites** ; « adaptatif » n'est pas une licence pour agrandir ou réduire à l'infini :

| Réglage | Valeur | Justification |
|------|------|------|
| Largeur de référence | 360px | À cette largeur, le rapport vaut **exactement 1** : la largeur de panneau usuelle restitue la mise en page de la version 0.1.0 |
| Limite basse | 0.9× | Si le panneau est plus étroit, le texte doit rester lisible |
| Limite haute | 1.15× | Plus large ne sert qu'au confort, pas au gigantisme |
| Quantification | Deux décimales | Le redimensionnement ne réorganise que par paliers de 0,01, pas à chaque pixel |

Le rapport est déduit de la largeur du conteneur et écrit dans la variable CSS `--reader-scale` ; la taille de police racine vaut `13px × rapport`, et le corps du texte utilise entièrement des `em` : le texte est donc **reflowé** à la nouvelle taille, et non mis à l'échelle dans son ensemble par un `transform` (cela le rendrait flou).

**Seul le contenu du document est mis à l'échelle.** Titres, paragraphes, listes, code, notes, tables et légendes d'images suivent le rapport ; **la barre d'information, les éléments d'interface autres que les étiquettes d'en-tête/pied de page, la bannière de disjoncteur et les états de chargement/vide gardent une taille de police fixe** — voir le texte de l'interface changer en tirant le séparateur ressemblerait à une panne, pas à de l'adaptatif.

Deux décisions associées :

- **Une largeur non mesurable retombe sur 1, pas sur une valeur extrême.** À la première frame, la largeur vaut 0 ; si l'on rendait « le plus étroit possible », une police minuscule clignoterait à chaque ouverture de document.
- **Les images ne participent pas à la mise à l'échelle.** Elles s'affichent aux dimensions déclarées par le document, plafonnées à la largeur du panneau ; agrandir une bitmap au-delà de sa taille d'origine pour suivre la taille de police ne fait que la rendre plus floue — de restitution, point du tout.

## 3. Pipeline de lecture

```
Octets de l'archive (route /sidebar/file de l'hôte, binaire)
  → répertoire central (vérification préalable du volume déclaré après décompression)
  → décompression en flux + budget d'octets (comptage pendant la décompression, cancel dès dépassement)
  → word/document.xml             blocs du corps (balayage séquentiel, les paragraphes à l'intérieur des tables sont ignorés)
  → word/_rels/document.xml.rels  rId → cibles des images / en-têtes-pieds (External ignoré)
  → word/styles.xml               id de style → niveau de titre
  → word/media/*                  octets des images (à la demande ; au-delà de la limite, on saute directement, sans décompresser)
```

Zéro dépendance à l'exécution : la décompression zip passe par le `DecompressionStream('deflate-raw')` natif du navigateur, le XML par un balayage ciblé (le WordprocessingML est une structure régulière générée par machine, et une expression régulière **ne peut pas** équilibrer des imbrications de même nom ; `findElements` compte donc les profondeurs).

## 4. Disjoncteur (sept dimensions)

| Dimension | Défaut | Au-delà de la limite |
|------|------|--------|
| Taille de l'archive | 5 MB | BLOCKED (rien n'est décompressé) |
| Décompression cumulée | 64 MB | BLOCKED — résistance aux zip bombs |
| Partie unique | 32 MB | BLOCKED |
| Nombre de blocs | 5 000 | TRUNCATED, la lecture s'arrête |
| Texte par bloc | 20 000 caractères | bloc omis + avertissement |
| Nombre d'images | 200 | les suivantes sont ignorées + avertissement |
| Image unique | 8 MB | image ignorée (**si la taille dépasse déjà dans le répertoire, pas de décompression**) + avertissement |

> **Au plus un avertissement par dimension** est une garantie structurelle (le breaker tient en interne un Map par `reason`), pas une convention : déclencher deux fois la même dimension rendrait deux lignes presque identiques sur la bannière — un plugin frère a même publié une version de correctif à cause de cela.

Le résultat du disjonctement est un citoyen de première classe : BLOCKED s'affiche comme une carte d'erreur lisible, sans jamais lever d'exception ni tourner en boucle infinie.

## 5. Build et vérification

```bash
npm run build     # double point d'entrée esbuild + déclarations de types tsc ; au build, le bundle est réellement chargé une fois via node:vm avec assertion de apply/inject
npm test          # 14 assertions
npm run verify    # build && test
```

Le dispositif de test est un **vrai zip docx construit sur place** (CRC32 et répertoire central corrects, référençant un vrai PNG 1×1), couvrant : détection des titres par nom de style (`List1` ne doit pas être pris à tort), formats en ligne, niveaux de listes, tables sans cellules dupliquées en paragraphes, EMU→px, espaces réservés des formats non rendables, note d'en-tête et relations External ignorées, cohérence des compteurs, ainsi que les cinq gardes et l'intégrité des placeholders zh/en.

## 6. Installation

```bash
# CLI officielle (recommandée ; gère aussi les dépendances et dsh.profile.bundles)
dsh plugin --profile <profile> add <path | npm 包 | github:owner/repo#<sha>>
```

L'installation manuelle comporte trois étapes, toutes obligatoires (ne faire que les étapes 1 et 3 = le plugin ne se charge jamais, sans aucune erreur) : ① copier dans le `node_modules/` du profil ; ② ajouter `dsh-docx-sidebar` au `dsh.profile.bundles` du `package.json` de ce profil ; ③ ajouter la ligne insert du `cordis.patch.yml` de ce paquet au `cordis.patch.yml` du profil.

Après l'installation, vérifiez hors ligne avant de redémarrer :

```powershell
dsh --profile <profile> --dump-config | Select-String dsh-docx-sidebar
```

**Dépendance** : `dsh-better-sidebar >= 0.18.1` (optionnelle). En son absence, le plugin se charge normalement, émet un warn en console et ne contribue aucune entrée.

**Matrice de compatibilité** :

| Version du plugin | Plage d'hôtes DSH | Détails |
|---------|-------------|------|
| 0.3.0 | `>=0.2.0-rc.1 <0.2.1-0` | Ligne 0.2.0 (`main`, promue depuis `compat/0.2.0`). Adaptation purement métadonnées : la surface consommée n'est que des callers purs `ctx.get(...)` ; 0.2.0-rc.1 est totalement compatible avec l'API de plugins 0.1.7 |
| 0.2.0 | `>=0.1.5-rc.1 <0.2.0-0` | Servie par les branches figées `compat/0.1.7` / `compat/0.1.5` |

`engines.dsh` dans `package.json`, le peer `@deepseek-ai/dsh-client-locale` et `engines.dsh` dans `dsh.plugin.json` : trois endroits, la même plage, maintenus cohérents.

## 7. Relation avec `dsh-opensheet-sidebar`

Tables (csv/xlsx) et documents (docx) sont **deux plugins séparés par domaine de capacité**, chacun auto-contenu : pas d'import entre plugins — cela créerait un couplage dur entre deux plugins « dépendance douce » et des pièges d'ordre d'installation. Le code partagé zip/budget de décompression existe en deux exemplaires ; on n'envisagera d'extraire un paquet commun que lorsqu'un **troisième** consommateur apparaîtra (décision par seuil, pas préméditée).

## 多语言说明 / Sprachen / Langues / Языки / Idiomas / Lingue

Le présent README est rédigé en chinois. Aperçu installation et compatibilité (cette ligne exige DSH 0.2.0 : `>=0.2.0-rc.1 <0.2.1-0` ; installation : `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`) :

- **Deutsch** — benötigt DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), getestet gegen DSH 0.2.0-rc.1. Installation: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Die 0.1.x-Wirtslinie wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` (npm-Tags `dsh-0.1.7` / `dsh-0.1.5`) versorgt.
- **Français** — nécessite DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testé avec DSH 0.2.0-rc.1. Installation : `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La lignée d'hôtes 0.1.x est assurée par les branches figées `compat/0.1.7` / `compat/0.1.5` (tags npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Русский** — требуется DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), протестировано на DSH 0.2.0-rc.1. Установка: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Линия хостов 0.1.x обслуживается замороженными ветками `compat/0.1.7` / `compat/0.1.5` (npm-теги `dsh-0.1.7` / `dsh-0.1.5`).
- **Español** — requiere DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), probado con DSH 0.2.0-rc.1. Instalación: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La línea de anfitriones 0.1.x la atienden las ramas congeladas `compat/0.1.7` / `compat/0.1.5` (etiquetas npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Italiano** — richiede DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testato su DSH 0.2.0-rc.1. Installazione: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La linea di host 0.1.x è servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` (tag npm `dsh-0.1.7` / `dsh-0.1.5`).
