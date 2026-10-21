// 模块③ 持仓 · 录入交易弹层
// 输代码后自动补名称与现价（腾讯行情直连）；费用按 A 股口径自动算，允许手动改（对齐券商实际扣费）。
import { useEffect, useState } from 'react';
import { fetchQuotes } from '../../lib/quotesClient';
import { normalizeSymbol, bareSymbol } from '../../lib/symbol';
import { calcFee } from '../../lib/fees';
import { todayStr } from '../../lib/marketList';
import type { NewTrade } from './usePortfolio';

interface Props {
  onAdd: (input: NewTrade) => void;
  onClose: () => void;
  /** 预填（如从持仓行点「加仓」时带入代码） */
  preset?: { symbol?: string; name?: string; price?: number; side?: 'buy' | 'sell' };
}

export function TradeModal({ onAdd, onClose, preset }: Props) {
  const [symbol, setSymbol] = useState(preset?.symbol ?? '');
  const [name, setName] = useState(preset?.name ?? '');
  const [side, setSide] = useState<'buy' | 'sell'>(preset?.side ?? 'buy');
  const [price, setPrice] = useState(preset?.price ? String(preset.price) : '');
  const [qty, setQty] = useState('100');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [fee, setFee] = useState('');
  const [feeTouched, setFeeTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const priceNum = Number(price);
  const qtyNum = Number(qty);

  // 代码变化 → 自动查名称与现价（只查一次，避免每次输入都打上游）
  useEffect(() => {
    const code = normalizeSymbol(symbol);
    if (!/^[a-z]{2}\d{6}$/.test(code)) return;
    let alive = true;
    setLooking(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchQuotes([code]);
        const q = res.quotes[0];
        if (!alive || !q) return;
        setName((prev) => prev || q.name);
        setPrice((prev) => prev || q.price.toFixed(2));
      } catch {
        /* 查不到就让用户手填 */
      } finally {
        if (alive) setLooking(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
      setLooking(false);
    };
  }, [symbol]);

  // 费用自动计算（用户手动改过就不再覆盖）
  useEffect(() => {
    if (feeTouched) return;
    if (!(priceNum > 0) || !(qtyNum > 0)) {
      setFee('');
      return;
    }
    setFee(calcFee(side, priceNum, qtyNum).total.toFixed(2));
  }, [side, priceNum, qtyNum, feeTouched]);

  const amount = priceNum > 0 && qtyNum > 0 ? priceNum * qtyNum : 0;
  const feeNum = Number(fee) || 0;
  const cashDelta = side === 'buy' ? -(amount + feeNum) : amount - feeNum;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return setErr('请填写股票代码');
    if (!(priceNum > 0)) return setErr('成交价必须大于 0');
    if (!(qtyNum > 0)) return setErr('数量必须大于 0');
    if (side === 'buy' && qtyNum % 100 !== 0) return setErr('买入数量须为 100 股整数倍');
    setErr(null);
    onAdd({
      symbol: normalizeSymbol(symbol),
      name: name.trim() || bareSymbol(symbol),
      side,
      price: priceNum,
      qty: qtyNum,
      fee: feeNum,
      date,
      note: note.trim() || undefined
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="录入交易">
      <form className="modal" onSubmit={submit}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h3>录入交易</h3>

        <div className="seg-pair" role="group" aria-label="交易方向">
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
            aria-label="股票代码"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setName('');
              setPrice(preset?.price ? String(preset.price) : '');
            }}
            placeholder="如 600000 / sh600000"
            autoFocus
          />
        </label>
        <label>
          名称{looking ? '（查询中…）' : '（自动带出）'}
          <input aria-label="股票名称" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            成交价
            <input
              aria-label="成交价"
              type="number"
              step="0.001"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label>
            数量（股）
            <input
              aria-label="数量"
              type="number"
              step="100"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            日期
            <input aria-label="日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            费用
            <input
              aria-label="费用"
              type="number"
              step="0.01"
              min="0"
              value={fee}
              onChange={(e) => {
                setFeeTouched(true);
                setFee(e.target.value);
              }}
            />
          </label>
        </div>
        <label>
          备注（可选）
          <input aria-label="备注" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <p className="hint">
          {amount > 0 ? (
            <>
              成交额 {amount.toFixed(2)} 元 · 现金流 {cashDelta >= 0 ? '+' : ''}
              {cashDelta.toFixed(2)} 元
            </>
          ) : (
            '填入价格与数量后自动计算费用（佣金 0.025% 最低 5 元、印花税 0.05% 仅卖出、过户费 0.001%）'
          )}
        </p>

        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit">保存</button>
        </div>
      </form>
    </div>
  );
}
