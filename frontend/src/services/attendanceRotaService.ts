// Attendance Rota Service — work schedules, rota management, and attendance reports
import { supabase } from '../lib/supabaseClient';

// =====================================================
// Types
// =====================================================

export interface WorkSchedule {
  id: string;
  name: string;
  description: string | null;
  schedule_type: 'office' | 'field' | 'remote' | 'off' | 'flexible';
  start_time: string;   // "HH:MM"
  end_time: string;     // "HH:MM"
  expected_hours: number;
  break_minutes: number;
  grace_period_minutes: number;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffRotaEntry {
  id: string;
  user_id: string;
  schedule_id: string | null;
  rota_date: string;  // "YYYY-MM-DD"
  is_day_off: boolean;
  notes: string | null;
  schedule?: WorkSchedule;
  profile?: {
    first_name: string;
    last_name: string;
    employee_id: string;
    department_id: string;
  };
}

export interface RotaEmployee {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  department_id: string;
  department_name: string;
  role: string;
}

export interface AttendanceLateRecord {
  user_id: string;
  employee_name: string;
  employee_id: string;
  department: string;
  date: string;
  day_of_week: string;
  scheduled_start: string;
  actual_check_in: string;   // ISO
  minutes_late: number;
  grace_period: number;
  status: 'late' | 'very_late';
}

export interface AttendanceHoursRecord {
  user_id: string;
  employee_name: string;
  employee_id: string;
  department: string;
  days_present: number;   // office days with completed checkout
  days_late: number;
  days_field: number;     // OOO / field assignment days
  office_hours: number;   // hours from office attendance records
  field_hours: number;    // hours from field clock-logs (OOO)
  total_hours_worked: number;  // office_hours + field_hours
  standard_hours: number;      // total expected hours for the period
  variance_hours: number;
  overtime_hours: number;
  deficit_hours: number;
  completion_pct: number;
  avg_hours_per_day: number;
}

export interface AttendanceDayStatus {
  date: string;
  day: string;
  status: 'present' | 'late' | 'absent' | 'leave' | 'field' | 'holiday' | 'off' | 'no_schedule' | 'future';
  check_in?: string;
  check_out?: string;
  hours?: number;
  schedule_name?: string;
  leave_type?: string;
}

export interface EmployeeAbsenceRecord {
  user_id: string;
  employee_name: string;
  employee_id: string;
  department: string;
  days: AttendanceDayStatus[];
  summary: {
    present: number;
    late: number;
    absent: number;
    leave: number;
    field: number;
    off: number;
    holiday: number;
  };
}

// =====================================================
// Helpers
// =====================================================

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isoToTimeStr(iso: string): string {
  // Extract HH:MM in EAT from an ISO timestamp
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).substring(0, 5);
}

function getDaysInMonth(year: number, month: number): Date[] {
  // Returns every Mon-Fri in the given month (1-based month)
  const days: Date[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =====================================================
// Work Schedules
// =====================================================

export async function getWorkSchedules(): Promise<WorkSchedule[]> {
  const { data, error } = await supabase
    .from('work_schedules')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Failed to fetch work schedules: ${error.message}`);
  return (data ?? []) as WorkSchedule[];
}

export async function saveWorkSchedule(
  schedule: Partial<WorkSchedule> & { id?: string }
): Promise<WorkSchedule> {
  const payload = { ...schedule, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from('work_schedules')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(`Failed to save work schedule: ${error.message}`);
  return data as WorkSchedule;
}

export async function deleteWorkSchedule(id: string): Promise<void> {
  const { error } = await supabase
    .from('work_schedules')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to delete work schedule: ${error.message}`);
}

// =====================================================
// Staff Rota
// =====================================================

export async function getStaffRota(
  startDate: string,
  endDate: string,
  userId?: string
): Promise<StaffRotaEntry[]> {
  let query = supabase
    .from('staff_rota')
    .select(`
      *,
      schedule:work_schedules(*),
      profile:users_profile(first_name, last_name, employee_id, department_id)
    `)
    .gte('rota_date', startDate)
    .lte('rota_date', endDate)
    .order('rota_date');

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch staff rota: ${error.message}`);
  return (data ?? []) as StaffRotaEntry[];
}

export async function setRotaEntry(
  userId: string,
  rotaDate: string,
  scheduleId: string | null,
  isDayOff: boolean,
  notes?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    user_id: userId,
    rota_date: rotaDate,
    schedule_id: scheduleId,
    is_day_off: isDayOff,
    notes: notes ?? null,
    created_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('staff_rota')
    .upsert(payload, { onConflict: 'user_id,rota_date' });

  if (error) throw new Error(`Failed to set rota entry: ${error.message}`);
}

export async function bulkSetRota(
  userIds: string[],
  dates: string[],
  scheduleId: string | null,
  isDayOff: boolean
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const rows = userIds.flatMap(uid =>
    dates.map(d => ({
      user_id: uid,
      rota_date: d,
      schedule_id: scheduleId,
      is_day_off: isDayOff,
      notes: null as string | null,
      created_by: user?.id ?? null,
      updated_at: now,
    }))
  );

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('staff_rota')
    .upsert(rows, { onConflict: 'user_id,rota_date' });

  if (error) throw new Error(`Failed to bulk-set rota: ${error.message}`);
}

export async function getRotaEmployees(): Promise<RotaEmployee[]> {
  const { data, error } = await supabase
    .from('users_profile')
    .select(`
      id,
      first_name,
      last_name,
      employee_id,
      department_id,
      role,
      departments!users_profile_department_id_fkey(name)
    `)
    .eq('is_active', true)
    .in('role', ['employee', 'hod', 'hr_admin', 'super_admin', 'fleet_manager', 'driver'])
    .order('first_name');

  if (error) throw new Error(`Failed to fetch employees: ${error.message}`);

  return ((data ?? []) as unknown as Array<{
    id: string;
    first_name: string;
    last_name: string;
    employee_id: string;
    department_id: string;
    role: string;
    departments: { name: string } | null;
  }>).map(e => ({
    id: e.id,
    first_name: e.first_name,
    last_name: e.last_name,
    employee_id: e.employee_id,
    department_id: e.department_id,
    department_name: e.departments?.name ?? 'Unknown',
    role: e.role,
  }));
}

// =====================================================
// Public Holidays helper
// =====================================================

export async function getPublicHolidays(year: number, month: number): Promise<string[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const endStr = formatDate(endDate);

  const { data, error } = await supabase
    .from('public_holidays')
    .select('date')
    .gte('date', startDate)
    .lte('date', endStr);

  if (error) {
    // Table may not exist in all deployments — return empty silently
    console.warn('public_holidays fetch warning:', error.message);
    return [];
  }
  return (data ?? []).map((r: { date: string }) => r.date);
}

// =====================================================
// Late Arrivals Report
// =====================================================

export async function getLateReport(
  startDate: string,
  endDate: string,
  departmentId?: string,
  userId?: string
): Promise<AttendanceLateRecord[]> {
  // attendance_records.user_id → auth.users (no PostgREST join to users_profile).
  // Fetch profiles in a separate parallel query and merge by user_id in application code.
  const [attendanceResult, rotaResult, settingsResult, profilesResult] = await Promise.all([
    (() => {
      let q = supabase
        .from('attendance_records')
        .select('id, user_id, employee_id, employee_name, check_in_time, date, status')
        .eq('status', 'late')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });
      if (userId) q = q.eq('user_id', userId);
      return q;
    })(),
    supabase
      .from('staff_rota')
      .select('user_id, rota_date, schedule_id, is_day_off, work_schedules(start_time, grace_period_minutes)')
      .gte('rota_date', startDate)
      .lte('rota_date', endDate),
    supabase
      .from('attendance_settings')
      .select('work_start_time, grace_period_minutes')
      .limit(1)
      .single(),
    (() => {
      let q = supabase
        .from('users_profile')
        .select('id, first_name, last_name, employee_id, department_id, departments!users_profile_department_id_fkey(name)')
        .eq('is_active', true);
      if (departmentId) q = q.eq('department_id', departmentId);
      if (userId) q = q.eq('id', userId);
      return q;
    })(),
  ]);

  if (attendanceResult.error) {
    throw new Error(`Failed to fetch attendance records: ${attendanceResult.error.message}`);
  }

  const defaultStart = (settingsResult.data as { work_start_time: string; grace_period_minutes: number } | null)
    ?.work_start_time?.substring(0, 5) ?? '08:00';
  const defaultGrace = (settingsResult.data as { work_start_time: string; grace_period_minutes: number } | null)
    ?.grace_period_minutes ?? 15;

  // Build rota map: user_id + date => schedule info
  type RotaRow = {
    user_id: string;
    rota_date: string;
    is_day_off: boolean;
    work_schedules: { start_time: string; grace_period_minutes: number } | null;
  };
  const rotaMap = new Map<string, RotaRow>();
  for (const r of ((rotaResult.data ?? []) as unknown as RotaRow[])) {
    rotaMap.set(`${r.user_id}__${r.rota_date}`, r);
  }

  // Build profile map: user_id => profile
  type ProfileRow = {
    id: string;
    first_name: string;
    last_name: string;
    employee_id: string;
    department_id: string;
    departments: { name: string } | null;
  };
  const profileMap = new Map<string, ProfileRow>();
  for (const p of ((profilesResult.data ?? []) as unknown as ProfileRow[])) {
    profileMap.set(p.id, p);
  }

  type AttRow = {
    user_id: string;
    employee_id: string;
    employee_name: string;
    check_in_time: string;
    date: string;
    status: string;
  };

  const result: AttendanceLateRecord[] = [];
  const records = (attendanceResult.data ?? []) as unknown as AttRow[];

  for (const rec of records) {
    const profile = profileMap.get(rec.user_id);
    if (!profile) continue;

    // Department filter (already applied server-side when departmentId is set, double-check client-side)
    if (departmentId && profile.department_id !== departmentId) continue;

    const rotaKey = `${rec.user_id}__${rec.date}`;
    const rotaEntry = rotaMap.get(rotaKey);
    const schedStart = rotaEntry?.work_schedules?.start_time?.substring(0, 5) ?? defaultStart;
    const gracePeriod = rotaEntry?.work_schedules?.grace_period_minutes ?? defaultGrace;

    const scheduledMins = timeToMinutes(schedStart);
    const checkInTime = isoToTimeStr(rec.check_in_time);
    const checkInMins = timeToMinutes(checkInTime);

    const minutesLate = checkInMins - scheduledMins;
    if (minutesLate <= 0) continue;

    const d = new Date(rec.date);
    result.push({
      user_id: rec.user_id,
      employee_name: `${profile.first_name} ${profile.last_name}`,
      employee_id: profile.employee_id ?? rec.employee_id,
      department: profile.departments?.name ?? 'Unknown',
      date: rec.date,
      day_of_week: DAY_NAMES[d.getDay()],
      scheduled_start: schedStart,
      actual_check_in: rec.check_in_time,
      minutes_late: minutesLate,
      grace_period: gracePeriod,
      status: minutesLate >= 30 ? 'very_late' : 'late',
    });
  }

  return result;
}

// =====================================================
// Hours Worked Report
// =====================================================

export async function getHoursReport(
  startDate: string,
  endDate: string,
  departmentId?: string,
  userId?: string
): Promise<AttendanceHoursRecord[]> {
  // One day past endDate for timestamp range on field_clock_logs
  const dayAfter = new Date(endDate);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const endDateExclusive = dayAfter.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

  // attendance_records.user_id → auth.users (no direct join to users_profile).
  // Query all four sources in parallel; merge by user_id in application code.
  const [attendanceResult, rotaResult, profilesResult, fieldLogsResult, oooResult] = await Promise.all([
    (() => {
      let q = supabase
        .from('attendance_records')
        .select('user_id, date, status, work_hours')
        .gte('date', startDate)
        .lte('date', endDate)
        .not('check_out_time', 'is', null);
      if (userId) q = q.eq('user_id', userId);
      return q;
    })(),
    (() => {
      let q = supabase
        .from('staff_rota')
        .select('user_id, rota_date, is_day_off, work_schedules(expected_hours)')
        .gte('rota_date', startDate)
        .lte('rota_date', endDate);
      if (userId) q = q.eq('user_id', userId);
      return q;
    })(),
    (() => {
      let q = supabase
        .from('users_profile')
        .select('id, first_name, last_name, employee_id, department_id, departments!users_profile_department_id_fkey(name)')
        .eq('is_active', true)
        .in('role', ['employee', 'hod', 'hr_admin', 'super_admin', 'fleet_manager', 'driver']);
      if (departmentId) q = q.eq('department_id', departmentId);
      if (userId) q = q.eq('id', userId);
      return q;
    })(),
    (() => {
      // field_clock_logs.user_id → users_profile (migration 027), join works.
      let q = supabase
        .from('field_clock_logs')
        .select('user_id, clock_in_time, work_hours')
        .gte('clock_in_time', startDate)
        .lt('clock_in_time', endDateExclusive)
        .not('clock_out_time', 'is', null)
        .not('work_hours', 'is', null);
      if (userId) q = q.eq('user_id', userId);
      return q;
    })(),
    (() => {
      // Approved OOO requests — tracked once per approval, not per day.
      // user_id references auth.users.id which equals users_profile.id in Supabase.
      let q = supabase
        .from('ooo_requests')
        .select('user_id, start_date, end_date, department_id')
        .eq('status', 'hr_approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate);
      if (departmentId) q = q.eq('department_id', departmentId);
      if (userId) q = q.eq('user_id', userId);
      return q;
    })(),
  ]);

  if (attendanceResult.error) {
    throw new Error(`Failed to fetch hours data: ${attendanceResult.error.message}`);
  }

  // ── Profile map ──────────────────────────────────────────────────────────────
  type ProfileRow = {
    id: string;
    first_name: string;
    last_name: string;
    employee_id: string;
    department_id: string;
    departments: { name: string } | null;
  };
  const profileMap = new Map<string, ProfileRow>();
  for (const p of ((profilesResult.data ?? []) as unknown as ProfileRow[])) {
    profileMap.set(p.id, p);
  }

  // ── Standard hours from rota (per user, summing all non-day-off entries) ─────
  type RotaHoursRow = {
    user_id: string;
    rota_date: string;
    is_day_off: boolean;
    work_schedules: { expected_hours: number } | null;
  };
  const userRotaStdHours = new Map<string, number>(); // user_id → total scheduled hours
  for (const r of ((rotaResult.data ?? []) as unknown as RotaHoursRow[])) {
    if (r.is_day_off || !profileMap.has(r.user_id)) continue;
    const exp = r.work_schedules?.expected_hours ?? 8.0;
    userRotaStdHours.set(r.user_id, (userRotaStdHours.get(r.user_id) ?? 0) + exp);
  }

  // Fallback: total weekday count in the period × 8h (for employees without rota entries)
  const weekdaysInPeriod = (() => {
    let count = 0;
    const cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  })();
  const defaultStdHours = weekdaysInPeriod * 8.0;

  // ── GPS field clock logs aggregation ─────────────────────────────────────────
  // Build fieldHoursPerDay first — office aggregation below uses it to deduplicate
  // hours on days where an employee did partial-day field work then returned to office.
  type FieldRow = { user_id: string; clock_in_time: string; work_hours: number | null };
  const fieldHoursPerDay = new Map<string, number>(); // `${user_id}__${YYYY-MM-DD}` → hours
  const fieldClockMap = new Map<string, { hours: number; dates: Set<string> }>();
  for (const log of ((fieldLogsResult.data ?? []) as unknown as FieldRow[])) {
    if (!profileMap.has(log.user_id)) continue;
    const hrs = log.work_hours ?? 0;
    const dateStr = log.clock_in_time.substring(0, 10);
    const dayKey = `${log.user_id}__${dateStr}`;
    fieldHoursPerDay.set(dayKey, (fieldHoursPerDay.get(dayKey) ?? 0) + hrs);
    const e = fieldClockMap.get(log.user_id) ?? { hours: 0, dates: new Set<string>() };
    e.hours += hrs;
    e.dates.add(dateStr);
    fieldClockMap.set(log.user_id, e);
  }

  // ── Approved OOO aggregation (full-day, pre-approved, no clock-in required) ──
  type OOORow = { user_id: string; start_date: string; end_date: string };
  const oooMap = new Map<string, { hours: number; days: number }>();
  const periodStart = new Date(startDate);
  const periodEnd   = new Date(endDate);
  for (const ooo of ((oooResult.data ?? []) as unknown as OOORow[])) {
    if (!profileMap.has(ooo.user_id)) continue;
    const oooStart = new Date(Math.max(new Date(ooo.start_date).getTime(), periodStart.getTime()));
    const oooEnd   = new Date(Math.min(new Date(ooo.end_date).getTime(),   periodEnd.getTime()));
    let workDays = 0;
    const cur = new Date(oooStart);
    while (cur <= oooEnd) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        // If the employee clocked in at the field on this day, skip the flat 8h estimate —
        // actual clock data from field_clock_logs takes precedence for that day.
        if (!fieldHoursPerDay.has(`${ooo.user_id}__${ds}`)) workDays++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (workDays === 0) continue;
    const e = oooMap.get(ooo.user_id) ?? { hours: 0, days: 0 };
    oooMap.set(ooo.user_id, { hours: e.hours + workDays * 8.0, days: e.days + workDays });
  }

  // ── Office hours aggregation ──────────────────────────────────────────────────
  // Subtract any field clock hours on the same day to prevent double-counting
  // when an employee goes to a field assignment mid-day and returns to the office.
  type AttRow = { user_id: string; date: string; status: string; work_hours: number | null };
  const officeMap = new Map<string, { hours: number; days: number; late: number }>();
  for (const rec of ((attendanceResult.data ?? []) as unknown as AttRow[])) {
    if (!profileMap.has(rec.user_id)) continue;
    const e = officeMap.get(rec.user_id) ?? { hours: 0, days: 0, late: 0 };
    const fieldOnDay = fieldHoursPerDay.get(`${rec.user_id}__${rec.date}`) ?? 0;
    e.hours += Math.max(0, (rec.work_hours ?? 0) - fieldOnDay);
    e.days  += 1;
    if (rec.status === 'late') e.late += 1;
    officeMap.set(rec.user_id, e);
  }

  // ── Build result for every profile in scope ────────────────────────────────────
  const result: AttendanceHoursRecord[] = [];
  for (const profile of profileMap.values()) {
    const office     = officeMap.get(profile.id)      ?? { hours: 0, days: 0, late: 0 };
    const fieldClock = fieldClockMap.get(profile.id)  ?? { hours: 0, dates: new Set<string>() };
    const ooo        = oooMap.get(profile.id)         ?? { hours: 0, days: 0 };

    const office_hours = Math.round(office.hours * 100) / 100;
    // field_hours = GPS-tracked clock logs + approved OOO days (8h/day)
    const field_hours  = Math.round((fieldClock.hours + ooo.hours) * 100) / 100;
    const total_hours  = Math.round((office.hours + fieldClock.hours + ooo.hours) * 100) / 100;
    const days_field   = fieldClock.dates.size + ooo.days;

    // Standard hours: rota if available, else weekdays × 8h
    const standard_hours = Math.round(
      (userRotaStdHours.has(profile.id) ? userRotaStdHours.get(profile.id)! : defaultStdHours) * 100
    ) / 100;

    const variance  = Math.round((total_hours - standard_hours) * 100) / 100;
    const totalDays = office.days + days_field;

    result.push({
      user_id:            profile.id,
      employee_name:      `${profile.first_name} ${profile.last_name}`,
      employee_id:        profile.employee_id,
      department:         profile.departments?.name ?? 'Unknown',
      days_present:       office.days,
      days_late:          office.late,
      days_field,
      office_hours,
      field_hours,
      total_hours_worked: total_hours,
      standard_hours,
      variance_hours:     variance,
      overtime_hours:     variance > 0 ? variance : 0,
      deficit_hours:      variance < 0 ? Math.round(-variance * 100) / 100 : 0,
      completion_pct:     standard_hours > 0
        ? Math.round((total_hours / standard_hours) * 10000) / 100
        : 0,
      avg_hours_per_day:  totalDays > 0
        ? Math.round((total_hours / totalDays) * 100) / 100
        : 0,
    });
  }

  // Sort: department → name (keeps grouping intact in UI)
  result.sort((a, b) => a.department.localeCompare(b.department) || a.employee_name.localeCompare(b.employee_name));
  return result;
}

// =====================================================
// Absence / Calendar Report
// =====================================================

export async function getAbsenceReport(
  year: number,
  month: number,
  departmentId?: string
): Promise<EmployeeAbsenceRecord[]> {
  const workingDays = getDaysInMonth(year, month);
  if (workingDays.length === 0) return [];

  const startDate = formatDate(workingDays[0]);
  const endDate = formatDate(workingDays[workingDays.length - 1]);
  const today = formatDate(new Date());

  // Fetch all data in parallel
  const [employeesResult, attendanceResult, rotaResult, leaveResult, holidaysResult, oooResult] = await Promise.all([
    (() => {
      let q = supabase
        .from('users_profile')
        .select(`
          id, first_name, last_name, employee_id, department_id, role,
          departments!users_profile_department_id_fkey(name)
        `)
        .eq('is_active', true)
        .in('role', ['employee', 'hod', 'hr_admin', 'super_admin', 'fleet_manager', 'driver'])
        .order('first_name');
      if (departmentId) q = q.eq('department_id', departmentId);
      return q;
    })(),
    supabase
      .from('attendance_records')
      .select('user_id, date, status, check_in_time, check_out_time, work_hours')
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('staff_rota')
      .select('user_id, rota_date, is_day_off, work_schedules(name, schedule_type)')
      .gte('rota_date', startDate)
      .lte('rota_date', endDate),
    supabase
      .from('leave_requests')
      .select('user_id, start_date, end_date, status, leave_type:leave_types(name)')
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate),
    getPublicHolidays(year, month),
    supabase
      .from('ooo_requests')
      .select('user_id, start_date, end_date')
      .eq('status', 'hr_approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate),
  ]);

  if (employeesResult.error) {
    throw new Error(`Failed to fetch employees: ${employeesResult.error.message}`);
  }

  type EmployeeRow = {
    id: string;
    first_name: string;
    last_name: string;
    employee_id: string;
    department_id: string;
    role: string;
    departments: { name: string } | null;
  };

  type AttRow = {
    user_id: string;
    date: string;
    status: string;
    check_in_time: string;
    check_out_time: string | null;
    work_hours: number | null;
  };

  type RotaRow = {
    user_id: string;
    rota_date: string;
    is_day_off: boolean;
    work_schedules: { name: string; schedule_type: string } | null;
  };

  type LeaveRow = {
    user_id: string;
    start_date: string;
    end_date: string;
    status: string;
    leave_type: { name: string } | null;
  };

  // Index data by user+date
  const attendanceMap = new Map<string, AttRow>();
  for (const r of ((attendanceResult.data ?? []) as AttRow[])) {
    attendanceMap.set(`${r.user_id}__${r.date}`, r);
  }

  const rotaMap = new Map<string, RotaRow>();
  for (const r of ((rotaResult.data ?? []) as unknown as RotaRow[])) {
    rotaMap.set(`${r.user_id}__${r.rota_date}`, r);
  }

  // Leave: expand date ranges into per-day entries
  const leaveMap = new Map<string, string>(); // key => leave type name
  for (const l of ((leaveResult.data ?? []) as unknown as LeaveRow[])) {
    const cur = new Date(l.start_date);
    const end = new Date(l.end_date);
    while (cur <= end) {
      const ds = formatDate(cur);
      leaveMap.set(`${l.user_id}__${ds}`, l.leave_type?.name ?? 'Leave');
      cur.setDate(cur.getDate() + 1);
    }
  }

  const holidaySet = new Set<string>(holidaysResult);

  // Approved OOO: expand each request's date range into a per-day lookup
  type OOOAbsRow = { user_id: string; start_date: string; end_date: string };
  const oooAbsMap = new Set<string>(); // `${user_id}__${YYYY-MM-DD}`
  for (const ooo of ((oooResult.data ?? []) as unknown as OOOAbsRow[])) {
    const cur = new Date(ooo.start_date);
    const end = new Date(ooo.end_date);
    while (cur <= end) {
      const ds = formatDate(cur);
      if (ds >= startDate && ds <= endDate) oooAbsMap.add(`${ooo.user_id}__${ds}`);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const employees = (employeesResult.data ?? []) as unknown as EmployeeRow[];
  const result: EmployeeAbsenceRecord[] = [];

  for (const emp of employees) {
    const days: AttendanceDayStatus[] = [];
    const summary = { present: 0, late: 0, absent: 0, leave: 0, field: 0, off: 0, holiday: 0 };

    for (const d of workingDays) {
      const ds = formatDate(d);
      const dayName = DAY_NAMES[d.getDay()];
      const key = `${emp.id}__${ds}`;

      // Future date
      if (ds > today) {
        days.push({ date: ds, day: dayName, status: 'future' });
        continue;
      }

      // Public holiday
      if (holidaySet.has(ds)) {
        summary.holiday += 1;
        days.push({ date: ds, day: dayName, status: 'holiday' });
        continue;
      }

      // Rota day-off
      const rotaEntry = rotaMap.get(key);
      if (rotaEntry?.is_day_off) {
        summary.off += 1;
        days.push({ date: ds, day: dayName, status: 'off' });
        continue;
      }

      // On approved leave
      const leaveType = leaveMap.get(key);
      if (leaveType) {
        summary.leave += 1;
        days.push({ date: ds, day: dayName, status: 'leave', leave_type: leaveType });
        continue;
      }

      // Approved OOO / official assignment (tracked once per approval)
      if (oooAbsMap.has(key)) {
        summary.field += 1;
        days.push({ date: ds, day: dayName, status: 'field' });
        continue;
      }

      // Attendance record exists
      const att = attendanceMap.get(key);
      if (att) {
        const isField = rotaEntry?.work_schedules?.schedule_type === 'field';
        if (isField) {
          summary.field += 1;
          days.push({
            date: ds, day: dayName, status: 'field',
            check_in: att.check_in_time,
            check_out: att.check_out_time ?? undefined,
            hours: att.work_hours ?? undefined,
            schedule_name: rotaEntry?.work_schedules?.name,
          });
        } else if (att.status === 'late') {
          summary.late += 1;
          days.push({
            date: ds, day: dayName, status: 'late',
            check_in: att.check_in_time,
            check_out: att.check_out_time ?? undefined,
            hours: att.work_hours ?? undefined,
          });
        } else {
          summary.present += 1;
          days.push({
            date: ds, day: dayName, status: 'present',
            check_in: att.check_in_time,
            check_out: att.check_out_time ?? undefined,
            hours: att.work_hours ?? undefined,
          });
        }
        continue;
      }

      // No record — absent (unexcused)
      summary.absent += 1;
      days.push({ date: ds, day: dayName, status: 'absent' });
    }

    result.push({
      user_id: emp.id,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      employee_id: emp.employee_id,
      department: emp.departments?.name ?? 'Unknown',
      days,
      summary,
    });
  }

  // Sort by most absent first
  result.sort((a, b) => b.summary.absent - a.summary.absent);
  return result;
}
