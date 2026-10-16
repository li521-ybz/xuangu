// 设置弹层：录入 GitHub 个人令牌（gists 权限），启用跨设备同步
import { useState } from 'react';

interface Props {
  onSave: (token: string) => void;
  onClose: () => void;
}

export function SettingsModal({ onSave, onClose }: Props) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    try {
      onSave(token.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="设置">
      <form className="modal" onSubmit={submit}>
        <h3>设置 · 跨设备同步</h3>
        <p className="hint">
          粘贴一个 GitHub 个人令牌（仅需 <code>gist</code> 权限）。数据将存入你的私有 Gist，无任何第三方数据库。
        </p>
        <label>
          GitHub 令牌
          <input
            aria-label="GitHub 令牌"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxx 或 github_pat_xxx"
            autoFocus
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={busy || !token.trim()}>
            保存并同步
          </button>
        </div>
      </form>
    </div>
  );
}
