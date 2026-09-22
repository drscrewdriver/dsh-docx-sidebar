/**
 * The document viewer. Renders the blocks the reader produced — and nothing it
 * did not: there is no attempt to imitate Word's layout, and the header strip
 * says so, because a layout difference that looks like a rendering bug is worse
 * than a plainly-labelled reading view.
 *
 * Pictures are turned into object URLs here (they live inside the archive, so
 * there is no host route to point at) and revoked when the result changes or the
 * viewer unmounts.
 */
import { useEffect, useState } from 'react'
import { readDocx } from './docx'
import { formatBytes } from './circuit-breaker'
import { basename } from './utils'
import type { ReactNode } from 'react'
import type { T } from './locales'
import type { DocBlock, DocResult, TextRun } from './types'

interface DocxViewerProps {
  path: string
  title?: string
  /** Raw archive bytes, from the registered `custom` loader. */
  customData?: unknown
  t: T
}

/** True when the loader handed us something we can read. */
function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}

export function DocxViewer({ path, title, customData, t }: DocxViewerProps) {
  const fileName = title !== undefined && title !== '' ? title : basename(path)
  const [result, setResult] = useState<DocResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isBytes(customData)) return
    let cancelled = false
    void (async () => {
      try {
        const read = await readDocx({ fileName, bytes: customData })
        if (!cancelled) setResult(read)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [customData, fileName])

  // One object URL per distinct picture, revoked on change/unmount.
  useEffect(() => {
    if (result === null) return
    const created: Record<string, string> = {}
    for (const block of result.blocks) {
      const image = block.image
      if (image === undefined || image.unsupported === true || image.bytes.byteLength === 0) continue
      if (created[image.name] !== undefined) continue
      created[image.name] = URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime }))
    }
    setUrls(created)
    return () => {
      for (const url of Object.values(created)) URL.revokeObjectURL(url)
    }
  }, [result])

  if (!isBytes(customData) || (result === null && error === null)) {
    return (
      <div className="docx-root">
        <div className="docx-loading">
          <div className="docx-spinner" />
          <div>{t('state.loading')}</div>
        </div>
      </div>
    )
  }

  if (error !== null) {
    return (
      <div className="docx-root">
        <div className="docx-error">
          <div className="docx-error__title">❌ {t('state.error')}</div>
          <div className="docx-error__hint">{error}</div>
        </div>
      </div>
    )
  }

  const document = result as DocResult
  const { meta, warnings, state } = document

  return (
    <div className="docx-root">
      <div className="docx-head">
        <span className="docx-head__name" title={meta.fileName}>
          📄 {meta.fileName}
        </span>
        <span className="docx-head__tag">{formatBytes(meta.fileSize)}</span>
        <span className="docx-head__tag">
          {t('doc.units', { blocks: meta.blocksRendered, images: meta.images })}
        </span>
        {meta.imagesSkipped > 0 && (
          <span className="docx-head__tag">{t('doc.unitsSkipped', { n: meta.imagesSkipped })}</span>
        )}
        {/* The one thing a reader must not have to guess. */}
        <span className="docx-head__badge">{t('doc.badge')}</span>
      </div>

      {warnings.length > 0 && <DocWarning state={state} warnings={warnings} t={t} />}

      {state === 'BLOCKED' ? (
        <div className="docx-empty">
          <div className="docx-empty__title">⛔ {t('doc.blocked')}</div>
          <div className="docx-empty__hint">{t('doc.blockedHint')}</div>
        </div>
      ) : document.blocks.length === 0 ? (
        <div className="docx-empty">
          <div className="docx-empty__title">{t('doc.empty')}</div>
          <div className="docx-empty__hint">{t('doc.emptyHint')}</div>
        </div>
      ) : (
        <div className="docx-body">
          {document.blocks.map((block, index) => (
            <Block key={index} block={block} urls={urls} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

/** The breaker banner: one line per tripped dimension. */
function DocWarning({
  state,
  warnings,
  t,
}: {
  state: DocResult['state']
  warnings: DocResult['warnings']
  t: T
}) {
  const blocked = state === 'BLOCKED'
  return (
    <div className={`docx-warning${blocked ? ' docx-warning--blocked' : ''}`} role="status">
      <div className="docx-warning__head">
        <span aria-hidden="true">{blocked ? '⛔' : '⚠️'}</span>
        <span>{t(blocked ? 'warning.blockedTitle' : 'warning.truncatedTitle')}</span>
      </div>
      <ul className="docx-warning__list">
        {warnings.map(warning => (
          <li key={warning.reason}>• {t(`warning.${warning.reason}`, warning.detail)}</li>
        ))}
      </ul>
    </div>
  )
}

/** One block, by kind. */
function Block({ block, urls, t }: { block: DocBlock; urls: Record<string, string>; t: T }) {
  switch (block.kind) {
    case 'heading': {
      const level = block.level ?? 1
      return <div className={`docx-h docx-h--${level}`}>{runs(block.runs ?? [{ text: block.text }])}</div>
    }
    case 'list':
      return (
        <div className="docx-list" style={{ marginLeft: `${((block.level ?? 1) - 1) * 14}px` }}>
          {runs(block.runs ?? [{ text: block.text }])}
        </div>
      )
    case 'table': {
      const rows = block.rows ?? []
      const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
      return (
        <div className="docx-table-wrap">
          <div className="docx-table__caption">
            {t('doc.table', { rows: rows.length, cols: width })}
          </div>
          <table className="docx-table">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) =>
                    rowIndex === 0 ? (
                      <th key={cellIndex}>{cell}</th>
                    ) : (
                      <td key={cellIndex}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'image': {
      const image = block.image
      if (image === undefined) return null
      const url = urls[image.name]
      return (
        <div className="docx-image">
          {url === undefined ? (
            <span className="docx-image__placeholder">
              🖼 {t('doc.image')} — {image.unsupported === true ? t('doc.imageUnsupported', { kind: image.reason ?? '' }) : t('doc.imageSkipped')}
            </span>
          ) : (
            <img
              src={url}
              alt={image.name}
              {...(image.widthPx !== undefined ? { width: image.widthPx } : {})}
              {...(image.heightPx !== undefined ? { height: image.heightPx } : {})}
            />
          )}
          <div className="docx-image__meta">
            {image.name}
            {image.widthPx !== undefined && image.heightPx !== undefined ? ` · ${image.widthPx}×${image.heightPx}` : ''}
          </div>
        </div>
      )
    }
    case 'note':
      return (
        <div className="docx-note">
          <span className="docx-note__label">{t(block.label === 'footer' ? 'doc.footer' : 'doc.header')}</span>
          {block.text}
        </div>
      )
    default:
      return <div className="docx-p">{runs(block.runs ?? [{ text: block.text }])}</div>
  }
}

/** Inline runs, with the formatting this view honours. */
function runs(items: TextRun[]): ReactNode[] {
  return items.map((run, index) => {
    if (run.bold !== true && run.italic !== true && run.underline !== true && run.code !== true) {
      return <span key={index}>{run.text}</span>
    }
    return (
      <span
        key={index}
        className={run.code === true ? 'docx-code' : undefined}
        style={{
          ...(run.bold === true ? { fontWeight: 600 } : {}),
          ...(run.italic === true ? { fontStyle: 'italic' as const } : {}),
          ...(run.underline === true ? { textDecoration: 'underline' } : {}),
        }}
      >
        {run.text}
      </span>
    )
  })
}
