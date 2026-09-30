# dsh-docx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

Lee `.docx` en la barra lateral derecha de DSH (consumidor de [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)): niveles de títulos, párrafos, sangría de listas, **tablas reales**, imágenes en línea, con protección por disyuntor.

> **Esta es una vista de lectura, no una reproducción del diseño.** Esa frase está escrita directamente en la parte superior de la interfaz — sin paginación, sin reproducir fuentes, sin procesar objetos flotantes, columnas ni marcas de revisión. Hacer creer al usuario que las diferencias de maquetación son un bug es peor que declarar claramente los límites de lo posible.

## 1. Qué hace / qué no hace

| Hace | Descripción |
|------|------|
| Niveles de títulos | Determinados por el **nombre** del estilo en `styles.xml` (`heading 1` → `w:h1`), sin adivinar por el dígito final del id; `w:outlineLvl` como respaldo |
| Párrafos y formato en línea | Negrita, cursiva, subrayado, `w:tab`/`w:br`, monoespaciado (`rStyle`/`rFonts` resuelto a monospace) |
| Listas | `w:numPr` + `w:ilvl` → niveles de sangría (no se reconstruyen las secuencias de numeración) |
| Tablas | `w:tbl` → `w:tr` → `w:tc`, los párrafos múltiples de la celda se fusionan; **ya no reaparecen como párrafos del cuerpo** |
| Imágenes | Bytes extraídos del archivo → URL `blob:` (las imágenes en línea están dentro del zip, no hay ruta del anfitrión a la que apuntar); EMF/WMF/TIFF no renderizables → marcador de posición anotado |
| Encabezados/pies de página | Como bloques note etiquetados, arriba/abajo |
| Fórmulas | Sin composición tipográfica; solo se muestra el texto almacenado en el archivo |

**No hace**: paginación y márgenes, reproducción de fuentes y tamaños, objetos flotantes/anclados, columnas, marcas de revisión (`w:ins`/`w:del`), comentarios, reconstrucción de secuencias de numeración, composición de fórmulas.

## 2. Adaptación a la anchura

El panel lateral es arrastrable, así que la vista de lectura escala con la anchura — **pero con límite inferior y superior**; «adaptable» no es permiso para ampliar o reducir sin fin:

| Mando | Valor | Razón |
|------|------|------|
| Anchura base | 360px | A esta anchura la proporción vale **exactamente 1**: la anchura habitual del panel renderiza justo la maquetación de 0.1.0 |
| Límite inferior | 0.9× | Por estrecho que sea, el texto debe poder leerse |
| Límite superior | 1.15× | Más ancho es solo comodidad, no gigantismo |
| Cuantización | Dos decimales | Arrastrar solo recompone en escalones de 0,01, no por cada píxel |

La proporción se deduce de la anchura del contenedor y se escribe en la variable CSS `--reader-scale`; el tamaño raíz es `13px × proporción`, el cuerpo usa `em` en su totalidad, así que el texto se **vuelve a fluir** al nuevo tamaño, no se escala en bloque con un `transform` (eso lo volvería borroso).

**Solo se escala el contenido del documento.** Títulos, párrafos, listas, código, notas, tablas y pies de imagen siguen la proporción; **la barra de información, los elementos de interfaz distintos de las etiquetas de encabezado/pie, el banner del disyuntor y los estados de carga/vacío mantienen un tamaño fijo** — que el texto de la interfaz cambiara al arrastrar el separador parecería un fallo, no adaptación.

Dos decisiones relacionadas:

- **Una anchura no medible retrocede a 1, no a un extremo.** En el primer fotograma la anchura es 0; renderizar «lo más estrecho posible» haría destellar un tamaño diminuto en cada apertura de documento.
- **Las imágenes no participan en la escala.** Se muestran en las dimensiones declaradas por el documento, con techo en la anchura del panel; ampliar un mapa de bits más allá de su tamaño original para perseguir el tamaño de fuente solo lo emborrona — de reproducción, ni hablar.

## 3. Tubería de lectura

```
Bytes del archivo (ruta /sidebar/file del anfitrión, binario)
  → directorio central (verificación previa del volumen declarado de descompresión)
  → descompresión en flujo + presupuesto de bytes (conteo sobre la marcha, cancel al pasarse)
  → word/document.xml             bloques del cuerpo (barrido secuencial, los párrafos dentro de tablas se saltan)
  → word/_rels/document.xml.rels  rId → destinos de imágenes / encabezados-pies (External se ignora)
  → word/styles.xml               id de estilo → nivel de título
  → word/media/*                  bytes de imágenes (bajo demanda; si excede, se salta directamente, sin descomprimir)
```

Cero dependencias en tiempo de ejecución: la descompresión zip usa el `DecompressionStream('deflate-raw')` nativo del navegador, el XML un barrido dirigido (WordprocessingML es una estructura regular generada por máquina, y las expresiones regulares **no pueden** equilibrar anidamientos homónimos; `findElements` cuenta profundidad).

## 4. Disyuntor (siete vías)

| Dimensión | Por defecto | Al pasarse |
|------|------|--------|
| Tamaño del archivo | 5 MB | BLOCKED (no se descomprimió nada) |
| Descompresión acumulada | 64 MB | BLOCKED — contra zip bombs |
| Pieza única | 32 MB | BLOCKED |
| Número de bloques | 5 000 | TRUNCATED, se deja de leer |
| Texto por bloque | 20 000 caracteres | bloque omitido + aviso |
| Número de imágenes | 200 | las siguientes se saltan + aviso |
| Imagen única | 8 MB | imagen saltada (**si ya excede en el directorio, no se descomprime**) + aviso |

> **Como máximo un aviso por dimensión** es una garantía estructural (el breaker mantiene internamente un Map por `reason`), no un convenio: disparar dos veces la misma dimensión renderizaría en el banner dos líneas casi idénticas — un plugin hermano llegó a publicar una versión de parche por esto.

El resultado del disyuntor es un ciudadano de primera: BLOCKED se renderiza como una tarjeta de error legible, nunca lanza excepciones, nunca gira infinitamente.

## 5. Compilación y verificación

```bash
npm run build     # doble punto de entrada esbuild + declaraciones de tipos tsc; en la compilación el bundle se carga de verdad una vez con node:vm y se verifican apply/inject
npm test          # 14 aserciones
npm run verify    # build && test
```

La fixture de pruebas es un **zip docx real construido en el momento** (CRC32 y directorio central correctos, referencia a un PNG real de 1×1); cubre: detección de títulos por nombre de estilo (`List1` no debe confundirse), formato en línea, niveles de listas, tablas sin celdas duplicadas como párrafos, EMU→px, marcadores para formatos no renderizables, note de encabezado y relaciones External ignoradas, coherencia de contadores, además de las cinco compuertas y la integridad de los marcadores zh/en.

## 6. Instalación

```bash
# CLI oficial (recomendada; mantiene a la vez dependencias y dsh.profile.bundles)
dsh plugin --profile <profile> add <path | npm 包 | github:owner/repo#<sha>>
```

La instalación manual son tres pasos, todos imprescindibles (solo los pasos 1 y 3 = el plugin nunca carga y no avisa): ① copiar a `node_modules/` del perfil; ② añadir `dsh-docx-sidebar` a `dsh.profile.bundles` en el `package.json` del perfil; ③ añadir la línea insert del `cordis.patch.yml` de este paquete al `cordis.patch.yml` del perfil.

Tras instalar, verifica sin conexión antes de reiniciar:

```powershell
dsh --profile <profile> --dump-config | Select-String dsh-docx-sidebar
```

**Dependencia**: `dsh-better-sidebar >= 0.18.1` (opcional). En su ausencia el plugin carga con normalidad, avisa (warn) en consola y no aporta ninguna entrada.

**Matriz de compatibilidad**:

| Versión del plugin | Rango de anfitriones DSH | Nota |
|---------|-------------|------|
| 0.3.0 | `>=0.2.0-rc.1 <0.2.1-0` | Línea 0.2.0 (`main`, promovida desde `compat/0.2.0`). Adaptación puramente de metadatos: la superficie de consumo son todos callers puros `ctx.get(...)`; 0.2.0-rc.1 es totalmente compatible con la API de plugins 0.1.7 |
| 0.2.0 | `>=0.1.5-rc.1 <0.2.0-0` | Atendida por las ramas congeladas `compat/0.1.7` / `compat/0.1.5` |

`engines.dsh` en `package.json`, el peer `@deepseek-ai/dsh-client-locale` y `engines.dsh` en `dsh.plugin.json`: tres sitios, el mismo rango, mantenidos en coherencia.

## 7. Relación con `dsh-opensheet-sidebar`

Tablas (csv/xlsx) y documentos (docx) están **repartidos en dos plugins por dominio de capacidad**, cada uno autosuficiente: sin import entre plugins — eso crearía un acoplamiento duro entre dos plugins de «dependencia blanda» y trampas de orden de instalación. El código compartido de zip/presupuesto de descompresión cada uno lo lleva por su cuenta; se pensará en extraer un paquete común cuando aparezca un **tercer** consumidor (decisión por umbral, no diseño anticipado).

## 多语言说明 / Sprachen / Langues / Языки / Idiomas / Lingue

Este README está redactado en chino. Resumen de instalación y compatibilidad (esta línea requiere DSH 0.2.0: `>=0.2.0-rc.1 <0.2.1-0`; instalación: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`):

- **Deutsch** — benötigt DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), getestet gegen DSH 0.2.0-rc.1. Installation: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Die 0.1.x-Wirtslinie wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` (npm-Tags `dsh-0.1.7` / `dsh-0.1.5`) versorgt.
- **Français** — nécessite DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testé avec DSH 0.2.0-rc.1. Installation : `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La lignée d'hôtes 0.1.x est assurée par les branches figées `compat/0.1.7` / `compat/0.1.5` (tags npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Русский** — требуется DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), протестировано на DSH 0.2.0-rc.1. Установка: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Линия хостов 0.1.x обслуживается замороженными ветками `compat/0.1.7` / `compat/0.1.5` (npm-теги `dsh-0.1.7` / `dsh-0.1.5`).
- **Español** — requiere DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), probado con DSH 0.2.0-rc.1. Instalación: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La línea de anfitriones 0.1.x la atienden las ramas congeladas `compat/0.1.7` / `compat/0.1.5` (etiquetas npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Italiano** — richiede DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testato su DSH 0.2.0-rc.1. Installazione: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La linea di host 0.1.x è servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` (tag npm `dsh-0.1.7` / `dsh-0.1.5`).
