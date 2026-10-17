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
