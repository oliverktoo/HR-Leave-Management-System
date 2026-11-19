import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';
import {
  getTodayLiveFeed,
  getTodayStats,
  getDeptBreakdown,
  getWeeklyTrend,
  getFlaggedIssues,
  getTodayOOOStaff,
  type AttendanceRecord,
  type LiveFeedEntry,
  type TodayStats,
  type DeptBreakdownRow,
  type WeeklyTrendEntry,
  type FlaggedIssue,
  type OOOStaffEntry,
} from '../../services/attendanceService';

const REFRESH_INTERVAL = 60_000; // 60 seconds

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
}
function presenceAge(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 60000; // minutes ago
}
function presenceColor(mins: number | null): string {
  if (mins === null) return 'var(--gray-400)';
  if (mins <= 15) return '#16a34a';   // green — very recent
  if (mins <= 35) return '#d97706';   // amber — possibly left
  return '#dc2626';                   // red — likely gone >35 min
}
function fmtHours(h: number | null) {
  if (!h) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

const STATUS_COLORS: Record<string, string> = {
  present: '#16a34a',
  late: '#d97706',
  half_day: '#7c3aed',
  absent: '#dc2626',
};

export const AdminAttendanceDashboard = () => {
  const { profile } = useAuth();
  const isHOD = (profile?.role as string) === 'hod';

  const [deptId, setDeptId] = useState<string | undefined>(undefined);
  const [deptName, setDeptName] = useState('');
  const [allDepts, setAllDepts] = useState<{ id: string; name: string }[]>([]);

  const [stats, setStats] = useState<TodayStats | null>(null);
  const [feed, setFeed] = useState<LiveFeedEntry[]>([]);
  const [deptBreakdown, setDeptBreakdown] = useState<DeptBreakdownRow[]>([]);
  const [trend, setTrend] = useState<WeeklyTrendEntry[]>([]);
  const [issues, setIssues] = useState<FlaggedIssue[]>([]);
  const [oooStaff, setOooStaff] = useState<OOOStaffEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load departments for filter
  useEffect(() => {
    const init = async () => {
      if (isHOD && profile?.department_id) {
        setDeptId(profile.department_id);
        const { data } = await supabase
          .from('departments')
          .select('id, name')
          .eq('id', profile.department_id)
          .single();
        if (data) setDeptName(data.name);
      } else {
        const { data } = await supabase.from('departments').select('id, name').order('name');
        if (data) setAllDepts(data);
      }
    };
    init();
  }, [profile, isHOD]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [s, f, d, t, i, ooo] = await Promise.all([
      getTodayStats(deptId),
      getTodayLiveFeed(deptId),
      getDeptBreakdown(),
      getWeeklyTrend(deptId),
      getFlaggedIssues(deptId),
      getTodayOOOStaff(),
    ]);
    if (s.data) setStats(s.data);
    if (f.data) setFeed(f.data);
    if (d.data) setDeptBreakdown(d.data);
    if (t.data) setTrend(t.data);
    if (i.data) setIssues(i.data);
    if (ooo.data) setOooStaff(ooo.data);
    setLastRefresh(new Date());
    setLoading(false);
    setCountdown(60);
  }, [deptId]);

  // Initial load + auto-refresh
  useEffect(() => {
    loadAll();

    timerRef.current = setInterval(loadAll, REFRESH_INTERVAL);
    countdownRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [loadAll]);

  // Max bar value for trend chart
  const trendMax = Math.max(...trend.map(t => t.present + t.late), 1);

  const issueTypeLabel: Record<FlaggedIssue['type'], string> = {
    repeated_late: 'Repeated Late',
    missing_checkout: 'Missing Clock-Out',
    high_overtime: 'High Overtime',
  };
  const issueTypeColor: Record<FlaggedIssue['type'], string> = {
    repeated_late: '#d97706',
    missing_checkout: '#dc2626',
    high_overtime: '#7c3aed',
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        {/* Header */}
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
              Live Attendance Dashboard
            </h1>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '2px 0 0' }}>
              {new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {isHOD && deptName && ` · ${deptName}`}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Department filter — super_admin / hr_admin only */}
            {!isHOD && allDepts.length > 0 && (
              <select
                value={deptId || ''}
                onChange={e => setDeptId(e.target.value || undefined)}
                style={{
                  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--gray-300)',
                  fontSize: 13, background: '#fff', color: 'var(--gray-700)',
                }}
              >
                <option value="">All Departments</option>
                {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}

            {/* Refresh indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: 'var(--gray-500)',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: loading ? '#d97706' : '#16a34a',
                animation: loading ? 'none' : 'pulse 2s infinite',
              }} />
              {loading ? 'Updating…' : `Refreshes in ${countdown}s`}
            </div>

            <button
              onClick={loadAll}
              disabled={loading}
              style={{
                padding: '6px 14px', borderRadius: 6,
                background: 'var(--primary-600)', color: '#fff',
                border: 'none', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              Refresh
            </button>

            <NotificationBell />
          </div>
        </div>

        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 24 }}>
            <KpiCard
              label="Clocked In Now"
              value={stats?.clocked_in_now ?? '—'}
              sub={`of ${stats?.total_staff ?? '—'} staff`}
              color="#16a34a"
              icon="✅"
            />
            <KpiCard
              label="On Leave"
              value={stats?.on_approved_leave ?? '—'}
              sub="approved leave"
              color="#3b82f6"
              icon="🏖️"
            />
            <KpiCard
              label="On OOO Assignment"
              value={stats?.on_ooo_assignment ?? '—'}
              sub="HR approved, out today"
              color="#0891b2"
              icon="📤"
            />
            <KpiCard
              label="Late Today"
              value={stats?.late_today ?? '—'}
              sub="after grace period"
              color="#d97706"
              icon="⏰"
            />
            <KpiCard
              label="Not Yet In"
              value={stats?.not_yet_in ?? '—'}
              sub="unaccounted for"
              color="#ef4444"
              icon="❌"
            />
            <KpiCard
              label="Missing Clock-Out"
              value={stats?.missing_checkout ?? '—'}
              sub="from yesterday"
              color="#7c3aed"
              icon="⚠️"
            />
          </div>

          {/* Main grid: feed + dept breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, marginBottom: 20 }}>

            {/* Live Feed */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--gray-800)' }}>
                  Today's Clock-In Activity
                </h2>
                {lastRefresh && (
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    Updated {fmt(lastRefresh.toISOString())}
                  </span>
                )}
              </div>

              {feed.length === 0 && !loading && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                  No clock-in activity today yet
                </div>
              )}

              <div style={{ overflowY: 'auto', maxHeight: 420 }}>
                {feed.map(entry => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 18px', borderBottom: '1px solid var(--gray-50)',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: 'var(--primary-100)', color: 'var(--primary-700)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>
                      {entry.employee_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.employee_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                        {entry.department_name || 'No dept'} · {entry.employee_id}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>
                        {fmt(entry.check_in_time)}
                        {entry.check_out_time && <> → {fmt(entry.check_out_time)}</>}
                      </div>
                      {entry.check_out_time ? (
                        <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                          {fmtHours(entry.work_hours)}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: presenceColor(presenceAge(entry.last_office_presence)), fontWeight: 600 }}>
                          {entry.last_office_presence
                            ? `Last seen ${fmt(entry.last_office_presence)}`
                            : 'No presence data'}
                        </div>
                      )}
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                ))}
              </div>
            </div>

            {/* Department Breakdown */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-100)' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--gray-800)' }}>
                  By Department
                </h2>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 420 }}>
                {deptBreakdown.map(row => {
                  const total = row.present + row.late + row.absent + row.on_leave || 1;
                  return (
                    <div key={row.department_id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--gray-50)' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800)', marginBottom: 6 }}>
                        {row.department_name}
                      </div>
                      {/* Mini bar */}
                      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ width: `${((row.present) / total) * 100}%`, background: '#16a34a' }} />
                        <div style={{ width: `${(row.late / total) * 100}%`, background: '#d97706' }} />
                        <div style={{ width: `${(row.on_leave / total) * 100}%`, background: '#3b82f6' }} />
                        <div style={{ width: `${(row.absent / total) * 100}%`, background: '#e5e7eb' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>{row.present} in</span>
                        {row.late > 0 && <span style={{ color: '#d97706', fontWeight: 600 }}>{row.late} late</span>}
                        {row.on_leave > 0 && <span style={{ color: '#3b82f6', fontWeight: 600 }}>{row.on_leave} leave</span>}
                        <span style={{ color: 'var(--gray-400)' }}>{row.absent} absent</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* OOO Staff Panel */}
          {oooStaff.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #b2ebf2', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e0f7fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e0f7fa' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#006064' }}>
                  📤 Staff on OOO Assignment Today
                </h2>
                <span style={{ background: '#00838f', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10 }}>
                  {oooStaff.length}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 0 }}>
                {oooStaff.map(entry => (
                  <div key={`${entry.user_id}_${entry.start_date}`} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 18px', borderBottom: '1px solid #e0f7fa', borderRight: '1px solid #e0f7fa',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: '#b2ebf2', color: '#006064',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700,
                    }}>
                      {entry.employee_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#006064', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.employee_name}
                      </div>
                      <div style={{ fontSize: 11, color: '#00838f' }}>
                        {entry.department_name || 'No dept'} · {entry.employee_id}
                      </div>
                      <div style={{ fontSize: 11, color: '#0891b2', fontWeight: 600, marginTop: 2 }}>
                        {entry.assignment_title || entry.ooo_type}
                        {entry.start_date !== entry.end_date && (
                          <span style={{ fontWeight: 400, color: '#0891b2', marginLeft: 4 }}>
                            until {new Date(entry.end_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ background: '#e0f7fa', color: '#00838f', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                      OOO
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom grid: trend + flagged issues */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>

            {/* Weekly Trend */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-100)' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--gray-800)' }}>
                  7-Day Attendance Trend
                </h2>
              </div>
              <div style={{ padding: '20px 18px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 120 }}>
                  {trend.map((day, idx) => {
                    const presentH = ((day.present / trendMax) * 100);
                    const lateH = ((day.late / trendMax) * 100);
                    const isToday = idx === 6;
                    return (
                      <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 90 }}>
                          <div
                            title={`Late: ${day.late}`}
                            style={{ width: '100%', height: `${lateH}%`, background: '#fbbf24', borderRadius: '3px 3px 0 0' }}
                          />
                          <div
                            title={`Present: ${day.present}`}
                            style={{ width: '100%', height: `${presentH}%`, background: isToday ? 'var(--primary-500)' : '#86efac' }}
                          />
                        </div>
                        <span style={{ fontSize: 10, color: isToday ? 'var(--primary-600)' : 'var(--gray-500)', fontWeight: isToday ? 700 : 400 }}>
                          {new Date(day.date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short' })}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--gray-600)', fontWeight: 600 }}>
                          {day.present + day.late}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--gray-500)' }}>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#86efac', borderRadius: 2, marginRight: 4 }} />Present</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#fbbf24', borderRadius: 2, marginRight: 4 }} />Late</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--primary-500)', borderRadius: 2, marginRight: 4 }} />Today</span>
                </div>
              </div>
            </div>

            {/* Flagged Issues */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--gray-800)' }}>
                  Flagged Issues
                </h2>
                {issues.length > 0 && (
                  <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                    {issues.length}
                  </span>
                )}
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                {issues.length === 0 && (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                    No issues flagged
                  </div>
                )}
                {issues.map((issue, idx) => (
                  <div key={`${issue.user_id}_${issue.type}_${idx}`} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '10px 18px', borderBottom: '1px solid var(--gray-50)',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                      background: issueTypeColor[issue.type],
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800)' }}>
                        {issue.employee_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>
                        {issue.department_name || 'No dept'}
                      </div>
                      <div style={{ fontSize: 11, color: issueTypeColor[issue.type], fontWeight: 600 }}>
                        {issueTypeLabel[issue.type]}: {issue.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: number | string; sub: string; color: string; icon: string;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)',
      padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 22, background: `${color}18`, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginTop: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AttendanceRecord['status'] }) {
  const labels: Record<string, string> = { present: 'On Time', late: 'Late', half_day: 'Half Day', absent: 'Absent' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `${STATUS_COLORS[status] || '#6b7280'}22`,
      color: STATUS_COLORS[status] || '#6b7280',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {labels[status] || status}
    </span>
  );
}
