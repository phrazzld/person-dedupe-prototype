'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function UnmergeButton({ mergeEventId }: { mergeEventId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch(`/api/merges/${mergeEventId}/unmerge`, { method: 'POST' });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button className="btn btn-sm btn-danger" onClick={onClick} disabled={pending}>
      {pending ? 'Unmerging…' : 'Unmerge'}
    </button>
  );
}
