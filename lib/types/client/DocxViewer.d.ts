import type { T } from './locales';
interface DocxViewerProps {
    path: string;
    title?: string;
    /** Raw archive bytes, from the registered `custom` loader. */
    customData?: unknown;
    t: T;
}
export declare function DocxViewer({ path, title, customData, t }: DocxViewerProps): import("react").JSX.Element;
export {};
