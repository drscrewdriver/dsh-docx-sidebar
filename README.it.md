# dsh-docx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> ⛔ **Questo progetto non è più mantenuto (2026-10-01).** Le versioni recenti dell’host DSH includono un’anteprima integrata nel pannello laterale per i documenti office; il plugin cessa di essere mantenuto — nessuna pubblicazione futura, nessun adattamento alle future linee dell’host. Le versioni pubblicate restano installabili; per gli host 0.1.x usate le build dai rami congelati `compat/0.1.7` / `compat/0.1.5`.

Lettura dei `.docx` nella barra laterale destra di DSH (consumer di [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)): livelli dei titoli, paragrafi, rientri degli elenchi, **tabelle vere**, immagini in linea, con protezione a interruttore.

> **Questa è una vista di lettura, non una riproduzione del layout.** La frase è indicata direttamente in cima all'interfaccia — niente impaginazione, nessuna riproduzione dei font, nessuna gestione di oggetti flottanti, colonne o revisioni. Far credere che le differenze di impaginazione siano un bug è peggio che dichiarare chiaramente i limiti delle capacità.

## 1. Cosa fa / cosa non fa

| Fatto | Descrizione |
|------|------|
| Livelli dei titoli | Determinati dal **nome** dello stile in `styles.xml` (`heading 1` → `w:h1`), non indovinati dalla cifra finale dell'id; `w:outlineLvl` come ripiego |
| Paragrafi e formattazione in linea | Grassetto, corsivo, sottolineato, `w:tab`/`w:br`, monospace (`rStyle`/`rFonts` risolti in monospace) |
| Elenchi | `w:numPr` + `w:ilvl` → livelli di rientro (la sequenza di numerazione non viene ricostruita) |
| Tabelle | `w:tbl` → `w:tr` → `w:tc`, i paragrafi multipli della cella vengono uniti; **non ricompaiono più come paragrafi del corpo** |
| Immagini | Byte estratti dall'archivio → URL `blob:` (le immagini in linea sono dentro lo zip, non c'è una rotta dell'host a cui puntare); EMF/WMF/TIFF non renderizzabili → segnaposto annotato |
| Intestazioni/piè di pagina | Come blocchi note etichettati, in cima/in fondo |
| Formule | Nessuna composizione; viene mostrato solo il testo memorizzato nel file |

**Non fa**: impaginazione e margini, riproduzione di font e corpi, oggetti flottanti/ancorati, colonne, revisioni (`w:ins`/`w:del`), commenti, ricostruzione delle sequenze di numerazione, composizione delle formule.

## 2. Adattamento alla larghezza

Il pannello laterale è trascinabile, quindi la vista di lettura scala con la larghezza — **ma con minimo e massimo**; «adattivo» non è il permesso di ingrandire o rimpicciolire all'infinito:

| Manopola | Valore | Motivazione |
|------|------|------|
| Larghezza di riferimento | 360px | A questa larghezza il rapporto vale **esattamente 1**: la larghezza tipica del pannello restituisce la stessa impaginazione della versione 0.1.0 |
| Minimo | 0.9× | Per quanto stretto, il testo deve restare leggibile |
| Massimo | 1.15× | Più largo è solo comodità, non gigantismo |
| Quantizzazione | Due decimali | Il trascinamento riimpagina solo a passi di 0,01, non a ogni pixel |

Il rapporto è derivato dalla larghezza del contenitore e scritto nella variabile CSS `--reader-scale`; la dimensione del font di radice è `13px × rapporto`, il testo usa ovunque `em`, quindi viene **ri-flussato** alla nuova dimensione, non scalato globalmente con un `transform` (che lo renderebbe sfocato).

**Scala solo il contenuto del documento.** Titoli, paragrafi, elenchi, codice, note, tabelle e didascalie delle immagini seguono il rapporto; **la barra informativa, gli elementi dell'interfaccia diversi dalle etichette di intestazione/piè di pagina, il banner dell'interruttore e gli stati di caricamento/vuoto mantengono una dimensione fissa** — vedere il testo dell'interfaccia cambiare mentre si trascina il divisore sembrerebbe un guasto, non un adattamento.

Due decisioni correlate:

- **Una larghezza non misurabile torna a 1, non a un valore estremo.** Alla prima frame la larghezza è 0; renderizzare «il più stretto possibile» farebbe lampeggiare una dimensione minuscola a ogni apertura del documento.
- **Le immagini non partecipano alla scala.** Sono mostrate alle dimensioni dichiarate dal documento, con tetto alla larghezza del pannello; ingrandire una bitmap oltre la dimensione originale per inseguire il corpo del font la rende solo più sfocata — di riproduzione, nemmeno a parlarne.

## 3. Pipeline di lettura

```
Byte dell'archivio (rotta /sidebar/file dell'host, binario)
  → directory centrale (verifica preventiva del volume dichiarato di decompressione)
  → decompressione in flusso + budget di byte (conteggio durante la decompressione, cancel al superamento)
  → word/document.xml             blocchi del corpo (scansione sequenziale, i paragrafi dentro le tabelle vengono saltati)
  → word/_rels/document.xml.rels  rId → destinazioni immagini / intestazioni-piè (External ignorato)
  → word/styles.xml               id di stile → livello dei titoli
  → word/media/*                  byte delle immagini (a richiesta; oltre il limite si salta direttamente, senza decomprimere)
```

Zero dipendenze a runtime: la decompressione zip usa il `DecompressionStream('deflate-raw')` nativo del browser, l'XML una scansione mirata (il WordprocessingML è una struttura regolare generata da macchina, e le espressioni regolari **non possono** bilanciare annidamenti omonimi — `findElements` conta la profondità).

## 4. Interruttore (sette dimensioni)

| Dimensione | Predefinito | Oltre il limite |
|------|------|--------|
| Dimensione dell'archivio | 5 MB | BLOCKED (non è stato decompresso nulla) |
| Decompressione cumulata | 64 MB | BLOCKED — anti zip bomb |
| Parte singola | 32 MB | BLOCKED |
| Numero di blocchi | 5 000 | TRUNCATED, lettura interrotta |
| Testo per blocco | 20 000 caratteri | blocco omesso + avviso |
| Numero di immagini | 200 | le successive vengono saltate + avviso |
| Immagine singola | 8 MB | immagine saltata (**se la dimensione eccede già nella directory, non si decomprime**) + avviso |

> **Al massimo un avviso per dimensione** è una garanzia strutturale (il breaker mantiene internamente una Map per `reason`), non una convenzione: attivare due volte la stessa dimensione renderebbe sul banner due righe quasi identiche — un plugin gemello ha persino pubblicato una versione di correzione per questo.

Il risultato dell'interruttore è un cittadino di prima classe: BLOCKED viene reso come una scheda di errore leggibile, mai eccezioni, mai attese infinite.

## 5. Build e verifica

```bash
npm run build     # doppio entry point esbuild + dichiarazioni di tipi tsc; in fase di build il bundle viene caricato davvero una volta con node:vm e si verificano apply/inject
npm test          # 14 asserzioni
npm run verify    # build && test
```

La fixture dei test è un **vero zip docx costruito sul momento** (CRC32 e directory centrale corretti, riferisce un vero PNG 1×1), copre: riconoscimento dei titoli dal nome dello stile (`List1` non deve essere scambiato), formattazione in linea, livelli degli elenchi, tabelle senza celle duplicate come paragrafi, EMU→px, segnaposto per i formati non renderizzabili, note di intestazione e relazioni External ignorate, coerenza dei contatori, oltre ai cinque cancelli e all'integrità dei segnaposto zh/en.

## 6. Installazione

```bash
# CLI ufficiale (consigliata; gestisce insieme dipendenze e dsh.profile.bundles)
dsh plugin --profile <profile> add <path | npm 包 | github:owner/repo#<sha>>
```

L'installazione manuale è in tre passi, tutti indispensabili (solo i passi 1 e 3 = il plugin non si carica mai e non segnala errori): ① copiare in `node_modules/` del profilo; ② aggiungere `dsh-docx-sidebar` a `dsh.profile.bundles` nel `package.json` del profilo; ③ accodare la riga insert del `cordis.patch.yml` di questo pacchetto al `cordis.patch.yml` del profilo.

Dopo l'installazione, verifica offline prima di riavviare:

```powershell
dsh --profile <profile> --dump-config | Select-String dsh-docx-sidebar
```

**Dipendenza**: `dsh-better-sidebar >= 0.18.1` (opzionale). In sua assenza il plugin si carica normalmente, avvisa (warn) in console e non contribuisce alcuna voce.

**Matrice di compatibilità**:

| Versione del plugin | Intervallo host DSH | Note |
|---------|-------------|------|
| 0.3.0 | `>=0.2.0-rc.1 <0.2.1-0` | Linea 0.2.0 (`main`, promossa da `compat/0.2.0`). Adattamento puramente di metadati: la superficie consumata è tutta caller puri `ctx.get(...)`; 0.2.0-rc.1 è pienamente compatibile con l'API plugin 0.1.7 |
| 0.2.0 | `>=0.1.5-rc.1 <0.2.0-0` | Servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` |

`engines.dsh` in `package.json`, il peer `@deepseek-ai/dsh-client-locale` e `engines.dsh` in `dsh.plugin.json`: tre posti, lo stesso intervallo, mantenuti coerenti.

## 7. Relazione con `dsh-opensheet-sidebar`

Tabelle (csv/xlsx) e documenti (docx) sono **due plugin separati per dominio di capacità**, ognuno autosufficiente: niente import tra i plugin — creerebbe un accoppiamento forte tra due plugin a «dipendenza morbida» e trappole sull'ordine di installazione. Il codice condiviso zip/budget di decompressione ognuno lo possiede in copia propria; si penserà a estrarre un pacchetto comune quando comparirà un **terzo** consumatore (decisione per soglia, non progettata in anticipo).

## 多语言说明 / Sprachen / Langues / Языки / Idiomas / Lingue

Il presente README è redatto in cinese. Panoramica installazione e compatibilità (questa linea richiede DSH 0.2.0: `>=0.2.0-rc.1 <0.2.1-0`; installazione: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`):

- **Deutsch** — benötigt DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), getestet gegen DSH 0.2.0-rc.1. Installation: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Die 0.1.x-Wirtslinie wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` (npm-Tags `dsh-0.1.7` / `dsh-0.1.5`) versorgt.
- **Français** — nécessite DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testé avec DSH 0.2.0-rc.1. Installation : `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La lignée d'hôtes 0.1.x est assurée par les branches figées `compat/0.1.7` / `compat/0.1.5` (tags npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Русский** — требуется DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), протестировано на DSH 0.2.0-rc.1. Установка: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Линия хостов 0.1.x обслуживается замороженными ветками `compat/0.1.7` / `compat/0.1.5` (npm-теги `dsh-0.1.7` / `dsh-0.1.5`).
- **Español** — requiere DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), probado con DSH 0.2.0-rc.1. Instalación: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La línea de anfitriones 0.1.x la atienden las ramas congeladas `compat/0.1.7` / `compat/0.1.5` (etiquetas npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Italiano** — richiede DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testato su DSH 0.2.0-rc.1. Installazione: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La linea di host 0.1.x è servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` (tag npm `dsh-0.1.7` / `dsh-0.1.5`).
