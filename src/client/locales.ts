/**
 * Plugin-owned dictionaries, registered through the DSH locale service under our
 * own namespace. `en` is the fallback; a missing key renders the key itself,
 * never a blank, so a translation gap is visible instead of silent.
 */

/** Namespace for every key below. */
export const NS = 'dsh-docx-sidebar'

/** The two built-in languages this plugin ships. */
export const dictionaries: Record<string, Record<string, string>> = {
  en: {
    'viewer.title': 'Document',
    'doc.badge': 'reading view — not a layout reproduction',
    'doc.units': '{blocks} blocks · {images} images',
    'doc.unitsSkipped': '{n} images skipped',
    'doc.header': 'header',
    'doc.footer': 'footer',
    'doc.empty': 'Nothing to show',
    'doc.emptyHint': 'This document has no body content.',
    'doc.blocked': 'Blocked by the circuit breaker',
    'doc.blockedHint': 'This file exceeds a ceiling. Narrow it down first, or open it elsewhere.',
    'doc.table': 'table {rows}×{cols}',
    'doc.image': 'image',
    'doc.imageUnsupported': 'not drawn ({kind})',
    'doc.imageSkipped': 'image skipped',
    'state.loading': 'Reading…',
    'state.error': 'Could not read this document',

    'warning.blockedTitle': 'Too large to read — blocked',
    'warning.truncatedTitle': 'Content truncated to keep the tab responsive',
    'warning.file-size': 'Archive is {found} — the ceiling is {limit}',
    'warning.container-error': 'This file cannot be read: {message}',
    'warning.inflated-bytes': 'This archive unpacks to {found} — past the {limit} budget, so it was refused',
    'warning.part-bytes': 'One part unpacks to {found} — past its {limit} ceiling',
    'warning.blocks': '{kept} of at least {found} blocks shown',
    'warning.text-length': 'One block held {found} characters — elided at {limit}',
    'warning.images': 'Only the first {kept} images are shown ({found} found)',
    'warning.image-bytes': 'An image is {found} — past its {limit} ceiling, so it was skipped',
    'warning.parse-error': 'The document is malformed: {message}',
  },
  zh: {
    'viewer.title': '文档',
    'doc.badge': '阅读视图 —— 非版式还原',
    'doc.units': '{blocks} 个块 · {images} 张图',
    'doc.unitsSkipped': '跳过 {n} 张图',
    'doc.header': '页眉',
    'doc.footer': '页脚',
    'doc.empty': '没有可显示的内容',
    'doc.emptyHint': '该文档没有正文内容。',
    'doc.blocked': '已被熔断器阻止',
    'doc.blockedHint': '文件超过上限，请先切分或改用其他方式打开。',
    'doc.table': '表格 {rows}×{cols}',
    'doc.image': '图片',
    'doc.imageUnsupported': '未绘制（{kind}）',
    'doc.imageSkipped': '图片已跳过',
    'state.loading': '正在读取…',
    'state.error': '无法读取该文档',

    'warning.blockedTitle': '文件过大，已阻止读取',
    'warning.truncatedTitle': '内容已截断，以保证侧栏不卡死',
    'warning.file-size': '归档 {found}，上限 {limit}',
    'warning.container-error': '无法读取该文件：{message}',
    'warning.inflated-bytes': '该归档解压后达 {found}，超过 {limit} 预算，已拒绝加载',
    'warning.part-bytes': '某个部件解压后达 {found}，超过 {limit} 上限',
    'warning.blocks': '共至少 {found} 个块，已显示前 {kept} 个',
    'warning.text-length': '某个块有 {found} 字符，已在 {limit} 处省略',
    'warning.images': '仅显示前 {kept} 张图片（共 {found} 张）',
    'warning.image-bytes': '某张图片 {found}，超过 {limit} 上限，已跳过',
    'warning.parse-error': '文档格式异常：{message}',
  },
}

/** Values substituted into a `{placeholder}` template. */
export type TVars = Record<string, string | number>

/** A translate function bound to the plugin namespace. */
export type T = (key: string, vars?: TVars) => string

/** Substitute `{name}` placeholders; unknown placeholders stay literal. */
export function interpolate(template: string, vars?: TVars): string {
  if (vars === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

/** Build a `T` from a raw dictionary — used when no locale service exists. */
export function translatorFrom(dict: Record<string, string>): T {
  return (key, vars) => interpolate(dict[key] ?? key, vars)
}
