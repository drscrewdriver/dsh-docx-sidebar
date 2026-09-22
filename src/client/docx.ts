/**
 * Zero-dependency `.docx` reader — a **reading view, not a layout
 * reproduction**. It walks WordprocessingML and produces the blocks a document
 * actually has: headings, paragraphs, list items, tables, pictures.
 *
 * What it deliberately does not do: pagination, fonts, floats/anchors, section
 * columns, revision marks, comments, equations as typeset math. Those need a
 * layout engine, and pretending otherwise would make every layout difference
 * look like a bug.
 *
 * Parts read: `word/document.xml` (the body), `word/_rels/document.xml.rels`
 * (picture and header/footer targets), `word/styles.xml` (which style ids are
 * headings), plus every referenced header/footer part. Pictures are pulled out
 * of the archive as bytes and handed to the view, which turns them into object
 * URLs — an embedded image lives *inside* the zip, so there is no host route to
 * point at, unlike a linked file.
 */
import { DEFAULT_CONFIG, blockedResult, createBreaker, formatBytes } from './circuit-breaker'
import { BudgetExceeded, inflateEntry, listZipEntries } from './zip'
import { attributeOf, decodeXml, findAll, findElements, firstTag, isSelfClosing } from './xml'
import type { DocBreaker } from './circuit-breaker'
import type { DocBlock, DocImage, DocResult, DocxConfig, TextRun } from './types'

/** What the caller hands over. */
export interface DocxInput {
  fileName: string
  bytes: Uint8Array
  config?: Partial<DocxConfig>
}

/** Extension → mime, for the pictures we can hand to the browser. */
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  emf: 'image/emf',
  wmf: 'image/wmf',
}

/** Formats a browser actually renders; the rest become labelled placeholders. */
const RENDERABLE = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'])

/** English Metric Units per CSS pixel (914 400 EMU per inch, 96 px per inch). */
const EMU_PER_PX = 9525

/** Everything the walk needs, threaded through instead of captured globally. */
interface WalkContext {
  breaker: DocBreaker
  relationships: Map<string, { target: string; external: boolean }>
  headingLevels: Map<string, number>
  readBinary: (name: string, limit: number) => Promise<Uint8Array | undefined>
  readPart: (name: string) => Promise<string | undefined>
  /** Declared (uncompressed) size of a part, straight from the zip directory. */
  declaredSize: (name: string) => number | undefined
}

/** Read a `.docx`. Never throws: every failure comes back as a BLOCKED result. */
export async function readDocx(input: DocxInput): Promise<DocResult> {
  const config: DocxConfig = { ...DEFAULT_CONFIG, ...(input.config ?? {}) }
  const bytes = input.bytes
  const size = bytes.byteLength

  // Gate 1 — the archive itself, before touching the zip at all.
  if (size > config.maxFileSize) {
    return blockedResult(input.fileName, size, config, 'file-size', {
      found: formatBytes(size),
      limit: formatBytes(config.maxFileSize),
    })
  }

  let entries
  try {
    entries = listZipEntries(bytes)
  } catch (error) {
    return blockedResult(input.fileName, size, config, 'container-error', { message: messageOf(error) })
  }

  const byName = new Map(entries.map(entry => [entry.name, entry]))
  let inflatedTotal = 0

  /** Inflate one part as text, enforcing both container gates. */
  const readPart = async (name: string): Promise<string | undefined> => {
    const raw = await readBinary(name, config.maxPartBytes)
    return raw === undefined ? undefined : new TextDecoder('utf-8').decode(raw)
  }

  /** Inflate one part as bytes, enforcing both container gates. */
  const readBinary = async (name: string, limit: number): Promise<Uint8Array | undefined> => {
    const entry = byName.get(name)
    if (entry === undefined) return undefined
    if (entry.uncompressedSize > limit) throw new BudgetExceeded(entry.uncompressedSize, limit)
    const projected = inflatedTotal + entry.uncompressedSize
    if (projected > config.maxInflatedBytes) throw new BudgetExceeded(projected, config.maxInflatedBytes)
    const raw = await inflateEntry(bytes, entry, limit)
    inflatedTotal += raw.byteLength
    return raw
  }

  try {
    const documentXml = await readPart('word/document.xml')
    if (documentXml === undefined) {
      return blockedResult(input.fileName, size, config, 'container-error', {
        message: 'word/document.xml is missing (this is not a .docx container)',
      })
    }

    const relsXml = await readPart('word/_rels/document.xml.rels')
    const relationships = relsXml === undefined ? new Map() : parseRelationships(relsXml)

    const stylesXml = await readPart('word/styles.xml')
    const headingLevels = stylesXml === undefined ? new Map<string, number>() : parseHeadingLevels(stylesXml)

    const breaker = createBreaker(config)
    const headerIds = referenceIds(documentXml, 'w:headerReference')
    const footerIds = referenceIds(documentXml, 'w:footerReference')
    breaker.startReading({ fileName: input.fileName, fileSize: size, hasHeaderFooter: headerIds.length + footerIds.length > 0 })

    const context: WalkContext = {
      breaker,
      relationships,
      headingLevels,
      readBinary,
      readPart,
      declaredSize: name => byName.get(name)?.uncompressedSize,
    }

    // A header belongs above the body, a footer below it: same blocks, different
    // position, labelled so the view can mark them as not-part-of-the-body.
    for (const id of headerIds) await pushNote(context, 'header', id)
    await walkBody(bodyOf(documentXml), context)
    for (const id of footerIds) await pushNote(context, 'footer', id)

    return breaker.finalize()
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      const reason = error.limit === config.maxInflatedBytes ? 'inflated-bytes' : 'part-bytes'
      return blockedResult(input.fileName, size, config, reason, {
        found: formatBytes(error.bytes),
        limit: formatBytes(error.limit),
      })
    }
    return blockedResult(input.fileName, size, config, 'container-error', { message: messageOf(error) })
  }
}

/** Error → a string safe to put in a warning. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The body element's inner XML (falls back to the whole document). */
function bodyOf(documentXml: string): string {
  const found = findElements(documentXml, 'w:body')[0]
  return found === undefined ? documentXml : found.inner
}

/** `r:id` values of every `<tag …/>`, deduped, order preserved. */
function referenceIds(xml: string, tag: string): string[] {
  const ids: string[] = []
  for (const start of findAll(xml, tag)) {
    const id = attributeOf(start, 'r:id')
    if (id !== undefined && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** One header/footer part as a labelled note block. */
async function pushNote(context: WalkContext, label: string, referenceId: string): Promise<void> {
  const relationship = context.relationships.get(referenceId)
  if (relationship === undefined || relationship.external) return
  const xml = await context.readPart(resolvePart(relationship.target))
  if (xml === undefined) return
  const text = plainText(xml).replace(/\s+/g, ' ').trim()
  if (text === '') return
  context.breaker.push({ kind: 'note', label, text })
}

/** Normalise a relationship target to a zip entry name. */
export function resolvePart(target: string): string {
  const normalised = target.replace(/\\/g, '/')
  if (normalised.startsWith('/')) return normalised.slice(1)
  const segments: string[] = []
  for (const segment of `word/${normalised}`.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

/** `rId → { target, external }` from a relationships part. */
export function parseRelationships(xml: string): Map<string, { target: string; external: boolean }> {
  const map = new Map<string, { target: string; external: boolean }>()
  for (const start of findAll(xml, 'Relationship')) {
    const id = attributeOf(start, 'Id')
    const target = attributeOf(start, 'Target')
    if (id === undefined || target === undefined) continue
    map.set(id, { target, external: attributeOf(start, 'TargetMode') === 'External' })
  }
  return map
}

/** Which paragraph style ids are headings, and at what level. */
export function parseHeadingLevels(stylesXml: string): Map<string, number> {
  const levels = new Map<string, number>()
  for (const style of findElements(stylesXml, 'w:style')) {
    const id = attributeOf(style.tag, 'w:styleId')
    if (id === undefined) continue
    const type = attributeOf(style.tag, 'w:type')
    if (type !== undefined && type !== 'paragraph') continue

    const name = attributeOf(firstTag(style.inner, 'w:name') ?? '', 'w:val') ?? id
    // Prefer the human-readable name ("heading 3"), then the id ("Heading3"),
    // and only then a trailing digit — in that order, so `List1` is not a heading.
    const match = /heading\s*([1-9])/i.exec(name) ?? /^heading([1-9])$/i.exec(id)
    if (match === null) continue
    const level = Number(match[1])
    if (level >= 1 && level <= 6) levels.set(id, level)
  }
  return levels
}

/**
 * Top-level `<w:p>` / `<w:tbl>` children of a fragment, in document order.
 *
 * WordprocessingML nests the same element names (a paragraph inside a table
 * cell), so the scan jumps past each element it has already consumed — which is
 * what keeps table cells from being emitted as body paragraphs.
 */
export function topLevelChildren(xml: string): { name: string; element: string }[] {
  const out: { name: string; element: string }[] = []
  const open = /<w:(p|tbl)(\s[^>]*?)?(\/?)>/g

  for (let match = open.exec(xml); match !== null; match = open.exec(xml)) {
    const name = match[1] as string
    if (match[3] === '/') {
      out.push({ name, element: match[0] })
      continue
    }
    const found = findElements(xml.slice(match.index), `w:${name}`)[0]
    if (found === undefined) continue
    const end = match.index + found.tag.length + found.inner.length + `</w:${name}>`.length
    out.push({ name, element: xml.slice(match.index, end) })
    open.lastIndex = end
  }
  return out
}

/** Walk the body into blocks, stopping when the breaker says so. */
async function walkBody(body: string, context: WalkContext): Promise<void> {
  for (const child of topLevelChildren(body)) {
    if (child.name === 'tbl') {
      if (!context.breaker.push(tableBlock(child.element))) return
      continue
    }
    for (const block of await paragraphBlocks(child.element, context)) {
      if (!context.breaker.push(block)) return
    }
  }
}

/** One paragraph → its text block (if any) followed by its pictures. */
async function paragraphBlocks(paragraph: string, context: WalkContext): Promise<DocBlock[]> {
  const blocks: DocBlock[] = []
  const runs = runsOf(paragraph)
  const text = runs.map(run => run.text).join('').replace(/[ \t]+$/, '')

  if (text.trim() !== '') {
    const styleId = attributeOf(firstTag(paragraph, 'w:pStyle') ?? '', 'w:val')
    const outline = attributeOf(firstTag(paragraph, 'w:outlineLvl') ?? '', 'w:val')
    const indent = attributeOf(firstTag(paragraph, 'w:ilvl') ?? '', 'w:val')
    const numbered = firstTag(paragraph, 'w:numPr') !== undefined

    const byStyle = styleId === undefined ? undefined : context.headingLevels.get(styleId)
    // `w:outlineLvl` is 0-based; only trust it up to level 6.
    const byOutline = outline === undefined ? undefined : Number(outline) + 1
    const heading = byStyle ?? (byOutline !== undefined && byOutline >= 1 && byOutline <= 6 ? byOutline : undefined)

    if (heading !== undefined) blocks.push({ kind: 'heading', level: heading, text, runs })
    else if (numbered) blocks.push({ kind: 'list', level: (Number(indent ?? '0') || 0) + 1, text, runs })
    else blocks.push({ kind: 'paragraph', text, runs })
  }

  for (const image of await imagesOf(paragraph, context)) blocks.push({ kind: 'image', text: '', image })
  return blocks
}

/** Inline runs of one paragraph, with the formatting this view honours. */
function runsOf(xml: string): TextRun[] {
  const runs: TextRun[] = []
  for (const run of findElements(xml, 'w:r')) {
    const properties = findElements(run.inner, 'w:rPr')[0]?.inner ?? ''
    const text = runText(run.inner)
    if (text === '') continue
    const style = attributeOf(firstTag(properties, 'w:rStyle') ?? '', 'w:val') ?? ''
    const fonts = firstTag(properties, 'w:rFonts') ?? ''
    runs.push({
      text,
      ...(isOn(properties, 'w:b') ? { bold: true } : {}),
      ...(isOn(properties, 'w:i') ? { italic: true } : {}),
      ...(isOn(properties, 'w:u') ? { underline: true } : {}),
      ...(/code|mono/i.test(style) || /consolas|courier|monaco|mono/i.test(attributeOf(fonts, 'w:ascii') ?? '')
        ? { code: true }
        : {}),
    })
  }
  return runs
}

/** True when a toggle property is present and not explicitly off. */
function isOn(properties: string, tag: string): boolean {
  const start = firstTag(properties, tag)
  if (start === undefined) return false
  if (isSelfClosing(start)) return true
  const value = attributeOf(start, 'w:val')
  return value === undefined || !/^(0|false|off)$/i.test(value)
}

/** Visible text of a fragment: `w:t` runs, tabs and breaks, in order. */
export function runText(xml: string): string {
  let out = ''
  const pattern = /<w:t(\s[^>]*?)?>([\s\S]*?)<\/w:t>|<w:t(\s[^>]*?)?\/>|<w:tab(\s[^>]*?)?\/>|<w:br(\s[^>]*?)?\/>|<w:cr(\s[^>]*?)?\/>/g
  for (let found = pattern.exec(xml); found !== null; found = pattern.exec(xml)) {
    if (found[2] !== undefined) out += decodeXml(found[2])
    else if (found[0].startsWith('<w:tab')) out += '\t'
    else if (found[0].startsWith('<w:br') || found[0].startsWith('<w:cr')) out += '\n'
  }
  return out
}

/** Plain text of any fragment (cells, headers/footers, whole parts). */
export function plainText(xml: string): string {
  return runText(xml)
}

/** A table: rows of cells, each cell's paragraphs joined by a space. */
export function tableBlock(tableXml: string): DocBlock {
  const rows: string[][] = []
  for (const row of findElements(tableXml, 'w:tr')) {
    const cells: string[] = []
    for (const cell of findElements(row.inner, 'w:tc')) {
      const paragraphs = findElements(cell.inner, 'w:p').map(part => plainText(part.inner).replace(/\s+/g, ' ').trim())
      cells.push(paragraphs.filter(text => text !== '').join(' '))
    }
    rows.push(cells)
  }
  return { kind: 'table', text: '', rows }
}

/** Pictures referenced by one paragraph, read out of the archive. */
async function imagesOf(paragraph: string, context: WalkContext): Promise<DocImage[]> {
  const images: DocImage[] = []

  for (const blip of findAll(paragraph, 'a:blip')) {
    const id = attributeOf(blip, 'r:embed')
    if (id === undefined) continue // `r:link` is an external file, not in the archive
    const relationship = context.relationships.get(id)
    if (relationship === undefined || relationship.external) continue

    const name = resolvePart(relationship.target)
    const extension = name.split('.').pop()?.toLowerCase() ?? ''
    const mime = IMAGE_MIME[extension] ?? 'application/octet-stream'
    const extent = firstTag(paragraph, 'wp:extent') ?? ''

    // The pixel size is stated in EMU by the drawing itself.
    const cx = Number(attributeOf(extent, 'cx') ?? '0')
    const cy = Number(attributeOf(extent, 'cy') ?? '0')
    const size =
      cx > 0 && cy > 0
        ? { widthPx: Math.round(cx / EMU_PER_PX), heightPx: Math.round(cy / EMU_PER_PX) }
        : {}

    if (!RENDERABLE.has(extension)) {
      // A placeholder is still information: say what it was and why it is not drawn.
      const placeholder: DocImage = { name, mime, bytes: new Uint8Array(0), unsupported: true, reason: extension.toUpperCase(), ...size }
      if (context.breaker.takeImage(placeholder)) images.push(placeholder)
      continue
    }

    const entry = context.breaker.config
    const limit = Math.min(entry.maxImageBytes, entry.maxPartBytes)
    const declared = context.declaredSize(name)
    if (declared !== undefined && declared > limit) {
      // Refuse before inflating: the ceiling is on the bytes we would decode.
      context.breaker.skipImage('image-bytes', { found: formatBytes(declared), limit: formatBytes(limit) })
      continue
    }

    const raw = await context.readBinary(name, limit)
    if (raw === undefined) continue
    const image: DocImage = { name, mime, bytes: raw, ...size }
    if (context.breaker.takeImage(image)) images.push(image)
  }
  return images
}
