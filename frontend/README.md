# 前端脚手架（阶段 1）

面向初学者的互动 STEM 教学网站前端：Python 排序算法 + 香港天文台气象数据。
本目录当前只包含**阶段 1** 的骨架：项目配置、设计 tokens、双语组件、7 页导航与状态页。
**尚未实现**排序可视化、Python 代码同步高亮与气象图表，相关页面均标注「開發中 / In development」。

## 运行

依赖已用 pnpm 安装（`pnpm-lock.yaml` 锁定）。在本目录执行：

```powershell
# pnpm 由仓库 .tools/bin/pnpm.cmd 提供
$env:Path = "<repo>\.tools\bin;" + $env:Path
$env:npm_config_store_dir = "<repo>\.tools\pnpm-store"
$env:npm_config_cache_dir = "<repo>\.tools\pnpm-cache"

# 重要（DSH 沙箱）：pnpm 的全局 store 操作锁写在 %USERPROFILE%\AppData\Local，
# 该位置在沙箱外会被拒写，因此把 USERPROFILE 指到工作区内再安装：
$env:USERPROFILE = "<repo>\.tools\userprofile"

pnpm install
pnpm dev        # 开发服务器 http://localhost:5173
pnpm build      # 产出 dist/
pnpm test:run   # Vitest 一次性运行
pnpm exec tsc --noEmit
```

后端未启动时，`/api` 请求会失败，但阶段 1 的页面本身不发起任何请求。
`vite.config.ts` 已把 `/api` 代理到 `http://127.0.0.1:8000`（本项目 FastAPI 后端），
浏览器端**绝不**直接请求香港天文台。

### 沙箱限制与对应处理（重要，避免误判为项目缺陷）

1. **pnpm 12 原生版**在当前 DSH 沙箱下有两处环境问题，已在项目里绕开：
   - 全局 store 操作锁位于 `%USERPROFILE%\AppData\Local`，沙箱外写入被拒
     （`ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`）→ 安装前重定向 `USERPROFILE` 到工作区内。
   - 默认 `isolated` 链接器会在本机触发原生栈溢出（`thread ... has overflowed its stack`）→
     `pnpm-workspace.yaml` 固定 `nodeLinker: hoisted`。
2. `pnpm run` 默认会先做依赖校验安装，同样会撞上 store 锁；`pnpm-workspace.yaml` 已设置
   `verifyDepsBeforeRun: false`。
3. Vite 在 Windows 上首次解析路径时会执行一次 `net use` 探测网络驱动器，沙箱禁止管道派生子进程
   （`spawn EPERM`）→ `scripts/sandbox-guard.cjs` 把该探测降级为失败回调，scripts 里统一用
   `node --require ./scripts/sandbox-guard.cjs ...` 启动 Vite / Vitest。
4. 构建链选用 **Vite 8（rolldown，进程内原生绑定）**，而不是 Vite 7：Vite 7 的 esbuild
   需要派生子进程，在沙箱内直接 `spawn EPERM`。
5. Vitest 使用 `pool: "threads"`（默认 forks 池同样需要 fork 子进程）。
6. 若 pnpm 完全不可用，可临时回退：
   `npm install --ignore-scripts --legacy-peer-deps`（不生成 pnpm-lock，仅作应急）。

## 目录

```
frontend/
├─ index.html
├─ package.json
├─ pnpm-lock.yaml / pnpm-workspace.yaml   # 锁定依赖 + 沙箱兼容设置
├─ vite.config.ts          # Vite 8 + Tailwind v4 插件 + Vitest 配置
├─ tsconfig.json
├─ components.json         # 为后续引入 shadcn/ui 预留（Tailwind v4 无 tailwind.config.js）
├─ scripts/sandbox-guard.cjs
├─ .env.example            # VITE_API_BASE_URL=/api
└─ src/
   ├─ main.tsx / App.tsx   # BrowserRouter + 路由表
   ├─ navigation.ts        # 7 个页面名称/状态/路径的单一数据源
   ├─ api/client.ts        # 只指向本项目后端的 fetch 封装与 QueryClient
   ├─ i18n/
   │  ├─ dictionary.ts     # zh-Hant + en 成对字典
   │  └─ BilingualText.tsx # 中文在上、英文在下的双语组件
   ├─ styles/
   │  ├─ tokens.css        # 设计 tokens（颜色/字体/圆角/阴影/动效）
   │  └─ global.css        # @import "tailwindcss" + 双语排版样式
   ├─ layouts/AppLayout.tsx
   ├─ components/          # 页头、面包屑、返回入口、状态徽标等
   ├─ pages/               # 7 个页面 + 404
   └─ data/algorithms.ts   # 十种算法入口与状态
```

## 双语实现

- 每个 key 在 `dictionary.ts` 里都是 `{ "zh-Hant": "...", en: "..." }`，组件内禁止硬编码中文。
- `BilingualText` 渲染一个纵向堆叠的整体：中文 17px（主层级）+ 英文 14px（次层级），间距 3px；
  标题层级用 `clamp()` 放大。两者分别带 `lang="zh-Hant"` / `lang="en"`。
- 英文节点使用 `aria-hidden="true"`，屏幕阅读器只朗读一遍繁体中文，避免重复播报；
  英文仍完整显示，不省略、不截断。按钮与导航链接始终是**一个**交互元素。
- 状态徽标同时用颜色、圆点和文字表达，不只依赖颜色。
- 字典单测会扫描常见简体字，防止简体文案混进学生可见界面。

## 已知问题 / 后续计划

- **Tailwind v4 + shadcn/ui**：项目已按 v4 方式接入（`@import "tailwindcss"` + `@tailwindcss/vite`），
  并附 `components.json`、`@/lib/utils` 的 `cn()` 与 tsconfig/vite 的 `@` 别名；
  但本阶段未生成任何 shadcn 组件，等阶段 2 起按需 `add` 并逐个验证。
- **字体**：目前只用系统字体栈（Noto Sans TC / PingFang TC / Microsoft JhengHei 优先），
  不下载 Web 字体；若后续要自托管 Noto Sans TC 子集，需评估体积与许可。
- **lint**：`pnpm lint` 目前等同 `tsc --noEmit`；ESLint 未引入，避免本阶段新增依赖。
- 阶段 1 页面不请求任何后端数据；`loading` / `error` 双语文案已进字典，供后续接口接入使用。
- 首页「可立即操作的小型排序展示」与学习路径的互动预览按阶段规划留到阶段 2，
  首页当前给出路径与入口，不伪造排序动画。
