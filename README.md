# dsh-docx-sidebar

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

## 二、读取管线

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

## 三、熔断（七道）

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

## 四、构建与验证

```bash
npm run build     # esbuild 双入口 + tsc 类型声明；构建期用 node:vm 真加载一次 bundle 并断言 apply/inject
npm test          # 14 项断言
npm run verify    # build && test
```

测试夹具是**现场构造的真实 docx zip**（正确的 CRC32 与中央目录，引用一张真 1×1 PNG），覆盖：样式名判定标题（`List1` 不得误判）、行内格式、列表层级、表格且单元格不重复成段、EMU→px、不可渲染格式占位、页眉 note 与 External 关系忽略、计数自洽，以及五道闸门与 zh/en 占位符完整性。

## 五、安装

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

## 六、与 `dsh-opensheet-sidebar` 的关系

表格（csv/xlsx）与文档（docx）**按能力域分成两个插件**，各自自包含：插件之间不做 import —— 那会造出两个"软依赖"插件之间的硬耦合与安装顺序陷阱。共享的 zip/解压预算代码各持一份；等到出现**第三个**使用者再考虑抽公共包（阈值驱动，而不是提前设计）。
