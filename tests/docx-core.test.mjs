/**
 * Core tests for the .docx reader + circuit breaker.
 *
 * The fixture is a **real docx-shaped zip built here**: deflate entries with
 * proper CRC32s and a correct central directory, referencing a genuine (if tiny)
 * PNG. That exercises the paths a synthetic object graph cannot — relationship
 * resolution, EMU→px conversion, the unsupported-format placeholder.
 *
 * Run: `npm test`  (exits non-zero on any failed assertion)
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = mkdtempSync(join(tmpdir(), 'dsh-docx-test-'))

await build({
  absWorkingDir: root,
  entryPoints: ['src/client/docx.ts', 'src/client/locales.ts'],
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
})

const docx = await import(pathToFileURL(join(outDir, 'docx.mjs')).href)
const { dictionaries, interpolate } = await import(pathToFileURL(join(outDir, 'locales.mjs')).href)

// ── a minimal, correct zip writer (fixture only) ─────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

/** Standard CRC32, as the central directory records it. */
function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/**
 * Build a zip from `{ name, data, declaredSize? }` entries. `declaredSize`
 * overrides the central directory's uncompressed size — the lying-header case the
 * declared-size gate must catch without inflating.
 */
function zip(entries) {
  const locals = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const payload = deflateRawSync(raw)
    const crc = crc32(raw)
    const declared = entry.declaredSize ?? raw.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(declared, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, payload)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(8, 10)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(payload.length, 20)
    cen.writeUInt32LE(declared, 24)
    cen.writeUInt16LE(name.length, 28)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, name)

    offset += local.length + name.length + payload.length
  }

  const directory = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(directory.length, 12)
  eocd.writeUInt32LE(offset, 16)

  return new Uint8Array(Buffer.concat([...locals, directory, eocd]))
}

// ── the fixture document ─────────────────────────────────────────────────────

/** A real 1×1 PNG, so the image path carries actual bytes with a real signature. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+2gAAAABJRU5ErkJggg==',
  'base64',
)

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly report</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="List1"/></w:pPr><w:r><w:t>Not a heading</w:t></w:r></w:p>
    <w:p><w:r><w:t>Plain </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr><w:r><w:t>nested bullet</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><wp:extent cx="1905000" cy="952500"/><a:blip r:embed="rId10"/></w:drawing></w:r></w:p>
    <w:p><w:r><w:drawing><a:blip r:embed="rId11"/></w:drawing></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Region</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Units</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>north</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>120</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:sectPr><w:headerReference w:type="default" r:id="rId20"/></w:sectPr>
  </w:body>
</w:document>`

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="styles.xml"/>
  <Relationship Id="rId10" Target="media/image1.png"/>
  <Relationship Id="rId11" Target="media/logo.emf"/>
  <Relationship Id="rId20" Target="header1.xml"/>
  <Relationship Id="rId30" Target="https://example.com/x.png" TargetMode="External"/>
</Relationships>`

const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="List1"><w:name w:val="List Paragraph"/></w:style>
</w:styles>`

const HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>Confidential</w:t></w:r></w:p>
</w:hdr>`

/** The normal fixture. `overrides` replaces individual parts. */
function fixture(overrides = {}) {
  const parts = {
    'word/document.xml': DOCUMENT,
    'word/_rels/document.xml.rels': RELS,
    'word/styles.xml': STYLES,
    'word/header1.xml': HEADER,
    'word/media/image1.png': PNG_1X1,
    'word/media/logo.emf': Buffer.from('fake-emf-bytes'),
    ...overrides,
  }
  return zip(Object.entries(parts).map(([name, data]) => ({ name, data })))
}

// ── assertions ───────────────────────────────────────────────────────────────

let checks = 0
const check = async (label, fn) => {
  await fn()
  checks++
  console.log(`  ok  ${label}`)
}

console.log('dsh-docx-sidebar :: docx core')

await check('headings come from the style map, and a non-heading style stays a paragraph', async () => {
  const result = await docx.readDocx({ fileName: 'report.docx', bytes: fixture() })
  assert.equal(result.state, 'OK')
  // A header part leads the list by design (it sits above the body), so blocks
  // are located by kind rather than by index.
  assert.equal(result.blocks[0].kind, 'note')
  const heading = result.blocks.find(block => block.kind === 'heading')
  assert.ok(heading !== undefined, 'no heading block')
  assert.equal(heading.level, 1)
  assert.equal(heading.text, 'Quarterly report')
  // `List1` ends in a digit but is not a heading: only the style NAME decides.
  const notHeading = result.blocks.find(block => block.text === 'Not a heading')
  assert.ok(notHeading !== undefined)
  assert.equal(notHeading.kind, 'paragraph')
})

await check('inline runs keep bold and italic', async () => {
  const result = await docx.readDocx({ fileName: 'report.docx', bytes: fixture() })
  const paragraph = result.blocks.find(block => block.text === 'Plain bolditalic')
  assert.ok(paragraph !== undefined, 'the run paragraph was not produced')
  assert.deepEqual(
    paragraph.runs.map(run => [run.text, run.bold === true, run.italic === true]),
    [
      ['Plain ', false, false],
      ['bold', true, false],
      ['italic', false, true],
    ],
  )
})

await check('a numbered paragraph becomes a list item at its indent level', async () => {
  const result = await docx.readDocx({ fileName: 'report.docx', bytes: fixture() })
  const item = result.blocks.find(block => block.kind === 'list')
  assert.ok(item !== undefined)
  assert.equal(item.text, 'nested bullet')
  assert.equal(item.level, 2) // ilvl 1 is 0-based
})

await check('a table becomes rows of cells, not stray paragraphs', async () => {
  const result = await docx.readDocx({ fileName: 'report.docx', bytes: fixture() })
  const table = result.blocks.find(block => block.kind === 'table')
  assert.ok(table !== undefined)
  assert.deepEqual(table.rows, [
    ['Region', 'Units'],
    ['north', '120'],
  ])
  // The cells must NOT also appear as body paragraphs.
  assert.equal(result.blocks.filter(block => block.text === 'Region').length, 0)
})

await check('an embedded picture is read out of the archive with its EMU size', async () => {
  const result = await docx.readDocx({ fileName: 'report.docx', bytes: fixture() })
  const image = result.blocks.find(block => block.kind === 'image' && block.image?.unsupported !== true)
  assert.ok(image !== undefined, 'no readable image block')
  assert.equal(image.image.mime, 'image/png')
  assert.equal(image.image.name, 'word/media/image1.png')
  assert.equal(image.image.widthPx, 200) // 1 905 000 EMU / 9525
  assert.equal(image.image.heightPx, 100)
  assert.deepEqual([...image.image.bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]) // real PNG signature
})

await check('an unrenderable format becomes a labelled placeholder, not a silent gap', async () => {
  const result = await docx.readDocx({ fileName: 'report.docx', bytes: fixture() })
  const placeholder = result.blocks.find(block => block.image?.unsupported === true)
  assert.ok(placeholder !== undefined)
  assert.equal(placeholder.image.reason, 'EMF')
  assert.equal(placeholder.image.bytes.byteLength, 0)
})

await check('a header part becomes a labelled note, and external links are ignored', async () => {
  const result = await docx.readDocx({ fileName: 'report.docx', bytes: fixture() })
  const note = result.blocks.find(block => block.kind === 'note')
  assert.ok(note !== undefined)
  assert.equal(note.label, 'header')
  assert.equal(note.text, 'Confidential')
  assert.equal(result.meta.hasHeaderFooter, true)
  // The External relationship must not be fetched or listed.
  assert.equal(result.blocks.filter(block => block.image?.name.includes('example.com')).length, 0)
})

await check('counts add up', async () => {
  const result = await docx.readDocx({ fileName: 'report.docx', bytes: fixture() })
  assert.equal(result.meta.images, 2) // the PNG plus the EMF placeholder
  assert.equal(result.meta.imagesSkipped, 0)
  assert.equal(result.meta.blocksRendered, result.blocks.length)
  assert.ok(result.meta.blocksTotal >= result.meta.blocksRendered)
})

await check('GATE: the archive ceiling blocks before any unpacking', async () => {
  const result = await docx.readDocx({ fileName: 'big.docx', bytes: fixture(), config: { maxFileSize: 10 } })
  assert.equal(result.state, 'BLOCKED')
  assert.equal(result.warnings[0].reason, 'file-size')
  assert.equal(result.blocks.length, 0)
})

await check('GATE: a lying part size is refused from the directory alone', async () => {
  const lying = zip([
    { name: 'word/document.xml', data: DOCUMENT, declaredSize: 400 * 1024 * 1024 },
    { name: 'word/_rels/document.xml.rels', data: RELS },
  ])
  const result = await docx.readDocx({ fileName: 'bomb.docx', bytes: lying })
  assert.equal(result.state, 'BLOCKED')
  assert.equal(result.warnings[0].reason, 'part-bytes')
})

await check('GATE: the total inflate budget is enforced across parts', async () => {
  const lying = zip([
    { name: 'word/document.xml', data: DOCUMENT, declaredSize: 60 * 1024 * 1024 },
    { name: 'word/_rels/document.xml.rels', data: RELS },
  ])
  const result = await docx.readDocx({
    fileName: 'bomb.docx',
    bytes: lying,
    config: { maxPartBytes: 100 * 1024 * 1024, maxInflatedBytes: 50 * 1024 * 1024 },
  })
  assert.equal(result.state, 'BLOCKED')
  assert.equal(result.warnings[0].reason, 'inflated-bytes')
})

await check('GATE: a non-zip file is a readable error, never a throw', async () => {
  const result = await docx.readDocx({ fileName: 'notes.txt', bytes: new TextEncoder().encode('hello there') })
  assert.equal(result.state, 'BLOCKED')
  assert.equal(result.warnings[0].reason, 'container-error')
})

await check('GATE: block, text and warning budgets behave and never double-warn', async () => {
  const many = ['<w:p><w:r><w:t>filler</w:t></w:r></w:p>'.repeat(20)]
  const document = DOCUMENT.replace('<w:sectPr>', `${many.join('')}<w:sectPr>`)

  const capped = await docx.readDocx({ fileName: 'many.docx', bytes: fixture({ 'word/document.xml': document }), config: { maxBlocks: 3 } })
  assert.equal(capped.state, 'TRUNCATED')
  assert.equal(capped.meta.blocksRendered, 3)
  assert.equal(capped.warnings.filter(warning => warning.reason === 'blocks').length, 1)

  const long = DOCUMENT.replace('Quarterly report', 'y'.repeat(300))
  const clamped = await docx.readDocx({ fileName: 'long.docx', bytes: fixture({ 'word/document.xml': long }), config: { maxTextLength: 50 } })
  assert.equal(clamped.state, 'TRUNCATED')
  const clampedHeading = clamped.blocks.find(block => block.kind === 'heading')
  assert.ok(clampedHeading !== undefined, 'the clamped heading is missing')
  assert.ok(clampedHeading.text.startsWith('y'.repeat(50)))
  assert.ok(clampedHeading.text.includes('+250 chars'))
  assert.equal(clamped.warnings.filter(warning => warning.reason === 'text-length').length, 1)
})

await check('GATE: every warning renders with no leftover placeholder in zh or en', async () => {
  const lying = zip([
    { name: 'word/document.xml', data: DOCUMENT, declaredSize: 400 * 1024 * 1024 },
    { name: 'word/_rels/document.xml.rels', data: RELS },
  ])
  const results = [
    await docx.readDocx({ fileName: 'a.docx', bytes: fixture(), config: { maxFileSize: 10 } }),
    await docx.readDocx({ fileName: 'b.docx', bytes: lying }),
    await docx.readDocx({ fileName: 'c.txt', bytes: new TextEncoder().encode('nope') }),
    await docx.readDocx({ fileName: 'd.docx', bytes: fixture(), config: { maxBlocks: 1 } }),
    await docx.readDocx({
      fileName: 'e.docx',
      bytes: fixture({ 'word/document.xml': DOCUMENT.replace('Quarterly report', 'z'.repeat(300)) }),
      config: { maxTextLength: 20 },
    }),
  ]

  const warnings = results.flatMap(result => result.warnings)
  const reasons = new Set(warnings.map(warning => warning.reason))
  for (const required of ['file-size', 'part-bytes', 'container-error', 'blocks', 'text-length']) {
    assert.ok(reasons.has(required), `no warning of reason ${required} was produced`)
  }

  for (const warning of warnings) {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      const template = dict[`warning.${warning.reason}`]
      assert.ok(template !== undefined, `${lang} has no template for warning.${warning.reason}`)
      const rendered = interpolate(template, warning.detail)
      assert.ok(!rendered.includes('{'), `${lang} ${warning.reason} left a placeholder: ${rendered}`)
    }
  }

  // One dimension, one line — structural in the breaker (a Map keyed by reason).
  for (const result of results) {
    const seen = result.warnings.map(warning => warning.reason)
    assert.equal(new Set(seen).size, seen.length, `duplicate warning reasons: ${seen.join(', ')}`)
  }
})

rmSync(outDir, { recursive: true, force: true })
console.log(`\ndsh-docx-sidebar :: ${checks} checks passed, 0 failed`)
