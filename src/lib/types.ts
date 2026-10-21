// 核心领域类型：选股 APP 跨模块共用

export type GroupName = string;

export interface Stock {
  id: string;
  symbol: string; // 交易所代码，如 sh600000 / sz000001
  name: string;
  group: GroupName; // 分组：持仓 / 观察 / 自定义
}

export interface Quote {
  symbol: string;
  name: string;
  price: number; // 最新价
  prevClose: number; // 昨收
  change: number; // 涨跌额 = price - prevClose
  changePct: number; // 涨跌幅(%) = change / prevClose * 100
  time?: string;
}

// 日K / 30分K / 60分K 一根 K 线
export interface Candle {
  date: string; // 日K：YYYY-MM-DD；分钟K：YYYYMMDDHHmm（如 202610161400）
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 分时图一个数据点
export interface IntradayPoint {
  time: string; // HH:MM
  price: number;
}

/** 全市场快照一行：看盘总览的市场宽度与排行榜共用（模块① 数据层，见 lib/marketStats.ts） */
export interface MarketRow {
  symbol: string; // sh600000
  code: string; // 600000
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  amount: number; // 成交额（元）
  turnover?: number; // 换手率（%），腾讯兜底时可缺
  mainInflow?: number; // 主力净流入（元），仅东财源提供
  limitPct: number; // 该股板幅（10/20/5），用于涨跌停判定
}

export interface MarketSnapshot {
  source: 'eastmoney' | 'tencent';
  rows: MarketRow[];
  fetchedAt: number;
}

export interface Breadth {
  up: number;
  down: number;
  flat: number;
  limitUp: number;
  limitDown: number;
  amount: number; // 全市场成交额（元）
  mainInflow?: number; // 全市场主力净流入（元）
  total: number;
}

/** 指数卡一行 */
export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

/** 交易流水（模块③ 持仓录入）：一条买卖记录，成本按移动加权在 portfolio.ts 里算 */
export interface Trade {
  id: string;
  symbol: string; // sh600000
  name: string;
  side: 'buy' | 'sell';
  price: number;
  qty: number;
  fee: number; // 费用合计（佣金+印花税+过户费）
  date: string; // YYYY-MM-DD
  note?: string;
  seq?: number; // 录入顺序，保证同日多笔可重现
}

/** 净值/收益率快照（持仓与模拟盘共用结构） */
export interface EquitySnapshot {
  date: string; // YYYY-MM-DD
  value: number;
}
