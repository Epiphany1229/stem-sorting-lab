# 演示模式样本（真实官方数据快照）

> ⚠️ 这不是编造的数据，而是**官方月表在某一时点的真实快照**，用于演示模式与离线开发。
> 页面使用本文件时必须常驻「示範資料」标识，且默认不启用。

## 来源
- 接口：`https://data.weather.gov.hk/weatherAPI/opendata/opendata.php`
- dataType：`CLMMAXT`（日最高温）、`CLMMINT`（日最低温）
- 站点：HKO, KP, SHA
- 年月：2026-09
- 抓取时间：2026-10-23T20:15:35+08:00
- 成功请求：6 次（串行，间隔 ≥3 秒）
- 生成脚本：`.tools/reference/export_stage3_assets.py`

## 字段
| 列 | 说明 |
|---|---|
| `obs_date` | 观测日期（香港时区自然日） |
| `station_id` | 官方站号（见 `backend/app/data_sources/hko/stations.json`） |
| `metric` | `tmax` / `tmin` |
| `value_raw` | 官方原始字符串，保留一位小数精度 |
| `unit` | `°C` |
| `quality_flag` | 官方标记：`C` 完整 / `#` 不完整 / `***` 无数据 |

## 已知限制
- 只覆盖 2026 年 9 月，不是「最近 30 天」的实时结果；
- 不含降雨与湿度（官方无历史日值接口）；
- 演示模式数据与 official 数据在数据库中分开存放、分开标注。
