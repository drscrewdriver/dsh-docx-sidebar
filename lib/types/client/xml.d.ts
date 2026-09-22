/**
 * Targeted XML scanning. WordprocessingML is machine-generated and regular, so a
 * few well-defined scans beat a general parser — and they run in Node, which
 * keeps the parser unit-testable.
 */
/** Resolve entities and numeric escapes. */
export declare function decodeXml(text: string): string;
/** One attribute of a start tag, or undefined. */
export declare function attributeOf(tag: string, name: string): string | undefined;
/** The start tag that opens `xml`, or '' when it is a bare fragment. */
declare function head(xml: string): string;
/**
 * Every complete `<tag …>…</tag>` element, including nested ones up to their own
 * matching close. Returns `{ tag, inner }` per match, in document order.
 *
 * WordprocessingML nests the same element name (`w:p` inside `w:tc` inside
 * `w:tbl`), so a regex cannot balance it — this walks with a depth counter,
 * which is the whole reason it is not a one-liner.
 */
export declare function findElements(xml: string, tag: string): {
    tag: string;
    inner: string;
}[];
/** Every start tag of one element name (self-closing included). */
export declare function findAll(xml: string, tag: string): string[];
/** True when a start tag is self-closing. */
export declare function isSelfClosing(tag: string): boolean;
/** First `<tag …>` start tag, or undefined. */
export declare function firstTag(xml: string, tag: string): string | undefined;
/** Text content of every `<tag>` element, concatenated. */
export declare function textOf(xml: string, tag: string): string;
/** The tag's own name from a start tag. */
export declare function tagName(tag: string): string;
/** Re-exported for callers that need the opening tag of a fragment. */
export { head };
