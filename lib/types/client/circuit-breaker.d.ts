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
import type { BreakerReason, BreakerState, BreakerWarning, DocBlock, DocImage, DocMeta, DocResult, DocxConfig } from './types';
/** Ceilings. The three container gates plus the three document budgets. */
export declare const DEFAULT_CONFIG: DocxConfig;
/** Human-readable byte size. */
export declare function formatBytes(bytes: number): string;
/** The breaker's mutable face. */
export interface DocBreaker {
    readonly config: DocxConfig;
    /** Enter READING and seed the metadata the header strip shows. */
    startReading(seed: Partial<DocMeta>): void;
    /** Offer one block. Returns false when the block ceiling is reached. */
    push(block: DocBlock): boolean;
    /** Offer one picture. Returns false to skip it (and says why, once). */
    takeImage(image: DocImage): boolean;
    /**
     * Record a picture that was never read at all (its declared size already
     * exceeded the ceiling, so inflating it would be wasted work).
     */
    skipImage(reason: BreakerReason, detail: BreakerWarning['detail']): void;
    /** Mark the run BLOCKED (nothing usable will be produced). */
    block(reason: BreakerReason, detail: BreakerWarning['detail']): void;
    /** Mark the run TRUNCATED (usable, but incomplete). */
    warn(reason: BreakerReason, detail: BreakerWarning['detail']): void;
    /** Close the run and hand back the renderable result. */
    finalize(): DocResult;
    state(): BreakerState;
}
/** Build one breaker run. */
export declare function createBreaker(config?: Partial<DocxConfig>): DocBreaker;
/** A BLOCKED result with no content — the one shape every failure path returns. */
export declare function blockedResult(fileName: string, fileSize: number, config: Partial<DocxConfig>, reason: BreakerReason, detail: BreakerWarning['detail']): DocResult;
