// 模块⑤ 模拟盘 · 下单面板
// 输代码自动带出名称与现价；数量支持 1/4、1/3、1/2、全仓 快捷（按可用资金向下取整到 100 股）。
import { useEffect, useMemo, useState } from 'react';
import { fetchQuotes } from '../../lib/quotesClient';
import { normalizeSymbol, bareSymbol } from '../../lib/symbol';
import { calcFee, isLotAligned, type Side } from '../../lib/fees';
import type { PlaceInput } from './sim';

interface Props {
  cash: number;
  prices: Record<string, number>;
  onSubmit: (input: PlaceInput, quotePrice: number) => void;
}

export function OrderPanel({ cash, prices, onSubmit }: Props) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('100');
  const [err, setErr] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const code = normalizeSymbol(symbol);
  const bare = useMemo(() => bareSymbol(code), [code]);
  const quotePrice = prices[bare] ?? Number(price) ?? 0;

  // 代码有效 → 查名称与现价
  useEffect(() => {
    if (!/^[a-z]{2}\d{6}$/.test(code)) return;
    let alive = true;
    setLooking(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchQuotes([code]);
        const q = res.quotes[0];
        if (!alive || !q) return;
        setName(q.name);
        setPrice(q.price.toFixed(2));
      } catch {
        /* 查不到由用户手填 */
      } finally {
        if (alive) setLooking(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [code]);

  const priceNum = Number(price) || 0;
  const qtyNum = Number(qty) || 0;
  const refPrice = type === 'market' ? quotePrice : priceNum;
  const amount = refPrice * qtyNum;
  const fee = refPrice > 0 && qtyNum > 0 ? calcFee(side, refPrice, qtyNum).total : 0;

  const quick = (ratio: number) => {
    const unit = type === 'market' ? quotePrice : priceNum;
    if (!(unit > 0)) return;
    // 预留佣金，避免全仓时差几块钱买不了
    const budget = side === 'buy' ? cash * ratio * 0.995 : 0;
    if (side === 'buy') {
      const lots = Math.floor(budget / unit / 100) * 100;
      setQty(String(Math.max(0, lots)));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!/^[a-z]{2}\d{6}$/.test(code)) return setErr('请填写正确的股票代码');
    if (!(refPrice > 0)) return setErr('请输入有效价格');
    if (!(qtyNum > 0)) {
      return setErr(
        side === 'buy' && quotePrice > 0 && cash < quotePrice * 100
          ? `可用资金不足买 1 手（${quotePrice.toFixed(2)} × 100 = ${(quotePrice * 100).toFixed(0)} 元）`
          : '数量必须大于 0'
      );
    }
    if (side === 'buy' && !isLotAligned(qtyNum)) return setErr('买入数量须为 100 股整数倍');
    if (side === 'buy' && amount + fee > cash) {
      return setErr(`可用资金不足：需 ${(amount + fee).toFixed(2)} 元，可用 ${cash.toFixed(2)} 元`);
    }
    onSubmit(
      { symbol: code, name: name || bare, side, type, price: refPrice, qty: qtyNum },
      quotePrice
    );
  };

  return (
    <form className="sim-order mk-card" onSubmit={submit} aria-label="模拟下单">
      <header className="mk-card-head">
        <h3>下单</h3>
        <span className="mk-muted">可用 {cash.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 元</span>
      </header>

      <div className="seg-pair sim-side" role="group" aria-label="买卖方向">
        <button
          type="button"
          className={side === 'buy' ? 'active buy' : ''}
          onClick={() => setSide('buy')}
          aria-pressed={side === 'buy'}
        >
          买入
        </button>
        <button
          type="button"
          className={side === 'sell' ? 'active sell' : ''}
          onClick={() => setSide('sell')}
          aria-pressed={side === 'sell'}
        >
          卖出
        </button>
      </div>

      <label>
        代码
        <input
          aria-label="模拟盘股票代码"
          value={symbol}
          onChange={(e) => {
            setSymbol(e.target.value);
            setName('');
          }}
          placeholder="如 600000"
        />
      </label>
      {name && (
        <p className="hint">
          {name} · 现价 {quotePrice > 0 ? quotePrice.toFixed(2) : '—'}
          {looking ? ' · 查询中…' : ''}
        </p>
      )}

      <div className="seg-pair sim-type" role="group" aria-label="委托类型">
        <button
          type="button"
          className={type === 'market' ? 'active' : ''}
          onClick={() => setType('market')}
          aria-pressed={type === 'market'}
        >
          市价
        </button>
        <button
          type="button"
          className={type === 'limit' ? 'active' : ''}
          onClick={() => setType('limit')}
          aria-pressed={type === 'limit'}
        >
          限价
        </button>
      </div>

      <div className="form-row">
        <label>
          价格
          <input
            aria-label="模拟盘价格"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (type === 'market') setType('limit');
            }}
            placeholder={quotePrice > 0 ? quotePrice.toFixed(2) : '现价'}
          />
        </label>
        <label>
          数量（股）
          <input
            aria-label="模拟盘数量"
            type="number"
            step="100"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
      </div>

      {side === 'buy' && (
        <div className="sim-quick">
          {[
            { r: 0.25, label: '1/4' },
            { r: 1 / 3, label: '1/3' },
            { r: 0.5, label: '1/2' },
            { r: 1, label: '全仓' }
          ].map((q) => (
            <button type="button" key={q.label} onClick={() => quick(q.r)}>
              {q.label}
            </button>
          ))}
        </div>
      )}

      <p className="hint">
        {amount > 0 ? (
          <>
            成交额 {amount.toFixed(2)} 元 · 费用 {fee.toFixed(2)} 元
            {side === 'buy' ? ` · 合计 ${(amount + fee).toFixed(2)} 元` : ` · 到账 ${(amount - fee).toFixed(2)} 元`}
          </>
        ) : (
          'A 股规则：整手买入、T+1 卖出、佣金 0.025%（最低 5 元）、印花税 0.05%（仅卖出）、过户费 0.001%'
        )}
      </p>

      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}

      <button type="submit" className={`sim-submit ${side}`}>
        {side === 'buy' ? '买入' : '卖出'}
      </button>
    </form>
  );
}
