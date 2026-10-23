# 环境与可行性审计报告（阶段 1 前置）

- 审计日期：2026-10-23（Asia/Shanghai）
- 审计方式：在本项目工作目录下由 DSH 受控终端（Windows PowerShell 5.1，`workspace-write` 沙箱）实际执行命令；每条结论附实际命令与关键输出摘录。
- 原则：只记录**实际执行**的结果。未执行的写「未验证」。本机 Schannel 类工具全部故障（见 §2），因此凡涉及外网连通性的结论均同时给出所用客户端，避免以单一客户端代表整体网络。
- 标注约定：`[本报告实测]` = 本次执行；`[Lead 实测]` = 由 Team Lead 独立执行、本报告直接采用；`[推断]` = 由实测结果推导，非直接观测。

---

## 1. 工具链版本表

| 工具 | 实测结果 | 命令 | 关键输出 / 说明 |
|---|---|---|---|
| Windows | Windows 11 系（Build 22621 家族） | `$PSVersionTable.PSVersion` | `5.1.22621.4391`（Windows PowerShell，原生参数引号传递有缺陷） |
| Python（首要） | **3.10.4** | `py -3.10 --version` | `Python 3.10.4` |
| Python 路径 | `C:\Users\HwH\AppData\Local\Programs\Python\Python310\python.exe` | `py -3.10 -c "import sys;print(sys.executable)"` | 与 Lead 的 `py -0p` 一致 |
| Python 构建 | MSC v.1929 64 bit (AMD64) | 同上（`sys.version` 全文） | `3.10.4 (tags/v3.10.4:9d38120, Mar 23 2022 ...)` |
| OpenSSL | **1.1.1n  15 Mar 2022** | `py -3.10 ... ssl.OPENSSL_VERSION` | 已属 EOL 分支（见 §5 B5） |
| py launcher | `C:\Windows\py.exe` | `where.exe py` | `C:\Windows\py.exe` |
| 其它解释器 | 另有 Python 3.9（Miniconda） | `py -0p` | `-3.10-64 ...Python310\python.exe`、`-3.9-64 C:\ProgramData\Miniconda3\python.exe` |
| `python` 命令 | **不在 PATH** | `where.exe python` | `INFO: Could not find files for the given pattern(s).`（与 Lead 已知事实一致） |
| pip | **22.0.4** | `py -3.10 -m pip --version` | `pip 22.0.4 from ...\Python310\lib\site-packages\pip (python 3.10)` |
| uv | **未安装** | `uv --version` | `无法将"uv"项识别为 ... CommandNotFoundException` |
| Node.js | **v22.22.0** [Lead 实测，本次复核] | `node -v` | `v22.22.0` |
| npm | **10.9.4** | `npm -v` | `10.9.4` |
| corepack | **0.34.0**（可用） | `corepack --version` | `0.34.0`；`where corepack` → `C:\Program Files\nodejs\corepack` |
| pnpm | **未安装** | `where.exe pnpm` | `INFO: Could not find files for the given pattern(s).` |
| npm 全局包 | 无 pnpm/vite 等 | `npm ls -g --depth=0` | `asar@3.2.0`、`create-vite@8.3.0`、`electron-packager@17.1.2` |
| npm global prefix | `C:\Users\HwH\AppData\Roaming\npm` | `npm config get prefix` | 位于工作区之外（沙箱写入受限，见 §5 B7） |
| git | **2.56.0.windows.2** | `git --version` | `git version 2.56.0.windows.2` |
| Docker CLI | **28.1.1 (4eba377)** | `docker --version` | `Docker version 28.1.1, build 4eba377` |
| Docker Compose | **v2.35.1-desktop.1** | `docker compose version` | `Docker Compose version v2.35.1-desktop.1`（daemon 是否运行**未验证**） |
| curl.exe | **8.12.1 (Schannel)** | `curl.exe --version` | `curl 8.12.1 (Windows) libcurl/8.12.1 Schannel zlib/1.3 WinIDN` |
| venv 模块 | 可用 | `py -3.10 -m venv --help` | 正常输出 usage |

### 1.1 已安装 Python 包（`py -3.10 -m pip list`）

```
asgiref 3.11.1 / Django 5.2.11 / django-cors-headers 4.9.0 / mysqlclient 2.2.8
pip 22.0.4 / PyMySQL 1.1.2 / setuptools 58.1.0 / sqlparse 0.5.5
typing_extensions 4.15.0 / tzdata 2025.3
```

**需求技术栈所需的后端与质量包一个都没有**：`fastapi`、`uvicorn`、`pydantic`、`pydantic-settings`、`httpx`、`pandas`、`SQLAlchemy`、`pytest`、`pytest-asyncio`、`hypothesis`、`ruff`、`mypy` 均不在列表中。该 Python 3.10 目前是「Django + MySQL」用途的独立环境，不是本项目的环境。

---

## 2. 网络与 TLS 结论表

### 2.1 结论汇总

| 客户端 | 目标 | 结果 | 依据 |
|---|---|---|---|
| `curl.exe`（Schannel） | `https://data.weather.gov.hk/...rhrread` | **失败** | `curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)`，`http=000` |
| `curl.exe`（Schannel） | `https://pypi.org/pypi/pydantic/json` | **失败** | 同上 `SEC_E_NO_CREDENTIALS`，`http=000` |
| `curl.exe -x http://127.0.0.1:10809`（走本地代理） | 上述两个目标 | **失败** | 同上，`http=000`（失败在 TLS 栈，不在网络路径） |
| `Invoke-WebRequest`（.NET/WinINET） | HKO | **失败** | `基础连接已经关闭: 接收时发生错误。`；inner `安全包中没有可用的凭证`（即 SEC_E_NO_CREDENTIALS） |
| `[System.Net.WebRequest]` 且 `Proxy=$null`（.NET 直连） | HKO | **失败** | 同样的 `基础连接已经关闭`（确认与代理无关，是 Schannel 凭据层） |
| **Python 3.10 + OpenSSL，直连（`ProxyHandler({})`）** | **HKO rhrread** | **成功** | `OK status=200 elapsed=10.24s`，正文为真实 JSON：`b'{"rainfall":{"data":[{"unit":"mm","place":"Central & Western District","max":0,...` |
| **Python 3.10 + OpenSSL，直连** | `https://pypi.org/pypi/pydantic/json` | **成功** | `OK status=200 elapsed=0.39s` |
| Python 3.10，默认 opener（自动套用注册表代理） | HKO rhrread | **失败** | `URLError: <urlopen error [Errno 2] No such file or directory>`（22.55s） |
| Python 3.10，显式 `http://127.0.0.1:10809` | HKO rhrread | **失败** | 同上 `URLError [Errno 2]`（21.64s） |
| Python 3.10，默认 opener | pypi.org | 成功但慢 | `status=200`，22.20s（直连仅 0.39s） |
| Python 3.10 + `http.client.HTTPSConnection` 直连 [Lead 实测] | HKO | **成功** | HTTP 200，真实 rhrread JSON；`ssl` 裸握手到 `103.30.70.56:443` → TLSv1.3 成功 |
| 原始 TCP [本报告实测] | `data.weather.gov.hk:443` | 连通 | `socket.create_connection` OK，0.93s，peer `('103.30.70.56', 443)`；DNS `AF_INET 103.30.70.56` |
| pip 22.0.4（默认配置） | Tsinghua 镜像 + PyPI | **失败** | `SSLError(SSLEOFError(8, 'EOF occurred in violation of protocol (_ssl.c:997)'))` |
| **pip 22.0.4 + `NO_PROXY=*`（绕过代理）** | **PyPI** | **成功** | `Downloading six-1.17.0-py2.py3-none-any.whl (11 kB)` / `Successfully downloaded six`，落盘 11,050 字节 |
| npm 10.9.4（Node/OpenSSL） | `registry.npmjs.org` | **成功** | `npm view vite version` → `8.3.5`；`npm config get registry` → `https://registry.npmjs.org/` |

### 2.2 关键判定：TLS 栈本身没问题，故障在 Windows Schannel 与本机代理配置

1. **Schannel 层是机器级故障，不是目标站点问题**：`curl.exe` 对 HKO **和** PyPI **和** 经代理三条路径全部返回 `SEC_E_NO_CREDENTIALS`；.NET 走 Schannel 同样报「安全包中没有可用的凭证」。因此本机**不能**用 curl / Invoke-WebRequest 判定任何站点是否可达。
2. **Python 的 OpenSSL 栈完全正常**：同一解释器、同一 URL、同一时刻，仅切换「是否用注册表代理」这一个变量：
   - `ProxyHandler({})`（直连）→ HKO **200 + 真实 JSON**
   - 默认 opener（用注册表代理）→ HKO `URLError [Errno 2]`
   - 显式 `http://127.0.0.1:10809` → HKO `URLError [Errno 2]`
   → 这是受控对照实验，结论是：**阻断发生在 `127.0.0.1:10809` 这条代理路径上，而非 HKO 主机或 DNS**。同一代理对 PyPI 却是「能通但慢」（8～22s vs 直连 0.39s），说明该代理对 `data.weather.gov.hk` 的转发失败，其余域名勉强可用。
3. **`[Errno 2] No such file or directory` 不是「文件缺失」**：它出现在 `http/client.py` 的 `_send_request → endheaders`（socket 发送阶段），是代理连接被异常中断后在 CPython 侧的错误映射。此现象**不适用于**直连。
   - 与 Lead 观察到的现象（默认 `urllib.request.urlopen` 访问 `*.hko.gov.hk` 全失败）**一致**；本报告补充了成因定位与「直连可成功」的反证。
4. **`https://` 前缀的代理值本身也是隐患**：`urllib.request.getproxies()` 返回 `{'https': 'https://127.0.0.1:10809'}`，即 Python 会先对本机代理做 TLS 再 CONNECT，而该端口是普通 HTTP 代理 → 进一步解释了 `EOF occurred in violation of protocol` 类错误（pip/requests 路径）。

---

## 3. 代理线索（解释「web_fetch 能通而本机不能」）

| 检查项 | 命令 | 实际输出 |
|---|---|---|
| WinHTTP 代理 | `netsh winhttp show proxy` | `Current WinHTTP proxy settings: Direct access (no proxy server).` |
| 代理环境变量 | `[Environment]::GetEnvironmentVariable(...)` 遍历 | `HTTP_PROXY/HTTPS_PROXY/NO_PROXY/ALL_PROXY/http_proxy/https_proxy/no_proxy/all_proxy` **全部 `<unset>`** |
| WinINET（IE/系统）注册表 | `Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'` | `ProxyEnable : 1`；`ProxyServer : 127.0.0.1:10809`；`ProxyOverride : <local>;localhost;127.*;10.*;172.16.*; ...;192.168.*` |
| .NET 系统代理解析 | `[System.Net.WebRequest]::GetSystemWebProxy().GetProxy(...)` | `http://127.0.0.1:10809/` |
| 代理端口是否在监听 | `Test-NetConnection 127.0.0.1 -Port 10809` | `True` |
| Python 实际采用的代理 | `py -3.10 -c "import urllib.request;print(urllib.request.getproxies())"` | `{'http': 'http://127.0.0.1:10809', 'https': 'https://127.0.0.1:10809', 'ftp': 'ftp://127.0.0.1:10809'}` |
| DNS | `socket.getaddrinfo('data.weather.gov.hk',443)` | `AF_INET ('103.30.70.56', 443)` 正常 |

**根因链条 [本报告实测 + 推断]**：
- 本机存在一个**只在 WinINET 注册表里启用**的本地代理 `127.0.0.1:10809`（典型 Clash/V2Ray 类客户端），环境变量与 WinHTTP 均未配置它。
- CPython 在 Windows 上的 `urllib.request.getproxies()` 逻辑是「先读环境变量，没有则**回退读注册表**」，因此 **Python / pip（内嵌 requests）会静默走这个代理**；而 `curl.exe`（只读 `*_PROXY` 环境变量，不读注册表）与 `netsh winhttp` 走直连。
- **`[推断]` web_fetch 之所以能通**：`web_fetch` 由 DSH 运行时在宿主机进程侧发起 HTTP(S) 请求（使用其自带的 HTTP 客户端与信任链），既不经过该 WinINET 注册表代理，也不使用本机 Schannel，因此不受「代理转发失败」与「Schannel 凭据故障」两层问题影响。此点无法在沙箱内直接验证，属推断。

---

## 4. 安装可行性结论

| 项目 | 结论 | 依据 / 备注 |
|---|---|---|
| **pip 能否拉包** | **能，但必须先绕过注册表代理** | 默认配置：tuna 镜像与 pypi.org 均 `SSLEOFError`。设 `NO_PROXY=*` 后实测 `six-1.17.0` wheel 下载成功（11,050 B）。用户级 `pip.ini` 见下。 |
| **PyPI 可达性** | 可达 | Python 直连 `https://pypi.org/pypi/pydantic/json` → 200（0.39s）；`https://pypi.org/simple/` → 200 |
| **npm registry 可达性** | **可达** | `npm view vite version` → `8.3.5`；Node 用 OpenSSL，不受 Schannel 故障影响 |
| **uv 能否装** | **未验证（未执行安装）** | 目前 `uv` 不存在。可行路径有两条，但均**未实测**：(a) `py -3.10 -m pip install uv`（依赖 §4 的代理绕过）；(b) 官方独立安装脚本（需外网 + 写用户目录）。 |
| **pnpm 能否装** | **未验证（沙箱内被拦截）** | `corepack 0.34.0` 存在（`corepack enable pnpm` 路径可用）；`npm i -g pnpm --prefix <临时目录> --cache <临时目录>` 实测失败于 `npm error code: 'EPERM' ... syscall: 'spawn'`。该 EPERM 属 DSH 沙箱对「以管道 stdio 派生子进程」的限制（本轮权限范围内无法提权复核），**不能**据此判定真实终端下 pnpm 不可装。 |
| **Docker 启动方式** | CLI 就绪 | `docker 28.1.1` + `compose v2.35.1-desktop.1`；**daemon 是否运行未验证**（未执行 `docker info`/`docker ps`） |

### 4.1 现有 pip 用户配置（会直接影响建环境）

`py -3.10 -m pip config debug` 显示唯一生效的配置文件：

```
C:\Users\HwH\AppData\Roaming\pip\pip.ini, exists: True
  global.index-url: https://pypi.tuna.tsinghua.edu.cn/simple
  install.trusted-host: pypi.tuna.tsinghua.edu.cn
```

该镜像在本机实测**不可用**（`SSLEOFError`，`trusted-host` 无法绕过协议层中断）。全局 `C:\ProgramData\pip\pip.ini`、site、user 其它位置均不存在。

---

## 5. 对需求文件「阶段 1」的阻塞项与可执行建议

阶段 1 目标（需求 §十六）：*建立项目、目录导航、质量检查和数据来源调查报告*；技术栈硬约束：Python 严格 3.10（`requires-python = ">=3.10,<3.11"`）、uv 锁依赖、Ruff `target-version = "py310"`、前端 React+TS+Vite+Tailwind+shadcn/ui。

| # | 阻塞项（均已实测） | 影响 | 建议动作（阶段 1 内可执行） |
|---|---|---|---|
| **B1** | `python` 不在 PATH，只有 `py` launcher | 任何脚本、README 命令、CI 直接写 `python`/`python -m` 都会失败 | 统一写 `py -3.10`；或在项目内建 venv 后使用 `.venv\Scripts\python.exe`。`venv` 模块实测可用：`py -3.10 -m venv .venv`（**尚未执行**）。不建议依赖系统 PATH 改动。 |
| **B2** | **pip 与 PyPI/镜像的默认路径不可用**：`pip.ini` 指向 tsinghua 镜像且 TLS 中断；不绕过代理时 pypi.org 同样 `SSLEOFError` | 阶段 1 无法装 Ruff/mypy/pytest，也无法装 uv | 先做代理决策，再建环境。两个已验证/可验证选项：①**直连优先**：`$env:NO_PROXY='*'`（已在 PowerShell 会话内实测 `pip download six` 成功）并把 `pip.ini` 的 `index-url` 改为 `https://pypi.org/simple`；②**走代理**：`$env:HTTPS_PROXY='http://127.0.0.1:10809'`、`$env:HTTP_PROXY='http://127.0.0.1:10809'`（**未实测**，且该代理对 HKO 已证明转发失败，不宜作为唯一依赖通道）。 |
| **B3** | **uv 未安装**，而需求要求「使用 uv 解析并锁定依赖」 | `pyproject.toml` + `uv.lock` 无法生成，`.python-version` 也无从校验 | 阶段 1 第一步装 uv（**未验证**）：`$env:NO_PROXY='*'; py -3.10 -m pip install uv`，然后 `uv --version` / `uv python pin 3.10` / `uv lock`。兜底：在 uv 装好前用 `py -3.10 -m pip` 手工验证依赖可解析，但**不得**把 pip 生成的依赖状态冒充 `uv.lock`。 |
| **B4** | **pnpm 未安装**，前端包管理器未定 | 前端脚手架（Vite/Tailwind/shadcn）无法按 pnpm 安装 | 两条未验证路径，建议在普通终端任选其一并记录实际版本：`corepack enable && corepack prepare pnpm@latest --activate`（corepack 0.34.0 已确认存在）或 `npm i -g pnpm`。沙箱内因 `EPERM spawn` 无法验证，**不要**在报告中宣称已安装。 |
| **B5** | **Schannel 全线故障**（curl/IWR/.NET 均 `SEC_E_NO_CREDENTIALS`） | ①任何「用 curl 测接口」的验证脚本都会误报「网络不通」；②Playwright/浏览器类工具若复用系统证书栈可能受影响（**未验证**） | 连通性验证**只用 Python（OpenSSL）或 Node**；README/测试脚本里禁止用 `curl.exe` 作为数据源可达性判据。排查脚本示例：`py -3.10 -c "..."` 配 `ProxyHandler({})`。 |
| **B6** | ~~**后端 HTTP 客户端行为未定**（`httpx` 未安装）~~ → **2026-10-23 由 Lead 实测关闭** | `httpx 0.28.1` 装在 `.venv`：`trust_env=True` → `ConnectError: EOF occurred in violation of protocol (_ssl.c:997)`（0.24s）；`trust_env=False` → HKO opendata **200 / 30 行 / 0.24s**，`rhrread` **200 / 27 站**。**结论：后端必须使用 `httpx.Client(trust_env=False)`**。原报告的 `[推断]` 现已有实测证据支撑 |
| **B7** | Python **3.10.4 / OpenSSL 1.1.1n** 偏旧（3.10 线已有更新补丁；OpenSSL 1.1.1 已 EOL） | 不违反 `>=3.10,<3.11`；但依赖解析可能遇到无 wheel 的新版本包，且存在已知 TLS 漏洞面 | 记录为风险即可；若允许，在 3.10 线内升级补丁版本（**未验证**是否已装其它 3.10 补丁）。`requires-python` 与 Ruff `py310` 不需要改。 |
| **B8** | [沙箱内现象] npm 默认缓存 `C:\Users\HwH\AppData\Local\npm-cache` 与全局 prefix 在工作区外，被 `workspace-write` 拒绝（`EPERM ... open ..._cacache\tmp\...`） | 仅影响本受控会话，不影响真实终端；但会误导「npm 不可用」的判断 | 沙箱内测试需加 `--cache <工作区内或系统临时目录>`（本报告实测 `npm view vite version` 即因此成功）。真实终端无需此参数。 |
| **B9** | **Docker daemon 状态未验证** | 需求只把 Compose 作为可选启动方式，不阻塞阶段 1 | 阶段 1 无需处理；若后续采用，先跑 `docker info` 确认 daemon 在运行。 |

### 5.1 建议的阶段 1 执行顺序（含每步的验证命令）

1. 建 Python 环境：`py -3.10 -m venv .venv` → `.venv\Scripts\python.exe -V` 确认 `3.10.x`（**待执行**）。
2. 解决代理：会话内 `$env:NO_PROXY='*'`；同时把 `pip.ini` 的 index 改为可达源（或明确使用代理），并**记录实际生效的配置**。
3. 装 uv 并锁定：`pip install uv` → `uv --version` → `uv lock`（**待验证**）。
4. 装 uv 依赖（阶段 1 只需质量工具）：`uv add --dev ruff mypy pytest pytest-asyncio hypothesis` 的等价锁文件操作，随后 `uv run ruff --version` / `uv run pytest --version` 记录真实输出。
5. 前端：确认 pnpm 可用后再脚手架；否则先用 npm 并显式说明与需求（uv/pnpm）的偏差。
6. 连通性验证脚本一律使用 Python/Node，并**分别记录**直连与代理两条路径的结果。
7. `docs/data-sources.md`（需求 §七）所需的 HKO 数据可行性，建议直接用 Python + `ProxyHandler({})` 直连 rhrread 实测采集字段，**不要**复用本报告 §2 中失败客户端的结论。

---

## 6. 本报告未验证的部分

以下项目**没有**实际执行或未能完成，不得当作已通过：

1. **`uv` 的安装与版本**：完全未执行安装，命令与版本未知。
2. **`pnpm` 的安装与版本**：沙箱内 `npm i -g pnpm` 失败于 `EPERM (spawn)`（沙箱派生子进程限制），未能在真实终端复核。
3. ~~**`httpx` 请求 HKO 的真实行为**：httpx 未安装，`trust_env` 相关结论仅为推断（见 B6）。~~ → **已实测关闭（见 B6）**：`httpx 0.28.1` + `trust_env=False` → HKO 200；`trust_env=True` → `ConnectError: EOF occurred in violation of protocol`。
4. **FastAPI / Uvicorn / Pydantic / pandas / SQLAlchemy / pytest / Ruff / mypy 在 Python 3.10.4 上的安装与兼容性**：一个都没装、没跑。
5. **Playwright 及其浏览器二进制下载**：未验证；`Playwright` 依赖系统证书栈还是自带 CA 包未确认。
6. **Docker daemon 是否在运行**：只记录了 CLI 与 Compose 插件版本，未执行 `docker info`/`docker ps`。
7. **在非沙箱普通终端中 curl / Invoke-WebRequest 是否仍然失败**：Schannel `SEC_E_NO_CREDENTIALS` 可能被 DSH 沙箱放大（沙箱限制进程访问凭据相关资源），本报告无法区分「机器本身故障」与「沙箱内故障」，**因此本报告不宣称该机器在普通终端下 Schannel 一定不可用**；但已确认的是：在当前受控会话中，Schannel 类工具全部不可用于外网验证。
8. **venv 的实际创建与应用**：只验证了 `venv` 模块存在（`--help` 正常），未创建 `.venv`。
9. **`pip.ini` 的修改**：仅诊断出配置内容，**未修改**用户级 pip 配置（避免越权改动用户环境）。
10. **HKO 数据接口的字段/覆盖范围/许可**：属 `docs/data-sources.md` 范畴，本报告只证明「该 URL 在 Python 直连下返回 200 与真实 JSON 正文」，未做业务级核实。
11. **Node/npm 之外的前端依赖可达性**（Vite/Tailwind/shadcn/TanStack Query/Plotly/Prism 的具体版本解析）：只测了 registry 与 `npm view vite version`，未做实际安装。

---

## 附录：Lead 本轮实际安装记录（2026-10-23，用户授权安装 uv / pnpm）

> 本节由 Lead 执行并记录。说明：由于当前会话是 `workspace-write` 沙箱，**写工作区之外的路径会被拒绝**，因此两个工具都装在**项目内 `.tools\`**，未做系统级全局安装。这不代表机器不能全局安装。

### A. 先撞到的三面墙（全部实测，均为沙箱边界，不是机器权限不足）

| 尝试 | 命令 | 实际结果 |
|---|---|---|
| pip 用户级安装 uv | `py -3.10 -m pip install -i https://pypi.org/simple uv` | 下载成功（15.4 MB），安装阶段 `ERROR: Could not install packages due to an OSError: [WinError 5] 拒绝访问: 'C:\Users\HwH\AppData\Roaming\Python'` → 用户 site 目录在工作区外 |
| corepack 启用 pnpm | `corepack enable pnpm` | `Internal Error: EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpx'` → Node 安装目录在工作区外 |
| npm 全局安装 pnpm | `npm i -g pnpm` | `EPERM ... open 'C:\Users\HwH\AppData\Local\npm-cache\_cacache\tmp\...'` → npm 缓存/prefix 在工作区外；之后即使改 `--prefix` 到工作区，仍会因 postinstall 的 `spawn EPERM`（沙箱禁止管道 stdio 派生子进程）失败 |

### B. uv 的安装结果与"uv 具体做了什么"

**安装方式**：不经过 pip 的 site-packages，而是取 wheel 后**只提取可执行文件**放在工作区。

| 步骤 | 实际执行 | 结果 |
|---|---|---|
| 1. 下载 wheel | `py -3.10 -m pip download --no-deps -i https://pypi.org/simple -d .tools\uv-wheel uv` | `uv-0.13.5-py3-none-win_amd64.whl`，**15,358,650 字节** |
| 2. 查看 wheel 结构 | Python `zipfile.namelist()` | 二进制位于 `uv-0.13.5.data/scripts/`：`uv.exe`、`uvw.exe`、`uvx.exe`（另有 `uv/` Python 包装模块） |
| 3. 提取 | `zipfile.extractall()` 到 `.tools\uv-pkg`（`Expand-Archive` 不收 `.whl` 扩展名） | `uv.exe` **31,899,952 字节**、`uvw.exe` 346,416 B、`uvx.exe` 345,392 B |
| 4. 安装到 PATH 可用处 | 复制 `uv.exe`、`uvx.exe` 到 `.tools\bin\` | 可执行 |
| 5. 清理 | 删除 `.tools\uv-pkg`、`.tools\uv-wheel` | 只保留可执行文件与缓存 |

**验证（真实输出）**：

```
uv 0.13.5 (46776a95d 2026-10-21 x86_64-pc-windows-msvc)
```

```
$ uv python list --only-installed
cpython-3.10.4-windows-x86_64-none    C:\Users\HwH\AppData\Local\Programs\Python\Python310\python.exe
cpython-3.9.1-windows-x86_64-none     C:\ProgramData\Miniconda3\python.exe
```

```
$ uv pip install --python <Python310\python.exe> --system --dry-run six
Using Python 3.10.4 environment at: C:\Users\HwH\AppData\Local\Programs\Python\Python310
Resolved 1 package in 3.08s
Would download 1 package
Would install 1 package
 + six==1.17.0
```

**uv 到底"操作"了什么（精确界定）**：

| uv 动作 | 是否发生 | 说明 |
|---|---|---|
| 读取/识别本机 Python | ✅ 发生 | 只**读**，识别出 3.10.4 与 3.9.1；未安装或替换任何 Python |
| 解析依赖（resolver） | ✅ 发生 | `--dry-run` 对 Python 3.10.4 解析出 `six==1.17.0`（3.08s） |
| 写缓存目录 | ✅ 发生 | 因设置了 `UV_CACHE_DIR`，写入工作区 `.tools\uv-cache`（含 `interpreter-v4`、`simple-v27`、`wheels-v7`、`sdists-v10`，以及 uv 自建的 `CACHEDIR.TAG`、`.gitignore`、`.lock`）。**若无此变量，默认缓存目录在工作区外会被沙箱拒写** |
| 修改 site-packages | ❌ 未发生 | 全程 `--dry-run`，未装任何包进 Python 3.10.4 环境 |
| 修改系统 PATH / 注册表 | ❌ 未发生 | uv 只被放到 `.tools\bin\`，PATH 未改 |
| 生成 `pyproject.toml` / `uv.lock` / `.python-version` / `.venv` | ❌ 未发生 | 本轮只做工具链安装，按"暂不写项目代码"要求未初始化项目 |
| 下载托管 Python | ❌ 未发生 | 复用了系统已有的 3.10.4 |

> 后续建项目时的标准动作（**尚未执行**）：`uv python pin 3.10`（写 `.python-version`）→ `uv lock`（写 `uv.lock`）→ `uv sync`（建 `.venv` 并按锁安装）。这些都会写工作区内文件，可正常执行。

### C. pnpm 的安装结果

| 项 | 实际值 |
|---|---|
| 安装命令 | `npm i -g pnpm --prefix <项目>\.tools\pnpm-home --ignore-scripts --no-fund --no-audit`（`--ignore-scripts` 用于绕开沙箱的 `spawn EPERM`） |
| 结果 | `added 1 package, and changed 1 package in 3s`，exit `0` |
| 版本 | **12.15.0**（`node ...\pnpm\bin\pnpm.mjs --version`） |
| 已知缺陷 | npm 自动生成的 `pnpm.cmd` 指向不存在的 `node_modules\pnpm\pnpm`（无扩展名）→ 直接调用报「不是内部或外部命令」 |
| 修复方式 | 自建 shim `.tools\bin\pnpm.cmd`：`@echo off` + `node "%~dp0..\pnpm-home\node_modules\pnpm\bin\pnpm.mjs" %*` |
| 验证 | `pnpm --version` → `12.15.0`；`pnpm --help` 可输出 Usage（该命令 exit code 为 1，属 pnpm 自身对 `--help` 的返回码，不影响版本与安装） |

### D. 使用方式（当前会话）

```powershell
$env:Path = "C:\Users\HwH\Desktop\AIET\Coding and thinking\GroupProject\.tools\bin;" + $env:Path
$env:UV_CACHE_DIR = "C:\Users\HwH\Desktop\AIET\Coding and thinking\GroupProject\.tools\uv-cache"
uv --version
pnpm --version
```

> **诚实边界**：① `.tools\` 未加入系统 PATH，也**未** `git init`/`.gitignore`（当前目录不是 git 仓库）；② 系统级安装（`corepack enable pnpm`、`pip install uv` 进用户 site）**未完成**，需在普通终端执行，**未验证**；③ pnpm 12.15.0 与 uv 0.13.5 均只做过版本/解析验证，**未**跑过 `pnpm install` 或 `uv sync` 的完整安装。

## 附：本报告（成员部分）使用的临时文件位置

所有探测脚本、候选下载文件均写入受控会话的系统临时目录（`$env:TEMP\env_audit_probe\`），**未写入项目源码目录**；项目内新增 `docs/environment-report.md` 与 `.tools/`（工具链，见上文附录）。
