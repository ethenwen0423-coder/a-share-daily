# 量化策略实验室

面向 A 股研究者的可视化量化策略回测 MVP。用户无需编写 Python，可以选择标的、配置技术指标、组合交易条件、设置交易成本与风控规则，并查看完整净值、回撤、绩效和交易证据。

> 仅用于研究与历史回测，不接入实盘交易，不构成投资建议。

## 已实现功能

- A 股、ETF、主要指数的日线单标的回测。
- AKShare 统一数据适配层，覆盖股票、ETF、指数接口及字段清洗。
- SQLite 行情缓存；优先读缓存，缺少区间时补拉，不生成虚假行情。
- SMA、EMA、WMA、MACD、RSI、布林带、成交量均线、ATR、ROC、CCI、威廉指标、OBV 注册式指标引擎。
- 大于、大于等于、小于、小于等于、等于、不等于、上穿、下穿，以及 AND / OR 条件组。
- 固定仓位比例、固定止损、固定止盈、最大持仓天数。
- T 日收盘确认信号，T+1 开盘成交；A 股/ETF 按 100 股整数手。
- 手续费、卖出印花税、滑点、可配置最低佣金。
- 策略版本、回测记录、指标、权益曲线和交易明细持久化。
- FastAPI OpenAPI 文档、React 策略工作台、运行状态、报告和历史记录。
- 固定种子模拟行情用于离线测试和公网演示；收益不是写死结果。

## 系统架构

```text
backend/app/data          AKShare 与缓存
backend/app/indicators    指标注册与计算
backend/app/strategies    安全规则解释器（无 eval/exec）
backend/app/backtest      T+1 事件驱动回测引擎
backend/app/analytics     绩效指标
backend/app/models        SQLAlchemy 数据模型
backend/app/api           FastAPI 路由
frontend/src              React + TypeScript + ECharts
app                       Sites 公网发布入口，共用 React 产品代码
```

## 环境要求

- Python 3.13（本机已验证）
- Node.js 22+
- npm 10+

## 安装

```bash
python3.13 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm install
npm --prefix frontend install
scripts/init_db.sh
```

## 启动

一键启动本地 FastAPI 与 Vite：

```bash
scripts/dev.sh
```

也可以分别启动：

```bash
scripts/start_backend.sh
scripts/start_frontend.sh
```

- 前端：http://127.0.0.1:5173
- API：http://127.0.0.1:8000
- OpenAPI：http://127.0.0.1:8000/docs

## 测试与构建

```bash
npm run test:all
```

该命令依次执行后端 pytest、前端类型检查、前端生产构建、Sites 生产构建和服务端渲染测试。后端测试使用固定 CSV，不依赖实时网络。

## AKShare 数据口径

- 股票：`stock_zh_a_hist`
- ETF：`fund_etf_hist_em`
- 指数：`index_zh_a_hist`
- 统一清洗为 `trade_date/open/high/low/close/volume/amount`。
- 日期升序、重复交易日去重、数值和 OHLC 合法性校验。
- 请求失败、返回空数据或字段异常时停止回测并返回明确错误。
- `data_snapshot_time` 记录行情获取时间；同一行情、参数和策略版本可复现结果。

## 成交与成本口径

1. T 日收盘后计算指标并确认信号。
2. 最早在 T+1 个可交易日按开盘价成交。
3. 买入价 = 原始开盘价 × (1 + 滑点率)。
4. 卖出价 = 原始开盘价 × (1 - 滑点率)。
5. 买卖均收佣金，卖出额外收印花税；最低佣金为独立参数。
6. 止损、止盈基于收盘确认，下一交易日开盘成交。
7. 默认回测结束时按最后交易日收盘价强制平仓，报告会记录该原因。

## 绩效指标

- 累计收益：期末资产 / 初始资产 - 1。
- 年化收益：按 252 个交易日折算。
- 年化波动：日收益标准差 × √252。
- 夏普：日均超额收益 / 日收益标准差 × √252。
- 最大回撤：净值相对历史峰值的最大跌幅。
- 无交易、标准差为零、样本过短等场景返回 `null`，不使用误导性的零。

## 当前限制

- 只支持日线、单标的和固定仓位比例。
- 本地 Python 服务提供真实 AKShare 与 SQLite 持久化；公网 Sites 版本提供固定种子演示，不托管 Python 进程。
- 回测同步执行，长区间或高并发需迁移到后台任务队列。
- 暂不处理涨跌停无法成交、停牌、分红现金流和复杂复权事件。
- 不支持分钟线、多标的选股、机器学习、参数寻优、多用户和实盘交易。

## 下一阶段

1. 增加后台任务与进度事件。
2. 补充涨跌停、停牌、公司行动等 A 股微观结构。
3. 支持多标的组合、基准指数与再平衡。
4. 将 SQLite 迁移 PostgreSQL，并增加用户权限。
5. 在严格隔离研究与交易后，再评估模拟盘接入。
