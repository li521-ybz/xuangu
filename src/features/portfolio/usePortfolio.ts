// 模块③ 持仓：状态编排（交易流水 + 实时行情 + 每日净值快照）
//
// 存储：交易流水与净值快照都落 localStorage（纯静态站点无后端），键见 store.ts。
// 快照口径：成本基准净值 = 100 × (持仓市值 + 累计已实现) / 持仓成本额；
//   加仓/减仓会让分母跳变，因此曲线用于看「相对当前成本的累计盈亏趋势」，不是严格时间加权净值。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EquitySnapshot, Trade } from '../../lib/types';
import { loadJSON, saveJSON, newId } from '../../lib/store';
import { todayStr } from '../../lib/marketList';
import { useQuotes } from '../quotes/useQuotes';
import { buildHoldings, summarizePortfolio, withQuotes } from './portfolio';

const TRADES_KEY = 'portfolio.trades.v1';
const EQUITY_KEY = 'portfolio.equity.v1';

export type NewTrade = Omit<Trade, 'id' | 'seq'>;

export function usePortfolio() {
  const [trades, setTrades] = useState<Trade[]>(() => loadJSON<Trade[]>(TRADES_KEY, []));
  const [equity, setEquity] = useState<EquitySnapshot[]>(() => loadJSON<EquitySnapshot[]>(EQUITY_KEY, []));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveJSON(TRADES_KEY, trades);
  }, [trades]);
  useEffect(() => {
    saveJSON(EQUITY_KEY, equity);
  }, [equity]);

  const { holdings, realizedTotal } = useMemo(() => buildHoldings(trades), [trades]);
  const symbols = useMemo(() => holdings.map((h) => h.symbol), [holdings]);
  const { quotes, refresh } = useQuotes(symbols);
  const rows = useMemo(() => withQuotes(holdings, quotes), [holdings, quotes]);
  const summary = useMemo(() => summarizePortfolio(rows, realizedTotal), [rows, realizedTotal]);

  // 每日净值快照：同一天覆盖写入；成本额为 0（空仓）时跳过
  useEffect(() => {
    if (summary.costAmount <= 0) return;
    const value = (100 * (summary.marketValue + realizedTotal)) / summary.costAmount;
    if (!Number.isFinite(value) || value <= 0) return;
    const date = todayStr();
    setEquity((prev) => {
      const idx = prev.findIndex((p) => p.date === date);
      const rounded = Math.round(value * 100) / 100;
      if (idx >= 0) {
        if (Math.abs(prev[idx].value - rounded) < 0.005) return prev; // 无变化不重写
        const next = [...prev];
        next[idx] = { date, value: rounded };
        return next;
      }
      return [...prev, { date, value: rounded }];
    });
  }, [summary.marketValue, summary.costAmount, realizedTotal]);

  const addTrade = useCallback((input: NewTrade) => {
    setError(null);
    if (!input.symbol.trim()) {
      setError('股票代码不能为空');
      return;
    }
    if (!(input.qty > 0)) {
      setError('数量必须大于 0');
      return;
    }
    setTrades((prev) => [
      ...prev,
      { ...input, id: newId('trade'), seq: prev.length }
    ]);
  }, []);

  const removeTrade = useCallback((id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setTrades([]);
    setEquity([]);
  }, []);

  return {
    trades,
    equity,
    holdings,
    rows,
    summary,
    error,
    addTrade,
    removeTrade,
    clearAll,
    refresh
  };
}
