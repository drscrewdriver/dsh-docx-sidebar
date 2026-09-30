# dsh-docx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> ⛔ **本项目已停止维护（2026-10-01）。** DSH 宿主较新版本已内置 office 文档的侧栏预览，本插件不再单独维护、不再发版，也不参与后续宿主版本线适配。已发布版本仍可安装使用；0.1.x 宿主请使用冻结分支 `compat/0.1.7` / `compat/0.1.5` 的对应版本。

在 DSH 右侧栏阅读 `.docx`（[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 消费者）：标题层级、段落、列表缩进、**真表格**、内联图片，带熔断保护。

> **这是阅读视图，不是版式还原。** 界面顶部直接标着这句话 —— 不做分页、不还原字体、不处理浮动/分栏/修订痕迹。让用户误以为排版差异是 bug，比明说能力边界更糟。

## 一、做到什么 / 不做什么

| 做到 | 说明 |
|------|------|
| 标题层级 | 由 `styles.xml` 的样式**名称**决定（`heading 1` → `w:h1`），不靠 id 尾数字猜；`w:outlineLvl` 兜底 |
| 段落与行内格式 | 粗体、斜体、下划线、`w:tab`/`w:br`、等宽（`rStyle`/`rFonts` 命中 monospace） |
| 列表 | `w:numPr` + `w:ilvl` → 缩进层级（不重建编号序列） |
| 表格 | `w:tbl` → `w:tr` → `w:tc`，单元格内多段落合并；**不会再作为正文段落重复出现** |
| 图片 | 从归档里取出字节 → `blob:` URL（内联图在 zip 内，没有宿主路由可指）；EMF/WMF/TIFF 渲染不了 → 标注占位 |
| 页眉/页脚 | 作为带标签的 note 块置顶/置底 |
| 公式 | 不排；只显示文件里存的文本 |

**不做**：分页与页边距、字体与字号还原、浮动/锚定对象、分栏、修订痕迹（`w:ins`/`w:del`）、批注、编号序列重建、公式排版。

## 二、宽度自适应

侧栏面板可拖动，阅读视图因此随宽度缩放 —— **但有上下限**，「自适应」不是无限放大或无限缩小的许可：

| 旋钮 | 取值 | 理由 |
|------|------|------|
| 基准宽度 | 360px | 此宽度下比例**恰为 1**，即常见的面板宽度渲染出的就是 0.1.0 那套版式 |
| 下限 | 0.9× | 面板再窄，字也要能读 |
| 上限 | 1.15× | 面板再宽也只是舒适，不是巨大 |
| 量化 | 两位小数 | 拖动只在 0.01 台阶上重排，不是每像素 |

比例由容器宽度推出，写进 CSS 变量 `--reader-scale`；根字号为 `13px × 比例`，正文全部用 `em`，所以文字是**重新折行**到新字号，而不是整体 `transform` 缩放（那会让字发虚）。

**只有文档内容缩放。** 标题、段落、列表、代码、备注、表格与图片说明跟随比例；**信息条、页眉页脚标签以外的界面元素、熔断横幅、加载/空态保持固定字号** —— 拖分隔条时界面文字跟着变会像故障，而不是像自适应。

两个相关决定：

- **不可测量的宽度回退到 1，而不是取极值。** 首帧宽度是 0，若按「尽可能窄」渲染，每次打开文档都会闪一下极小字号。
- **图片不参与缩放。** 按文档声明的尺寸显示，仅以面板宽度封顶；把位图放大到超过原始尺寸去追字号只会更糊，谈不上更还原。

## 三、读取管线

```
归档字节（宿主 /sidebar/file 路由，二进制）
  → 中央目录（声明的解压体积前置核对）
  → 流式解压 + 字节预算（边解压边计数，越界即 cancel）
  → word/document.xml           正文块（顺序扫描，跳过表格内部的段落）
  → word/_rels/document.xml.rels  rId → 图片 / 页眉页脚目标（External 忽略）
  → word/styles.xml             样式 id → 标题层级
  → word/media/*                图片字节（按需，超限直接跳过、不解压）
```

零运行时依赖：zip 解压用浏览器原生 `DecompressionStream('deflate-raw')`，XML 用针对性扫描（WordprocessingML 是机器生成的规整结构，且正则**无法**平衡同名嵌套，所以 `findElements` 用深度计数）。

## 四、熔断（七道）

| 维度 | 默认 | 越界后 |
|------|------|--------|
| 归档大小 | 5 MB | BLOCKED（未解压任何东西） |
| 累计解压 | 64 MB | BLOCKED —— 抗 zip 炸弹 |
| 单个部件 | 32 MB | BLOCKED |
| 块数 | 5 000 | TRUNCATED，停止读取 |
| 单块文本 | 20 000 字符 | 该块省略 + 警告 |
| 图片张数 | 200 | 跳过后续 + 警告 |
| 单张图片 | 8 MB | 该图跳过（**体积在目录里就超限则不解压**）+ 警告 |

> **每个维度最多一条警告**是结构性保证（breaker 内部按 reason 建 Map），不是约定：同一维度触发两次会在横幅上渲染两行几乎一样的字 —— 兄弟插件曾因此发过一个补丁版。

被熔断的结果是一等公民：BLOCKED 渲染成可读的错误卡，永不抛异常、永不无限转圈。

## 五、构建与验证

```bash
npm run build     # esbuild 双入口 + tsc 类型声明；构建期用 node:vm 真加载一次 bundle 并断言 apply/inject
npm test          # 14 项断言
npm run verify    # build && test
```

测试夹具是**现场构造的真实 docx zip**（正确的 CRC32 与中央目录，引用一张真 1×1 PNG），覆盖：样式名判定标题（`List1` 不得误判）、行内格式、列表层级、表格且单元格不重复成段、EMU→px、不可渲染格式占位、页眉 note 与 External 关系忽略、计数自洽，以及五道闸门与 zh/en 占位符完整性。

## 六、安装

```bash
# 官方 CLI（推荐；会一并维护依赖与 dsh.profile.bundles）
dsh plugin --profile <profile> add <path | npm 包 | github:owner/repo#<sha>>
```

手动安装是三步，缺一不可（只做第 1、3 步 = 插件永不加载且不报错）：① 复制到 profile 的 `node_modules/`；② 把 `dsh-docx-sidebar` 加进该 profile `package.json` 的 `dsh.profile.bundles`；③ 把本包 `cordis.patch.yml` 的 insert 行追加到 profile 的 `cordis.patch.yml`。

装完先离线验证再重启：

```powershell
dsh --profile <profile> --dump-config | Select-String dsh-docx-sidebar
```

**依赖**：`dsh-better-sidebar >= 0.18.1`（可选）。缺席时插件正常加载、控制台 warn、不贡献任何条目。

**兼容矩阵**：

| 插件版本 | DSH 宿主范围 | 说明 |
|---------|-------------|------|
| 0.3.0 | `>=0.2.0-rc.1 <0.2.1-0` | 0.2.0 线（`main`，自 `compat/0.2.0` 升格）。纯元数据适配：消费面全部是 `ctx.get(...)` 纯 caller，0.2.0-rc.1 对 0.1.7 插件 API 完全兼容 |
| 0.2.0 | `>=0.1.5-rc.1 <0.2.0-0` | 由冻结分支 `compat/0.1.7` / `compat/0.1.5` 服务 |

`package.json` 的 `engines.dsh`、`@deepseek-ai/dsh-client-locale` peer 与 `dsh.plugin.json` 的 `engines.dsh` 三处同范围、保持一致。

## 七、与 `dsh-opensheet-sidebar` 的关系

表格（csv/xlsx）与文档（docx）**按能力域分成两个插件**，各自自包含：插件之间不做 import —— 那会造出两个"软依赖"插件之间的硬耦合与安装顺序陷阱。共享的 zip/解压预算代码各持一份；等到出现**第三个**使用者再考虑抽公共包（阈值驱动，而不是提前设计）。

## 多语言说明 / Sprachen / Langues / Языки / Idiomas / Lingue

本 README 以中文撰写。安装与兼容性速览（本线要求 DSH 0.2.0：`>=0.2.0-rc.1 <0.2.1-0`；安装：`dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`）：

- **Deutsch** — benötigt DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), getestet gegen DSH 0.2.0-rc.1. Installation: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Die 0.1.x-Wirtslinie wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` (npm-Tags `dsh-0.1.7` / `dsh-0.1.5`) versorgt.
- **Français** — nécessite DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testé avec DSH 0.2.0-rc.1. Installation : `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La lignée d'hôtes 0.1.x est assurée par les branches figées `compat/0.1.7` / `compat/0.1.5` (tags npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Русский** — требуется DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), протестировано на DSH 0.2.0-rc.1. Установка: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. Линия хостов 0.1.x обслуживается замороженными ветками `compat/0.1.7` / `compat/0.1.5` (npm-теги `dsh-0.1.7` / `dsh-0.1.5`).
- **Español** — requiere DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), probado con DSH 0.2.0-rc.1. Instalación: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La línea de anfitriones 0.1.x la atienden las ramas congeladas `compat/0.1.7` / `compat/0.1.5` (etiquetas npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Italiano** — richiede DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`), testato su DSH 0.2.0-rc.1. Installazione: `dsh plugin --profile <profile> add dsh-docx-sidebar@dsh-0.2.0`. La linea di host 0.1.x è servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` (tag npm `dsh-0.1.7` / `dsh-0.1.5`).
