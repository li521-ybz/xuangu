// 模块① 添加自选弹层
import { useState } from 'react';
import type { GroupName } from '../../lib/types';

interface Props {
  groups: GroupName[];
  onAdd: (input: { symbol: string; name: string; group?: string }) => Promise<void> | void;
  onClose: () => void;
}

export function AddStockModal({ groups, onAdd, onClose }: Props) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [group, setGroup] = useState<GroupName>(groups.includes('观察') ? '观察' : groups[0] ?? '观察');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onAdd({ symbol: symbol.trim(), name: name.trim(), group });
      onClose();
    } catch (e2) {
      // 展示失败原因（如令牌无效），保持弹层打开便于重试
      setErr((e2 as Error).message || '添加失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="添加自选">
      <form className="modal" onSubmit={submit}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h3>添加自选股</h3>
        <label>
          代码
          <input
            aria-label="股票代码"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="如 sh600000"
            autoFocus
          />
        </label>
        <label>
          名称（可选）
          <input aria-label="股票名称" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          分组
          <select aria-label="分组" value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={busy || !symbol.trim()}>
            添加
          </button>
        </div>
      </form>
    </div>
  );
}
