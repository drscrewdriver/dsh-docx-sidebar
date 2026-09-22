/**
 * The document model this plugin renders. Pure types — no DOM, no React — so
 * the parser and the breaker stay testable under plain Node.
 */
/** One inline run: text with the formatting we actually honour. */
export interface TextRun {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** `w:rStyle` naming a code-ish character style, or a monospace font. */
    code?: boolean;
}
/** A picture pulled out of the archive, ready to become an object URL. */
export interface DocImage {
    /** The zip entry name (`word/media/image1.png`). */
    name: string;
    mime: string;
    bytes: Uint8Array;
    /** Pixel size when the drawing declares one (EMU converted). */
    widthPx?: number;
    heightPx?: number;
    /** True when the browser cannot render this format (e.g. EMF/WMF). */
    unsupported?: boolean;
    /** Why it was skipped, when it was. */
    reason?: string;
}
/** What one block is. */
export type DocBlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'image' | 'note';
/** One renderable block, in document order. */
export interface DocBlock {
    kind: DocBlockKind;
    /** Heading level 1–6, or list indent level. */
    level?: number;
    /** Concatenated run text (kept so tests and search need no run walking). */
    text: string;
    runs?: TextRun[];
    /** Table cells, row-major. */
    rows?: string[][];
    /** Picture for `kind: 'image'`. */
    image?: DocImage;
    /** Label for `kind: 'note'` ("header" / "footer"). */
    label?: string;
}
/** Metadata shown in the document header strip. */
export interface DocMeta {
    fileName: string;
    /** Archive size in bytes, as reported by the host. */
    fileSize: number;
    /** Blocks actually rendered. */
    blocksRendered: number;
    /** Blocks the reader walked (may exceed the rendered count when truncated). */
    blocksTotal: number;
    /** Pictures carried into the view. */
    images: number;
    /** Pictures dropped because of a ceiling or an unsupported format. */
    imagesSkipped: number;
    /** True when the document declares a header or footer part. */
    hasHeaderFooter: boolean;
}
/** Circuit-breaker state machine. */
export type BreakerState = 'IDLE' | 'READING' | 'PARSING' | 'OK' | 'TRUNCATED' | 'BLOCKED';
/** Why the breaker tripped. */
export type BreakerReason = 'file-size'
/** The archive itself could not be read (not a zip / missing part). */
 | 'container-error'
/** Inflated past the total byte budget — a zip bomb. */
 | 'inflated-bytes'
/** One part alone exceeded its ceiling. */
 | 'part-bytes'
/** More blocks than the rendering budget. */
 | 'blocks'
/** One block's text alone exceeded its ceiling. */
 | 'text-length'
/** More pictures than the budget. */
 | 'images'
/** One picture alone exceeded its ceiling. */
 | 'image-bytes' | 'parse-error';
/** One tripped dimension, with the numbers the view renders. */
export interface BreakerWarning {
    reason: BreakerReason;
    detail: Record<string, number | string>;
}
/** The breaker's output. */
export interface DocResult {
    state: BreakerState;
    meta: DocMeta;
    blocks: DocBlock[];
    warnings: BreakerWarning[];
}
/** Tunable ceilings. The two container gates plus the document budgets. */
export interface DocxConfig {
    /** Archive size ceiling (bytes). Over it: BLOCKED before any unpacking. */
    maxFileSize: number;
    /** Total bytes every part may inflate to, summed. */
    maxInflatedBytes: number;
    /** Ceiling for one part's inflated XML. */
    maxPartBytes: number;
    /** How many blocks the view keeps. */
    maxBlocks: number;
    /** Ceiling for one block's text length. */
    maxTextLength: number;
    /** How many pictures the view keeps. */
    maxImages: number;
    /** Ceiling for one picture's byte size. */
    maxImageBytes: number;
}
