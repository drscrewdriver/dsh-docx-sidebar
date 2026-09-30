# Changelog — dsh-docx-sidebar

## 0.3.0 — 2026-09-29

### Changed

- **Migrazione della linea di host a DSH 0.2.0** (`main`, promossa da `compat/0.2.0`): `engines.dsh` e il peer `@deepseek-ai/dsh-client-locale` passano da `>=0.1.5-rc.1 <0.2.0-0` a `>=0.2.0-rc.1 <0.2.1-0` (finestra rc bloccata, rivalutazione da 0.2.1). Adattamento puramente di metadati — la superficie consumata è tutta caller puri `ctx.get(...)` (con definizioni di interfaccia locali incluse); 0.2.0-rc.1 è pienamente compatibile con l'API plugin 0.1.7, zero modifiche al codice. La linea 0.1.x (0.1.5/0.1.7) resta servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` (≤0.2.0).
- L'albero delle dipendenze è stato rinfrescato sulla nuova linea, lockfile rigenerato; version/engines di `dsh.plugin.json` allineati in sync con `package.json`.

### Documentazione (2026-09-29 — nessuna ripubblicazione)

- Struttura dei rami assestata: `main` promossa a linea 0.2.0 (da `compat/0.2.0`); la linea di host 0.1.x è servita dai rami congelati `compat/0.1.7` / `compat/0.1.5`. La mappatura npm non cambia: `dsh-0.2.0` → questa linea, `dsh-0.1.7` / `dsh-0.1.5` → linea 0.1.x.
- Installazione (questa linea): `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`.
- Il README si è arricchito di una panoramica di installazione e compatibilità in cinque lingue (de/fr/ru/es/it).

## 0.2.0 — 2026-09-23

Adattamento alla larghezza della barra laterale: la vista di lettura scala proporzionalmente alla larghezza del pannello, con minimo e massimo.

### Added

- **Scalatura adattiva in larghezza** (`src/client/scale.ts` + `useReaderScale.ts`): dalla larghezza del contenitore si deriva un coefficiente di rapporto, scritto nella variabile CSS `--reader-scale`, font di radice `13px × scale`, il testo passa interamente a `em` e quindi scala con esso. Larghezza di riferimento: **rapporto esattamente 1 a 360px** (a larghezza normale l'aspetto è identico a 0.1.0), minimo **0.9**, massimo **1.15**.
- **La scalatura riguarda solo il contenuto del documento**: titoli, paragrafi, elenchi, codice, note, tabelle e didascalie delle immagini seguono il rapporto; **barra informativa, banner dell'interruttore e stati di caricamento/vuoto mantengono dimensione fissa** — vedere il testo dell'interfaccia cambiare mentre si trascina il divisore sembrerebbe un guasto, non un adattamento.
- **Rapporto quantizzato a due decimali**: il trascinamento del divisore ha effetto solo a passi di 0,01, per evitare un riimpaginato a ogni pixel.
- **Larghezza non misurabile: ripiego su 1**: 0 / negativi / NaN / Infinity (prima frame o segnalazioni anomale) sono sempre resi alla dimensione di riferimento, mai a valori estremi — altrimenti all'apertura lampeggerebbe una dimensione minuscola.
- **Rientri passati a `em`**: il rientro dei bullet vale `INDENT_EM = 1.08em`, a rapporto 1 equivale ai precedenti 14px.
- **Tetto delle celle delle tabelle 320px → 24.6em**: nei pannelli stretti le celle si restringono con esso invece di forzare una barra di scorrimento orizzontale.

### Changed

- Le immagini restano mostrate alle dimensioni dichiarate dal documento, con tetto solo alla larghezza del pannello: ingrandire una bitmap oltre la sua dimensione originale per inseguire il corpo del font la rende solo più sfocata — di riproduzione, nemmeno a parlarne.

### Tests

- 5 nuove asserzioni (19 in totale): rapporto costante 1 alla larghezza di riferimento, limiti e monotonia, ripiego su larghezza non misurabile, quantizzazione a due decimali, rientro allineato ai 14px originali.

### Packaging

- **Prima pubblicazione npm**: `dsh-docx-sidebar@0.2.0`, dist-tags `latest` + `dsh-0.1.5`; 38 files / 75.8 kB, shasum del tarball `1060a5e8bc35e0629cbd59b62d71620bfc5790b0`.
- Campo **`repository`** dichiarato, che punta a `drscrewdriver/dsh-docx-sidebar`. L'elenco di inclusione associa il pacchetto npm al repository solo quando il pacchetto pubblicato punta al repository.
- **Script dichiarati ma inesistenti: colmati**: `publish-npm.ps1` e `migrate-profile.ps1` ripristinati da un repository della stessa famiglia (il primo identico byte per byte, senza nome di pacchetto incorporato — nome e versione letti da package.json); `fixtures` e `report` non hanno alcuna implementazione in questo repository, le dichiarazioni sospese sono state eliminate.

## 0.1.0 — 2026-09-22

Prima versione: vista di lettura `.docx` (non una riproduzione del layout), zero dipendenze a runtime.

### Added

- **Visualizzatore di documenti** (`registerFileViewer`, `exts: ['docx','docm']`, `fetchStrategy: 'custom'`): i byte dell'archivio arrivano dalla rotta `/sidebar/file` dell'host; la recinzione dei percorsi del workspace resta sul lato host.
- **Parsing** (`src/client/docx.ts`): i livelli dei titoli sono determinati dal **nome** dello stile in `styles.xml` (`heading N`), `w:outlineLvl` come ripiego, niente più scambi per la cifra finale dell'id (`List1` non è un titolo); paragrafi e formattazione in linea (grassetto/corsivo/sottolineato/monospace/`w:tab`/`w:br`); `w:numPr`+`w:ilvl` → rientri degli elenchi; `w:tbl` → tabelle vere (le celle non vengono più duplicate come paragrafi); intestazioni/piè di pagina → blocchi note etichettati.
- **Immagini**: byte estratti dall'archivio → URL `blob:` (le immagini in linea sono dentro lo zip, non c'è una rotta dell'host a cui puntare), liberate con `revokeObjectURL` allo scaricamento/cambio; formati non renderizzabili come EMF/WMF/TIFF → segnaposto annotato, mai vuoti silenziosi.
- **Sette dimensioni dell'interruttore**: dimensione dell'archivio / decompressione cumulata / parte singola (tre cancelli di contenitore) + numero di blocchi / testo per blocco / numero di immagini / immagine singola. Se il volume di un'immagine eccede già nella directory, **nessuna decompressione, salto diretto**.
- **Al massimo un avviso per dimensione**: il breaker tiene internamente una Map per reason, deduplicazione strutturale (un plugin gemello ha avuto avvisi doppi sulla stessa dimensione).
- **Test**: 14 asserzioni, fixture di veri zip docx costruiti sul momento (CRC32 + directory centrale + vero PNG), coprono i percorsi di parsing, i cinque cancelli e l'integrità dei segnaposto zh/en; codice d'uscita 0/1.

### Notes

- Volontariamente non fatto: impaginazione/margini, riproduzione di font e corpi, oggetti flottanti e ancorati, colonne, revisioni, commenti, ricostruzione delle sequenze di numerazione, composizione delle formule. L'interfaccia è etichettata in cima con «Vista di lettura — non una riproduzione del layout».
- Nessun import reciproco con `dsh-opensheet-sidebar` (dominio delle tabelle): i plugin sono autosufficienti; il codice condiviso verrà estratto quando comparirà un terzo consumatore.
