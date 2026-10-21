// 模块⑤ 模拟盘：状态编排（本地持久化 + 行情撮合 + 每日权益快照）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadJSON, saveJSON } from '../../lib/store';
import { useQuotes } from '../quotes/useQuotes';
import {
  createSimState,
  matchPending,
  placeOrder,
  settlePositions,
  todayStr,
  type PlaceInput,
  type SimState
} from './sim';

const KEY = 'sim.state.v1';

export function useSim() {
  const [state, setState] = useState<SimState>(() => loadJSON<SimState>(KEY, () => createSimState()));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    saveJSON(KEY, state);
  }, [state]);

  // 每天首次打开：T+1 解冻
  useEffect(() => {
    setState((s) => settlePositions(s, todayStr()));
  }, []);

  const symbols = useMemo(() => state.positions.map((p) => p.symbol), [state.positions]);
  const { quotes, refresh } = useQuotes(symbols);

  const prices = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [code, q] of Object.entries(quotes)) map[code] = q.price;
    return map;
  }, [quotes]);

  // 行情到位后：撮合挂单 + 记录当日权益快照（同一天覆盖；价格未变不重复处理，避免自激）
  const lastKey = useRef('');
  useEffect(() => {
    const key = `${todayStr()}|${symbols.join(',')}|${Object.entries(prices)
      .map(([k, v]) => `${k}:${v}`)
      .join(',')}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (symbols.length === 0 && state.orders.every((o) => o.status !== 'pending')) return;

    setState((s) => {
      const settled = settlePositions(s, todayStr());
      const { state: matched, filled } = matchPending(settled, prices, todayStr());
      if (filled > 0) setNotice(`挂单成交 ${filled} 笔`);
      const marketValue = matched.positions.reduce((sum, p) => {
        const price = prices[p.symbol.replace(/^[a-z]{2}/, '')] ?? prices[p.symbol];
        return sum + (price !== undefined ? price * p.qty : p.costAmount);
      }, 0);
      const total = matched.account.cash + marketValue;
      // 空仓且无挂单：不记快照（避免一条水平线）
      if (matched.positions.length === 0 && matched.orders.length === 0) return matched;
      const date = todayStr();
      const idx = matched.equity.findIndex((e) => e.date === date);
      const value = Math.round(total * 100) / 100;
      const equity =
        idx >= 0
          ? matched.equity[idx].value === value
            ? matched.equity
            : matched.equity.map((e, i) => (i === idx ? { date, value } : e))
          : [...matched.equity, { date, value }];
      return { ...matched, equity };
    });
  }, [prices, symbols, state.orders]);

  const submit = useCallback(
    (input: PlaceInput, quotePrice: number) => {
      setError(null);
      setState((s) => {
        const res = placeOrder(s, input, quotePrice, todayStr());
        if (res.error) {
          setError(res.error);
          return s;
        }
        setNotice(
          res.order.status === 'filled'
            ? `${input.side === 'buy' ? '买入' : '卖出'}成交 ${res.order.qty} 股 @ ${res.order.fillPrice?.toFixed(2)}`
            : '限价单已挂出，价格到位自动成交'
        );
        return res.state;
      });
    },
    []
  );

  const reset = useCallback((initialCash: number) => {
    setState(createSimState(initialCash));
    setError(null);
    setNotice('模拟账户已重置');
  }, []);

  return { state, error, notice, setNotice, submit, reset, refresh, prices };
}
