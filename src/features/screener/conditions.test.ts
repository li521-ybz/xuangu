// 模块④ 条件引擎测试：涨停回调 + 分钟级买点（fixture 手工构造，逐条覆盖口径）
import { describe, it, expect } from 'vitest';
import type { Candle } from '../../lib/types';
import {
  bollBands,
  bollNarrowing,
  closeAboveMa10,
  crossUp,
  evalBuyPoint,
  evalMainConditions,
  findLimitUpIndex,
  firstLimitUpInRun,
  isLimitUp,
  isStStock,
  limitPctFor,
  DEFAULT_TOGGLES
} from './conditions';

/** 由收盘序列造 K 线；lows/vols 缺省派生 */
function mk(closes: number[], lows?: number[], vols?: number[]): Candle[] {
  return closes.map((close, i) => ({
    date: `d${String(i).padStart(3, '0')}`,
    open: close,
    high: close * 1.005,
    low: lows ? lows[i] : close * 0.995,
    close,
    volume: vols ? vols[i] : 1000
  }));
}

/** 主条件全过 fixture：20 根缓涨 → 涨停日 T(距最新 4 日) → 4 根高位整理 */
function mainPassFixture() {
  const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01); // 10.00~10.19
  const closes = [...pre, 11.21, 11.25, 11.22, 11.30, 11.35]; // T=20，涨停 +10.01%
  const lows = [...pre.map((c) => c * 0.99), 11.0, 11.05, 11.1, 11.15, 11.2];
  const vols = [...pre.map(() => 1000), 10000, 8000, 5000, 7000, 6000]; // 最低 5000 = 基准 50%
  return mk(closes, lows, vols);
}

describe('涨停识别（分板块阈值）', () => {
  it('主板 ±10%：+10% 是涨停，+9% 不是', () => {
    const c = mk([10, 11, 10.9]);
    expect(isLimitUp(c, 1, '600000', '测试')).toBe(true);
    expect(isLimitUp(c, 2, '600000', '测试')).toBe(false);
  });

  it('双创 ±20%：+20% 是涨停，+15% 不是', () => {
    const c = mk([10, 12, 11.5]);
    expect(isLimitUp(c, 1, '300001', '测试')).toBe(true);
    expect(isLimitUp(c, 2, '301001', '测试')).toBe(false);
  });

  it('北交所 ±30%：+30% 是涨停，+25% 不是', () => {
    const c = mk([10, 13, 12.5]);
    expect(isLimitUp(c, 1, '830001', '测试')).toBe(true);
    expect(isLimitUp(c, 2, '830001', '测试')).toBe(false);
  });

  it('ST ±5%：+5% 是涨停，+4% 不是；阈值函数去交易所前缀', () => {
    const c = mk([10, 10.5, 10.4]);
    expect(isLimitUp(c, 1, 'sh600000', 'ST 测试')).toBe(true);
    expect(isLimitUp(c, 2, 'sh600000', 'ST 测试')).toBe(false);
    expect(limitPctFor('sz000001', '平安银行')).toBe(10);
    expect(limitPctFor('688001', '测试')).toBe(20);
    expect(limitPctFor('bj430001', '*ST 测试')).toBe(5);
  });

  it('边界：首根无前收，不算涨停', () => {
    expect(isLimitUp(mk([11]), 0, '600000', '测试')).toBe(false);
  });
});

describe('ST 识别（剔除项，2026-10-18）', () => {
  it('名称含 ST/*ST/S*ST → ST 股；普通名/空名/大小写 → 否', () => {
    expect(isStStock('ST 高鸿')).toBe(true);
    expect(isStStock('*ST 宏图')).toBe(true);
    expect(isStStock('S*ST 沪科')).toBe(true);
    expect(isStStock('st 测试')).toBe(true); // 大小写不敏感
    expect(isStStock('平安银行')).toBe(false);
    expect(isStStock('')).toBe(false);
  });

  it('DEFAULT_TOGGLES.excludeSt 默认开', () => {
    expect(DEFAULT_TOGGLES.excludeSt).toBe(true);
  });
});

describe('涨停日查找（窗口内最近一个）', () => {
  it('窗口 [3,10] 内有两个涨停 → 取更近的', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    // T1=20（距 6 日）、T2=22（距 4 日），最新=26
    const closes = [...pre, 11.21, 11.3, 12.43, 12.5, 12.55, 12.6, 12.65];
    expect(findLimitUpIndex(mk(closes), '600000', '测试')).toBe(22);
  });

  it('窗口外涨停（距 1 日）→ 找不到；关窗口开关后可作锚点', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const closes = [...pre, 10.3, 10.31, 11.34]; // 涨停在最后一根，距 0 日
    const c = mk(closes);
    expect(findLimitUpIndex(c, '600000', '测试', 3, 10)).toBe(-1);
    expect(findLimitUpIndex(c, '600000', '测试', 0, 0)).toBe(22);
  });

  it('firstLimitUpInRun：单板返回自身；连板回溯到第一个涨停日', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const c = mk([...pre, 11.21, 12.33, 12.4]); // 20、21 连续两个涨停
    expect(firstLimitUpInRun(c, 21, '600000', '测试')).toBe(20);
    expect(firstLimitUpInRun(c, 20, '600000', '测试')).toBe(20);
  });
});

describe('主条件评估（日K）', () => {
  it('全过：涨停后 4 日、缩量 50%、不破最低价、收盘 > MA20', () => {
    const r = evalMainConditions(mainPassFixture(), { code: 'sh600000', name: '测试' });
    expect(r.pass).toBe(true);
    expect(r.limitUpIndex).toBe(20);
    expect(r.daysSinceLimitUp).toBe(4);
    expect(r.shrinkActual).toBe(0.5);
    expect(r.failReasons).toEqual([]);
  });

  it('窗口外无涨停 → 不过', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const r = evalMainConditions(mk([...pre, 10.3, 10.31, 11.34]), { code: '600000', name: '测试' });
    expect(r.pass).toBe(false);
    expect(r.failReasons).toContain('窗口内无涨停');
  });

  it('未缩量至 55% → 不过', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const closes = [...pre, 11.21, 11.25, 11.22, 11.3, 11.35];
    const lows = [...pre.map((c) => c * 0.99), 11, 11.05, 11.1, 11.15, 11.2];
    const vols = [...pre.map(() => 1000), 10000, 8000, 7000, 7500, 7200];
    const r = evalMainConditions(mk(closes, lows, vols), { code: '600000', name: '测试' });
    expect(r.pass).toBe(false);
    expect(r.failReasons).toEqual(['未缩量至 55%（最低 70%）']);
  });

  it('单板：跌破首板（=涨停日）最低价 → 不过', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const closes = [...pre, 11.21, 11.25, 11.22, 11.3, 11.35];
    const lows = [...pre.map((c) => c * 0.99), 11, 10.9, 11.1, 11.15, 11.2]; // T+1 破 11.0
    const vols = [...pre.map(() => 1000), 10000, 8000, 5000, 7000, 6000];
    const r = evalMainConditions(mk(closes, lows, vols), { code: '600000', name: '测试' });
    expect(r.pass).toBe(false);
    expect(r.failReasons).toEqual(['跌破首板最低价']);
  });

  it('二板：T+1 低点介于首板与二板低点之间 → 过（基准取首板低点，非二板）', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    // 首板 T1=20（low 11.0）→ 二板 T2=21（low 11.4）→ T+1 低点 11.2：破二板低点、不破首板低点
    const closes = [...pre, 11.21, 12.33, 12.4, 12.5, 12.55];
    const lows = [...pre.map((c) => c * 0.99), 11.0, 11.4, 11.2, 11.5, 11.6];
    const vols = [...pre.map(() => 1000), 10000, 8000, 4000, 7000, 6000]; // 最低 4000 = 基准(max(8000,4000)) 50%
    const r = evalMainConditions(mk(closes, lows, vols), { code: '600000', name: '测试' });
    expect(r.pass).toBe(true);
    expect(r.limitUpIndex).toBe(21);
    expect(r.daysSinceLimitUp).toBe(3);
    expect(r.shrinkActual).toBe(0.5);
    expect(r.failReasons).toEqual([]);
  });

  it('二板：T+1 破首板低点 → 不过（即便未破二板低点）', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const closes = [...pre, 11.21, 12.33, 12.4, 12.5, 12.55];
    const lows = [...pre.map((c) => c * 0.99), 11.0, 11.4, 10.9, 11.5, 11.6]; // T+1 破首板 11.0
    const vols = [...pre.map(() => 1000), 10000, 8000, 4000, 7000, 6000];
    const r = evalMainConditions(mk(closes, lows, vols), { code: '600000', name: '测试' });
    expect(r.pass).toBe(false);
    expect(r.failReasons).toEqual(['跌破首板最低价']);
  });

  it('收盘未站上 MA20 → 不过', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const closes = [...pre, 11.21, 11.25, 11.22, 11.3, 10.0]; // 末根回落至 MA20 下方
    const lows = [...pre.map((c) => c * 0.99), 9.2, 11.0, 11.1, 11.15, 9.98];
    const vols = [...pre.map(() => 1000), 10000, 8000, 5000, 7000, 6000];
    const r = evalMainConditions(mk(closes, lows, vols), { code: '600000', name: '测试' });
    expect(r.pass).toBe(false);
    expect(r.failReasons).toEqual(['收盘未站上 MA20']);
  });

  it('窗口中段曾跌破 MA20、最新一天收回 → 过（新口径只查最新一根；原每日检查口径会挂）', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    // T=20 涨停 11.21；T+2 收 10.0（< 当日 MA20≈10.22）但最新 T+4 收 11.35（> 当日 MA20≈10.35）
    const closes = [...pre, 11.21, 11.25, 10.0, 11.3, 11.35];
    const lows = [...pre.map((c) => c * 0.99), 11, 11.05, 9.98, 11.15, 11.2];
    const vols = [...pre.map(() => 1000), 10000, 8000, 5000, 7000, 6000]; // 最低 5000 = 基准 50%
    const r = evalMainConditions(mk(closes, lows, vols), {
      code: '600000',
      name: '测试',
      toggles: { ...DEFAULT_TOGGLES, notBreakLimitLow: false } // 隔离 MA20：T+2 低点 9.98 会破首板低点，与本条无关故关掉
    });
    expect(r.pass).toBe(true);
    expect(r.failReasons).toEqual([]);
  });

  it('开关可单独关闭：关缩量后未缩量也过', () => {
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const closes = [...pre, 11.21, 11.25, 11.22, 11.3, 11.35];
    const vols = [...pre.map(() => 1000), 10000, 8000, 7000, 7500, 7200];
    const r = evalMainConditions(mk(closes, undefined, vols), {
      code: '600000',
      name: '测试',
      toggles: { ...DEFAULT_TOGGLES, shrink: false }
    });
    expect(r.pass).toBe(true);
  });

  it('边界：空数据 / 涨停即末根（无后续K线）', () => {
    expect(evalMainConditions([]).pass).toBe(false);
    const pre = Array.from({ length: 20 }, (_, i) => 10 + i * 0.01);
    const r = evalMainConditions(mk([...pre, 10.3, 10.31, 11.34]), {
      code: '600000',
      name: '测试',
      toggles: { ...DEFAULT_TOGGLES, limitUpWindow: false }
    });
    expect(r.limitUpIndex).toBe(22);
    expect(r.daysSinceLimitUp).toBe(0);
    expect(r.failReasons).toContain('涨停后无后续K线');
  });
});

describe('收盘价 > MA10（日K）', () => {
  it('上行末端站上 MA10；回落则否；数据不足否', () => {
    const up = Array.from({ length: 25 }, (_, i) => 10 + i * 0.05);
    expect(closeAboveMa10(mk(up))).toBe(true);
    const down = [...Array.from({ length: 24 }, (_, i) => 11), 9.0];
    expect(closeAboveMa10(mk(down))).toBe(false);
    expect(closeAboveMa10(mk([10, 10.1, 10.2]))).toBe(false);
  });
});

describe('BOLL 与缩口', () => {
  it('带计算：数据不足置 null；末根零方差带=中轨', () => {
    const b = bollBands([10, 10, 10, 10, 10, 12, 12, 12], 3, 2);
    expect(b[0]).toBeNull();
    expect(b[7]).toEqual({ mid: 12, upper: 12, lower: 12 });
    expect(b[6]?.mid).toBeCloseTo(11.333, 2);
  });

  it('缩口：尾段方差收敛为真，发散/数据不足为假', () => {
    const calm = [...Array.from({ length: 10 }, () => 10), 9.7, 9.8, 9.9, 10, 10, 10];
    expect(bollNarrowing(mk(calm), 3, 2)).toBe(true);
    const wild = [...Array.from({ length: 10 }, () => 10), 10, 10, 10, 9.9, 9.8, 9.7];
    expect(bollNarrowing(mk(wild), 3, 2)).toBe(false);
    expect(bollNarrowing(mk([10, 11, 12]), 20, 2)).toBe(false);
  });
});

describe('MA13 上穿 MA25', () => {
  it('横盘后急拉 → 5 根内金叉为真；全程平盘为假', () => {
    const rise = [...Array.from({ length: 25 }, () => 10), 10.1, 10.2, 10.3, 10.4, 10.5];
    expect(crossUp(mk(rise), 13, 25)).toBe(true);
    expect(crossUp(mk(Array.from({ length: 30 }, () => 10)), 13, 25)).toBe(false);
  });
});

describe('买点评估（按距涨停日数分支）', () => {
  const dayUp = Array.from({ length: 25 }, (_, i) => 10 + i * 0.05); // 收盘 > MA10
  /**
   * 30 分：前 40 根震荡 ±0.5、中 10 根收敛 ±0.1、末 5 根缓抬。
   * 满足 BOLL(45,2) 缩口（末 3 根带宽 0.16979>0.16752>0.16497 持续下降）
   * 与 13/25 金叉（i=52，落在最近 5 根内）。
   * 2026-10-17 21:09 用户澄清：两分支均要求 30 分 13/25 金叉，近/远分支复用同一 fixture。
   */
  const m30Narrow = (() => {
    const c: number[] = [];
    for (let i = 0; i < 40; i++) c.push(i % 2 ? 9.5 : 10.5);
    for (let i = 0; i < 10; i++) c.push(i % 2 ? 9.9 : 10.1);
    for (let i = 0; i < 5; i++) c.push(10 + i * 0.05);
    return mk(c);
  })();
  /**
   * 30 分：前 40 根震荡 ±0.5、中 10 根收敛 ±0.1、末 5 根缓降（9.90→9.86）。
   * 满足 BOLL(45,2) 缩口（末 3 根带宽 0.17019>0.16778>0.16531 持续下降），
   * 但 MA13 末 5 根全程低于 MA25（无上穿）——供 >6 日分支「30 分未金叉」用例。
   */
  const m30NarrowNoCross = (() => {
    const c: number[] = [];
    for (let i = 0; i < 40; i++) c.push(i % 2 ? 9.5 : 10.5);
    for (let i = 0; i < 10; i++) c.push(i % 2 ? 9.9 : 10.1);
    for (let i = 0; i < 5; i++) c.push(9.9 - i * 0.01);
    return mk(c);
  })();
  const m60Cross = mk([...Array.from({ length: 25 }, () => 10), 10.1, 10.2, 10.3, 10.4, 10.5]);
  const m60Flat = mk(Array.from({ length: 30 }, () => 10));
  const m30Flat = mk(Array.from({ length: 30 }, () => 10));

  it('≤6 日分支：30 分 BOLL(45,2) 缩口 + 30 分 13/25 金叉 → 过', () => {
    const r = evalBuyPoint({ dayCandles: mk(dayUp), m30: m30Narrow, m60: m60Flat, daysSinceLimitUp: 4 });
    expect(r.branch).toBe('near');
    expect(r.pass).toBe(true);
    expect(r.checks).toEqual({ closeAboveMa10: true, bollNarrow: true, maCross: true });
  });

  it('≤6 日分支：30 分平盘 → 缩口与金叉双否', () => {
    const r = evalBuyPoint({ dayCandles: mk(dayUp), m30: m30Flat, m60: m60Flat, daysSinceLimitUp: 6 });
    expect(r.branch).toBe('near');
    expect(r.pass).toBe(false);
    expect(r.failReasons).toEqual(['30 分 BOLL(45,2) 未缩口', '30 分 MA13/25 未金叉']);
  });

  it('>6 日分支：30 分 BOLL(45,2) 缩口 + 30 分/60 分 13/25 金叉 → 过', () => {
    const r = evalBuyPoint({ dayCandles: mk(dayUp), m30: m30Narrow, m60: m60Cross, daysSinceLimitUp: 8 });
    expect(r.branch).toBe('far');
    expect(r.pass).toBe(true);
  });

  it('>6 日分支：60 分未金叉 → 不过；关该开关后放行', () => {
    const r = evalBuyPoint({ dayCandles: mk(dayUp), m30: m30Narrow, m60: m60Flat, daysSinceLimitUp: 9 });
    expect(r.branch).toBe('far');
    expect(r.failReasons).toEqual(['60 分 MA13/25 未金叉']);
    const r2 = evalBuyPoint({
      dayCandles: mk(dayUp),
      m30: m30Narrow,
      m60: m60Flat,
      daysSinceLimitUp: 9,
      toggles: { ...DEFAULT_TOGGLES, maCross60: false }
    });
    expect(r2.pass).toBe(true);
  });

  it('>6 日分支：30 分未金叉 → 不过；关该开关后放行', () => {
    const r = evalBuyPoint({ dayCandles: mk(dayUp), m30: m30NarrowNoCross, m60: m60Cross, daysSinceLimitUp: 9 });
    expect(r.branch).toBe('far');
    expect(r.failReasons).toEqual(['30 分 MA13/25 未金叉']);
    const r2 = evalBuyPoint({
      dayCandles: mk(dayUp),
      m30: m30NarrowNoCross,
      m60: m60Cross,
      daysSinceLimitUp: 9,
      toggles: { ...DEFAULT_TOGGLES, bollNarrow: false }
    });
    expect(r2.pass).toBe(true);
  });

  it('收盘未站上 MA10 → 不过', () => {
    const r = evalBuyPoint({ dayCandles: mk([...dayUp.slice(0, 24), 9.0]), m30: m30Narrow, m60: m60Cross, daysSinceLimitUp: 4 });
    expect(r.pass).toBe(false);
    expect(r.failReasons).toContain('收盘未站上 MA10');
  });
});
