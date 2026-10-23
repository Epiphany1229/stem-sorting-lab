# 项目 Skills 目录

本目录用于存放本项目可复用的开发规范（Skill）。分两类，**来源必须可审计**。

## 一、外部下载（9 个，第三方原始内容）

均通过 `codeload.github.com` 下载仓库 tarball 后提取，未改写原文。每个目录内：

- `SKILL.md` —— 原始内容
- `SOURCE.md` —— 仓库、路径、ref、tarball ETag、文件 sha256、抓取时间
- `LICENSE.repo` —— 原仓库 LICENSE（若根目录存在）

| 目录 | 仓库 | 用途 |
|---|---|---|
| `test-driven-development` | obra/superpowers | 先写测试、红绿循环 |
| `verification-before-completion` | obra/superpowers | 交付前必须实跑验证命令 |
| `animate` | emilkowalski/skills | 动效设计原则 |
| `animation-performance` | emilkowalski/skills | 动画性能（含减少动画偏好） |
| `react-best-practices` | vercel-labs/agent-skills | React 19 实践（少用 useEffect 等） |
| `web-design-guidelines` | vercel-labs/agent-skills | 网页设计通用规范 |
| `responsive-testing` | spencerpauly/awesome-cursor-skills | 多视口响应式测试 |
| `accessibility-auditing` | spencerpauly/awesome-cursor-skills | 无障碍审计 |
| `impeccable` | pbakaus/impeccable | 视觉品质审查 |

> 抓取时间与 sha256 见各 `SOURCE.md`；抓取脚本记录在 `.tools/reference/skills_download_report.json`（不入库）。

## 二、项目专属（3 个，本地编写）

基于 `docs/PROJECT_REQUIREMENTS.md` 的硬性规范与本项目实测结论编写，**不是外部下载内容**：

| 目录 | 锁定什么 |
|---|---|
| `trace-and-code-sync` | 统一轨迹协议、唯一可信代码源、行映射规则、指标分账、可重复性 |
| `bilingual-a11y-lab-ui` | 繁中在上/英文在下的双语形态、颜色+图标+文字多通道、键盘与屏幕阅读器、响应式 |
| `hko-safe-fetcher` | `trust_env=False`、并发 1 + 3s interval、429/403 处理、缺失值不填 0、精度与窗口口径 |

## 说明

- 本项目的 DSH 会话在启动时已固定技能清单，**新增文件不会自动变成当前会话可调用的 skill 工具**；这些文件供后续会话/其他 agent 使用，本轮开发是按其内容手工执行的。
- 目录名选 `.claude/skills/` 是遵循请求中的约定；若后续切换工具约定，可整体迁移。
- 外部 Skill 的许可以其原仓库为准，本项目仅作内部开发参考。
