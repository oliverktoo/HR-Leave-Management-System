// Rota Management — HR Admin / HOD
// Two tabs: Roster Grid (week view) + Schedules (templates)

import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { useAuth } from '../../hooks/useAuth';
import {
  getWorkSchedules,
  saveWorkSchedule,
  deleteWorkSchedule,
  getStaffRota,
  setRotaEntry,
  bulkSetRota,
  getRotaEmployees,
  WorkSchedule,
  StaffRotaEntry,
  RotaEmployee,
} from '../../services/attendanceRotaService';

// ─── date helpers ────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of the week containing d */
function weekStart(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun
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

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short' });
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Generate all dates Mon→Sun for a given Monday
function weekDates(mon: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

// Generate all YYYY-MM-DD strings for a date range (inclusive)
function dateRange(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endMs = new Date(end).setHours(0, 0, 0, 0);
  while (cur.getTime() <= endMs) {
    out.push(isoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ─── schedule-type badge colours ─────────────────────────────────────────────

const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  office:   { bg: '#dbeafe', color: '#1d4ed8' },
  field:    { bg: '#dcfce7', color: '#15803d' },
  remote:   { bg: '#f3e8ff', color: '#7e22ce' },
  off:      { bg: '#fee2e2', color: '#b91c1c' },
  flexible: { bg: '#fef3c7', color: '#92400e' },
};

// ─── cell dropdown ────────────────────────────────────────────────────────────

interface CellDropdownProps {
  schedules: WorkSchedule[];
  onSelect: (scheduleId: string | null, isDayOff: boolean) => void;
  onClose: () => void;
}

function CellDropdown({ schedules, onSelect, onClose }: CellDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        zIndex: 200,
        top: '100%',
        left: 0,
        minWidth: 180,
        background: '#fff',
        border: '1px solid var(--gray-200)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        overflow: 'hidden',
      }}
    >
      {schedules.map(s => (
        <button
          key={s.id}
          onClick={() => { onSelect(s.id, false); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '7px 12px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color || '#94a3b8', flexShrink: 0 }} />
          {s.name}
        </button>
      ))}
      <div style={{ borderTop: '1px solid var(--gray-100)', margin: '4px 0' }} />
      <button
        onClick={() => { onSelect(null, true); onClose(); }}
        style={{
          display: 'block', width: '100%', padding: '7px 12px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, textAlign: 'left', color: 'var(--gray-500)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        Day Off
      </button>
      <button
        onClick={() => { onSelect(null, false); onClose(); }}
        style={{
          display: 'block', width: '100%', padding: '7px 12px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, textAlign: 'left', color: 'var(--danger-500)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        Clear
      </button>
    </div>
  );
}

// ─── schedule form ─────────────────────────────────────────────────────────────

interface ScheduleFormData {
  id?: string;
  name: string;
  description: string;
  schedule_type: WorkSchedule['schedule_type'];
  start_time: string;
  end_time: string;
  expected_hours: number;
  break_minutes: number;
  grace_period_minutes: number;
  color: string;
}

const BLANK_FORM: ScheduleFormData = {
  name: '',
  description: '',
  schedule_type: 'office',
  start_time: '08:00',
  end_time: '17:00',
  expected_hours: 8,
  break_minutes: 60,
  grace_period_minutes: 15,
  color: '#2563eb',
};

// ─── main component ────────────────────────────────────────────────────────────

type Tab = 'roster' | 'schedules';

export function RotaManagement() {
  const { profile } = useAuth();
  const isHOD = profile?.role === 'hod';
  const hodDeptId: string | undefined = isHOD ? (profile as any)?.department_id : undefined;

  const [tab, setTab] = useState<Tab>('roster');

  // ── roster state ──
  const [weekMon, setWeekMon] = useState<Date>(() => weekStart(new Date()));
  const [employees, setEmployees] = useState<RotaEmployee[]>([]);
  const [rota, setRota] = useState<StaffRotaEntry[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [deptFilter, setDeptFilter] = useState<string>(hodDeptId ?? '__all__');
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null); // "userId__date"
  const [openCell, setOpenCell] = useState<string | null>(null); // "userId__date"
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── bulk modal ──
  const [showBulk, setShowBulk] = useState(false);
  const [bulkEmployees, setBulkEmployees] = useState<string[]>([]);
  const [bulkStart, setBulkStart] = useState('');
  const [bulkEnd, setBulkEnd] = useState('');
  const [bulkScheduleId, setBulkScheduleId] = useState<string>('__off__');
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── schedules tab state ──
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormData>({ ...BLANK_FORM });
  const [savingSchedule, setSavingSchedule] = useState(false);

  // ─── derived ───────────────────────────────────────────────────────────────

  const dates = weekDates(weekMon);
  const weekEnd = dates[6];

  const allDepts = Array.from(
    new Map(employees.map(e => [e.department_id, e.department_name])).entries()
  ).map(([id, name]) => ({ id, name }));

  const visibleEmployees = employees.filter(e =>
    deptFilter === '__all__' ? true : e.department_id === deptFilter
  );

  // rota lookup: userId__date => entry
  const rotaMap = new Map<string, StaffRotaEntry>();
  for (const r of rota) {
    rotaMap.set(`${r.user_id}__${r.rota_date}`, r);
  }

  // ─── loaders ───────────────────────────────────────────────────────────────

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const data = await getWorkSchedules();
      setSchedules(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSchedules(false);
    }
  }, []);

  const loadRoster = useCallback(async () => {
    setLoadingRoster(true);
    try {
      const [emps, rotaData] = await Promise.all([
        getRotaEmployees(),
        getStaffRota(isoDate(weekMon), isoDate(weekEnd)),
      ]);
      setEmployees(emps);
      setRota(rotaData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingRoster(false);
    }
  }, [weekMon, weekEnd]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);
  useEffect(() => { loadRoster(); }, [loadRoster]);

  // ─── flash ─────────────────────────────────────────────────────────────────

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  // ─── cell actions ──────────────────────────────────────────────────────────

  const handleCellSelect = async (
    emp: RotaEmployee,
    date: Date,
    scheduleId: string | null,
    isDayOff: boolean
  ) => {
    const dateStr = isoDate(date);
    const key = `${emp.id}__${dateStr}`;
    setSavingCell(key);
    try {
      await setRotaEntry(emp.id, dateStr, scheduleId, isDayOff);
      // Refresh rota for the week
      const rotaData = await getStaffRota(isoDate(weekMon), isoDate(weekEnd));
      setRota(rotaData);
      flash('Saved');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingCell(null);
    }
  };

  // ─── bulk assign ───────────────────────────────────────────────────────────

  const handleBulkAssign = async () => {
    if (bulkEmployees.length === 0 || !bulkStart || !bulkEnd) return;
    const dates = dateRange(new Date(bulkStart), new Date(bulkEnd));
    if (dates.length === 0) return;

    const isDayOff = bulkScheduleId === '__off__';
    const schedId = isDayOff ? null : bulkScheduleId;

    setBulkSaving(true);
    try {
      await bulkSetRota(bulkEmployees, dates, schedId, isDayOff);
      setShowBulk(false);
      setBulkEmployees([]);
      setBulkStart('');
      setBulkEnd('');
      setBulkScheduleId('__off__');
      flash(`Bulk assignment applied to ${bulkEmployees.length} employee(s) over ${dates.length} day(s).`);
      await loadRoster();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBulkSaving(false);
    }
  };

  // ─── schedule CRUD ─────────────────────────────────────────────────────────

  const openNewSchedule = () => {
    setScheduleForm({ ...BLANK_FORM });
    setShowScheduleForm(true);
  };

  const openEditSchedule = (s: WorkSchedule) => {
    setScheduleForm({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      schedule_type: s.schedule_type,
      start_time: s.start_time,
      end_time: s.end_time,
      expected_hours: s.expected_hours,
      break_minutes: s.break_minutes,
      grace_period_minutes: s.grace_period_minutes,
      color: s.color,
    });
    setShowScheduleForm(true);
  };

  const handleSaveSchedule = async () => {
    if (!scheduleForm.name.trim()) return;
    setSavingSchedule(true);
    try {
      await saveWorkSchedule({
        ...(scheduleForm.id ? { id: scheduleForm.id } : {}),
        name: scheduleForm.name.trim(),
        description: scheduleForm.description.trim() || null,
        schedule_type: scheduleForm.schedule_type,
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time,
        expected_hours: Number(scheduleForm.expected_hours),
        break_minutes: Number(scheduleForm.break_minutes),
        grace_period_minutes: Number(scheduleForm.grace_period_minutes),
        color: scheduleForm.color,
        is_active: true,
      });
      setShowScheduleForm(false);
      flash(scheduleForm.id ? 'Schedule updated.' : 'Schedule created.');
      await loadSchedules();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this schedule? It will no longer appear in roster assignment.')) return;
    try {
      await deleteWorkSchedule(id);
      flash('Schedule deactivated.');
      await loadSchedules();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">

          {/* Header */}
          <header className="admin-header">
            <div>
              <h1>Shift / Rota Management</h1>
              <p className="admin-subtitle">Manage staff schedules and weekly rosters</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <NotificationBell />
            </div>
          </header>

          {/* Alerts */}
          {error && (
            <div className="alert alert-error mb-4">
              {error}
              <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
            </div>
          )}
          {success && <div className="alert alert-success mb-4">{success}</div>}

          {/* Tabs */}
          <div className="tabs mb-4">
            <button className={`tab ${tab === 'roster' ? 'active' : ''}`} onClick={() => setTab('roster')}>
              Roster Grid
            </button>
            <button className={`tab ${tab === 'schedules' ? 'active' : ''}`} onClick={() => setTab('schedules')}>
              Shift Schedules
            </button>
          </div>

          {/* ── ROSTER GRID TAB ────────────────────────────── */}
          {tab === 'roster' && (
            <div>
              {/* Toolbar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                {/* Week navigator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setWeekMon(w => addDays(w, -7))}
                  >
                    ←
                  </button>
                  <span style={{ fontWeight: 600, fontSize: 14, minWidth: 180, textAlign: 'center' }}>
                    Week of {fmtDate(weekMon)}
                  </span>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setWeekMon(w => addDays(w, 7))}
                  >
                    →
                  </button>
                </div>

                {/* Department filter */}
                {!isHOD && (
                  <select
                    className="form-control"
                    style={{ width: 'auto', minWidth: 160, fontSize: 13, height: 34, padding: '0 8px' }}
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                  >
                    <option value="__all__">All Departments</option>
                    {allDepts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}

                <button className="btn btn-primary btn-sm" onClick={() => setShowBulk(true)}>
                  Bulk Assign
                </button>
              </div>

              {/* Grid */}
              {loadingRoster ? (
                <div className="loading-container"><div className="loading-spinner" /><p>Loading roster…</p></div>
              ) : visibleEmployees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--gray-400)' }}>No employees found.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{
                          position: 'sticky', left: 0, zIndex: 10,
                          background: 'var(--gray-100)', padding: '10px 14px',
                          textAlign: 'left', borderBottom: '2px solid var(--gray-200)',
                          minWidth: 180, fontWeight: 600, color: 'var(--gray-700)',
                        }}>
                          Employee
                        </th>
                        {dates.map((d, i) => (
                          <th key={i} style={{
                            padding: '10px 8px', textAlign: 'center',
                            borderBottom: '2px solid var(--gray-200)',
                            background: 'var(--gray-100)', fontWeight: 600,
                            color: 'var(--gray-700)', minWidth: 110,
                          }}>
                            <div>{DAY_LABELS[i]}</div>
                            <div style={{ fontWeight: 400, fontSize: 11, color: 'var(--gray-500)' }}>{fmtShort(d)}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEmployees.map((emp, empIdx) => (
                        <tr key={emp.id} style={{ background: empIdx % 2 === 0 ? '#fff' : 'var(--gray-50)' }}>
                          {/* Employee name */}
                          <td style={{
                            position: 'sticky', left: 0, zIndex: 5,
                            background: empIdx % 2 === 0 ? '#fff' : 'var(--gray-50)',
                            padding: '8px 14px', borderBottom: '1px solid var(--gray-100)',
                          }}>
                            <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>
                              {emp.first_name} {emp.last_name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{emp.department_name}</div>
                          </td>

                          {/* Day cells */}
                          {dates.map((date, di) => {
                            const dateStr = isoDate(date);
                            const cellKey = `${emp.id}__${dateStr}`;
                            const entry = rotaMap.get(cellKey);
                            const isSaving = savingCell === cellKey;
                            const isOpen = openCell === cellKey;

                            let cellContent: React.ReactNode = (
                              <span style={{ color: 'var(--gray-300)', fontSize: 12 }}>—</span>
                            );

                            if (isSaving) {
                              cellContent = <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>…</span>;
                            } else if (entry?.is_day_off) {
                              cellContent = (
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                                  fontSize: 11, background: 'var(--gray-100)', color: 'var(--gray-500)',
                                  fontWeight: 500,
                                }}>
                                  Off
                                </span>
                              );
                            } else if (entry?.schedule) {
                              const s = entry.schedule;
                              cellContent = (
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                                  fontSize: 11, background: (s.color || '#2563eb') + '22',
                                  color: s.color || '#2563eb', fontWeight: 600,
                                  border: `1px solid ${s.color || '#2563eb'}44`,
                                  maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {s.name}
                                </span>
                              );
                            }

                            return (
                              <td
                                key={di}
                                style={{
                                  padding: '6px 8px', textAlign: 'center',
                                  borderBottom: '1px solid var(--gray-100)',
                                  position: 'relative', verticalAlign: 'middle',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'inline-block', cursor: 'pointer', position: 'relative',
                                    borderRadius: 6, padding: '2px 4px',
                                    minWidth: 60, minHeight: 28,
                                    transition: 'background 0.1s',
                                  }}
                                  onClick={() => setOpenCell(isOpen ? null : cellKey)}
                                  title="Click to assign schedule"
                                >
                                  {cellContent}
                                  {isOpen && (
                                    <CellDropdown
                                      schedules={schedules}
                                      onSelect={(scheduleId, isDayOff) => handleCellSelect(emp, date, scheduleId, isDayOff)}
                                      onClose={() => setOpenCell(null)}
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SCHEDULES TAB ──────────────────────────────── */}
          {tab === 'schedules' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <button className="btn btn-primary" onClick={openNewSchedule}>
                  + New Schedule
                </button>
              </div>

              {loadingSchedules ? (
                <div className="loading-container"><div className="loading-spinner" /><p>Loading schedules…</p></div>
              ) : schedules.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--gray-400)' }}>
                  No schedules defined yet.
                </div>
              ) : (
                <div className="card">
                  <div className="card-body" style={{ padding: 0 }}>
                    <div className="table-responsive">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Hours</th>
                            <th>Break</th>
                            <th>Grace</th>
                            <th>Color</th>
                            <th>Status</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedules.map(s => {
                            const badge = TYPE_BADGE[s.schedule_type] ?? { bg: '#e5e7eb', color: '#374151' };
                            return (
                              <tr key={s.id}>
                                <td>
                                  <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{s.name}</div>
                                  {s.description && (
                                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{s.description}</div>
                                  )}
                                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                                    {s.start_time} – {s.end_time}
                                  </div>
                                </td>
                                <td>
                                  <span style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                                    fontSize: 11, fontWeight: 600,
                                    background: badge.bg, color: badge.color,
                                    textTransform: 'capitalize',
                                  }}>
                                    {s.schedule_type}
                                  </span>
                                </td>
                                <td style={{ fontSize: 13 }}>{s.expected_hours}h</td>
                                <td style={{ fontSize: 13 }}>{s.break_minutes} min</td>
                                <td style={{ fontSize: 13 }}>{s.grace_period_minutes} min</td>
                                <td>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: 6,
                                    background: s.color || '#94a3b8',
                                    border: '2px solid var(--gray-200)',
                                  }} />
                                </td>
                                <td>
                                  <span style={{
                                    color: s.is_active ? 'var(--success-600)' : 'var(--gray-400)',
                                    fontWeight: 600, fontSize: 12,
                                  }}>
                                    {s.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-outline btn-sm" onClick={() => openEditSchedule(s)}>
                                      Edit
                                    </button>
                                    <button
                                      className="btn btn-outline btn-sm"
                                      style={{ color: 'var(--danger-500)', borderColor: 'var(--danger-300)' }}
                                      onClick={() => handleDeactivate(s.id)}
                                    >
                                      Deactivate
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* ── BULK ASSIGN MODAL ──────────────────────────────── */}
      {showBulk && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>Bulk Assign Schedule</h3>
              <button className="modal-close" onClick={() => setShowBulk(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

              {/* Employee selection */}
              <div className="form-group">
                <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>
                  Select Employees ({bulkEmployees.length} selected)
                </label>
                <div style={{
                  border: '1px solid var(--gray-200)', borderRadius: 8,
                  maxHeight: 220, overflowY: 'auto', padding: 8,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: 'var(--gray-600)' }}>
                    <input
                      type="checkbox"
                      checked={bulkEmployees.length === visibleEmployees.length && visibleEmployees.length > 0}
                      onChange={e => setBulkEmployees(e.target.checked ? visibleEmployees.map(e => e.id) : [])}
                    />
                    Select all
                  </label>
                  <div style={{ borderTop: '1px solid var(--gray-100)', margin: '4px 0' }} />
                  {visibleEmployees.map(emp => (
                    <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={bulkEmployees.includes(emp.id)}
                        onChange={e => setBulkEmployees(prev =>
                          e.target.checked ? [...prev, emp.id] : prev.filter(id => id !== emp.id)
                        )}
                      />
                      <span>{emp.first_name} {emp.last_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{emp.department_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" className="form-control" value={bulkStart} onChange={e => setBulkStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" className="form-control" value={bulkEnd} onChange={e => setBulkEnd(e.target.value)} />
                </div>
              </div>

              {/* Schedule selection */}
              <div className="form-group">
                <label>Schedule / Assignment</label>
                <select className="form-control" value={bulkScheduleId} onChange={e => setBulkScheduleId(e.target.value)}>
                  <option value="__off__">Day Off</option>
                  {schedules.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>
                  ))}
                </select>
              </div>

            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setShowBulk(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleBulkAssign}
                disabled={bulkSaving || bulkEmployees.length === 0 || !bulkStart || !bulkEnd}
              >
                {bulkSaving ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULE FORM MODAL ──────────────────────────── */}
      {showScheduleForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>{scheduleForm.id ? 'Edit Schedule' : 'New Schedule'}</h3>
              <button className="modal-close" onClick={() => setShowScheduleForm(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>

              <div className="form-group">
                <label>Name <span style={{ color: 'var(--danger-500)' }}>*</span></label>
                <input
                  className="form-control"
                  value={scheduleForm.name}
                  onChange={e => setScheduleForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Morning Shift"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  className="form-control"
                  value={scheduleForm.description}
                  onChange={e => setScheduleForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>

              <div className="form-group">
                <label>Schedule Type</label>
                <select
                  className="form-control"
                  value={scheduleForm.schedule_type}
                  onChange={e => setScheduleForm(f => ({ ...f, schedule_type: e.target.value as WorkSchedule['schedule_type'] }))}
                >
                  <option value="office">Office</option>
                  <option value="field">Field</option>
                  <option value="remote">Remote</option>
                  <option value="off">Off</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Start Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={scheduleForm.start_time}
                    onChange={e => setScheduleForm(f => ({ ...f, start_time: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={scheduleForm.end_time}
                    onChange={e => setScheduleForm(f => ({ ...f, end_time: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Expected Hours</label>
                  <input
                    type="number"
                    className="form-control"
                    min={0} max={24} step={0.5}
                    value={scheduleForm.expected_hours}
                    onChange={e => setScheduleForm(f => ({ ...f, expected_hours: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="form-group">
                  <label>Break (min)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={0} max={240}
                    value={scheduleForm.break_minutes}
                    onChange={e => setScheduleForm(f => ({ ...f, break_minutes: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="form-group">
                  <label>Grace (min)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={0} max={120}
                    value={scheduleForm.grace_period_minutes}
                    onChange={e => setScheduleForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Colour</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="color"
                    value={scheduleForm.color}
                    onChange={e => setScheduleForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: 48, height: 36, padding: 2, border: '1px solid var(--gray-300)', borderRadius: 6, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{scheduleForm.color}</span>
                  <span style={{
                    display: 'inline-block', padding: '3px 12px', borderRadius: 10,
                    background: scheduleForm.color + '22', color: scheduleForm.color,
                    border: `1px solid ${scheduleForm.color}44`, fontSize: 12, fontWeight: 600,
                  }}>
                    Preview
                  </span>
                </div>
              </div>

            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setShowScheduleForm(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSaveSchedule}
                disabled={savingSchedule || !scheduleForm.name.trim()}
              >
                {savingSchedule ? 'Saving…' : scheduleForm.id ? 'Save Changes' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
