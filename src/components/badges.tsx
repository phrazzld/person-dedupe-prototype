export function confidenceBand(confidence: number): 'hot' | 'warm' | 'cool' {
  if (confidence >= 90) return 'hot';
  if (confidence >= 60) return 'warm';
  return 'cool';
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const band = confidenceBand(confidence);
  return <span className={`confidence-badge confidence-${band}`}>{confidence}</span>;
}

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  license_plate: 'Plate',
  full_name: 'Name',
  address_line: 'Address',
  date_of_birth: 'DOB',
  first_name: 'First name',
  last_name: 'Last name',
  bookings: 'Bookings',
};

export function FieldChips({ fieldWeights }: { fieldWeights: Record<string, 'strong' | 'moderate' | 'weak' | 'counter'> }) {
  const entries = Object.entries(fieldWeights);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([field, weight]) => (
        <span key={field} className={`field-chip field-${weight}`}>
          {FIELD_LABELS[field] ?? field}
        </span>
      ))}
    </>
  );
}

export function StatusPill({ children, tone }: { children: React.ReactNode; tone?: 'reversed' | 'active' }) {
  return <span className={`status-pill${tone ? ` ${tone}` : ''}`}>{children}</span>;
}
