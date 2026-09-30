# Changelog — dsh-docx-sidebar

## 0.3.0 — 2026-09-29

### Changed

- **Hostlinien-Wechsel zu DSH 0.2.0** (`main`, befördert aus `compat/0.2.0`): `engines.dsh` und das `@deepseek-ai/dsh-client-locale`-Peer wechseln von `>=0.1.5-rc.1 <0.2.0-0` auf `>=0.2.0-rc.1 <0.2.1-0` (rc-Fenster verriegelt, Neubewertung ab 0.2.1). Reine Metadaten-Anpassung — die Konsumfläche besteht ausschließlich aus reinen `ctx.get(...)`-Callern (mit eigenen lokalen Schnittstellendefinitionen); 0.2.0-rc.1 ist zur 0.1.7-Plugin-API voll kompatibel, null Codeänderung. Die 0.1.x-Linie (0.1.5/0.1.7) wird weiter von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` (≤0.2.0) bedient.
- Der Abhängigkeitsbaum wurde auf die neue Linie aktualisiert, die Lockfile neu erzeugt; version/engines in `dsh.plugin.json` wurden mit `package.json` synchron gezogen.

### Dokumentation (2026-09-29 — keine Neuveröffentlichung)

- Zweigstruktur in Ordnung gebracht: `main` ist zur 0.2.0-Linie befördert (aus `compat/0.2.0`); die 0.1.x-Hostlinie wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` bedient. Die npm-Zuordnung bleibt unverändert: `dsh-0.2.0` → diese Linie, `dsh-0.1.7` / `dsh-0.1.5` → 0.1.x-Linie.
- Installation (diese Linie): `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`.
- Das README erhielt einen Installations- und Kompatibilitätsüberblick in fünf Sprachen (de/fr/ru/es/it).

## 0.2.0 — 2026-09-23

Breitenadaption der Seitenleiste: Die Leseansicht skaliert proportional zur Panel-Breite, mit Ober- und Untergrenze.

### Added

- **Breitenadaptive Skalierung** (`src/client/scale.ts` + `useReaderScale.ts`): Aus der Containerbreite wird ein Verhältniskoeffizient abgeleitet und in die CSS-Variable `--reader-scale` geschrieben, Basis-Schriftgröße `13px × scale`, der Fließtext nutzt durchweg `em` und skaliert daher mit. Referenzbreite: **bei 360px ist das Verhältnis genau 1** (bei normaler Breite visuell identisch mit 0.1.0), Untergrenze **0.9**, Obergrenze **1.15**.
- **Skalierung wirkt nur auf den Dokumentinhalt**: Überschriften, Absätze, Listen, Code, Notizen, Tabellen und Bildunterschriften folgen dem Verhältnis; **Infobar, Schutzschalter-Banner und Lade-/Leerzustände behalten feste Schriftgrößen** — änderte sich Oberflächentext beim Ziehen des Trenners mit, sähe das nach einem Defekt aus, nicht nach Adaptivität.
- **Verhältnis auf zwei Dezimalstellen quantisiert**: Das Ziehen des Trenners wirkt nur in 0,01er-Stufen, um Neulayout pro Pixel zu vermeiden.
- **Nicht messbare Breite fällt auf 1 zurück**: 0 / negativ / NaN / Infinity (erster Frame oder Fehlermeldung) werden stets auf die Referenz gerendert, nicht auf Extremwerte — sonst würde beim Öffnen kurz eine winzige Schriftgröße aufblitzen.
- **Einrückung auf `em` umgestellt**: Aufzählungs-Einrückung `INDENT_EM = 1.08em`, bei Verhältnis 1 gleich den bisherigen 14px.
- **Tabellenzellen-Deckel 320px → 24.6em**: In schmalen Panels werden die Zellen mit schmaler, statt eine horizontale Scrollleiste zu erzwingen.

### Changed

- Bilder erscheinen weiterhin in den vom Dokument deklarierten Maßen, nur auf die Panel-Breite gedeckelt: eine Bitmap über ihre Originalgröße hinaus zu vergrößern, um der Schriftgröße zu folgen, macht sie nur matschiger — von Nachbau keine Spur.

### Tests

- 5 neue Assertionen (insgesamt 19): Verhältnis konstant 1 bei Referenzbreite, Grenzen und Monotonie, Rückfall bei nicht messbarer Breite, Quantisierung auf zwei Dezimalstellen, Einrückung bündig mit 14px.

### Packaging

- **Erste npm-Veröffentlichung**: `dsh-docx-sidebar@0.2.0`, dist-tags `latest` + `dsh-0.1.5`; 38 files / 75.8 kB, tarball shasum `1060a5e8bc35e0629cbd59b62d71620bfc5790b0`.
- Das Feld **`repository`** verweist zurück auf `drscrewdriver/dsh-docx-sidebar`. Die Aufnahmelist verknüpft das npm-Paket erst mit dem Repo, wenn das veröffentlichte Paket darauf verweist.
- **Deklarierte, aber nicht vorhandene Scripts ergänzt**: `publish-npm.ps1` und `migrate-profile.ps1` aus einem Schwester-Repo wiederhergestellt (ersteres byteidentisch und ohne fest verdrahteten Paketnamen — Name und Version werden aus package.json gelesen); `fixtures` und `report` haben in diesem Repo keine Entsprechung, die schwebenden Deklarationen wurden gelöscht.

## 0.1.0 — 2026-09-22

Erste Version: `.docx`-Leseansicht (kein Layout-Nachbau), keine Laufzeit-Abhängigkeiten.

### Added

- **Dokument-Viewer** (`registerFileViewer`, `exts: ['docx','docm']`, `fetchStrategy: 'custom'`): Archiv-Bytes kommen aus der Host-Route `/sidebar/file`; die Workspace-Pfad-Einzäunung bleibt auf der Host-Seite.
- **Parsen** (`src/client/docx.ts`): Überschriftenebenen bestimmen sich nach dem **Namen** des Stils in `styles.xml` (`heading N`), `w:outlineLvl` als Rückfallebene, keine Fehldeutungen mehr über Endziffern der id (`List1` ist keine Überschrift); Absätze und Inline-Formatierung (fett/kursiv/unterstrichen/monospace/`w:tab`/`w:br`); `w:numPr`+`w:ilvl` → Listen-Einrückung; `w:tbl` → echte Tabellen (Zellen werden nicht mehr als Absätze dupliziert); Kopf-/Fußzeilen → etikettierte Note-Blöcke.
- **Bilder**: Bytes aus dem Archiv → `blob:`-URL (Inline-Bilder stecken im zip, keine Host-Route zum Verweisen), beim Entladen/Wechseln per `revokeObjectURL` freigegeben; nicht renderbare Formate wie EMF/WMF/TIFF → markierter Platzhalter, kein stilles Auslassen.
- **Siebenfacher Schutzschalter**: Archivgröße / kumuliertes Entpacken / Einzelteil (drei Container-Gates) + Blockanzahl / Text je Block / Bildanzahl / Einzelbild. Überschreitet ein Bild das Limit schon im Verzeichnis, wird es **ohne Entpacken direkt übersprungen**.
- **Höchstens eine Warnung je Dimension**: Der Breaker führt intern eine Map nach reason, strukturelle Deduplizierung (ein Schwester-Plugin hatte Doppelwarnungen derselben Dimension).
- **Tests**: 14 Assertionen, Fixtures sind vor Ort konstruierte echte docx-zips (CRC32 + zentrales Verzeichnis + echtes PNG), abdecken die Parse-Pfade, die fünf Gates und die Vollständigkeit der zh/en-Platzhalter; Exit-Code 0/1.

### Notes

- Bewusst nicht gemacht: Paginierung/Seitenränder, Rekonstruktion von Schriften und Schriftgrößen, schwebende und verankerte Objekte, Spaltensatz, Änderungsnachverfolgung, Kommentare, Rekonstruktion von Nummerierungsfolgen, Formelsatz. Die Oberfläche ist oben mit »Leseansicht — kein Layout-Nachbau« beschriftet.
- Kein gegenseitiges import mit `dsh-opensheet-sidebar` (Tabellen-Domäne): die Plugins sind in sich abgeschlossen; gemeinsamer Code wird erst ausgekoppelt, wenn ein dritter Konsument auftaucht.
