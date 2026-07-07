'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Match {
  person: { id: string; first_name: string; last_name: string; email: string | null };
  det_score: number;
  tier: string;
  description: string;
}

const emptyForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address_line: '',
  city: '',
  region: '',
  postal_code: '',
  license_plate: '',
};

export default function NewPersonPage() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [matches, setMatches] = useState<Match[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runCheck(nextForm: typeof form) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!nextForm.first_name && !nextForm.last_name && !nextForm.email && !nextForm.phone) {
        setMatches([]);
        return;
      }
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: nextForm.first_name,
          last_name: nextForm.last_name,
          email: nextForm.email || null,
          phone: nextForm.phone || null,
          address_line: nextForm.address_line || null,
          city: nextForm.city || null,
          region: nextForm.region || null,
          postal_code: nextForm.postal_code || null,
          license_plate: nextForm.license_plate || null,
        }),
      });
      const body = await res.json();
      setMatches(body.matches ?? []);
    }, 350);
  }

  function updateField(field: keyof typeof form, value: string) {
    const next = { ...form, [field]: value };
    setForm(next);
    if (['first_name', 'last_name', 'email', 'phone'].includes(field)) {
      runCheck(next);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          email: form.email || null,
          phone: form.phone || null,
          address_line: form.address_line || null,
          city: form.city || null,
          region: form.region || null,
          postal_code: form.postal_code || null,
          license_plate: form.license_plate || null,
        }),
      });
      const body = await res.json();
      if (res.ok) router.push(`/people/${body.person.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <p style={{ marginBottom: 6 }}>
          <Link href="/people">&larr; Back to people</Link>
        </p>
        <h1>New person</h1>
        <p>Creation is never blocked — this is a warning, not a gate.</p>
      </div>

      {matches.length > 0 && (
        <div className="warning-panel">
          This may be a duplicate of{' '}
          <strong>
            {matches[0].person.first_name} {matches[0].person.last_name}
          </strong>{' '}
          ({matches[0].description}).
          <div className="warning-actions">
            <Link href={`/people/${matches[0].person.id}`}>Use this instead</Link>
            <Link href="/duplicates">Open duplicates report</Link>
          </div>
        </div>
      )}

      <form className="card" style={{ padding: 20 }} onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label">First name</label>
            <input type="text" value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Last name</label>
            <input type="text" value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="form-label">Email</label>
            <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Address</label>
            <input type="text" value={form.address_line} onChange={(e) => updateField('address_line', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">City</label>
            <input type="text" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Region</label>
            <input type="text" value={form.region} onChange={(e) => updateField('region', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Postal code</label>
            <input type="text" value={form.postal_code} onChange={(e) => updateField('postal_code', e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">License plate</label>
            <input type="text" value={form.license_plate} onChange={(e) => updateField('license_plate', e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create person'}
        </button>
      </form>
    </div>
  );
}
