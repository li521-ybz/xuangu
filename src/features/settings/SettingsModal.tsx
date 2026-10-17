// 设置弹层：录入 GitHub 个人令牌（gists 权限），启用跨设备同步
import { useState } from 'react';
import { getStoredGithubToken, verifyGithubToken } from '../../lib/gistRepo';

interface Props {
  onSave: (token: string) => void;
  onClose: () => void;
}

export function SettingsModal({ onSave, onClose }: Props) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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

  async function testToken() {
    if (!token.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await verifyGithubToken(token.trim()));
    } finally {
      setTesting(false);
    }
  }

  const trimmed = token.trim();
  const formatOk = !trimmed || /^(ghp_|github_pat_)/.test(trimmed);
  const saved = getStoredGithubToken();

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="设置">
      <form className="modal" onSubmit={submit}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h3>设置 · 跨设备同步</h3>
        <p className="hint">
          {saved
            ? `已保存令牌：${saved.slice(0, 4)}…${saved.slice(-4)}（保存新令牌可覆盖）`
            : '尚未设置令牌：当前自选股仅存在本机浏览器，刷新不丢、但不能跨设备同步'}
        </p>
        <p className="hint">
          粘贴一个 GitHub 个人令牌（仅需 <code>gist</code> 权限）。数据将存入你的私有 Gist，无任何第三方数据库。
        </p>
        <label>
          GitHub 令牌
          <input
            aria-label="GitHub 令牌"
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setTestResult(null);
            }}
            placeholder="ghp_xxx 或 github_pat_xxx"
            autoFocus
          />
        </label>
        {!formatOk && <p className="error">令牌通常以 ghp_ 或 github_pat_ 开头，请检查是否复制完整</p>}
        {testResult && (
          <p className={testResult.ok ? 'ok' : 'error'} role="status">
            {testResult.message}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" onClick={testToken} disabled={testing || !trimmed}>
            {testing ? '测试中…' : '测试令牌'}
          </button>
          <button type="submit" disabled={busy || !trimmed}>
            保存并同步
          </button>
        </div>
      </form>
    </div>
  );
}
