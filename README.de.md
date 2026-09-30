# dsh-docx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> ⛔ **Dieses Projekt wird nicht mehr gepflegt (2026-10-01).** Neuere DSH-Hosts bringen eine eingebaute Seitenleisten-Vorschau für Office-Dokumente mit; dieses Plugin wird nicht weiter gepflegt — keine weiteren Veröffentlichungen, keine Anpassung an künftige Host-Versionen. Veröffentlichte Versionen bleiben installierbar; für 0.1.x-Hosts die Builds aus den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` verwenden.

Lese `.docx`-Dateien in der rechten DSH-Seitenleiste ([dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)-Konsument): Überschriftenebenen, Absätze, Listen-Einrückung, **echte Tabellen**, Inline-Bilder — mit Schutzschalter-Absicherung.

> **Dies ist eine Leseansicht, kein Layout-Nachbau.** Ganz oben in der Oberfläche steht genau das — keine Paginierung, keine Rekonstruktion von Schriften, keine Verarbeitung von schwebenden Objekten, Spaltensatz oder Änderungsnachverfolgung. Nutzer glauben zu lassen, Layout-Unterschiede seien ein Bug, ist schlimmer, als die Fähigkeitsgrenzen klar auszusprechen.

## 1. Was unterstützt wird / was nicht

| Unterstützt | Beschreibung |
|------|------|
| Überschriftenebenen | Bestimmt durch den **Namen** des Stils in `styles.xml` (`heading 1` → `w:h1`), nicht geraten aus der Endziffer der id; `w:outlineLvl` als Rückfallebene |
| Absätze und Inline-Formatierung | Fett, kursiv, unterstrichen, `w:tab`/`w:br`, Monospace (`rStyle`/`rFonts` trifft monospace) |
| Listen | `w:numPr` + `w:ilvl` → Einrückungsebenen (Nummerierungsfolgen werden nicht rekonstruiert) |
| Tabellen | `w:tbl` → `w:tr` → `w:tc`, mehrere Absätze je Zelle werden zusammengeführt; **erscheinen nicht mehr zusätzlich als Textabsätze** |
| Bilder | Bytes aus dem Archiv extrahiert → `blob:`-URL (Inline-Bilder stecken im zip, es gibt keine Host-Route zum Verweisen); EMF/WMF/TIFF nicht renderbar → markierter Platzhalter |
| Kopf-/Fußzeilen | Als etikettierte Note-Blöcke oben/unten |
| Formeln | Kein Satz; nur der in der Datei gespeicherte Text wird angezeigt |

**Nicht unterstützt**: Paginierung und Seitenränder, Rekonstruktion von Schriften und Schriftgrößen, schwebende/verankerte Objekte, Spaltensatz, Änderungsnachverfolgung (`w:ins`/`w:del`), Kommentare, Rekonstruktion von Nummerierungsfolgen, Formelsatz.

## 2. Breitenadaption

Das Seitenleisten-Panel ist verschiebbar, die Leseansicht skaliert daher mit der Breite — **aber mit Ober- und Untergrenze**; »adaptiv« ist keine Erlaubnis zu unbegrenzter Vergrößerung oder Verkleinerung:

| Regler | Wert | Begründung |
|------|------|------|
| Referenzbreite | 360px | Bei dieser Breite ist das Verhältnis **genau 1** — die übliche Panel-Breite rendert also genau das Layout von 0.1.0 |
| Untergrenze | 0.9× | Auch noch schmaler: der Text muss lesbar bleiben |
| Obergrenze | 1.15× | Breiter ist nur Komfort, nicht riesig |
| Quantisierung | Zwei Dezimalstellen | Ziehen bewirkt Neulayout nur in 0,01er-Stufen, nicht pro Pixel |

Das Verhältnis wird aus der Containerbreite abgeleitet und in die CSS-Variable `--reader-scale` geschrieben; die Basis-Schriftgröße ist `13px × Verhältnis`, der Fließtext nutzt durchweg `em` — der Text wird also auf die neue Größe **neu umbrochen**, nicht als Ganzes per `transform` skaliert (das würde ihn unscharf machen).

**Nur der Dokumentinhalt skaliert.** Überschriften, Absätze, Listen, Code, Notizen, Tabellen und Bildunterschriften folgen dem Verhältnis; **Infobar, Oberflächenelemente außer den Kopf-/Fußzeilen-Etiketten, Schutzschalter-Banner und Lade-/Leerzustände behalten feste Schriftgrößen** — änderte sich der Oberflächentext beim Ziehen des Trenners mit, sähe das nach einem Defekt aus, nicht nach Adaptivität.

Zwei verwandte Entscheidungen:

- **Nicht messbare Breite fällt auf 1 zurück, nicht auf einen Extremwert.** Im ersten Frame ist die Breite 0; würde man »so schmal wie möglich« rendern, blitze bei jedem Öffnen eines Dokuments eine winzige Schriftgröße auf.
- **Bilder nehmen nicht an der Skalierung teil.** Sie erscheinen in den vom Dokument deklarierten Maßen, gedeckelt auf die Panel-Breite; eine Bitmap über ihre Originalgröße hinaus zu vergrößern, nur um der Schriftgröße zu folgen, macht sie nur matschiger — von Nachbau keine Spur.

## 3. Lesepipeline

```
Archiv-Bytes (Host-Route /sidebar/file, binär)
  → zentrales Verzeichnis (deklarierter Entpack-Umfang wird vorab geprüft)
  → Streaming-Entpacken + Byte-Budget (Zählen während des Entpackens, bei Überschreitung cancel)
  → word/document.xml             Textkörper-Blöcke (sequentieller Scan, Absätze innerhalb von Tabellen werden übersprungen)
  → word/_rels/document.xml.rels  rId → Bild-/Kopf-Fuß-Ziele (External ignoriert)
  → word/styles.xml               Stil-id → Überschriftenebene
  → word/media/*                  Bild-Bytes (bei Bedarf; bei Überschreitung direkt übersprungen, ohne Entpacken)
```

Keine Laufzeit-Abhängigkeiten: zip-Entpacken über den nativen `DecompressionStream('deflate-raw')` des Browsers, XML über gezieltes Scannen (WordprocessingML ist eine maschinell erzeugte, regelmäßige Struktur, und Regex **kann** gleichnamige Verschachtelungen **nicht** ausbalancieren — `findElements` zählt daher die Tiefe).

## 4. Schutzschalter (siebenfach)

| Dimension | Standard | Bei Überschreitung |
|------|------|--------|
| Archivgröße | 5 MB | BLOCKED (nichts entpackt) |
| Kumuliertes Entpacken | 64 MB | BLOCKED — schützt vor zip-Bomben |
| Einzelteil | 32 MB | BLOCKED |
| Blockanzahl | 5 000 | TRUNCATED, Lesen stoppt |
| Text je Block | 20 000 Zeichen | Block weggelassen + Warnung |
| Bildanzahl | 200 | Rest wird übersprungen + Warnung |
| Einzelbild | 8 MB | Bild übersprungen (**überschreitet die Größe schon das Verzeichnis, wird nicht entpackt**) + Warnung |

> **Höchstens eine Warnung je Dimension** ist eine strukturelle Garantie (der Breaker führt intern eine Map nach `reason`), keine Konvention: dieselbe Dimension zweimal ausgelöst würde zwei fast identische Zeilen auf dem Banner rendern — ein Schwester-Plugin hat deshalb einmal eine Patch-Version veröffentlicht.

Das Ergebnis des Schutzschalters ist ein Bürger erster Klasse: BLOCKED rendert als lesbare Fehlerkarte, wirft nie eine Exception, dreht nie endlos.

## 5. Build und Verifikation

```bash
npm run build     # esbuild-Doppeleinstieg + tsc-Typdeklarationen; beim Build wird das bundle einmal echt per node:vm geladen und apply/inject werden geprüft
npm test          # 14 Assertionen
npm run verify    # build && test
```

Test-Fixture ist ein **vor Ort konstruierter echter docx-zip** (korrektes CRC32 und zentrales Verzeichnis, referenziert ein echtes 1×1-PNG), abgedeckt: Überschriftenerkennung über Stilnamen (`List1` darf nicht fehlinterpretiert werden), Inline-Formatierung, Listenebenen, Tabellen ohne Zellen als Absatz-Dubletten, EMU→px, Platzhalter für nicht renderbare Formate, Kopfzeilen-Note und ignorierte External-Beziehungen, Zähler-Konsistenz sowie die fünf Gates und die Vollständigkeit der zh/en-Platzhalter.

## 6. Installation

```bash
# Offizielle CLI (empfohlen; pflegt Abhängigkeiten und dsh.profile.bundles gleich mit)
dsh plugin --profile <profile> add <path | npm 包 | github:owner/repo#<sha>>
```

Die manuelle Installation besteht aus drei Schritten, alle Pflicht (nur Schritt 1 und 3 = das Plugin lädt nie und meldet keinen Fehler): ① in `node_modules/` des Profils kopieren; ② `dsh-docx-sidebar` in `dsh.profile.bundles` der `package.json` des Profils aufnehmen; ③ die insert-Zeile aus dem `cordis.patch.yml` dieses Pakets an das `cordis.patch.yml` des Profils anhängen.

Nach der Installation erst offline verifizieren, dann neu starten:

```powershell
dsh --profile <profile> --dump-config | Select-String dsh-docx-sidebar
```

**Abhängigkeit**: `dsh-better-sidebar >= 0.18.1` (optional). Fehlt sie, lädt das Plugin normal, warnt in der Konsole und trägt keine Einträge bei.

**Kompatibilitätsmatrix**:

| Plugin-Version | DSH-Hostbereich | Anmerkung |
|---------|-------------|------|
| 0.3.0 | `>=0.2.0-rc.1 <0.2.1-0` | 0.2.0-Linie (`main`, befördert aus `compat/0.2.0`). Reine Metadaten-Anpassung: die Konsumfläche besteht ausschließlich aus reinen `ctx.get(...)`-Callern; 0.2.0-rc.1 ist zur 0.1.7-Plugin-API voll kompatibel |
| 0.2.0 | `>=0.1.5-rc.1 <0.2.0-0` | Wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` bedient |

`engines.dsh` in `package.json`, das `@deepseek-ai/dsh-client-locale`-Peer und `engines.dsh` in `dsh.plugin.json` — drei Stellen, ein Bereich, konsistent gehalten.

## 7. Verhältnis zu `dsh-opensheet-sidebar`

Tabellen (csv/xlsx) und Dokumente (docx) sind **nach Fähigkeitsdomänen in zwei Plugins geteilt**, jeweils in sich abgeschlossen: keine imports zwischen den Plugins — das würde eine harte Kopplung zwischen zwei »weichen Abhängigkeits«-Plugins und Installationsreihenfolge-Fallen erzeugen. Den gemeinsamen zip/Entpack-Budget-Code hält jeder selbst; an eine Auslagerung in ein gemeinsames Paket wird erst gedacht, wenn ein **dritter** Konsument auftaucht (schwellengetrieben, nicht im Voraus entworfen).

## 多语言说明 / Sprachen / Langues / Языки / Idiomas / Lingue

Dieses README ist auf Chinesisch verfasst. Installations- und Kompatibilitätsüberblick (diese Linie erfordert DSH 0.2.0: `>=0.2.0-rc.1 <0.2.1-0`; Installation: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`):

- **Deutsch** — benötigt DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), getestet gegen DSH 0.2.0-rc.1. Installation: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Die 0.1.x-Wirtslinie wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` (npm-Tags `dsh-0.1.7` / `dsh-0.1.5`) versorgt.
- **Français** — nécessite DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testé avec DSH 0.2.0-rc.1. Installation : `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La lignée d'hôtes 0.1.x est assurée par les branches figées `compat/0.1.7` / `compat/0.1.5` (tags npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Русский** — требуется DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), протестировано на DSH 0.2.0-rc.1. Установка: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Линия хостов 0.1.x обслуживается замороженными ветками `compat/0.1.7` / `compat/0.1.5` (npm-теги `dsh-0.1.7` / `dsh-0.1.5`).
- **Español** — requiere DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), probado con DSH 0.2.0-rc.1. Instalación: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La línea de anfitriones 0.1.x la atienden las ramas congeladas `compat/0.1.7` / `compat/0.1.5` (etiquetas npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Italiano** — richiede DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testato su DSH 0.2.0-rc.1. Installazione: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La linea di host 0.1.x è servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` (tag npm `dsh-0.1.7` / `dsh-0.1.5`).
