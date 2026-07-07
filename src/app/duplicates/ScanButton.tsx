'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ScanButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch('/api/scan', { method: 'POST' });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button className="btn btn-primary" onClick={onClick} disabled={pending}>
      {pending ? 'Scanning…' : 'Scan now'}
    </button>
  );
}
