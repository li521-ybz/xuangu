// 模块⑥ 策略回测页：选股 → 选策略调参 → 运行 → 绩效/曲线/成交明细
// 数据：腾讯日K（前复权 320 根，与图表模块同源），纯前端计算，不上传任何数据。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candle } from '../../lib/types';
import { fetchDaily } from '../../lib/chartClient';
import { normalizeSymbol, bareSymbol } from '../../lib/symbol';
import {
  STRATEGIES,
  defaultParams,
  runBacktest,
  strategyByKey,
  type BacktestResult
} from './engine';
import { EquityChart } from '../common/EquityChart';
import { pctText, trendOf } from '../../lib/format';

interface Props {
  onOpenStock?: (symbol: string) => void;
}

const DEFAULT_OPTS = { maxHoldDays: 10, stopLossPct: 5, takeProfitPct: 15 };

export function BacktestPage({ onOpenStock }: Props) {
  const [symbol, setSymbol] = useState('sh600000');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [strategyKey, setStrategyKey] = useState(STRATEGIES[0].key);
  const strategy = useMemo(() => strategyByKey(strategyKey), [strategyKey]);
  const [params, setParams] = useState<Record<string, number>>(() => defaultParams(STRATEGIES[0]));
  const [opts, setOpts] = useState(DEFAULT_OPTS);
  const [result, setResult] = useState<BacktestResult | null>(null);

  // 切策略：参数重置为该策略默认值，并清掉旧结果（避免结果与参数不匹配）
  useEffect(() => {
    setParams(defaultParams(strategy));
    setResult(null);
  }, [strategy]);

  const load = useCallback(
    async (raw: string) => {
      const code = normalizeSymbol(raw);
      if (!/^[a-z]{2}\d{6}$/.test(code)) {
        setErr('请输入 6 位股票代码，如 600000');
        return;
      }
      setLoading(true);
      setErr(null);
      setResult(null);
      try {
        const data = await fetchDaily(code, 'day');
        if (data.length === 0) throw new Error('未取到 K 线数据，请检查代码');
        setCandles(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'K 线加载失败');
        setCandles([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // 首次进入自动加载默认股票
  useEffect(() => {
    void load(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    if (candles.length < 30) {
      setErr('K 线不足 30 根，无法回测');
      return;
    }
    setErr(null);
    setResult(runBacktest(candles, { strategyKey, params, ...opts }));
  };

  const drawdown = useMemo(() => {
    if (!result) return [];
    let peak = -Infinity;
    return result.equity.map((p) => {
      peak = Math.max(peak, p.value);
      return { date: p.date, value: peak > 0 ? ((p.value - peak) / peak) * 100 : 0 };
    });
  }, [result]);

  const money = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cls = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

  return (
    <div className="bt-page" data-testid="backtest-page">
      <header className="wb-page-head">
        <h2>策略回测</h2>
        <span className="mk-muted">T 日收盘信号 · T+1 开盘成交 · 含 A 股手续费</span>
      </header>

      {/* 配置区 */}
      <section className="mk-card bt-config" aria-label="回测配置">
        <div className="bt-row">
          <label className="bt-field">
            股票代码
            <input
              aria-label="回测股票代码"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load(symbol);
              }}
              placeholder="600000"
            />
          </label>
          <button type="button" className="tool-btn wide" onClick={() => void load(symbol)} disabled={loading}>
            {loading ? '加载中…' : '加载K线'}
          </button>
          <span className="mk-muted">
            {candles.length > 0
              ? `${bareSymbol(normalizeSymbol(symbol))} · ${candles.length} 根日K（${candles[0].date.slice(0, 10)} 起）`
              : '未加载'}
          </span>
        </div>

        <div className="bt-row">
          <label className="bt-field">
            策略
            <select value={strategyKey} onChange={(e) => setStrategyKey(e.target.value)} aria-label="策略">
              {STRATEGIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <span className="mk-muted bt-desc">{strategy.desc}</span>
        </div>

        <div className="bt-params">
          {strategy.params.map((p) => (
            <label className="bt-field small" key={p.key}>
              {p.label}
              <input
                aria-label={p.label}
                type="number"
                min={p.min}
                max={p.max}
                step={p.step}
                value={params[p.key] ?? p.default}
                onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: Number(e.target.value) }))}
              />
            </label>
          ))}
          <label className="bt-field small">
            最长持有(日)
            <input
              aria-label="最长持有天数"
              type="number"
              min={0}
              step={1}
              value={opts.maxHoldDays}
              onChange={(e) => setOpts((p) => ({ ...p, maxHoldDays: Number(e.target.value) }))}
            />
          </label>
          <label className="bt-field small">
            止损(%)
            <input
              aria-label="止损百分比"
              type="number"
              min={0}
              step={1}
              value={opts.stopLossPct}
              onChange={(e) => setOpts((p) => ({ ...p, stopLossPct: Number(e.target.value) }))}
            />
          </label>
          <label className="bt-field small">
            止盈(%)
            <input
              aria-label="止盈百分比"
              type="number"
              min={0}
              step={1}
              value={opts.takeProfitPct}
              onChange={(e) => setOpts((p) => ({ ...p, takeProfitPct: Number(e.target.value) }))}
            />
          </label>
          <button type="button" className="tool-btn tool-btn-primary wide bt-run" onClick={run} disabled={loading}>
            运行回测
          </button>
        </div>

        {err && <p className="error">{err}</p>}
      </section>

      {result && (
        <>
          <section className="pf-summary" aria-label="回测绩效">
            <div className="pf-metric">
              <span className="k">策略收益</span>
              <span className={`v num ${cls(result.summary.totalReturn)}`}>
                {pctText(result.summary.totalReturn)}
              </span>
            </div>
            <div className="pf-metric">
              <span className="k">同期持有不动</span>
              <span className={`v num ${cls(result.benchmarkReturn)}`}>{pctText(result.benchmarkReturn)}</span>
            </div>
            <div className="pf-metric">
              <span className="k">年化收益</span>
              <span className={`v num ${cls(result.summary.annualized)}`}>{pctText(result.summary.annualized)}</span>
            </div>
            <div className="pf-metric">
              <span className="k">最大回撤</span>
              <span className="v num down">{result.summary.maxDrawdown.toFixed(2)}%</span>
            </div>
            <div className="pf-metric">
              <span className="k">胜率</span>
              <span className="v num">{result.summary.winRate.toFixed(1)}%</span>
            </div>
            <div className="pf-metric">
              <span className="k">盈亏比 / 交易</span>
              <span className="v num">
                {result.summary.profitFactor.toFixed(2)} / {result.summary.trades}
              </span>
            </div>
          </section>

          <div className="bt-charts">
            <section className="mk-card" aria-label="策略净值曲线">
              <header className="mk-card-head">
                <h3>策略净值</h3>
                <span className="mk-muted">
                  初始 10 万 → 期末 {money(result.finalCash)} 元
                </span>
              </header>
              <EquityChart
                points={result.equity}
                baseline={100_000}
                format={(v) => (v / 10000).toFixed(1) + '万'}
                ariaLabel="策略净值曲线"
              />
            </section>

            <section className="mk-card" aria-label="回撤曲线">
              <header className="mk-card-head">
                <h3>回撤</h3>
                <span className="mk-muted">最大 {result.summary.maxDrawdown.toFixed(2)}%</span>
              </header>
              <EquityChart
                points={drawdown}
                baseline={0}
                inverse
                format={(v) => v.toFixed(1) + '%'}
                ariaLabel="回撤曲线"
              />
            </section>
          </div>

          <section className="mk-card" aria-label="成交明细">
            <header className="mk-card-head">
              <h3>成交明细</h3>
              <span className="mk-muted">共 {result.trades.length} 笔</span>
            </header>
            {result.trades.length === 0 ? (
              <p className="empty">该策略在此区间未产生交易，可放宽参数或换策略</p>
            ) : (
              <div className="bt-table" role="table">
                <div className="bt-thead" role="row">
                  <span>买入日</span>
                  <span className="num">买入价</span>
                  <span>卖出日</span>
                  <span className="num">卖出价</span>
                  <span className="num">数量</span>
                  <span className="num">持有</span>
                  <span className="num">盈亏</span>
                  <span>说明</span>
                </div>
                {result.trades.map((t, i) => (
                  <div className="bt-trow" role="row" key={`${t.inDate}-${i}`}>
                    <span className="num">{t.inDate}</span>
                    <span className="num">{t.inPrice.toFixed(2)}</span>
                    <span className="num">{t.outDate}</span>
                    <span className="num">{t.outPrice.toFixed(2)}</span>
                    <span className="num">{t.qty.toLocaleString('zh-CN')}</span>
                    <span className="num">{t.days} 日</span>
                    <span className={`num ${trendOf(t.pnl)}`}>
                      {t.pnl >= 0 ? '+' : ''}
                      {money(t.pnl)}
                      <span className="sub">{pctText(t.pnlPct)}</span>
                    </span>
                    <span className="bt-reason">{t.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="bt-disclaimer">
            回测结果仅供研究参考，不构成投资建议。历史收益不代表未来表现；滑点、涨跌停无法成交、停牌等实盘摩擦未完全模拟。
          </p>
        </>
      )}

      {!result && !loading && candles.length > 0 && (
        <p className="empty">点「运行回测」查看该策略在这只股票上的历史表现</p>
      )}
    </div>
  );
}
