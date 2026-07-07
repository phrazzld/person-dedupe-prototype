'use client';

// Bulk-merge controls for the duplicates report: checkbox selection lives in
// the table rows (via the shared context below), this bar drives
// select-all-suggested and the batch execution, then renders per-pair
// results. Each pair merges individually server-side — failures report
// per-pair and never abort the rest.

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface BulkState {
  selected: Set<string>;
  toggle: (id: string) => void;
}

const BulkContext = createContext<BulkState | null>(null);

export function useBulk(): BulkState | null {
  return useContext(BulkContext);
}

export function BulkSelectBox({ candidateId }: { candidateId: string }) {
  const bulk = useBulk();
  if (!bulk) return null;
  return (
    <input
      type="checkbox"
      aria-label="Select for bulk merge"
      checked={bulk.selected.has(candidateId)}
      onChange={() => bulk.toggle(candidateId)}
    />
  );
}

interface ResultLine {
  candidate_id: string;
  ok: boolean;
  merged?: { primary: string; secondary: string; merge_event_id: string };
  error?: string;
}

export function BulkProvider({ suggestedIds, children }: { suggestedIds: string[]; children: ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultLine[] | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function mergeSelected() {
    setRunning(true);
    setResults(null);
    try {
      const res = await fetch('/api/merge/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_ids: [...selected] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Bulk merge failed');
      setResults(body.results);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setResults([{ candidate_id: '-', ok: false, error: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <BulkContext.Provider value={{ selected, toggle }}>
      <div className="bulk-bar">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(suggestedIds))} disabled={suggestedIds.length === 0}>
          Select all suggested ({suggestedIds.length})
        </button>
        <button className="btn btn-primary btn-sm" onClick={mergeSelected} disabled={running || selected.size === 0}>
          {running ? 'Merging…' : `Merge selected (${selected.size})`}
        </button>
        <span className="bulk-note">
          Bulk merges use default survivorship (older record survives). Each pair merges individually — one failure
          never blocks the rest — and every merge is audited and reversible.
        </span>
      </div>
      {results && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="step-label">Bulk merge results</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
            {results.map((r, i) => (
              <li key={i} style={{ color: r.ok ? 'inherit' : 'var(--danger)' }}>
                {r.ok && r.merged
                  ? `Merged ${r.merged.secondary} into ${r.merged.primary} ✓`
                  : `Failed${r.candidate_id !== '-' ? ` (${r.candidate_id})` : ''}: ${r.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </BulkContext.Provider>
  );
}
