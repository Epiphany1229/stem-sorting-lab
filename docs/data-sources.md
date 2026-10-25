# 香港天文台（HKO）气象数据源可行性调查报告

> **文档性质**：本文件是「数据可行性调查」的结果记录，**不是**数据接入实现说明。
> 本项目**尚未接入**真实历史数据；文中所有「可用」仅指「本次调查中该端点返回了预期结构」。
>
> **验证日期**：2026-10-23（香港时间 Asia/Hong_Kong，观测时段约 13:02–13:20）
> **调查人**：hko-data-verifier（团队成员）；2026-10-23 晚间由 Lead 补做官方 PDF 下载与测站表解析（§5.4）
> **对应需求**：`docs/PROJECT_REQUIREMENTS.md` 第七、八、九节
> **请求总量**：首轮调查 **27 次**网络请求（含 1 次检索）；Lead 补做阶段另有 3 次 PDF 下载 + 3 次 API 抽样复核。全程串行、无并发、未做压力测试。

---

## 0. 结论摘要（先看这里）

| # | 数据源 | 结论 | 一句话理由 |
|---|---|---|---|
| 1 | `weather.php?dataType=rhrread`（实时天气） | **可用（指标残缺）** | HTTP 200，结构稳定；但湿度只有 1 站、降雨是 18 个行政区、**无风速风向、无每日最高/最低温** |
| 2 | `opendata.php` 月表 `CLMMAXT` / `CLMMINT` / `CLMTEMP` | **部分可用（重大限制）** | 逐日最高/最低/平均温可取，但**只覆盖到上一个完整月**；当前月（2026-10）返回 `data: []` 空数组 |
| 3 | 「最近 30 天（截至昨日）」需求 | **当前无法满足** | 截至 2026-10-23，逐日数据最后可用日 = **2026-09-30**；最近 30 天窗口为 2026-09-24～2026-10-22，**缺 22 天** |
| 4 | HKO 气候资料 Daily Extract（逐日网页） | **不可用（非 API）** | 页面为 JS 年/月表单 + Go 按钮，静态 HTML 无数据、无 CSV 直链；且 `robots.txt` 对 `/cis/` 为 `Disallow` |
| 5 | data.gov.hk 数据集页 | **元数据可用，资源不可直取** | 数据集存在，但唯一资源「格式 = API」指向 CSDI 地理信息门户，**未发现托管 CSV/JSON 文件** |
| 6 | 响应头（ETag / Last-Modified / Retry-After / 限流） | **未验证** | 当前可用通道（`web_fetch`）**不暴露响应头**，无任何可观测证据；禁止臆测 |
| 7 | 官方 API 说明 PDF | **已读取并解析（2026-10-23 补做）** | 用 `httpx(trust_env=False)` 下载英文/繁体/简体三份 PDF（英文版 `Last-Modified: 2025-09-22`），再用 `pypdf` 提取；测站代号表 39 站已逐字核对并写入 §5.4 |

**给项目的最重要一条结论**：需求第七节「不能假定实时接口支持最近一个月完整历史查询」——本次调查**证实了这个担心**。逐日月表有，但存在「整月发布」延迟，因此需求第八节默认的「截至昨日的最近 30 个完整自然日」在**首次部署时无法用官方逐日数据凑齐**（缺口见 §7.3）。这需要产品层面决策，不能靠代码绕过，也不能用实时数据倒推。

---

## 1. 环境限制（务必先读，直接影响后端实现）

### 1.1 本机网络通道差异（Lead 实测 + 本次调查确认）

| 通道 | 对 `https://data.weather.gov.hk` 的结果 | 说明 |
|---|---|---|
| `curl.exe` | **失败**：`schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)` | 本机 schannel 凭据/TLS 握手问题，**不是** HKO 拒绝服务 |
| `Invoke-WebRequest` | **失败**：提示「基础连接已经关闭」 | 同上 |
| `web_fetch`（本次调查唯一使用的联网通道） | **成功**，多次返回 HTTP 200 | 调查期间所有 HKO 请求均经此通道 |

**含义**：本机命令行工具无法直连 HKO，但代理通道可以。因此后端若使用 `httpx`/`requests` 直连，**其 TLS 行为在本机未经验证**，必须在目标运行环境单独复测，不能假定「调查能用，部署就能用」。

> **Lead 后续复核补充（2026-10-23，不改变上文结论）**：用 `py -3.10`（Python 3.10.4 / OpenSSL 1.1.1n）做受控对照实验，已定位真实根因。
> - `http.client.HTTPSConnection("data.weather.gov.hk", 443, context=ssl.create_default_context())` → **HTTP 200 + 真实 JSON**；裸 TLS 握手 TLSv1.3。
> - 同一解释器 `urllib.request.urlopen` 默认路径 → `URLError [Errno 2]`；改用 `build_opener(ProxyHandler({}))` **直连 → 200，30 行，0.21 秒**。
> - 原因：`urllib.request.getproxies()` 返回 `{'https': 'https://127.0.0.1:10809', ...}`（环境变量未设，CPython 回退读取 WinINET 注册表 `ProxyEnable=1 / ProxyServer=127.0.0.1:10809`），该本地代理对 HKO 转发失败；对 PyPI 仅表现为变慢。`http.client` 不读注册表，故正常。
> 因此：**「curl/IWR 失败」不能推断为「本机出网受限」，也不能推断为「HKO 拦截」**。`httpx` 默认 `trust_env=True` 很可能复现同一代理故障，**必须在装好 httpx 后单独实测（含 `trust_env=False`）**；本结论在 httpx 实测前仍属未验证。详见 `docs/environment-report.md` §2.2。

### 1.2 本次调查的技术边界（必须如实告知）

| 限制 | 后果 |
|---|---|
| `web_fetch` **不返回响应头** | `ETag`、`Last-Modified`、`Retry-After`、`Content-Type`、限流/配额相关头**全部未验证**。需求第七节要求「适用且服务器支持时使用 ETag/Last-Modified 及条件式请求」——**该能力是否可用，目前无证据**，需后端直连后复核 |
| `web_fetch` **不支持 `application/pdf`** | 当时未能读取官方 PDF；**该空白已于 2026-10-23 用 `httpx(trust_env=False)` 直连补齐**：下载三份 PDF 并用 `pypdf` 提取，测站代号表见 §5.4。仍未逐字核对的是其它未用到的 `dataType` 定义 |
| `https://data.weather.gov.hk/robots.txt` | 请求未返回内容，而是**跨域重定向到 `https://www.hko.gov.hk`**（`cross-origin redirect ... is not followed automatically`）。即该主机自身 robots 规则**无法确认** |
| 未做压力测试 | 本次全程串行、单请求，**没有**验证过任何并发上限、配额或限流阈值。文档中不会出现任何「官方配额」断言 |

### 1.3 `robots.txt` 实测内容（`https://www.hko.gov.hk/robots.txt`，HTTP 200）

与项目直接相关的条目（原文摘录）：

```
Disallow: /cis/
Disallow: /appweb/
Disallow: /readme/
Disallow: /weatherAPI/
Disallow: /openData/
```

**解读与限制**：

- `/cis/` 正是 Daily Extract 所在路径 → **不得把 Daily Extract 纳入常规抓取**（本次仅作一次性人工可行性查看）。
- `www.hko.gov.hk/weatherAPI/` 被 `Disallow`；但本项目使用的主机是 `data.weather.gov.hk`，**该主机的 robots.txt 未取到**（重定向），所以不能简单地说「允许」或「禁止」。
- `/appweb/`（版权条款页）也在 `Disallow` 内 → 本次一次性人工查阅条款，不作为抓取目标。
- **robots.txt 不等于授权**（需求第七节原话）。判断能否自动存取，应以官方 API 条款与 data.gov.hk 使用条款为准（见 §10）。

---

## 2. 官方文档地址

| 用途 | 地址 | 本次是否读到 |
|---|---|---|
| 官方开放数据 API 说明书（英文 PDF） | `https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf` | ✅ **已下载并解析**（2026-10-23，581,389 B / 48 页） |
| 同上（繁体中文） | `https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation_tc.pdf` | 未读到（同上） |
| 同上（简体中文） | `https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation_sc.pdf` | 未读到（同上） |
| data.gov.hk 数据集页（逐日最高/平均/最低温） | `https://data.gov.hk/en-data/dataset/hk-hko-rss-daily-temperature-info-hko` | **已读到**（HTTP 200） |
| data.gov.hk 同一数据集（中文资源页） | `https://data.gov.hk/sc-data/dataset/hk-hko-rss-daily-temperature-info-hko/resource/37474eff-71cd-42db-838d-ed91af617432` | **已读到**（HTTP 200） |
| HKO 气候资料参考页（data.gov.hk 指明的 reference） | `https://www.weather.gov.hk/en/cis/climat.htm` | 未访问（`/cis/` 为 robots `Disallow`，且无必要） |
| HKO 气候资料 Daily Extract | `https://www.hko.gov.hk/en/cis/dailyExtract.htm` | **已读到**（HTTP 200，仅外壳页面） |
| HKO 网站非商业用途使用条件 | `https://www.hko.gov.hk/en/appweb/applink.htm` | **已读到**（HTTP 200，全文） |
| data.gov.hk 使用条款 | `https://data.gov.hk/en/terms-and-conditions` | **已读到**（HTTP 200，全文；Version 1.2, last updated 26 May 2025） |

> **注**：上述三个 PDF 地址不是猜的——它来自服务器自身在参数错误时的响应正文（见 §9.2），可视为官方给出的文档入口。

---

## 3. 实际数据地址与已验证参数

### 3.1 实时天气：`weather.php`

```
https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en
```

| 参数 | 已验证取值 | 状态 | 说明 |
|---|---|---|---|
| `dataType` | `rhrread` | ✅ 已验证 | 返回 HTTP 200 |
| `lang` | `en` | ✅ 已验证 | 仅验证 `en`；`sc`/`tc` **未验证** |

⚠️ 该端点**是否存在任何日期/区间参数（例如取历史）——未验证，也未尝试臆造**。需求第七节明令不得臆造 `start_date`/`end_date`，本次调查**全程未使用任何此类参数**。

### 3.2 逐日历史月表：`opendata.php`

```
https://data.weather.gov.hk/weatherAPI/opendata/opendata.php
    ?dataType=CLMMAXT|CLMMINT|CLMTEMP
    &lang=en
    &rformat=json|csv
    &station=HKO
    &year=YYYY
    &month=M
```

| 参数 | 已验证取值 | 状态 | 实测行为 |
|---|---|---|---|
| `dataType` | `CLMMAXT`（日最高温）、`CLMMINT`（日最低温）、`CLMTEMP`（日平均温） | ✅ 三者均 HTTP 200 | 三者结构完全一致 |
| `lang` | `en` | ✅ 已验证 | 注意：**`lang=en` 仍返回中英双语**字段（见 §9.4） |
| `rformat` | `json`、`csv` | ✅ 两者均可用 | CSV 有解析陷阱（见 §9.4） |
| `station` | `HKO`、`KP`、`CCH`、`SHA`、`TKL` | ✅ 五个均成功 | **该参数为必填**；省略 → 报参数错误（§9.2） |
| `station`（无效值） | `XYZ` | ✅ 已测失败 | 返回参数错误纯文本，**HTTP 仍是 200** |
| `year` | `1884`、`1990`、`2000`、`2025`、`2026` | ✅ 均可请求 | 见 §8 历史覆盖 |
| `month` | `9`、`10` | ✅ 已验证 | — |
| `month` **省略** | `year=2025`（无 `month`） | ✅ 已验证 | **返回该年全年逐日数据**（2025 年返回 365 行）。这是一个有用的减请求手段：取整年只需 1 次请求 |

**已验证的 `station` 代号（实测返回，含响应中自带的站名，非猜测）**：

| 代号 | 响应 `type` 中的站名 | 证据 |
|---|---|---|
| `HKO` | 天文台 / Hong Kong Observatory | `"日最高氣溫(攝氏度) - 天文台"` |
| `KP` | 京士柏 / King's Park | `"最高氣溫 (攝氏度) - 京士柏"` |
| `CCH` | 長洲 / Cheung Chau | `"最高氣溫 (攝氏度) - 長洲"` |
| `SHA` | 沙田 / Sha Tin | `"最高氣溫 (攝氏度) - 沙田"` |
| `TKL` | 打鼓嶺 / Ta Kwu Ling | `"最高氣溫 (攝氏度) - 打鼓嶺"` |

> ✅ **完整清单已于 2026-10-23 补齐**：官方 PDF 给出 **39 个** `station` 代号及中英文名、各站起始年，见 **§5.4**。上面 5 个是早期实测样本，仍然成立。
> ⚠️ 但**不要**据此推断「行政区 ↔ 测站」映射——官方 PDF 只给站名，没有行政区归属表。
> ⚠️ 另注：`KP`/`CCH`/`SHA`/`TKL` 是我按真实测站代号尝试后**恰好成功**的，响应自身回显了站名，才确认其含义。**不要**据此反推「某个行政区对应哪个代号」——需求第八节明确禁止凭名称猜测地区映射。

---

## 4. 字段定义

### 4.1 `rhrread` 响应字段（2026-10-23T13:02 实测）

| 字段 | 类型 | 含义（依实测结构描述） | 单位/取值 |
|---|---|---|---|
| `updateTime` | string | 整个响应的更新时间 | ISO 8601 带 +08:00，实测 `2026-10-23T13:02:00+08:00` |
| `temperature.data[]` | array | 逐测站气温 | 见下 |
| `temperature.data[].place` | string | 测站英文名 | — |
| `temperature.data[].value` | number | 气温值 | `unit` 字段给出 `C` |
| `temperature.data[].unit` | string | 单位 | `"C"` |
| `temperature.recordTime` | string | **该组数据的观测时间** | 实测 `2026-10-23T13:00:00+08:00` |
| `humidity.recordTime` | string | 湿度观测时间 | 同上 |
| `humidity.data[].place` / `.value` / `.unit` | — | 湿度 | `unit = "percent"` |
| `rainfall.data[].place` | string | **行政区名**（不是测站） | — |
| `rainfall.data[].max` | number | 雨量 | `unit = "mm"` |
| `rainfall.data[].main` | string | 布尔字符串，实测全为 `"FALSE"` | 语义**未验证**（PDF 未给出该字段定义） |
| `rainfall.startTime` / `endTime` | string | 该雨量统计窗口 | 实测 `11:45` → `12:45`（1 小时窗口） |
| `uvindex.data[].place` / `.value` / `.desc` | — | 紫外线指数 | 实测 `King's Park` / `7` / `"high"`，无量纲 |
| `uvindex.recordDesc` | string | 观测窗口描述 | 实测 `"During the past hour"` |
| `icon` / `iconUpdateTime` | array/string | 天气图标编号与更新时间 | 实测 `[50]` / `12:45` |
| `warningMessage` | array[string] | 生效警告 | 实测含火灾危险警告 |
| `tcmessage` | array[string] | 热带气旋讯息 | 实测含台风 Champi 位置 |
| `mintempFrom00To09` | string | 官方字段，**本次为空字符串** | 语义未验证 |
| `rainfallFrom00To12` | string | 官方字段，**本次为空字符串** | 语义未验证 |
| `rainfallLastMonth` | string | 官方字段，**本次为空字符串** | 语义未验证 |
| `rainfallJanuaryToLastMonth` | string | 官方字段，**本次为空字符串** | 语义未验证 |

**关于 `updateTime` 与 `recordTime` 的语义**（需求要求确认）：

- 实测**不是**所有字段共用一个 `recordTime`：`temperature` 与 `humidity` **各自带自己的 `recordTime`**（本次均为 `13:00`），`uvindex` 用 `recordDesc` 描述窗口而非具体时间，`rainfall` 用 `startTime`/`endTime` 区间，`icon` 用 `iconUpdateTime`。
- 顶层 `updateTime`（`13:02`）晚于各观测 `recordTime`（`13:00`）→ 可理解为「响应生成时间 ≥ 观测时间」，但**官方精确定义未验证**。
- **结论：不能用一个时间戳代表全部指标**。数据模型若要存「观测时间」，必须按指标分别取，缺失时不得臆造。

### 4.2 `opendata.php` 响应字段（JSON）

```json
{
  "type":   ["日最高氣溫(攝氏度) - 天文台", "Daily Maximum Temperature (°C) at the Hong Kong Observatory"],
  "fields": ["年/Year","月/Month","日/Day","數值/Value","數據完整性/data Completeness"],
  "data":   [["2025","9","1","34.4","C"], ...],
  "legend": ["*** 沒有數據/unavailable", "# 數據不完整/data incomplete", "C 數據完整/data Complete"]
}
```

| 字段 | 含义 | 单位/取值 |
|---|---|---|
| `type` | 指标名 + 测站名，**双语数组**；首元素带 BOM（`\ufeff`） | — |
| `fields` | 列名，**双语**，5 列固定 | — |
| `data` | 逐日行；**所有值都是字符串**，不是数字 | — |
| `data[0]` 年 / `data[1]` 月 / `data[2]` 日 | 日期拆分 | 年 4 位、月/日无前导零（实测 `"9"`,`"1"`） |
| `data[3]` 數值/Value | 观测值 | 见下 |
| `data[4]` 數據完整性 | 质量标记 | `C` / `#` / `***` |
| `legend` | 质量标记图例 | 见下 |

**质量标记（实测原文）**：

- `***` = 沒有數據 / unavailable
- `#` = 數據不完整 / data incomplete
- `C` = 數據完整 / data Complete

单位：`CLMMAXT`/`CLMMINT`/`CLMTEMP` 均为**摄氏度（°C）**，单位写在 `type` 字符串里（`(攝氏度)` / `(°C)`），**响应中没有独立的 `unit` 字段**。

---

## 5. 测站范围（需求第七节重点：各测站覆盖）

### 5.1 实时 `rhrread` 实测覆盖

| 指标 | 维度 | 实测数量 | 明细 |
|---|---|---|---|
| `temperature` | **气象测站** | **27 站** | King's Park、Hong Kong Observatory、Wong Chuk Hang、Ta Kwu Ling、Lau Fau Shan、Tai Po、Sha Tin、Tuen Mun、Tseung Kwan O、Sai Kung、Cheung Chau、Chek Lap Kok、Tsing Yi、Shek Kong、Tsuen Wan Ho Koon、Tsuen Wan Shing Mun Valley、Hong Kong Park、Shau Kei Wan、Kowloon City、Happy Valley、Wong Tai Sin、Stanley、Kwun Tong、Sham Shui Po、Kai Tak Runway Park、Yuen Long Park、Tai Mei Tuk |
| `humidity` | **气象测站** | **仅 1 站** | 只有 `Hong Kong Observatory`（天文台总部），`value = 49`, `unit = "percent"` |
| `uvindex` | 气象测站 | **1 站** | 只有 `King's Park`（京士柏） |
| `rainfall` | **行政区** | **18 区** | Central & Western、Eastern、Kwai Tsing、Islands、North、Sai Kung、Sha Tin、Southern、Tai Po、Tsuen Wan、Tuen Mun、Wan Chai、Yuen Long、Yau Tsim Mong、Sham Shui Po、Kowloon City、Wong Tai Sin、Kwun Tong |

**关键结论（回答任务中的两个具体疑问）**：

1. **湿度是否只有「Hong Kong Observatory」一个测站？→ 是。** 本次响应的 `humidity.data` 数组只有 1 个元素，`place = "Hong Kong Observatory"`。**没有**其他测站的湿度。→ 若教学页面要展示「各区湿度」，**现有数据做不到**，不能用一个站冒充全港。
2. **降雨是 18 个行政区还是测站？→ 是 18 个行政区（18 区齐全）。** `place` 值为行政区名（如 `Sha Tin`、`Kwun Tong`）。→ 这是本项目**唯一**能直接对上「行政区」维度的实时指标。注意：**不能**把 `temperature` 的测站（如 `Sha Tin`）与 `rainfall` 的行政区（`Sha Tin`）当成同一个实体——前者是气象站，后者是行政区，需求第八节要求严格区分。
3. **风速/风向 → 本次 `rhrread` 响应中不存在任何风力字段。** 需求第九节要求接入风速风向，**该端点无法满足**，需另找官方数据源（未调查）。
4. **每日最高/最低温 → `rhrread` 没有。** 顶层只有可空的 `mintempFrom00To09`（本次为空字符串）。→ 逐日最高/最低温**只能**走 `opendata.php` 月表。

### 5.2 历史月表 `opendata.php` 实测覆盖

| 项目 | 结论 | 证据 |
|---|---|---|
| 已验证可用代号 | `HKO`、`KP`、`CCH`、`SHA`、`TKL` | 5 次请求均 200，且 `type` 回显站名（见 §3.2） |
| 无效代号行为 | 返回参数错误纯文本 | `station=XYZ` → `Please include valid parameters in API request...` |
| 是否支持「非天文台」测站 | **支持**（至少 4 个非 HKO 站实测成功） | `KP`/`CCH`/`SHA`/`TKL` |
| 完整站点清单 | ✅ **已验证（39 站）** | 官方 API 说明书 PDF（2025-09-22 版）逐字提取，见 §5.4 |
| 各站历史起始年份 | ✅ **已验证（39 站逐站年限）** | 同上；`HKO` 为 1884 起（1940–1946 缺），`YCT` 最晚（2022 起） |

### 5.4 官方测站代号对照表（2026-10-23 从官方 PDF 逐字提取并核对）

**来源与取证过程**（全部可复现）：

| 项目 | 值 |
|---|---|
| 英文版 PDF | `https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf` |
| 繁体版 PDF | `https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation_tc.pdf` |
| 简体版 PDF | `https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation_sc.pdf` |
| 下载方式 | Python 3.10 + `httpx 0.28.1`，`trust_env=False`（本机必须，见 §1） |
| 文件大小 / 页数 | 英文 **581,389 B / 48 页**；繁体 **908,488 B / 46 页**；简体 984,610 B |
| 服务器 `Last-Modified` | **Mon, 22 Sep 2025 09:15:39 GMT**（英文版） |
| 文本提取 | `pypdf 6.21.2` |
| 解析脚本 | `.tools/reference/parse_stations.py`（不入库）；产物 `.tools/reference/station_table.md` |
| 适用范围 | `dataType` = `CLMTEMP` / `CLMMAXT` / `CLMMINT`（三者共用同一测站清单） |
| 抽样 API 复核 | `VP1`、`TMS` 中文名与 API `type` 完全一致；`HKO` 见下方说明 |

**重要说明（API 显示名 ≠ 官方正式名）**：PDF 的正式名是「香港天文台 / Hong Kong Observatory」，但 API 响应 `type` 里简写为「**天文台**」。同理 `VP1` 的 API 文本是「最高氣溫 (攝氏度) - 山頂」。→ 站名应**以本表为准**，API 文本只作对账，不要直接当显示名。

| 代号 | 英文名 | 繁体中文名 | 资料起始年 | 备注 |
|---|---|---|---|---|
| CCH | Cheung Chau | 長洲 | 1992 |  |
| CWB | Clear Water Bay | 清水灣 | 2018 |  |
| HKA | Hong Kong International Airport | 香港國際機場 | 1997 |  |
| HKO | Hong Kong Observatory | 香港天文台 | 1884 | 缺 1940–1946 |
| HKP | Hong Kong Park | 香港公園 | 2007 |  |
| HKS | Wong Chuk Hang | 黃竹坑 | 1989 |  |
| HPV | Happy Valley | 跑馬地 | 2008 |  |
| JKB | Tseung Kwan O | 將軍澳 | 1991 |  |
| KLT | Kowloon City | 九龍城 | 2008 |  |
| KP | King's Park | 京士柏 | 1992 |  |
| KSC | Kau Sai Chau | 滘西洲 | 2008 |  |
| KTG | Kwun Tong | 觀塘 | 2009 |  |
| LFS | Lau Fau Shan | 流浮山 | 1985 |  |
| NGP | Ngong Ping | 昂坪 | 2003 |  |
| PEN | Peng Chau | 坪洲 | 2004 |  |
| PLC | Tai Mei Tuk | 大美督 | 1993 |  |
| SE1 | Kai Tak Runway Park | 啟德跑道公園 | 2014 |  |
| SEK | Shek Kong | 石崗 | 1996 |  |
| SHA | Sha Tin | 沙田 | 1984 |  |
| SKG | Sai Kung | 西貢 | 1993 |  |
| SKW | Shau Kei Wan | 筲箕灣 | 2007 |  |
| SSH | Sheung Shui | 上水 | 2004 |  |
| SSP | Sham Shui Po | 深水埗 | 2010 |  |
| STY | Stanley | 赤柱 | 2009 |  |
| TC | Tate's Cairn | 大老山 | 1997 |  |
| TKL | Ta Kwu Ling | 打鼓嶺 | 1988 |  |
| TMS | Tai Mo Shan | 大帽山 | 1997 |  |
| TPO | Tai Po (Conservation Studies Centre) | 大埔（自然環境保護研究中心） | 1999 |  |
| TU1 | Tuen Mun Children and Juvenile Home | 屯門兒童及青少年院 | 2007 |  |
| TW | Tsuen Wan Shing Mun Valley | 荃灣城門谷 | 2010 |  |
| TWN | Tsuen Wan | 荃灣 | 2006 |  |
| TY1 | New Tsing Yi Station | 新青衣站 | 2010 |  |
| TYW | Pak Tam Chung (Tsak Yue Wu) | 北潭涌(鯽魚湖) | 1995 |  |
| VP1 | The Peak | 山頂 | 2003 |  |
| WGL | Waglan Island | 橫瀾島 | 1989 |  |
| WLP | Wetland Park | 濕地公園 | 2005 |  |
| WTS | Wong Tai Sin | 黃大仙 | 2009 |  |
| YCT | Tai Po (Yuan Chau Tsai Park) | 大埔（元洲仔公園） | 2022 |  |
| YLP | Yuen Long Park | 元朗公園 | 2015 |  |

**使用限制（实现前必读）**：

0. **TPO 已被官方 API 实际拒绝（2026-10-25 实测）**：PDF 名单里有 `TPO`（大埔自然環境保護研究中心），但 `CLMMAXT`/`CLMMINT`/`CLMTEMP` 三种 dataType 用 `station=TPO` 均返回 HTTP 200 + 参数错误 HTML（非 JSON）。→ 该站当前**不可用**；全量回填后 39 站中 38 站有数据。代码必须按"官方接口拒绝"处理并跳过，不得当网络故障重试，也不得伪造该站数据。

1. 本表只对 `CLMTEMP`/`CLMMAXT`/`CLMMINT` 有效。PDF 显示**潮汐类** `dataType`（`HHOT`/`HLT`）使用另一组 14 个站号（`CCH`、`CLK`、`CMW`、`KCT`、`KLW`、`LOP`、`MWC`、`QUB`、`SPW`、`TAO`、`TBT`、`TMW`、`TPK`、`WAG`），**不得混用**。
2. 实时接口 `rhrread` 返回 27 个气温测站，与本表 39 站**不是同一集合**（实时站名是英文显示名），不可直接按名称做等值匹配。
3. **行政区映射仍然缺失**：官方 PDF 只给站名，**没有**「测站 → 18 行政区」的映射表。需求第八节要求的行政区维度仍须另找官方来源，**不得**按站名猜测。
4. 各站起始年差异很大（1984–2022），做「历年同期对比」时必须按站检查年限，否则会拿不存在的数据。

### 5.3 「官网代表性/总体指标」（需求第七节要求核实）

- 已核验的两个端点中，**未发现任何「全港平均」「香港总体」字段**：`rhrread` 无汇总量，`opendata.php` 是单站表。
- 因此需求第八节的三选一口径必须由产品明确：
  1. 用 **天文台总部（HKO）** 作代表 → 必须标注「天文台总部」，**不得**称全港平均；
  2. 用多站**教学计算平均** → 必须标注「教学计算：所选测站平均」并说明覆盖率；
  3. 官方全港指标 → **本次未找到**，不作承诺。

---

## 6. 时间粒度

| 数据源 | 粒度 | 实测依据 |
|---|---|---|
| `rhrread` 气温/湿度 | 整点观测（每小时的 00 分） | `recordTime = 2026-10-23T13:00:00+08:00` |
| `rhrread` 降雨量 | 1 小时统计窗口 | `startTime 11:45` → `endTime 12:45` |
| `rhrread` 紫外线 | 「过去一小时」 | `recordDesc = "During the past hour"` |
| `rhrread` 整体 | 分钟级刷新 | `updateTime = 13:02`，`iconUpdateTime = 12:45`（各字段不同） |
| `opendata.php` 月表 | **逐日**（每日 1 行） | 2025-09 返回 30 行，2026-09 返回 30 行 |

> 「每分钟还是每小时更新」——实测只能确定：**各字段的 `recordTime`/`updateTime` 不相同**，`updateTime` 精确到分钟（`13:02`）。**官方刷新频率无文档证据**，故本报告不写「每分钟更新」这类断言。

---

## 7. 更新时间与发布延迟（本次调查最关键的发现）

### 7.1 实时端点

`updateTime = 2026-10-23T13:02:00+08:00`，观测 `recordTime = 13:00`。→ 实时数据**基本无延迟**（约 1–2 分钟内），但这是**单次观测**，不是当日汇总。

### 7.2 逐日月表：**当前月返回空数组**

| 请求 | HTTP | 返回内容 |
|---|---|---|
| `CLMMAXT` / `HKO` / `2026` / `10`（当前月） | **200** | **`"data": []`（空数组）**，`type`/`fields`/`legend` 正常 |
| `CLMMINT` / `HKO` / `2026` / `10`（当前月） | **200** | **`"data": []`（空数组）** |
| `CLMMAXT` / `HKO` / `2026` / `9`（上月） | 200 | **30 行完整数据**（9-01 至 9-30） |

⚠️ **失败模式很重要**：当前月不是 404、不是错误，而是 **HTTP 200 + 空数组**。后端若只判断状态码会误以为成功，必须显式判断 `data` 是否为空。

这与 data.gov.hk 元数据一致：该数据集 **Update Frequency = Monthly（每月）**。

### 7.3 「截至昨日的最近 30 天」可行性判定（需求第八节默认口径）

- 今天：**2026-10-23**
- 昨日：2026-10-22
- 需求默认窗口：**2026-09-24 ～ 2026-10-22**（30 个完整自然日）
- 官方逐日数据实测最后可用日：**2026-09-30**

| 区间 | 天数 | 能否取得逐日最高/最低温 |
|---|---|---|
| 2026-09-24 ～ 2026-09-30 | 7 天 | ✅ 可取（来自 2026-09 月表） |
| 2026-10-01 ～ 2026-10-22 | **22 天** | ❌ **取不到**（当前月 `data: []`） |

**结论：默认「最近 30 天」在当前官方渠道下缺 22 天，无法满足。** 且按需求第九节末句「实时采集只能积累今后的历史」，**不能用实时数据倒推补上这 22 天**。

**建议口径（需产品确认，本次不实现）**：明确把默认窗口改成「**最近一个完整月内、且官方实际可得的最近 30 天**」，并在界面**显式显示起止日期**且提示「2026-10 数据尚未发布」——需求第八节明确禁止「自动改成最近有数据的 30 天而不提示」。

### 7.4 发布延迟的量化程度

- 可确定：**2026-10 整月为零数据**，即月表在月内不提供数据。
- **不能确定**：月末到数据出现的具体天数（例如「次月 2 日」还是「次月 5 日」）。原因：本次只观测了一个时间点，且无法读取官方文档。→ 记为**未验证**，需在 11 月初实际观测一次才能量化。

---

## 8. 历史覆盖

| 请求 | HTTP | 结果 |
|---|---|---|
| `CLMMAXT` / `HKO` / **1884** / 9 | 200 | **完整 30 行**（1884-09-01 ～ 09-30，全为 `C`） |
| `CLMMAXT` / `HKO` / **1990** / 9 | 200 | 完整 30 行 |
| `CLMMAXT` / `HKO` / **2000** / 9 | 200 | 完整 30 行 |
| `CLMMAXT` / `HKO` / **2025** / 9 | 200 | 完整 30 行 |
| `CLMMAXT` / `HKO` / **2025**（省略 `month`） | 200 | **365 行**（全年逐日） |
| `CLMMAXT` / `HKO` / **2026** / 9 | 200 | 完整 30 行 |
| `CLMMAXT` / `HKO` / **2026** / 10 | 200 | **空数组** |

**结论**：

- **天文台总部（HKO）至少回溯到 1884 年**（1884-09 实测返回完整数据）。**更早年份未测试**，故「下限 = 1884」只能说「已证明不晚于 1884」，**不是**官方声明的起点。
- 覆盖「最近几年 + 当前可用月」**完全满足教学需求**（本项目只需最近 30 天级别的数据，历史纵深是加分项，可用于「历年同期对比」教学）。
- **各测站的历史起始年份差异很大**：官方 PDF 给出逐站起始年（§5.4），从 `SHA` 1984 到 `YCT` 2022。例如实测 `TKL`（打鼓岭，1988 起）2025-09 有大量 `#`（不完整），说明不同站的数据质量差异也很大。

---

## 9. 已知限制（实现前必读）

### 9.1 数据本身的限制

1. **当前月无数据**：`opendata.php` 对当月返回 `data: []`。→ 无法满足「截至昨日 30 天」。
2. **湿度只有 1 站**（天文台总部）、**紫外线只有 1 站**（京士柏）。→ 不能做「各区湿度」。
3. **降雨是 18 个行政区，不是测站**，与温度测站维度不同，粒度也不同。
4. **无风速/风向字段**（`rhrread` 实测无）→ 需求第九节该项**未满足**。
5. **无每日最高/最低温**（实时端点无）→ 只能取月表，受 §7.3 延迟限制。
6. **`#` 数据不完整很常见**：实测 `TKL` 2025-09 的 30 天中有 **22 天为 `#`**（仅 8 天为 `C`）；`SHA` 2025-09 有 6 天 `#`；`KP` 有 2 天 `#`、`CCH` 有 1 天 `#`。→ 质量标记必须在 UI 上呈现，**不能**把 `#` 当完整数据，**更不能**把缺失当 0（需求第九节第 1 条）。全量回填 2026 年后，官方 30,790 行中 **`#` 有 1,839 行**（约 6%），并非个别现象。
7. **`***` 可能落在数值列**（2026-10-25 实测 `HKS` 2026-07-15/16 形如 `["2026","7","15","***","#"]`）：必须当作"没有数据"跳过，不能报"数值无法解析"，更不能写 0。
8. **质量标记列为空但数值存在**（实测 `HKS` 部分 `CLMTEMP` 行）：按"不完整（`#`）"入库——既不丢弃真实数值，也不冒充完整。
9. **`TPO` 站已被当前 API 拒绝**（PDF 名单仍有）：三种 dataType 均返回参数错误 HTML。全量回填后 **39 站中 38 站有数据**，`TPO` 可用天数为 0；必须在 UI 显示为"官方接口当前不接受"，不得伪造。

### 9.2 接口行为陷阱

1. **错误返回 HTTP 200**：`station=XYZ` 或缺 `station` 时，返回的是**纯文本**提示（请求有效参数 + PDF 链接），**状态码仍是 200，`Content-Type` 不是 JSON**。→ 后端必须校验响应体是否为可解析 JSON，不能只看状态码。
   - 实测错误正文关键片段：`Please include valid parameters in API request. For details, please refer to [Hong Kong Observatory Open Data API Documentation](...)`（中英简三语并列）
2. **`station` 为必填**：省略 `station` 直接触发上述错误（实测）。
3. **空数据是 `data: []`，不是 404**。
4. **CSV 格式有陷阱**：`rformat=csv` 返回的不是纯数据表，而是：
   - 第 1–2 行：双语标题（带引号）
   - 第 3 行：字段行
   - 第 4–33 行：数据
   - **末尾 3 行：legend 图例文本**
   → 直接用 `pandas.read_csv()` 会读错。需 `skiprows` + 截断尾部，或改用 JSON。
5. **BOM**：`type` 首元素与 CSV 首行都带 UTF-8 BOM（`\ufeff`），需 `utf-8-sig` 处理。
6. **`lang=en` 并未英文化**：`type`/`fields`/`legend` 仍是中英双语（如 `"年/Year"`），需自行拆分。
7. **`legend` 文案不稳定**：不同响应的 `C` 条目文字不一致 —— 实测出现过 `"C 數據完整/data Complete"` 和 `"C 數據完整性/data Completeness"` 两种。→ **不要用 legend 文本做程序判断，只用 `data[4]` 的单字符标记**。
8. **数值是字符串**：`data[3]` 为 `"34.4"` 而非 `34.4`，且**必须保留一位小数精度**（需求第九节第 3 条：不得擅自取整）。

### 9.3 访问与合规限制

1. **`robots.txt` Disallow `/cis/`、`/appweb/`、`/readme/`、`/weatherAPI/`（在 www 主机上）** → 不抓网页版气候资料。
2. **`data.weather.gov.hk/robots.txt` 未取到**（重定向到 `www.hko.gov.hk`）→ 该主机 robots 规则未知。
3. **响应头、ETag、Last-Modified、Retry-After、配额 —— 全部未验证**（通道限制）。
4. **本次未做压力测试，也未获得任何官方授权或配额承诺。** 需求第七节要求的并发 1、间隔 ≥3 秒、有限重试、熔断等，全部是**本项目的自我约束，不是官方保证的安全配额**。
5. **本机 curl/Invoke-WebRequest 直连失败**（§1.1）→ 后端 TLS 行为需在部署环境复测。

### 9.4 未验证清单（明确列出，不含臆测）

| 项目 | 状态 | 原因 |
|---|---|---|
| 官方 API 说明书全文（字段定义、全部 `dataType`、`station` 完整代号表） | **部分已验证**（2026-10-23 更新） | PDF 已下载并解析：**39 个测站代号与中英文名、逐站起始年、CLMTEMP/CLMMAXT/CLMMINT 参数规则已确认**（§5.4）。其余 `dataType`（潮汐/日照/闪电/能见度等）的字段定义**未逐条核对**，且潮汐类站号是另一组 14 个 |
| 是否存在更细粒度（如逐时/近月逐日）官方端点 | **部分已验证** | PDF 的 `dataType` 清单显示除月表外还有 `HHOT`/`HLT`（潮汐）、`SRS`/`MRS`（日出月出）、`LHL`（闪电）、`LTMV`（能见度）等，但**没有**"最近逐日/逐时气温"的独立端点 |
| `rformat` 是否还有 `json`/`csv` 以外的取值 | **未验证** | PDF 只列 `json` / `csv` |
| `lang=sc` / `lang=tc` 的实际差异 | 部分验证 | 下载并解析了三语 PDF（内容等价、语言不同）；接口 `lang` 参数只验证过 `en` |
| `mintempFrom00To09` 等 4 个空字段的语义 | **未验证** | 属 `weather.php`（实时）字段；PDF 主要描述 `opendata.php` 参数，未找到这 4 个字段的逐字定义 |
| 响应头（ETag/Last-Modified/Retry-After/限流） | **部分验证** | PDF 文件本身返回了 `Last-Modified`；**API 响应头仍未观测**（`web_fetch` 不暴露） |
| 各测站历史起始年份、各站 `station` 代号全集 | ✅ **已验证** | §5.4，官方 PDF 逐站年限 |
| 月表数据的实际发布时点（次月几日） | **未验证** | 只观测到一个时间点 |
| 风速/风向、能见度等其他指标的官方来源 | **部分调查** | PDF 中有 `LTMV`（10 分钟平均能见度）端点；**风速风向端点未找到** |
| 官方「全港平均」指标是否存在 | **未找到** | 已核验的两个端点均无该字段 |

---

### 9.5 雨量数据专项核查（阶段 4 补做，2026-10-23 实测）

| 候选渠道 | 实测结果 | 结论 |
|---|---|---|
| `dataType=CLMRAINF`（用户提到） | 官方 PDF 的 `dataType` 清单中**不存在**该代号；接口对未知 dataType 返回 HTTP 200 + 参数错误文本 | ❌ 不存在 |
| `hourlyRainfall.php?lang=en` | HTTP 200，返回 `{obsTime, hourlyRainfall}`，**只有当前一小时** | 仅实时，无法回溯 |
| `opendata.php?dataType=RYES&date=YYYYMMDD` | HTTP 200，返回**平铺 JSON 日报**：`HKOReadingsRainfall`（日雨量 mm）、`HKOReadingsAccumRainfall`、`HKOReadingsMaxRH/MinRH`、多站 `*MaxTemp/*MinTemp` 等 | ✅ **官方日雨量存在**，但**仅天文台总部（HKO）一站**，且**每请求一天** |

**RYES 日期语义（实测，容易踩坑）**：请求 `date=YYYYMMDD` 时，响应中 `ReportTimeInfoDate` = 请求日（资料日），`BulletinDate` = **次日**（`BulletinTime=0015` 发布）。因此入库必须按 `ReportTimeInfoDate` 校验、按请求日归属；若两者不一致应拒绝写入，**绝不能把雨量记到错误日期**。

**项目处置**：不引入任何第三方气象机构数据；不做常驻累积守护进程（实时采集补不回过去 30 天）。仅提供可选 CLI `ingest-rainfall`（1 请求/天，仅 HKO，走既有安全客户端与预算）；`Trace`（<0.05mm）**不入库、不写 0**，在 CLI 汇总中单独计数。

**实现约束（2026-10-25 修复后固化）**：`rainfall` 行虽然入库，但**不得**参与阶段 3 查询接口的指标清单、默认窗口锚点（`last_available_date`）与测站可用天数统计——否则会向学生暴露不支持的指标（前端契约校验失败），或把 30 天窗口整体后移到雨量日期、只剩零散温度数据。数据库里可以有非温度指标，但 API 层只认 `tmax/tmin/tmean`。

---

### 9.6 2026 年 10 月数据的实际情况（2026-10-25 实测）与 RYES 补数

- **月表确实未发布**：`CLMMAXT&station=HKO&year=2026&month=10` 的 **JSON 与 CSV 都只有表头 + 3 行 legend、无数据行**；`year=2026` 不带 `month` 时最后一行仍是 `2026-09-30 34.2 C`。→ 项目**没有伪造** 10 月月表数据。
- **RYES 日报可补齐最近逐日温度**：`dataType=RYES&date=YYYYMMDD` 对 2026-10-01/10-20/10-24 均返回 JSON，`ReportTimeInfoDate`=资料日、`BulletinDate`=次日，含 `HKOReadingsMaxTemp/MinTemp` 与多个按站 `*MaxTemp/*MinTemp` 平铺键。
- **项目实现**：`ryes_temperature.py` 只映射名称与官方 39 站**完全一致**的 22 站（未映射键跳过计数，不猜行政区）；`recent_ingest.py` 逐日 1 请求、校验资料日、**月表优先**、幂等；CLI `ingest-recent --days 35`。真实补数结果：35 请求写入 144 行（Oct 01–24，HKO/KP/SHA × tmax/tmin），Sep 20–30 月表行未被覆盖。
- **口径声明**：RYES 官方注明数据为 **provisional**（有限校验）；月表正式发布后以月表为准。前端/文档必须如实标注数据来源，不得把 provisional 数据说成最终官方值。

---

## 10. 更新频率与数据许可/署名要求

### 10.1 更新时间（汇总）

| 数据源 | 更新频率 | 依据 |
|---|---|---|
| `rhrread` | 观测为整点，`updateTime` 分钟级（实测 13:02 / 观测 13:00） | 实测 |
| `opendata.php` 逐日月表 | **每月**（Monthly） | data.gov.hk 数据集页元数据「Update Frequency: Monthly」+ 实测当月为空 |
| data.gov.hk 资源 | 每月 | 资源页「更新频率：每月」 |

### 10.2 HKO 网站非商业用途使用条件（`applink.htm`，HTTP 200）

原文关键条款（英文原文摘录）：

> 「You may be authorised to disseminate, reproduce, adapt, distribute or print the contents available on this website (the "Materials") ... for non-commercial purposes on a free-of-charge basis on the following conditions」

必须履行的义务（原文）：

> 1. "The authorisation only applies to the use of the Materials, the intellectual property rights in which are owned by the Government of Hong Kong"
> 3.(a) "The Government must be acknowledged as the intellectual property rights' owner of the Materials"
> 3.(b) "You must acknowledge that the Materials are part of the website https://www.weather.gov.hk or https://www.hko.gov.hk and that the website is published by the Observatory"
> 3.(c) "The Intellectual Property Rights Notice and the Conditions herein must be reproduced"
> 5. "You shall display the following Disclaimer or the Trade Mark of the Observatory ... prominently with any Materials distributed or reproduced by you"
> 6. "Sale or exchange of any part of the Materials for any benefit, gain, profit or reward by you is absolutely prohibited in all circumstances"

第 5 条要求展示的免责声明原文（节选）：

> "This website / publication / product / service contains information that is copied or extracted from data made available on the websites of the Hong Kong Observatory ... The provision of the information copied or extracted from or a link to the Observatory's websites shall not be constituted as any form of co-operation or affiliation by the Observatory with any person ... Nothing in this website / publication / product / service shall give rise to any representation, warranty or implication that the Observatory agrees with, approves of, recommends or endorses this website / publication / product / service."

### 10.3 data.gov.hk 使用条款（`terms-and-conditions`，HTTP 200，Version 1.2, 2025-05-26）

原文关键条款：

> 「You are allowed to browse, download, distribute, reproduce, hyperlink to, and print the Data for both commercial and non-commercial purposes on a free-of-charge basis on condition that:- you shall comply with the Terms of Use; you shall identify clearly the source of the Data and acknowledge the Government and the Relevant Organisations' ownership of the intellectual property rights in the Data ...; you shall also give proper attribution to the Government, the Relevant Organisations and DATA.GOV.HK.」

免责/「按现状」条款：

> "The Data are provided by the Government and the Relevant Organisations to you on an 'AS IS' basis. No statement, representation or warranty of any kind ... is given ... in relation to the Data (including the accuracy, completeness, ... timeliness and appropriateness of the Data for use in any particular circumstances)."

### 10.4 本项目应采取的做法（建议，未实现）

- 本项目是**教学网站**，属非商业用途 → 适用 HKO 非商业条件。必须做到：
  1. 页面脚注**明确署名**：「資料來源：香港天文台（Hong Kong Observatory）」并说明数据取自 `weather.gov.hk` / `hko.gov.hk`；
  2. **复现免责声明**（§10.2 第 5 条那段），或使用天文台标志；
  3. 显示**抓取时间 + 观测时间**，并提示「数据可能未更新」（需求第七节强制要求）；
  4. **不得**声称与天文台有合作、认可或背书关系；
  5. **不得**出售数据或衍生产品。
- 若项目将来变为商业用途 → HKO 非商业条件**不再适用**，需改走 data.gov.hk 条款（允许商业，但仍须署名与免责）或另行向天文台申请（`mailbox@hko.gov.hk`）。
- ⚠️ 许可条款页面本身在 `robots.txt` 的 `Disallow: /appweb/` 内，本次仅为**一次性人工查阅**，不应纳入程序化抓取。

---

## 11. 需求可满足性映射（给产品的决策依据）

| 需求项（出处） | 能否用已核验数据源满足 | 依据 / 缺口 |
|---|---|---|
| 实时数据（§7） | ✅ 可 | `rhrread` HTTP 200 |
| 历史观测数据（§7） | ⚠️ 部分 | 逐日月表可取，但**当月缺**（§7.2） |
| 每日最高温 / 最低温（§7、§9） | ⚠️ 部分 | `CLMMAXT`/`CLMMINT` 可取，但截至上一完整月 |
| 各测站覆盖（§7） | ✅ 已核实 | 月表 **39 个测站**（§5.4，含逐站起始年 1984–2022）；实时气温 27 站。**仍缺**：测站→18 行政区映射 |
| 官方香港代表性/总体指标（§7） | ❌ 未找到 | 两个端点均无「全港平均」字段（§5.3） |
| 最近一个月可用性（§7） | ❌ **不可** | 缺 22 天（§7.3） |
| 更新时间及发布延迟（§7） | ⚠️ 部分 | 实时已明确；**月表发布时点未量化**（§7.4） |
| 气温（§9） | ✅ 可 | `rhrread` 27 站 |
| 相对湿度（§9） | ⚠️ 仅 1 站 | 只有天文台总部 |
| 降雨量（§9） | ⚠️ 行政区级 | 18 区，**非测站**；「微量」定义见下 |
| 风速和风向（§9） | ❌ 不可 | `rhrread` 无任何风字段 |
| 质量标记（§9） | ✅ 可 | `C`/`#`/`***` 三态 |
| 缺失值不默认为 0（§9.1） | ✅ 有依据 | 用 `***`/`#` 区分，且 `data: []` 可判空 |
| 保留原始精度（§9.3） | ✅ 有依据 | 值带一位小数，为字符串，**不能**先转 int |
| 最高温 ≥ 最低温校验（§9.5） | ✅ 有依据 | `CLMMAXT` 与 `CLMMINT` 同 `station/year/month` 结构一致，可逐日配对 |

**降雨「微量（Trace）」的官方定义（实测取自 Daily Extract 页面原文）**：

> "Trace means rainfall less than 0.05 mm"

→ 需求第九节第 2 条「降雨量『微量』等特殊值需要独立解释」有官方依据：**Trace = 雨量 < 0.05 mm**，应作为独立标记存储，**不得**记为 0.0。

---

## 附录 A：核验矩阵（逐条证据）

| # | 目的 | 请求（主机 + 路径 + 关键参数） | HTTP | 关键响应片段 | 结论 |
|---|---|---|---|---|---|
| 1 | 实时数据结构 | `data.weather.gov.hk/weather.php?dataType=rhrread&lang=en` | **200** | `"updateTime":"2026-10-23T13:02:00+08:00"`；`temperature` 27 项；`humidity` 仅 1 项 `Hong Kong Observatory`；`rainfall` 18 项行政区；`uvindex` 1 项 `King's Park` | ✅ 可用 |
| 2 | 日最高温 JSON | `opendata.php?dataType=CLMMAXT&lang=en&rformat=json&station=HKO&year=2025&month=9` | **200** | `fields:["年/Year",...,"數據完整性/data Completeness"]`；2025-09-01 `34.4/C` … 09-30 `32.8/C`（30 行） | ✅ 可用 |
| 3 | 日最低温 JSON | `...dataType=CLMMINT...&station=HKO&year=2025&month=9` | **200** | `"日最低氣溫(攝氏度) - 天文台"`，30 行 | ✅ 可用 |
| 4 | 日平均温 JSON | `...dataType=CLMTEMP...&station=HKO&year=2025&month=9` | **200** | `"日平均氣溫(攝氏度) - 天文台"`，30 行 | ✅ 可用 |
| 5 | 非 HKO 测站 `KP` | `...CLMMAXT...&station=KP&year=2025&month=9` | **200** | `"最高氣溫 (攝氏度) - 京士柏"`，含 2 个 `#`（09-10、09-24） | ✅ 支持 |
| 6 | 非 HKO 测站 `CCH` | `...&station=CCH&year=2025&month=9` | **200** | `"... - 長洲"`，含 1 个 `#`（09-20） | ✅ 支持 |
| 7 | 非 HKO 测站 `SHA` | `...&station=SHA&year=2025&month=9` | **200** | `"... - 沙田"`，含 6 个 `#`（09-24、25、27、28、29、30） | ✅ 支持 |
| 8 | 非 HKO 测站 `TKL` | `...&station=TKL&year=2025&month=9` | **200** | `"... - 打鼓嶺"`，**22 个 `#`**（30 天中仅 8 天完整） | ✅ 支持（质量差） |
| 9 | 年份 `1990` | `...&station=HKO&year=1990&month=9` | **200** | 30 行完整 | ✅ 有数据 |
| 10 | 年份 `2000` | `...&station=HKO&year=2000&month=9` | **200** | 30 行完整 | ✅ 有数据 |
| 11 | 年份下限探测 `1884` | `...&station=HKO&year=1884&month=9` | **200** | 30 行完整（`1884-09-01 30.9 C`） | ✅ 至少回溯到 1884 |
| 12 | 当前月 `2026-10`（MAXT） | `...&station=HKO&year=2026&month=10` | **200** | **`"data":[]`** | ⚠️ **当月无数据** |
| 13 | 上月 `2026-09` | `...&station=HKO&year=2026&month=9` | **200** | 30 行完整，09-30 `34.2/C` | ✅ 上月完整 |
| 14 | 当前月 `2026-10`（MINT） | `...dataType=CLMMINT...&year=2026&month=10` | **200** | **`"data":[]`** | ⚠️ 确认非单一 dataType 问题 |
| 15 | `rformat=csv` | `...&rformat=csv&station=HKO&year=2025&month=9` | **200** | 2 行双语标题 + 字段行 + 30 行数据 + **3 行 legend** | ✅ 可用（有解析陷阱） |
| 16 | `month` 省略 | `...&station=HKO&year=2025`（无 `month`） | **200** | **365 行**（2025-01-01 … 12-31） | ✅ 返回全年 |
| 17 | 无效站代号 `XYZ` | `...&station=XYZ&year=2025&month=9` | **200** | 纯文本：`Please include valid parameters in API request...`（非 JSON） | ⚠️ 错 200，需类型校验 |
| 18 | 官方文档 PDF（英文） | `data.weather.gov.hk/.../HKO_Open_Data_API_Documentation.pdf` | **200** | 581,389 B；`Last-Modified: Mon, 22 Sep 2025 09:15:39 GMT`；`%PDF-1.7`；48 页 | ✅ 已下载并解析（早期经 `web_fetch` 读失败，改用 Python 直连） |
| 27 | 官方文档 PDF（繁体 / 简体） | `..._tc.pdf` / `..._sc.pdf` | **200** | 908,488 B / 46 页；984,610 B | ✅ 已下载（提取中文站名用） |
| 28 | PDF 测站表解析 | 本地 `pypdf 6.21.2` + `.tools/reference/parse_stations.py` | — | 解析出 **39** 个站号、39 个英文名、39 个中文名、39 个起始年；无缺项 | ✅ 见 §5.4 |
| 29 | 抽样 API 复核站名 | `opendata.php?dataType=CLMMAXT&station=VP1|TMS|HKO&year=2025&month=9` | **200** | `VP1`→「山頂」、`TMS`→「大帽山」与 PDF 一致；`HKO` 的 API 显示名为「天文台」，PDF 正式名为「香港天文台」 | ✅ 一致（含命名差异说明） |
| 19 | HKO 非商业使用条件 | `www.hko.gov.hk/en/appweb/applink.htm` | **200** | 15 条条件全文（§10.2） | ✅ 已取得 |
| 20 | Daily Extract | `www.hko.gov.hk/en/cis/dailyExtract.htm` | **200** | 仅外壳：`Back YearMonthGo` + `Trace means rainfall less than 0.05 mm` | ❌ 非 API |
| 21 | robots.txt（www） | `www.hko.gov.hk/robots.txt` | **200** | `Disallow: /cis/`、`/appweb/`、`/readme/`、`/weatherAPI/` | ✅ 已取得 |
| 22 | robots.txt（API 主机） | `data.weather.gov.hk/robots.txt` | — | `cross-origin redirect to https://www.hko.gov.hk is not followed automatically` | ❌ 未取到 |
| 23 | data.gov.hk 数据集 | `data.gov.hk/en-data/dataset/hk-hko-rss-daily-temperature-info-hko` | **200** | `Update Frequency: Monthly`；`Data Dictionar(ies)` 指向同一 PDF | ✅ 元数据可用 |
| 24 | data.gov.hk 资源 | `data.gov.hk/sc-data/.../resource/37474eff-...` | **200** | 格式 = `API`；链接到 `portal.csdi.gov.hk/geoportal/?datasetId=hko_rcd_1634871488130_57930`；更新频率 `每月`；建立/发布 `2022-12-23` | ⚠️ 无托管文件 |
| 25 | data.gov.hk 使用条款 | `data.gov.hk/en/terms-and-conditions` | **200** | 「both commercial and non-commercial purposes」+ 署名与「AS IS」条款 | ✅ 已取得 |
| 26 | `station` 必填验证 | `...&year=2025&month=9`（**省略 station**） | **200** | 同 #17 的参数错误纯文本 | ✅ `station` 为必填 |

> 说明：#18、#22 属于「请求已发出但未取得可用内容」，不计为成功取证。合计 **26 次 `web_fetch` + 1 次检索 = 27 次网络操作**。

## 附录 B：对后端实现的建议（仅建议，本次未编码）

1. **必须校验响应体而非状态码**：`json.loads` 失败即视为错误；`data == []` 即视为「暂无数据」，**不可**当作空月份正常返回。
2. **当月回退策略**：请求当月 → 若 `data: []`，回退取上一个月，并在 UI 明示「当月数据尚未发布」+ 显示实际覆盖日期（需求第八节禁止静默替换）。
3. **减请求技巧（已实测）**：省略 `month` 可一次取回整年逐日数据（1 次请求换 365 行）。适合首次填充历史，避免每月 1 次 × 多站。
4. **质量标记落地**：`C` → 正常；`#` → 标记「不完整」并在图表上区分；`***` → 缺失（不得画成 0）。
5. **精度**：`Value` 保持原始字符串/`Decimal`，禁止 `int()`。
6. **配对校验**：同日 `CLMMAXT ≥ CLMMINT`，不满足则记质量问题（需求 §9.5）。
7. **测站字典以 §5.4 为唯一来源**：39 个站号来自官方 PDF，不要在代码里另抄一份；行政区映射仍缺，**禁止**按站名猜。
8. **响应头能力待定**：ETag/Last-Modified 条件式请求、429 的 `Retry-After` 处理，需在后端直连环境实测后再决定是否启用；在此之前按「无条件请求 + 保守间隔」实现。
9. **TLS 需复测**：本机 curl/IWR 直连失败（§1.1），后端 `httpx` 在部署环境必须先做一次连通性自检。

---

## 附录 C：验证环境与时间

| 项目 | 值 |
|---|---|
| 验证日期 | **2026-10-23**（需求规定必须记录） |
| 时区 | Asia/Hong_Kong（+08:00） |
| 观测时段 | 约 13:02 – 13:20 |
| 联网通道 | `web_fetch`（唯一成功通道；`curl.exe` / `Invoke-WebRequest` 本机 TLS 失败） |
| 请求方式 | **严格串行、无并发**；相邻请求之间均隔着一次完整推理/工具往返；**未记录逐次精确毫秒间隔**，但全程无任何并发请求 |
| 请求总数 | **27**（≤ 30 上限） |
| 是否压力测试 | **否** |
| 是否获得官方授权/配额承诺 | **否** |
| 是否已接入真实数据 | **否——仅为可行性调查** |
