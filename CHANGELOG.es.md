# Changelog — dsh-docx-sidebar

## 0.3.0 — 2026-09-29

### Changed

- **Cambio de línea de anfitriones a DSH 0.2.0** (`main`, promovida desde `compat/0.2.0`): `engines.dsh` y el peer `@deepseek-ai/dsh-client-locale` pasan de `>=0.1.5-rc.1 <0.2.0-0` a `>=0.2.0-rc.1 <0.2.1-0` (ventana rc bloqueada, reevaluación a partir de 0.2.1). Adaptación puramente de metadatos — la superficie de consumo son todos callers puros `ctx.get(...)` (con definiciones de interfaz locales incluidas); 0.2.0-rc.1 es totalmente compatible con la API de plugins 0.1.7, cero cambios de código. La línea 0.1.x (0.1.5/0.1.7) sigue atendida por las ramas congeladas `compat/0.1.7` / `compat/0.1.5` (≤0.2.0).
- El árbol de dependencias se refrescó a la nueva línea, lockfile regenerado; version/engines de `dsh.plugin.json` alineados en sincronía con `package.json`.

### Documentación (2026-09-29 — sin republicación)

- Estructura de ramas asentada: `main` promovida a línea 0.2.0 (desde `compat/0.2.0`); la línea de anfitriones 0.1.x la atienden las ramas congeladas `compat/0.1.7` / `compat/0.1.5`. El mapeo npm no cambia: `dsh-0.2.0` → esta línea, `dsh-0.1.7` / `dsh-0.1.5` → línea 0.1.x.
- Instalación (esta línea): `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`.
- El README se amplió con un resumen de instalación y compatibilidad en cinco lenguas (de/fr/ru/es/it).

## 0.2.0 — 2026-09-23

Adaptación a la anchura de la barra lateral: la vista de lectura escala proporcionalmente a la anchura del panel, con límites inferior y superior.

### Added

- **Escalado adaptativo por anchura** (`src/client/scale.ts` + `useReaderScale.ts`): de la anchura del contenedor se deduce un coeficiente de proporción, escrito en la variable CSS `--reader-scale`, tamaño raíz `13px × scale`, el cuerpo pasa íntegro a `em` y por eso escala con él. Anchura base: **proporción exactamente 1 a 360px** (con anchura normal el aspecto es idéntico a 0.1.0), mínimo **0.9**, máximo **1.15**.
- **El escalado solo actúa sobre el contenido del documento**: títulos, párrafos, listas, código, notas, tablas y pies de imagen siguen la proporción; **la barra de información, el banner del disyuntor y los estados de carga/vacío mantienen tamaño fijo** — que el texto de la interfaz cambiara al arrastrar el separador parecería un fallo, no adaptación.
- **Proporción cuantizada a dos decimales**: arrastrar el separador solo surte efecto en escalones de 0,01, para evitar recomposición por cada píxel.
- **Anchura no medible: retroceso a 1**: 0 / negativos / NaN / Infinity (primer fotograma o reportes anómalos) se renderizan siempre según la base, nunca en valores extremos — de lo contrario destellaría un tamaño diminuto al abrir.
- **Sangría pasada a `em`**: la sangría de viñetas vale `INDENT_EM = 1.08em`, a proporción 1 equivale a los anteriores 14px.
- **Techo de celdas de tabla 320px → 24.6em**: en paneles estrechos las celdas se estrechan con él en lugar de forzar una barra de desplazamiento horizontal.

### Changed

- Las imágenes siguen mostrándose en las dimensiones declaradas por el documento, con techo solo en la anchura del panel: ampliar un mapa de bits más allá de su tamaño original para perseguir el tamaño de fuente solo lo emborrona — de reproducción, ni hablar.

### Tests

- 5 aserciones nuevas (19 en total): proporción constante de 1 en la anchura base, límites y monotonía, retroceso con anchura no medible, cuantización a dos decimales, sangría alineada con los 14px originales.

### Packaging

- **Primera publicación en npm**: `dsh-docx-sidebar@0.2.0`, dist-tags `latest` + `dsh-0.1.5`; 38 files / 75.8 kB, shasum del tarball `1060a5e8bc35e0629cbd59b62d71620bfc5790b0`.
- Campo **`repository`** declarado, apuntando a `drscrewdriver/dsh-docx-sidebar`. La lista de inclusión solo asocia el paquete npm con el repositorio cuando el paquete publicado apunta a él.
- **Scripts declarados pero inexistentes: completados**: `publish-npm.ps1` y `migrate-profile.ps1` restaurados desde un repositorio de la misma familia (el primero idéntico byte a byte y sin nombre de paquete incrustado — nombre y versión se leen de package.json); `fixtures` y `report` no tienen implementación en este repositorio, las declaraciones suspendidas fueron eliminadas.

## 0.1.0 — 2026-09-22

Primera versión: vista de lectura `.docx` (sin reproducción del diseño), cero dependencias en tiempo de ejecución.

### Added

- **Visor de documentos** (`registerFileViewer`, `exts: ['docx','docm']`, `fetchStrategy: 'custom'`): los bytes del archivo llegan de la ruta `/sidebar/file` del anfitrión; la valla de rutas del espacio de trabajo queda del lado del anfitrión.
- **Análisis** (`src/client/docx.ts`): los niveles de títulos se determinan por el **nombre** del estilo en `styles.xml` (`heading N`), `w:outlineLvl` como respaldo, sin más confusiones por el dígito final del id (`List1` no es un título); párrafos y formato en línea (negrita/cursiva/subrayado/monoespaciado/`w:tab`/`w:br`); `w:numPr`+`w:ilvl` → sangría de listas; `w:tbl` → tablas reales (las celdas ya no se duplican como párrafos); encabezados/pies → bloques note etiquetados.
- **Imágenes**: bytes extraídos del archivo → URL `blob:` (las imágenes en línea están dentro del zip, no hay ruta del anfitrión a la que apuntar), liberadas con `revokeObjectURL` al descargar/cambiar; formatos no renderizables como EMF/WMF/TIFF → marcador de posición anotado, nunca huecos silenciosos.
- **Siete vías de disyuntor**: tamaño del archivo / descompresión acumulada / pieza única (tres compuertas de contenedor) + número de bloques / texto por bloque / número de imágenes / imagen única. Si el volumen de una imagen ya excede en el directorio, **sin descomprimir, salto directo**.
- **Como máximo un aviso por dimensión**: el breaker mantiene internamente un Map por reason, desduplicación estructural (un plugin hermano tuvo avisos dobles de la misma dimensión).
- **Pruebas**: 14 aserciones, fixtures de zips docx reales construidos en el momento (CRC32 + directorio central + PNG real), cubren las rutas de análisis, las cinco compuertas y la integridad de los marcadores zh/en; código de salida 0/1.

### Notes

- A propósito no se hace: paginación/márgenes, reproducción de fuentes y tamaños, objetos flotantes y anclados, columnas, marcas de revisión, comentarios, reconstrucción de secuencias de numeración, composición de fórmulas. La interfaz está rotulada arriba con «Vista de lectura — no reproducción del diseño».
- Sin import mutuo con `dsh-opensheet-sidebar` (dominio de tablas): los plugins son autosuficientes; el código compartido se extraerá cuando aparezca un tercer consumidor.
