# 无障碍结构审计（axe 结构规则子集）

本仓 verify 门挂载了第六波的无障碍结构审计（EKPO 试点后复制）。本
文件说明它的口径、接入点、覆盖面与基线维护方式。先说清边界：

- 审计对象是 jsdom 渲染后的 DOM，运行的是 **axe 结构规则子集**
  （axe-core 的 wcag2a / wcag2aa / wcag21a / wcag21aa 标签集，减去
  下列禁用规则）。jsdom 无布局、无绘制，本审计只查结构与 ARIA 语义。
- **本审计不构成合规结论**：颜色对比、焦点可见性、键盘顺序、真实
  播报质量都不在覆盖内，不得据此宣称页面符合 WCAG 或已通过无障碍
  验收。
- 本审计只读渲染结果，**不触碰孩子专区/孩子模式的任何逻辑**；审计
  结束后孩子池口径（小学组 verified 144 / 天文子集 110）照旧复核。

## 覆盖面与未覆盖面（本仓实情）

- 已覆盖：初始视图 + 6 个主标签页（首页、学习、知识库、读报、
  错题、我的），由 harness 枚举 `[data-tab]` 并调用页面自身的
  `go(page)` 逐个切换渲染后审计（本仓没有 `switchTab`，标签栏由
  委托点击驱动，`go` 是等价的页面自身导航入口）。
- 环境补全（harness 侧，缺了应用在 jsdom 里根本启不来）：本仓主
  脚本顶层有两处真实浏览器才有的能力调用——星空背景的 canvas
  `getContext('2d')` 与题库证据清单的顶层 `fetch`。jsdom 缺这两
  项时脚本会在顶层抛错中断、整个应用无法启动。harness 用
  `@napi-rs/canvas`（jsdom 官方配套）与一个只读本仓文件的最小
  fetch 把环境补齐到浏览器启动条件；补齐后 pageErrors 只剩
  jsdom 未实现 `window.scrollTo` 的提示（`go()` 每次都会调用
  它），不是应用错误，7 个视图全部完成渲染。
- 未覆盖（如实声明，以下部分的违规数不在基线内）：
  - **孩子模式内部视图**：孩子专区界面需从首页点「进入孩子模式」
    才切换，walker 只走顶层标签页、未进入孩子模式，其内部控件
    未被审计；
  - 练习 / 考试 / 结果 / 学习详情等子页面（practice / exam /
    result / learnDetail）不在标签栏内，未被审计；读报详情页
    同理；
  - 天文课堂与模拟实验的 canvas 绘制内容只验 DOM 结构、不验
    绘制本身。

## 基线违规概览（存量，只登记未修）

共 15 条：`label` 3 条（读报器语速/音量/音调三个 range 滑杆旁的
`<label>` 未与控件关联）+ `label-content-name-mismatch` 12 条
（天文课堂主题按钮的可见文字是「专项练习 ↗」、aria-label 却是
「练习知识主题 X」，可访问名不含可见文字）。逐条定位在基线文件内。

## 禁用规则（jsdom 下不可靠，逐项写明）

| 规则 | 禁用理由 |
|---|---|
| `color-contrast` | jsdom 无渲染引擎，计算颜色来自不完整的 CSS 级联、无布局无绘制，对比度数值不可信，需真浏览器 |
| `color-contrast-enhanced` | 同上（AAA 变体） |
| `link-in-text-block` | 需区分链接与周围文字的真实颜色/下划线渲染，jsdom 无法忠实复现 |
| `css-orientation-lock` | 依赖对真实视口/设备方向的媒体查询求值，jsdom 只有固定假视口 |

禁用清单同时固化在 `docs/a11y-baseline.json` 与每次运行的
`artifacts/a11y-report.json` 里，改动必须同步改这两处与 harness 源码。

## 接入形态（仓外共享 harness）

- 本仓**零依赖纪律不变**：jsdom 与 axe-core 不进本仓 `package.json`，
  它们只装在 goal 工作区的共享 harness 里
  （`goals/seven-repo-deep-optimization-and-app-releases/hidden_files/wave6-a11y-harness/`），
  harness 以仓库路径为参数运行，六仓共用一份。
- `scripts/verify.cjs` 的 `a11y-audit` 步按以下顺序找 harness：
  环境变量 `A11Y_HARNESS_DIR` → 本 checkout 同级 goal 工作区的默认
  路径。找不到 harness 时该步记 `skipped`（与浏览器步同一政策），
  不记 pass；在装有 harness 的机器上它真跑并把违规数、基线数、
  新增/已解决数写进 `artifacts/verify-report.json` 该步的 `details`，
  完整报告落 `artifacts/a11y-report.json`。

## 基线纪律

- `docs/a11y-baseline.json` 是当前存量违规基线（生成日期与逐条定位
  都在文件内）。verify 只拦**基线之外的新增违规**：新增即该步红。
- 存量违规逐项修：修掉一条，基线就应缩一条。刷新基线是显式动作，
  不许为了让门变绿而无理由重刷：

```bash
node <harness>/run-a11y.cjs --repo <本仓路径> \
  --baseline docs/a11y-baseline.json --write-baseline
```

- 基线文件带生成日期；发布对账周跑会顺带检查基线是否长期不动。
