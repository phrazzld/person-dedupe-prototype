'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RowActions({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function act(verdict: 'dismiss' | 'not_duplicate') {
    setPending(verdict);
    try {
      await fetch(`/api/duplicates/${candidateId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => act('not_duplicate')}
        disabled={pending !== null}
        title="Records the system's distinct verdict and suppresses re-flagging"
      >
        {pending === 'not_duplicate' ? '…' : 'Not duplicates'}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => act('dismiss')} disabled={pending !== null}>
        {pending === 'dismiss' ? '…' : 'Dismiss'}
      </button>
    </div>
  );
}
