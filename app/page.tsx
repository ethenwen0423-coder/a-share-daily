const indices = [
  { name: "上证指数", code: "000001.SH", value: "3,996.16", change: "-1.00%" },
  { name: "深证成指", code: "399001.SZ", value: "15,046.67", change: "-2.29%" },
  { name: "创业板指", code: "399006.SZ", value: "3,842.73", change: "-4.37%" },
  { name: "沪深300", code: "000300.SH", value: "4,780.79", change: "-1.96%" },
];

const sectorRows = [
  { name: "科创50", tag: "周度强势", value: "+4.52%", width: "92%", tone: "up" },
  { name: "计算机", tag: "低位补涨", value: "+3.53%", width: "78%", tone: "up" },
  { name: "传媒", tag: "AI应用", value: "+2.74%", width: "66%", tone: "up" },
  { name: "电力设备", tag: "估值消化", value: "-8.87%", width: "74%", tone: "down" },
  { name: "建筑材料", tag: "需求承压", value: "-12.43%", width: "96%", tone: "down" },
];

const scenarios = [
  {
    label: "基准",
    probability: "55%",
    title: "分化延续，业绩接棒题材",
    signal: "沪指守住 3,950，成交维持 2.8–3.3 万亿元",
    action: "等待盈利验证，优先低拥挤度与中报确定性。",
  },
  {
    label: "上行",
    probability: "25%",
    title: "风险偏好修复，科技扩散",
    signal: "成交重回 3.3 万亿元以上，创业板收复关键均线",
    action: "关注半导体向 AI 应用、券商的扩散持续性。",
  },
  {
    label: "下行",
    probability: "20%",
    title: "油价冲击放大，成长去估值",
    signal: "外盘油价跳升、沪指跌破 3,950 且缩量反抽",
    action: "降低高估值暴露，关注现金流、防御和能源链对冲。",
  },
];

export default function Home() {
  return (
    <main>
      <header className="siteHeader">
        <a className="brand" href="#top" aria-label="市场脉搏首页">
          <span className="brandMark">脉</span>
          <span>市场脉搏</span>
        </a>
        <nav aria-label="页面导航">
          <a href="#overview">市场概览</a>
          <a href="#sectors">板块温度</a>
          <a href="#scenarios">情景推演</a>
          <a href="#sources">数据来源</a>
        </nav>
        <div className="dateChip">2026.07.12 · 周日</div>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy">
          <div className="eyebrow"><span /> A 股分析日报 · 第 001 期</div>
          <h1>指数重挫，<br /><em>个股普涨</em></h1>
          <p className="heroDeck">
            权重与高估值成长集中回撤，但市场宽度显著改善。下周的关键不是猜指数反弹，
            而是验证“低位补涨”能否被成交量、中报业绩与外部风险共同确认。
          </p>
          <div className="heroMeta">
            <span><b>数据截止</b> 7月10日收盘</span>
            <span><b>资讯截止</b> 7月12日 12:10 CST</span>
            <span><b>研究姿态</b> 等待证据</span>
          </div>
        </div>
        <aside className="callCard" aria-label="今日核心判断">
          <span className="cardLabel">EXECUTIVE CALL</span>
          <div className="callNumber">69<span>%</span></div>
          <p>上涨个股占已统计涨跌股票的比例，和指数表现形成强烈背离。</p>
          <div className="callDivider" />
          <div className="callRow"><span>上涨 / 下跌</span><b>3,772 / 1,678</b></div>
          <div className="callRow"><span>涨停 / 跌停</span><b>94 / 5</b></div>
          <div className="callRow"><span>两市成交额</span><b>3.39 万亿元</b></div>
          <div className="status"><i /> 主线不清，偏轮动</div>
        </aside>
      </section>

      <section className="indexStrip" id="overview" aria-label="主要指数">
        {indices.map((item) => (
          <article className="indexItem" key={item.code}>
            <div><span>{item.name}</span><small>{item.code}</small></div>
            <strong>{item.value}</strong>
            <b>{item.change}</b>
          </article>
        ))}
      </section>

      <section className="section introSection">
        <div className="sectionHeading">
          <div><span className="sectionNo">01</span><p>MARKET DIAGNOSIS</p></div>
          <h2>宽度转暖，不等于趋势反转</h2>
        </div>
        <div className="diagnosisGrid">
          <article className="breadthPanel">
            <div className="panelHead"><h3>市场宽度</h3><span>单位：家</span></div>
            <div className="breadthVisual" aria-label="上涨3772家，下跌1678家">
              <div className="breadthUp" style={{ width: "69.2%" }}><b>3,772</b><span>上涨</span></div>
              <div className="breadthDown" style={{ width: "30.8%" }}><b>1,678</b><span>下跌</span></div>
            </div>
            <div className="breadthNotes">
              <span><i className="redDot" /> 权重股回撤拖累指数</span>
              <span><i className="blueDot" /> 低位个股扩散修复</span>
            </div>
          </article>
          <article className="thesisPanel">
            <span className="panelKicker">今日解释</span>
            <h3>指数下跌与个股普涨同时出现，说明资金正在重排，而不是全面撤退。</h3>
            <p>
              创业板指单日跌幅达到 4.37%，显著弱于上证指数；与此同时，上涨家数超过下跌家数两倍。
              这更像高估值与大市值品种集中去风险，叠加低位方向补涨。真正的趋势信号，要看下周成交能否维持高位、
              强势板块能否从情绪扩散到盈利验证。
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="sectors">
        <div className="sectionHeading">
          <div><span className="sectionNo">02</span><p>SECTOR TEMPERATURE</p></div>
          <h2>科技占优，但交易拥挤度上升</h2>
        </div>
        <div className="sectorGrid">
          <article className="sectorTable">
            <div className="tableCaption"><span>近一周相对表现</span><small>2026.07.06—07.10</small></div>
            {sectorRows.map((row) => (
              <div className="sectorRow" key={row.name}>
                <div className="sectorName"><b>{row.name}</b><span>{row.tag}</span></div>
                <div className="barTrack"><i className={row.tone} style={{ width: row.width }} /></div>
                <strong className={row.tone}>{row.value}</strong>
              </div>
            ))}
            <p className="tableFoot">板块数据为周度口径，不与上方单日指数数据直接比较。</p>
          </article>
          <article className="watchPanel">
            <div className="panelHead"><h3>下周研究队列</h3><span>按证据优先级</span></div>
            <ol>
              <li><span>01</span><div><b>半导体国产链</b><p>产业催化仍在，但需验证高波动后的承接与业绩兑现。</p></div></li>
              <li><span>02</span><div><b>券商</b><p>中报预喜密集，观察盈利高增能否转化为估值扩张。</p></div></li>
              <li><span>03</span><div><b>创新药</b><p>趋势品种回踩后的韧性，比单日涨幅更重要。</p></div></li>
              <li><span>04</span><div><b>能源与航运</b><p>仅作为霍尔木兹风险的情景映射，等待油价和运价确认。</p></div></li>
            </ol>
          </article>
        </div>
      </section>

      <section className="transmission section">
        <div className="sectionHeading lightHeading">
          <div><span className="sectionNo">03</span><p>TRANSMISSION MAP</p></div>
          <h2>周末变量如何传导至 A 股</h2>
        </div>
        <div className="eventStatus">
          <span>已报道事件</span>
          <p>央视新闻报道霍尔木兹海峡暂时关闭。事件发生于 A 股休市期间，价格影响尚未由国内市场确认。</p>
        </div>
        <div className="chain" role="list" aria-label="风险传导链">
          <div className="chainNode" role="listitem"><small>EVENT</small><b>航运安全风险上升</b><span>周末新增变量</span></div>
          <i>→</i>
          <div className="chainNode" role="listitem"><small>FIRST VARIABLE</small><b>油价与运价波动</b><span>先看外盘定价</span></div>
          <i>→</i>
          <div className="chainNode" role="listitem"><small>EARNINGS</small><b>成本与利润再分配</b><span>能源受益 / 运输承压</span></div>
          <i>→</i>
          <div className="chainNode accentNode" role="listitem"><small>A-SHARE ACTION</small><b>等待开盘验证</b><span>不预判，不追价</span></div>
        </div>
        <div className="impactRows">
          <div><span className="impactTag positive">潜在受益</span><b>油气开采、油服、部分煤化工</b><p>利润弹性取决于油价持续时间，不等同于一次性高开。</p></div>
          <div><span className="impactTag negative">潜在承压</span><b>航空、化纤下游、物流链</b><p>燃料与原料成本上升将先压缩利润预期，需看套保与传导能力。</p></div>
          <div><span className="impactTag neutral">二阶影响</span><b>成长股估值与风险偏好</b><p>若油价推升通胀预期，长久期成长资产可能继续承压。</p></div>
        </div>
      </section>

      <section className="section" id="scenarios">
        <div className="sectionHeading">
          <div><span className="sectionNo">04</span><p>SCENARIO MATRIX</p></div>
          <h2>三种路径，只交易被确认的那一种</h2>
        </div>
        <div className="scenarioGrid">
          {scenarios.map((item) => (
            <article className="scenarioCard" key={item.label}>
              <div className="scenarioTop"><span>{item.label}</span><b>{item.probability}</b></div>
              <h3>{item.title}</h3>
              <dl><dt>确认信号</dt><dd>{item.signal}</dd><dt>研究动作</dt><dd>{item.action}</dd></dl>
            </article>
          ))}
        </div>
        <div className="monitorBar">
          <b>周一开盘核验顺序</b>
          <span>① 油价与离岸风险资产</span><span>② 沪指 3,950</span><span>③ 两市成交 3 万亿元</span><span>④ 半导体与券商相对强度</span>
        </div>
      </section>

      <section className="section sources" id="sources">
        <div className="sourceIntro">
          <span className="sectionNo">05</span>
          <h2>来源、口径与限制</h2>
          <p>这是一份研究信息，不构成任何证券买卖建议。未提供具体持仓，因此页面仅给出观察队列与证据阈值。</p>
        </div>
        <div className="sourceList">
          <div><span>行情与市场宽度</span><p>同花顺问财，2026年7月10日收盘数据。指数成交额存在口径重叠，页面仅采用两市总成交额。</p><a href="https://www.iwencai.com/unifiedwap/chat" target="_blank" rel="noreferrer">访问数据源 ↗</a></div>
          <div><span>周度板块与策略背景</span><p>东方财富妙想资讯搜索：浙商证券、湘财证券、华源证券等 7月10—12日公开研究摘要。</p><a href="https://www.eastmoney.com/" target="_blank" rel="noreferrer">访问资讯源 ↗</a></div>
          <div><span>周末事件</span><p>央视新闻客户端，2026年7月12日 07:14 报道。事件持续性与市场价格影响需进一步核验。</p><a href="https://news.cctv.com/" target="_blank" rel="noreferrer">访问新闻源 ↗</a></div>
        </div>
      </section>

      <footer>
        <div className="brand"><span className="brandMark">脉</span><span>市场脉搏</span></div>
        <p>把噪音变成因果，把观点变成可核验的信号。</p>
        <span>© 2026 市场脉搏 · A股分析日报</span>
      </footer>
    </main>
  );
}
