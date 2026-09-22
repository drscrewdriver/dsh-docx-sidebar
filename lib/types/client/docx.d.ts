import type { DocBlock, DocResult, DocxConfig } from './types';
/** What the caller hands over. */
export interface DocxInput {
    fileName: string;
    bytes: Uint8Array;
    config?: Partial<DocxConfig>;
}
/** Read a `.docx`. Never throws: every failure comes back as a BLOCKED result. */
export declare function readDocx(input: DocxInput): Promise<DocResult>;
/** Normalise a relationship target to a zip entry name. */
export declare function resolvePart(target: string): string;
/** `rId → { target, external }` from a relationships part. */
export declare function parseRelationships(xml: string): Map<string, {
    target: string;
    external: boolean;
}>;
/** Which paragraph style ids are headings, and at what level. */
export declare function parseHeadingLevels(stylesXml: string): Map<string, number>;
/**
 * Top-level `<w:p>` / `<w:tbl>` children of a fragment, in document order.
 *
 * WordprocessingML nests the same element names (a paragraph inside a table
 * cell), so the scan jumps past each element it has already consumed — which is
 * what keeps table cells from being emitted as body paragraphs.
 */
export declare function topLevelChildren(xml: string): {
    name: string;
    element: string;
}[];
/** Visible text of a fragment: `w:t` runs, tabs and breaks, in order. */
export declare function runText(xml: string): string;
/** Plain text of any fragment (cells, headers/footers, whole parts). */
export declare function plainText(xml: string): string;
/** A table: rows of cells, each cell's paragraphs joined by a space. */
export declare function tableBlock(tableXml: string): DocBlock;
