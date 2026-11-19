import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyAssets, type AssetAssignment } from '../../services/assetService';

const CATEGORY_ICON: Record<string, string> = {
  laptop:       '💻',
  phone:        '📱',
  tablet:       '📋',
  vehicle_key:  '🔑',
  access_card:  '💳',
  uniform:      '👕',
  equipment:    '🔧',
  furniture:    '🪑',
  other:        '📦',
};

const CONDITION_COLOR: Record<string, React.CSSProperties> = {
  new:    { background: '#dcfce7', color: '#15803d' },
  good:   { background: '#dbeafe', color: '#1d4ed8' },
  fair:   { background: '#fef9c3', color: '#a16207' },
  poor:   { background: '#fee2e2', color: '#b91c1c' },
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const fmtCategory = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function MyAssets() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    getMyAssets().then(({ data, error: err }) => {
      if (err) setError(err.message || 'Failed to load assets');
      else     setAssignments(data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--gray-500)' }}
          >
            ←
          </button>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              💻 My Issued Assets
            </h1>
            <p style={{ color: 'var(--gray-500)', margin: 0, fontSize: '0.875rem' }}>
              Equipment and property currently assigned to you
            </p>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {!loading && !error && assignments.length === 0 && (
          <div style={{
            background: '#fff', borderRadius: 12, padding: '3rem',
            textAlign: 'center', border: '1px solid var(--gray-200)',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
            <p style={{ color: 'var(--gray-500)', margin: 0 }}>No assets are currently issued to you.</p>
          </div>
        )}

        {!loading && assignments.length > 0 && (
          <>
            <p style={{ color: 'var(--gray-600)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
              {assignments.length} asset{assignments.length !== 1 ? 's' : ''} currently in your custody
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {assignments.map(a => {
                const asset = a.asset!;
                const icon = CATEGORY_ICON[asset.category] ?? '📦';
                const condStyle = CONDITION_COLOR[a.condition_on_issue] ?? CONDITION_COLOR.good;
                return (
                  <div
                    key={a.id}
                    style={{
                      background: '#fff',
                      borderRadius: 12,
                      padding: '1.25rem 1.5rem',
                      border: '1px solid var(--gray-200)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 10,
                          background: 'var(--gray-100)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0,
                        }}>
                          {icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--gray-900)' }}>
                            {asset.name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                            {fmtCategory(asset.category)}
                            {asset.make ? ` · ${asset.make}` : ''}
                            {asset.model ? ` ${asset.model}` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Condition badge */}
                      <span style={{
                        ...condStyle, fontSize: '0.75rem', fontWeight: 600,
                        padding: '0.25rem 0.75rem', borderRadius: 20,
                      }}>
                        {a.condition_on_issue.charAt(0).toUpperCase() + a.condition_on_issue.slice(1)} condition
                      </span>
                    </div>

                    {/* Details grid */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: '0.75rem', marginTop: '1rem',
                      paddingTop: '1rem', borderTop: '1px solid var(--gray-100)',
                    }}>
                      <Detail label="Asset Tag"     value={asset.asset_tag} />
                      {asset.serial_number && <Detail label="Serial Number" value={asset.serial_number} />}
                      <Detail label="Issued On"     value={fmt(a.issued_at)} />
                      {a.notes && <Detail label="Notes" value={a.notes} full />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Disclaimer */}
            <div style={{
              marginTop: '1.5rem', background: '#fef9c3', border: '1px solid #fde68a',
              borderRadius: 8, padding: '0.875rem 1rem', fontSize: '0.8rem', color: '#92400e',
            }}>
              ⚠️ You are responsible for the safekeeping of all assets listed above. Report any damage or loss to HR immediately. Assets must be returned upon change of role or exit.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)' }}>{value}</div>
    </div>
  );
}
