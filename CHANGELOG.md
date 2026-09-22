# Changelog — dsh-docx-sidebar

## 0.1.0 — 2026-09-22

首个版本：`.docx` 阅读视图（非版式还原），零运行时依赖。

### Added

- **文档预览器**（`registerFileViewer`，`exts: ['docx','docm']`，`fetchStrategy: 'custom'`）：从宿主 `/sidebar/file` 路由取归档字节，工作区路径围栏留在宿主侧。
- **解析**（`src/client/docx.ts`）：标题层级由 `styles.xml` 的样式**名称**决定（`heading N`），`w:outlineLvl` 兜底，id 尾数字不再误判（`List1` 不是标题）；段落与行内格式（粗/斜/下划线/等宽/`w:tab`/`w:br`）；`w:numPr`+`w:ilvl` → 列表缩进；`w:tbl` → 真表格（单元格不再重复成段）；页眉/页脚 → 带标签的 note 块。
- **图片**：从归档取出字节 → `blob:` URL（内联图在 zip 内，没有宿主路由可指），卸载/切换时 `revokeObjectURL` 回收；EMF/WMF/TIFF 等不可渲染格式 → 标注占位，不静默留空。
- **七道熔断**：归档大小 / 累计解压 / 单部件（三道容器闸门）+ 块数 / 单块文本 / 图片张数 / 单张图片。图片体积在目录里就超限时**不解压直接跳过**。
- **每个维度最多一条警告**：breaker 内部按 reason 建 Map，结构性防重（兄弟插件曾出现同维度双警告）。
- **测试**：14 项断言，夹具为现场构造的真实 docx zip（CRC32 + 中央目录 + 真 PNG），覆盖解析路径、五道闸门与 zh/en 占位符完整性；退出码 0/1。

### Notes

- 刻意不做：分页/页边距、字体与字号还原、浮动与锚定对象、分栏、修订痕迹、批注、编号序列重建、公式排版。界面顶部标注「阅读视图 —— 非版式还原」。
- 与 `dsh-opensheet-sidebar`（表格域）互不 import：插件自包含；共享代码待第三个使用者出现后再抽。
