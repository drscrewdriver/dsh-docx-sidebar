/**
 * The circuit breaker, document edition.
 *
 * Six ceilings, each able to stop the reader early rather than after the damage:
 *
 * | dimension      | default | over it                                      |
 * |----------------|---------|----------------------------------------------|
 * | archive size   | 5 MB    | BLOCKED — refused before any unpacking        |
 * | total inflate  | 64 MB   | BLOCKED — the zip-bomb gate                   |
 * | one part       | 32 MB   | BLOCKED — a single oversized XML part         |
 * | blocks         | 5 000   | TRUNCATED — the reader stops                  |
 * | block text     | 20 000  | that block's text elided, warned              |
 * | images         | 200     | further pictures skipped, warned              |
 * | one image      | 8 MB    | that picture skipped, warned                  |
 *
 * **At most one warning per reason** is structural here (a Map keyed by reason),
 * not a convention: a dimension that trips twice would otherwise render two
 * near-identical banner lines — a bug the sibling plugin shipped and then had to
 * fix.
 *
 * Pure module: no DOM, no React, no imports beyond local types.
 */
import type {
  BreakerReason,
  BreakerState,
  BreakerWarning,
  DocBlock,
  DocImage,
  DocMeta,
  DocResult,
  DocxConfig,
} from './types'

/** Ceilings. The three container gates plus the three document budgets. */
export const DEFAULT_CONFIG: DocxConfig = {
  maxFileSize: 5 * 1024 * 1024,
  maxInflatedBytes: 64 * 1024 * 1024,
  maxPartBytes: 32 * 1024 * 1024,
  maxBlocks: 5_000,
  maxTextLength: 20_000,
  maxImages: 200,
  maxImageBytes: 8 * 1024 * 1024,
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The breaker's mutable face. */
export interface DocBreaker {
  readonly config: DocxConfig
  /** Enter READING and seed the metadata the header strip shows. */
  startReading(seed: Partial<DocMeta>): void
  /** Offer one block. Returns false when the block ceiling is reached. */
  push(block: DocBlock): boolean
  /** Offer one picture. Returns false to skip it (and says why, once). */
  takeImage(image: DocImage): boolean
  /**
   * Record a picture that was never read at all (its declared size already
   * exceeded the ceiling, so inflating it would be wasted work).
   */
  skipImage(reason: BreakerReason, detail: BreakerWarning['detail']): void
  /** Mark the run BLOCKED (nothing usable will be produced). */
  block(reason: BreakerReason, detail: BreakerWarning['detail']): void
  /** Mark the run TRUNCATED (usable, but incomplete). */
  warn(reason: BreakerReason, detail: BreakerWarning['detail']): void
  /** Close the run and hand back the renderable result. */
  finalize(): DocResult
  state(): BreakerState
}

/** Build one breaker run. */
export function createBreaker(config: Partial<DocxConfig> = {}): DocBreaker {
  const cfg: DocxConfig = { ...DEFAULT_CONFIG, ...config }
  let state: BreakerState = 'IDLE'
  let blocksTotal = 0
  let imagesSeen = 0
  let imagesKept = 0
  let imagesSkipped = 0
  const blocks: DocBlock[] = []
  /** Keyed by reason: one dimension, one line. */
  const warnings = new Map<BreakerReason, BreakerWarning>()
  const meta: DocMeta = {
    fileName: '',
    fileSize: 0,
    blocksRendered: 0,
    blocksTotal: 0,
    images: 0,
    imagesSkipped: 0,
    hasHeaderFooter: false,
  }

  /** Record a warning once, and mark the run truncated unless it is blocked. */
  const trip = (reason: BreakerReason, detail: BreakerWarning['detail']): void => {
    if (!warnings.has(reason)) warnings.set(reason, { reason, detail })
    if (state !== 'BLOCKED') state = 'TRUNCATED'
  }

  return {
    config: cfg,

    startReading(seed) {
      state = 'READING'
      Object.assign(meta, seed)
    },

    push(block) {
      blocksTotal++
      if (blocks.length >= cfg.maxBlocks) {
        trip('blocks', { kept: cfg.maxBlocks, found: blocksTotal })
        return false
      }
      if (block.text.length > cfg.maxTextLength) {
        const original = block.text.length
        blocks.push({ ...block, text: `${block.text.slice(0, cfg.maxTextLength)}… (+${original - cfg.maxTextLength} chars)` })
        trip('text-length', { found: original, limit: cfg.maxTextLength })
        return true
      }
      blocks.push(block)
      return true
    },

    takeImage(image) {
      imagesSeen++
      if (image.bytes.byteLength > cfg.maxImageBytes) {
        imagesSkipped++
        trip('image-bytes', { found: formatBytes(image.bytes.byteLength), limit: formatBytes(cfg.maxImageBytes) })
        return false
      }
      if (imagesKept >= cfg.maxImages) {
        imagesSkipped++
        trip('images', { kept: cfg.maxImages, found: imagesSeen })
        return false
      }
      imagesKept++
      return true
    },

    block(reason, detail) {
      warnings.set(reason, { reason, detail })
      state = 'BLOCKED'
    },

    skipImage(reason, detail) {
      imagesSeen++
      imagesSkipped++
      trip(reason, detail)
    },

    warn: trip,

    finalize() {
      if (state !== 'BLOCKED' && state !== 'TRUNCATED') {
        state = warnings.size > 0 ? 'TRUNCATED' : 'OK'
      }
      meta.blocksRendered = blocks.length
      meta.blocksTotal = blocksTotal
      meta.images = imagesKept
      meta.imagesSkipped = imagesSkipped
      return { state, meta: { ...meta }, blocks, warnings: [...warnings.values()] }
    },

    state: () => state,
  }
}

/** A BLOCKED result with no content — the one shape every failure path returns. */
export function blockedResult(
  fileName: string,
  fileSize: number,
  config: Partial<DocxConfig>,
  reason: BreakerReason,
  detail: BreakerWarning['detail'],
): DocResult {
  const breaker = createBreaker(config)
  breaker.startReading({ fileName, fileSize })
  breaker.block(reason, detail)
  return breaker.finalize()
}
