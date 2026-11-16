# 在 GitHub 开源本项目的步骤

> 本文档由项目维护者准备。**当前环境没有 `gh` CLI，也没有配置 GitHub 凭据**，因此仓库尚未推送；
> 以下命令在你的本机（已登录 GitHub）执行即可完成开源。

## 0. 推送前已完成的准备（本仓库内）

- `LICENSE`：MIT（只覆盖代码）。
- `NOTICE`：香港天文台数据署名/非商业条款、demo 快照、第三方 Skills 许可。
- `CONTRIBUTING.md`：开发环境、提交前门禁、代码/双语/数据规范。
- `.github/workflows/ci.yml`：push/PR 自动跑后端 `ruff + mypy + pytest` 与前端 `tsc + vitest + build`。
- `.gitignore` 已排除：`.tools/`、`.venv/`、`app.db`、`frontend/dist/`、`.env`、
  `cloudflared.exe`、隧道 `config.yml`、`.reports/`。
- 仓库历史共 13+ 个提交，未包含 `.env`、数据库或密钥（已扫描）。

## 1. 在 GitHub 创建空仓库

1. 打开 <https://github.com/new>。
2. Repository name 建议：`stem-sorting-lab`（或 `hko-sorting-lab`）。
3. 选择 **Public**。
4. **不要**勾选 "Add a README / .gitignore / license"（本地已有，避免冲突）。
5. 创建后记下仓库地址，例如 `https://github.com/<你的用户名>/stem-sorting-lab.git`。

## 2. 绑定远程并推送

```bash
# 在仓库根目录（C:\Users\HwH\Desktop\AIET\Coding and thinking\GroupProject）
git remote add origin https://github.com/<你的用户名>/stem-sorting-lab.git

# 统一主分支名为 main（本地当前为 master）
git branch -M main

# 推送代码与所有里程碑标签
git push -u origin main
git push origin --tags
```

> 使用 SSH 时把地址换成 `git@github.com:<用户名>/stem-sorting-lab.git`。
> 使用 HTTPS 时，GitHub 不再接受密码，需要 Personal Access Token（classic 的 `repo` 权限，或 fine-grained 的 Contents: Read and write）。

## 3. 推送后设置（建议）

- **About**：填写一句描述，例如
  `Bilingual (zh-Hant/en) interactive STEM lab: Python sorting algorithms visualised with real Hong Kong Observatory weather data.`
- **Topics**：`python` `fastapi` `react` `typescript` `vite` `education` `algorithm-visualization` `hong-kong` `open-data` `bilingual`
- **License**：GitHub 会自动识别 MIT（来自 `LICENSE`）。
- **Actions**：确认 CI 首次运行通过（Settings → Actions → General 保持默认即可）。
- **Pages**：本项目**不能**只用 GitHub Pages 部署（后端是 Python）；公网演示请按 README「单端口 + Cloudflare Tunnel」。

## 4. 数据与合规提醒（重要）

- 代码是 MIT，但**气象数据版权属香港天文台**，遵循其非商业用途条款：必须署名、复现免责声明、不得出售、不得暗示官方背书。
  仓库与网站需保留 `NOTICE` 与页面上的数据来源声明。
- `sample_data/demo/` 是官方数据的真实快照，仅作离线演示，页面会标注「示範資料」。
- 不要把 `app.db`、`cloudflared.exe`、隧道 `config.yml`（可能含凭据）、`.env`、`report-assets/`（课程报告素材，可按需单独处理）提交到公开仓库。

## 5. 可选的发布后完善

- 增加截图/GIF（建议重新截取当前版本，`report-assets/` 中的 `/sources` 截图是旧占位版）。
- 在 README 顶部加 CI 徽章：
  `![CI](https://github.com/<用户名>/stem-sorting-lab/actions/workflows/ci.yml/badge.svg)`
- 如需长期在线演示，按 README「单端口 + Cloudflare Tunnel」或部署到 Fly.io / Render（需持久磁盘）。
