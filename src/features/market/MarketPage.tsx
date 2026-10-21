// 模块① 看盘总览页：指数条 + 市场宽度 + 排行榜
// 数据全部浏览器直连（腾讯行情 / 东财快照），无后端。
import { useMemo, useState } from 'react';
import { INDEX_LIST, useIndices, useMarketSnapshot } from './useMarketData';
import { IndexStrip } from './IndexStrip';
import { BreadthCard } from './BreadthCard';
import { RankingCard } from './RankingCard';
import { computeBreadth } from '../../lib/marketStats';

interface Props {
  onOpenStock?: (symbol: string) => void;
}

export function MarketPage({ onOpenStock }: Props) {
  const indices = useIndices();
  const { snap, loading, progress, error, refresh } = useMarketSnapshot();
  const [spin, setSpin] = useState(false);

  const breadth = useMemo(() => (snap ? computeBreadth(snap.rows) : null), [snap]);
  const hasInflow = useMemo(
    () => !!snap && snap.rows.some((r) => typeof r.mainInflow === 'number'),
    [snap]
  );

  const onRefresh = async () => {
    setSpin(true);
    await refresh();
    setTimeout(() => setSpin(false), 400);
  };

  const updated = snap ? new Date(snap.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—';

  return (
    <div className="mk-page" data-testid="market-page">
      <header className="mk-page-head">
        <h2>看盘总览</h2>
        <div className="mk-head-tools">
          <span className="mk-muted">更新 {updated}</span>
          <button type="button" className="tool-btn" title="刷新" aria-label="刷新全市场" onClick={onRefresh}>
            <span className={spin ? 'spin' : ''}>↻</span>
          </button>
        </div>
      </header>

      <IndexStrip list={indices.list} labels={INDEX_LIST} />
      {indices.error && <p className="error">指数行情：{indices.error}</p>}

      {loading && !snap && (
        <div className="mk-loading">
          <span className="spinner" />
          <span>{progress || '正在加载全市场行情…'}</span>
        </div>
      )}
      {error && (
        <div className="mk-error-card">
          <p>{error}</p>
          <button type="button" className="tool-btn tool-btn-primary wide" onClick={onRefresh}>
            重试
          </button>
        </div>
      )}

      {breadth && snap && (
        <div className="mk-grid">
          <BreadthCard breadth={breadth} rows={snap.rows} source={snap.source} />
          <RankingCard rows={snap.rows} hasInflow={hasInflow} onPick={onOpenStock} />
        </div>
      )}
    </div>
  );
}
