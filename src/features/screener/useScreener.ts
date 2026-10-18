// 模块④ 选股编排：两段式拉取（日K 粗筛主条件 → 分钟K 精筛买点），进度可见
// 复用模块③ 的 fetchDaily（腾讯直连），不引入新数据源；并发受限避免打满上游。
// 两种范围共用同一引擎（2026-10-18 市场模式上线）：
//   自选股（默认）：日K 320 根（与图表一致）、并发 6、进入选股页自动跑一轮
//   沪深A股（市场）：日K 60 根走扫描专用主机（见 chartClient TX_FQKLINE_SCAN）、并发 8、手动开扫
import { useCallback, useRef, useState } from 'react';
import type { Candle, Stock } from '../../lib/types';
import { fetchDaily } from '../../lib/chartClient';
import { safeFetch } from '../../lib/fetchSafe';
import { bareSymbol } from '../../lib/symbol';
import { mapLimit } from '../../lib/mapLimit';
import {
  DEFAULT_TOGGLES,
  evalBuyPoint,
  evalMainConditions,
  isStStock,
  type BuyPointResult,
  type ConditionToggles,
  type MainResult
} from './conditions';

export type ScreenStatus = 'hit' | 'candidate' | 'no-data';

export interface ScreenRow {
  stock: Stock;
  status: ScreenStatus;
  main?: MainResult;
  buy?: BuyPointResult;
  day?: Candle[]; // 主条件用过的日K（买点评估复用，不重复拉取）
  note?: string;
}

/** 扫描参数（按范围定制；不传 = 自选股默认口径） */
export interface ScreenerOptions {
  bars?: number; // 日K条数：默认 320（自选，同图表）；市场模式 60（涨停窗口 3–10 日 + MA20 完全覆盖，流量减 80%）
  concurrency?: number; // 日K段并发：默认 6；市场模式 8
  minuteConcurrency?: number; // 分钟K段并发：默认 4
  staleDays?: number; // 日K新鲜度阈值（天）：最后一根K线更早 → 记数据缺失。默认 20（覆盖春节休市）；
  // 防退市/长期停牌票返回陈旧K线产生假信号（腾讯对死票仍返回最后停板价，名单层无法过滤）
  scanHost?: boolean; // 日K走 ifzq.gtimg.cn 扫描专用主机（市场模式；与图表 web.ifzq 域名隔离，WAF 不互累）
}

/** 日K新鲜度检查：最后一根K线距今天数超过阈值 → 抛错（上层记为数据缺失行） */
function assertFresh(day: Candle[], staleDays: number): void {
  const last = day[day.length - 1];
  if (!last) throw new Error('日K无数据');
  const raw = last.date.replace(/-/g, ''); // 兼容 YYYY-MM-DD / YYYYMMDD
  const t = Date.parse(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00`);
  if (Number.isNaN(t)) throw new Error(`K线日期无法解析：${last.date}`);
  const days = (Date.now() - t) / 86400000;
  if (days > staleDays) throw new Error(`数据陈旧（最后交易日 ${raw.slice(0, 10)}）`);
}

/** 进度文案的预计剩余（启动初期误差大，<1s 不显示） */
function etaText(startedAt: number, now: number, done: number, total: number): string {
  if (done <= 0 || total <= done) return '';
  const elapsed = now - startedAt;
  if (elapsed < 1000) return '';
  const remain = ((total - done) * elapsed) / done / 1000; // 秒
  if (remain < 45) return ` · 约剩 ${Math.ceil(remain)} 秒`;
  if (remain < 90) return ' · 约剩 1 分钟';
  return ` · 约剩 ${Math.round(remain / 60)} 分钟`;
}

export function useScreener(
  stocks: Stock[],
  opts: ScreenerOptions = {},
  fetchImpl: typeof fetch = safeFetch
) {
  const [rows, setRows] = useState<ScreenRow[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [scanned, setScanned] = useState(0); // 本轮实际扫描只数（市场模式结果汇总用）
  const [toggles, setToggles] = useState<ConditionToggles>(DEFAULT_TOGGLES);
  const runId = useRef(0); // 连续点击/退出/取消时旧任务结果作废

  const run = useCallback(async () => {
    const id = ++runId.current;
    const bars = opts.bars ?? 320;
    const conc = opts.concurrency ?? 6;
    const minuteConc = opts.minuteConcurrency ?? 4;
    const staleDays = opts.staleDays ?? 20;
    setRunning(true);
    setRows([]);
    setScanned(0);
    const results: ScreenRow[] = [];
    const startedAt = Date.now();
    // 剔除 ST（默认开）：名称含 ST 的股票不扫描、不拉K线（全市场档省流量）；关开关后照常参与
    const targets = toggles.excludeSt ? stocks.filter((s) => !isStStock(s.name)) : stocks;
    try {
      // 第一段：日K → 主条件（涨停窗口/缩量/不破位）
      let done = 0;
      let lastTick = 0;
      await mapLimit(targets, conc, async (s) => {
        if (id !== runId.current) return;
        const n = ++done;
        const now = Date.now();
        if (n === targets.length || now - lastTick >= 400) {
          lastTick = now;
          setProgress(`拉取日K ${n}/${targets.length}${etaText(startedAt, now, n, targets.length)}`);
        }
        try {
          const day = await fetchDaily(s.symbol, 'day', fetchImpl, { bars, scanHost: opts.scanHost });
          assertFresh(day, staleDays);
          const main = evalMainConditions(day, { code: bareSymbol(s.symbol), name: s.name, toggles });
          if (main.pass) results.push({ stock: s, status: 'candidate', main, day });
        } catch (e) {
          results.push({ stock: s, status: 'no-data', note: `日K拉取失败：${(e as Error).message}` });
        }
      });

      // 第二段：仅主条件通过者拉分钟K → 买点分支评估
      const survivors = results.filter((r) => r.status === 'candidate');
      let bd = 0;
      await mapLimit(survivors, minuteConc, async (r) => {
        if (id !== runId.current) return;
        const n = ++bd;
        setProgress(`分析买点 ${n}/${survivors.length}`);
        try {
          const [m30, m60] = await Promise.all([
            fetchDaily(r.stock.symbol, 'm30', fetchImpl),
            fetchDaily(r.stock.symbol, 'm60', fetchImpl)
          ]);
          const buy = evalBuyPoint({
            dayCandles: r.day as Candle[],
            m30,
            m60,
            daysSinceLimitUp: (r.main as MainResult).daysSinceLimitUp,
            toggles
          });
          r.buy = buy;
          r.status = buy.pass ? 'hit' : 'candidate';
        } catch (e) {
          r.note = `分钟K拉取失败：${(e as Error).message}`;
        }
      });

      if (id !== runId.current) return;
      // 排序：买点已到 → 候选 → 数据缺失；同状态内距涨停近的排前（买点更时效）
      const order: Record<ScreenStatus, number> = { hit: 0, candidate: 1, 'no-data': 2 };
      results.sort((a, b) => {
        const d = order[a.status] - order[b.status];
        if (d !== 0) return d;
        const da = a.main?.daysSinceLimitUp ?? Number.MAX_SAFE_INTEGER;
        const db = b.main?.daysSinceLimitUp ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      });
      setRows(results);
      setScanned(done);
      setProgress('');
    } finally {
      if (id === runId.current) setRunning(false);
    }
  }, [stocks, toggles, fetchImpl, opts]);

  /** 停止本轮扫描：作废旧任务（在途请求最多 conc 个，完成后即丢弃），保留已有结果 */
  const cancel = useCallback(() => {
    runId.current++;
    setRunning(false);
    setProgress('');
  }, []);

  /** 清空结果（切换选股范围时用） */
  const reset = useCallback(() => {
    runId.current++;
    setRows([]);
    setScanned(0);
    setProgress('');
    setRunning(false);
  }, []);

  const toggle = useCallback((key: keyof ConditionToggles) => {
    setToggles((t) => ({ ...t, [key]: !t[key] }));
  }, []);

  return { rows, running, progress, scanned, toggles, toggle, run, cancel, reset };
}
