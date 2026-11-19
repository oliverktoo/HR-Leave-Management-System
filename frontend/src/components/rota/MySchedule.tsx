// My Schedule — employee self-service, read-only 3-week view

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getStaffRota, StaffRotaEntry } from '../../services/attendanceRotaService';

// ─── date helpers ─────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of the week containing d */
function weekStart(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function fmtWeekHeader(mon: Date): string {
  return 'Week of ' + mon.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short' });
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const todayStr = isoDate(new Date());

// ─── main component ───────────────────────────────────────────────────────────

export function MySchedule() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [entries, setEntries] = useState<StaffRotaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The 3 weeks to show: prev week Mon, this week Mon, next week Mon
  const thisMon = weekStart(new Date());
  const weeks: Date[] = [addDays(thisMon, -7), thisMon, addDays(thisMon, 7)];

  const startDate = isoDate(weeks[0]);
  const endDate = isoDate(addDays(weeks[2], 6));

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    getStaffRota(startDate, endDate, user.id)
      .then(data => setEntries(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [user?.id, startDate, endDate]);

  // Build lookup: rota_date => entry
  const entryMap = new Map<string, StaffRotaEntry>();
  for (const e of entries) {
    entryMap.set(e.rota_date, e);
  }

  // ─── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', padding: '24px 16px' }}>

      {/* Page header */}
      <div style={{
        maxWidth: 900, margin: '0 auto 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: '1px solid var(--gray-300)',
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            fontSize: 14, color: 'var(--gray-600)', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          ← Back
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>My Schedule</h1>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>Your shift assignments for the next 3 weeks</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="alert alert-error"
          style={{ maxWidth: 900, margin: '0 auto 16px' }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading schedule…</p>
        </div>
      ) : (
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {weeks.map((mon, wi) => {
            const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
            const isCurrentWeek = isoDate(mon) === isoDate(thisMon);

            return (
              <div
                key={wi}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: isCurrentWeek
                    ? '2px solid var(--primary-600)'
                    : '1px solid var(--gray-200)',
                  overflow: 'hidden',
                  boxShadow: isCurrentWeek
                    ? '0 0 0 3px var(--primary-100)'
                    : '0 1px 4px rgba(0,0,0,0.05)',
                }}
              >
                {/* Week header */}
                <div style={{
                  padding: '12px 16px',
                  background: isCurrentWeek ? 'var(--primary-600)' : 'var(--gray-100)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: isCurrentWeek ? '#fff' : 'var(--gray-700)',
                  }}>
                    {fmtWeekHeader(mon)}
                  </span>
                  {isCurrentWeek && (
                    <span style={{
                      fontSize: 11, background: 'rgba(255,255,255,0.25)',
                      color: '#fff', padding: '1px 8px', borderRadius: 10, fontWeight: 600,
                    }}>
                      Current week
                    </span>
                  )}
                </div>

                {/* Day cards — horizontal scroll on small screens */}
                <div style={{
                  display: 'flex',
                  overflowX: 'auto',
                  padding: '12px',
                  gap: '8px',
                } as React.CSSProperties}>
                  {days.map((day, di) => {
                    const ds = isoDate(day);
                    const entry = entryMap.get(ds);
                    const isToday = ds === todayStr;
                    const isPast = ds < todayStr;

                    let pillContent: React.ReactNode = null;
                    let timeContent: React.ReactNode = null;

                    if (entry?.is_day_off) {
                      pillContent = (
                        <span style={{
                          display: 'inline-block', padding: '3px 10px',
                          borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: 'var(--gray-100)', color: 'var(--gray-500)',
                        }}>
                          Day Off
                        </span>
                      );
                    } else if (entry?.schedule) {
                      const s = entry.schedule;
                      pillContent = (
                        <span style={{
                          display: 'inline-block', padding: '3px 10px',
                          borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: (s.color || '#2563eb') + '22',
                          color: s.color || '#2563eb',
                          border: `1px solid ${s.color || '#2563eb'}44`,
                          maxWidth: 100, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {s.name}
                        </span>
                      );
                      timeContent = (
                        <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>
                          {s.start_time} – {s.end_time}
                        </div>
                      );
                    } else {
                      pillContent = (
                        <span style={{ fontSize: 12, color: 'var(--gray-300)' }}>—</span>
                      );
                    }

                    return (
                      <div
                        key={di}
                        style={{
                          flex: '0 0 calc(14.28% - 8px)',
                          minWidth: 100,
                          borderRadius: 8,
                          border: isToday
                            ? '2px solid var(--primary-600)'
                            : '1px solid var(--gray-100)',
                          background: isToday
                            ? 'var(--primary-50)'
                            : isPast ? 'var(--gray-50)' : '#fff',
                          padding: '10px 8px',
                          textAlign: 'center',
                          opacity: isPast && !isToday ? 0.75 : 1,
                          transition: 'opacity 0.1s',
                        }}
                      >
                        {/* Day label */}
                        <div style={{
                          fontWeight: isToday ? 700 : 600,
                          fontSize: 12,
                          color: isToday ? 'var(--primary-700)' : 'var(--gray-600)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>
                          {DAY_LABELS[di]}
                        </div>

                        {/* Date number */}
                        <div style={{
                          fontSize: isToday ? 20 : 18,
                          fontWeight: isToday ? 800 : 600,
                          color: isToday ? 'var(--primary-600)' : 'var(--gray-800)',
                          margin: '4px 0 8px',
                          lineHeight: 1,
                        }}>
                          {day.getDate()}
                        </div>

                        {/* Schedule pill */}
                        <div style={{ minHeight: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          {pillContent}
                          {timeContent}
                        </div>

                        {/* Today indicator */}
                        {isToday && (
                          <div style={{
                            marginTop: 6,
                            fontSize: 10,
                            color: 'var(--primary-600)',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}>
                            Today
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
