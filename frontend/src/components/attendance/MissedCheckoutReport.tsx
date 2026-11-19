import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';

interface MissedCheckoutRow {
  id: string;
  date: string;
  user_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  department_name: string | null;
  check_in_time: string;
  check_out_time: string | null;
  work_hours: number | null;
  auto_checked_out: boolean;
  presence_gap_flagged: boolean;
  last_office_presence: string | null;
  notes: string | null;
}

const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi',
  });
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: number | string; sub?: string; color: string; icon: string;
}) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid var(--gray-200)',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8,
        background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span style={{
      background: bg, color: text,
      padding: '2px 8px', borderRadius: 9999,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export const MissedCheckoutReport = () => {
  const [rows, setRows] = useState<MissedCheckoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'gap_flagged' | 'no_checkout'>('all');
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  });
  const [dateTo, setDateTo] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: qErr } = await supabase
        .from('v_missed_checkouts')
        .select('*')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false });
      if (qErr) throw qErr;
      setRows((data as MissedCheckoutRow[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    const name = `${r.first_name} ${r.last_name} ${r.employee_id}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (filterType === 'gap_flagged' && !r.presence_gap_flagged) return false;
    if (filterType === 'no_checkout' && r.check_out_time !== null) return false;
    return true;
  });

  const gapCount  = rows.filter(r => r.presence_gap_flagged).length;
  const autoCount = rows.filter(r => r.auto_checked_out).length;
  const openCount = rows.filter(r => !r.check_out_time).length;

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <div className="admin-main">
        {/* ── Page header ── */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid var(--gray-200)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              Missed Checkout Report
            </h1>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '2px 0 0' }}>
              Auto-checkout records and open attendance requiring HR review
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={load}
              disabled={loading}
              style={{
                padding: '6px 14px', borderRadius: 6,
                background: 'var(--primary-600)', color: '#fff',
                border: 'none', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <NotificationBell />
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>

          {/* Stat cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}>
            <StatCard
              icon="🚨"
              label="Presence Gap Flagged"
              value={gapCount}
              sub="Last presence >30min before cutoff"
              color="#dc2626"
            />
            <StatCard
              icon="🤖"
              label="System Auto-Checked Out"
              value={autoCount}
              sub="Closed by 8pm cron job"
              color="#d97706"
            />
            <StatCard
              icon="🔓"
              label="Still Open (Past Days)"
              value={openCount}
              sub="No checkout recorded at all"
              color="#6b7280"
            />
            <StatCard
              icon="📋"
              label="Total in Period"
              value={rows.length}
              sub={`${dateFrom} → ${dateTo}`}
              color="#3b82f6"
            />
          </div>

          {/* ── Filters ── */}
          <div style={{
            background: '#fff',
            borderRadius: 10,
            border: '1px solid var(--gray-200)',
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: 6,
                  border: '1px solid var(--gray-300)',
                  fontSize: 13, color: 'var(--gray-700)', background: '#fff',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: 6,
                  border: '1px solid var(--gray-300)',
                  fontSize: 13, color: 'var(--gray-700)', background: '#fff',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Filter
              </label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value as any)}
                style={{
                  padding: '6px 10px', borderRadius: 6,
                  border: '1px solid var(--gray-300)',
                  fontSize: 13, color: 'var(--gray-700)', background: '#fff',
                }}
              >
                <option value="all">All records</option>
                <option value="gap_flagged">Presence gap flagged</option>
                <option value="no_checkout">Still open (no checkout)</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Search
              </label>
              <input
                type="text"
                placeholder="Name or employee ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 6,
                  border: '1px solid var(--gray-300)',
                  fontSize: 13, color: 'var(--gray-700)', background: '#fff',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '12px 16px', marginBottom: 16,
              color: '#dc2626', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* ── Table ── */}
          <div style={{
            background: '#fff',
            borderRadius: 10,
            border: '1px solid var(--gray-200)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--gray-100)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--gray-800)' }}>
                Records
              </h2>
              <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                {filtered.length} record{filtered.length !== 1 ? 's' : ''}
                {filtered.length !== rows.length && ` of ${rows.length} total`}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                Loading records…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                No records found for the selected filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)' }}>
                      {['Date', 'Employee', 'Department', 'Check In', 'Last Presence', 'Check Out', 'Hours', 'Flags', 'System Note'].map(h => (
                        <th key={h} style={{
                          padding: '10px 14px',
                          textAlign: h === 'Date' || h === 'Employee' || h === 'Department' || h === 'System Note' ? 'left' : 'center',
                          fontSize: 11, fontWeight: 700,
                          color: 'var(--gray-500)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          borderBottom: '1px solid var(--gray-200)',
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, idx) => (
                      <tr
                        key={r.id}
                        style={{
                          background: r.presence_gap_flagged
                            ? '#fef2f2'
                            : r.auto_checked_out
                              ? '#fffbeb'
                              : idx % 2 === 0 ? '#fff' : 'var(--gray-50)',
                          borderBottom: '1px solid var(--gray-100)',
                        }}
                      >
                        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>
                          {fmtDate(r.date)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>
                            {r.first_name} {r.last_name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{r.employee_id}</div>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--gray-500)' }}>
                          {r.department_name ?? '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, color: 'var(--gray-700)' }}>
                          {fmtTime(r.check_in_time)}
                        </td>
                        <td style={{
                          padding: '10px 14px', textAlign: 'center', fontSize: 13,
                          color: r.last_office_presence ? 'var(--gray-700)' : 'var(--gray-400)',
                        }}>
                          {fmtTime(r.last_office_presence)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13 }}>
                          {r.check_out_time ? (
                            <span style={{ color: 'var(--gray-700)' }}>{fmtTime(r.check_out_time)}</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>OPEN</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, color: 'var(--gray-700)' }}>
                          {r.work_hours != null ? `${r.work_hours.toFixed(1)}h` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                            {r.auto_checked_out && (
                              <Badge label="AUTO" bg="#fef3c7" text="#92400e" />
                            )}
                            {r.presence_gap_flagged && (
                              <Badge label="GAP" bg="#fee2e2" text="#991b1b" />
                            )}
                            {!r.check_out_time && (
                              <Badge label="OPEN" bg="var(--gray-100)" text="var(--gray-600)" />
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', maxWidth: 280 }}>
                          {r.notes ? (
                            <>
                              <span style={{ fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.5 }}>
                                {expandedNote === r.id || r.notes.length <= 80
                                  ? r.notes
                                  : r.notes.slice(0, 80) + '…'}
                              </span>
                              {r.notes.length > 80 && (
                                <button
                                  onClick={() => setExpandedNote(expandedNote === r.id ? null : r.id)}
                                  style={{
                                    marginLeft: 6, background: 'none', border: 'none',
                                    color: 'var(--primary-600)', cursor: 'pointer',
                                    fontSize: 11, padding: 0, fontWeight: 600,
                                  }}
                                >
                                  {expandedNote === r.id ? 'less' : 'more'}
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--gray-300)', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Legend ── */}
          <div style={{
            marginTop: 16,
            padding: '12px 16px',
            background: 'var(--gray-50)',
            borderRadius: 8,
            border: '1px solid var(--gray-200)',
            fontSize: 12,
            color: 'var(--gray-500)',
            lineHeight: 1.8,
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <strong style={{ color: 'var(--gray-700)' }}>Legend:</strong>
            <span><Badge label="AUTO" bg="#fef3c7" text="#92400e" /> &nbsp;System auto-checkout at 8pm cutoff</span>
            <span><Badge label="GAP" bg="#fee2e2" text="#991b1b" /> &nbsp;Last confirmed presence was &gt;30min before checkout — HR review recommended</span>
            <span><Badge label="OPEN" bg="var(--gray-100)" text="var(--gray-600)" /> &nbsp;Record from a past day with no checkout at all</span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default MissedCheckoutReport;
