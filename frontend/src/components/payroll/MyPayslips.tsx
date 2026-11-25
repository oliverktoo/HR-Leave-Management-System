import { errorMessage } from '../../utils/errorMessage';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  getMyPayslipRuns,
  getPayrollLines,
  openPayslip,
  MyPayslipRun,
  PayrollLine,
  formatKES,
  monthName,
} from '../../services/payrollService';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function MyPayslips() {
  const now = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [userId, setUserId]   = useState('');
  const [runs, setRuns]       = useState<MyPayslipRun[]>([]);
  const [allRuns, setAllRuns] = useState<MyPayslipRun[]>([]);
  const [selected, setSelected] = useState<MyPayslipRun | null>(null);
  const [line, setLine]       = useState<PayrollLine | null>(null);
  const [loading, setLoading] = useState(true);
  const [lineLoading, setLineLoading] = useState(false);
  const [error, setError]     = useState('');

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 1 + i);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
    // Only runs whose payslips HR has released (also enforced in the database)
    getMyPayslipRuns()
      .then(setAllRuns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setRuns(allRuns.filter(r => r.pay_period_year === year));
    setSelected(null);
    setLine(null);
  }, [allRuns, year]);

  async function loadPayslip(run: MyPayslipRun) {
    setSelected(run);
    setLine(null);
    setLineLoading(true);
    try {
      const lines = await getPayrollLines(run.id);
      setLine(lines.find(l => l.user_id === userId) ?? null);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLineLoading(false);
    }
  }

  // YTD summary across all years (from allRuns with my lines)
  // We approximate from run totals — actual personal YTD loaded per-payslip
  const yearRuns = runs;

  if (loading) return <div className="loading-spinner">Loading payslips…</div>;
  if (error)   return <div className="error-message">{error}</div>;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1>My Payslips</h1>
          <p style={{ color: '#64748b', margin: 0 }}>View your payslips and tax history</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <select
            className="form-control"
            style={{ width: 120 }}
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <NotificationBell />
        </div>
      </div>

      {allRuns.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '3rem' }}>
            <p>No payslips have been released to you yet.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Month grid */}
          {yearRuns.length === 0 ? (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="empty-state" style={{ padding: '2rem' }}>
                <p>No payslips for {year}. Try a different year.</p>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.5rem',
            }}>
              {yearRuns.map(run => (
                <button
                  key={run.id}
                  onClick={() => loadPayslip(run)}
                  style={{
                    background: selected?.id === run.id ? 'var(--primary,#3b82f6)' : 'var(--card-bg,#fff)',
                    color: selected?.id === run.id ? '#fff' : 'inherit',
                    border: `1px solid ${selected?.id === run.id ? 'var(--primary,#3b82f6)' : 'var(--border-color,#e2e8f0)'}`,
                    borderRadius: 8,
                    padding: '0.75rem',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{MONTH_SHORT[run.pay_period_month - 1]}</div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{run.pay_period_year}</div>
                  <div style={{
                    marginTop: 4, fontSize: '0.7rem',
                    color: selected?.id === run.id ? '#e0f2fe' : run.status === 'paid' ? '#10b981' : '#f59e0b',
                  }}>
                    {run.status === 'paid' ? '✓ Paid' : 'Approved'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Payslip detail */}
          {selected && (
            <div className="card" style={{ padding: '1.5rem', maxWidth: 640 }}>
              {lineLoading && <div className="loading-spinner">Loading…</div>}
              {!lineLoading && !line && (
                <div className="empty-state">No payslip data found for this period.</div>
              )}
              {!lineLoading && line && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>
                      {monthName(selected.pay_period_month)} {selected.pay_period_year} Payslip
                    </h3>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => openPayslip(line, selected)}
                      title="Opens the official payslip in a new tab — print it or save as PDF from there"
                    >
                      🖨 Print / save payslip
                    </button>
                  </div>
                  <Payslip run={selected} line={line} />
                </>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

function Payslip({ run, line }: { run: MyPayslipRun; line: PayrollLine }) {
  const allowances = Object.entries(line.allowances || {});
  const otherDeductions = (line.other_deductions || []) as Array<{ name: string; amount: number }>;
  const hadAbsence = line.leave_days > 0 || line.ooo_days > 0 ||
    (line.pre_hire_days ?? 0) > 0 || (line.att_unpaid_days ?? 0) > 0;
  const otherVariable = (line.other_variable_pay || []) as Array<{ name: string; amount: number }>;
  const variablePay = [
    { label: `Overtime${line.overtime_hours ? ` (${line.overtime_hours} hrs)` : ''}`, amount: line.overtime_amount || 0 },
    { label: 'Bonus', amount: line.bonus_amount || 0 },
    { label: 'Acting Allowance', amount: line.acting_allowance || 0 },
    { label: (line.per_diem_exempt || 0) > 0
        ? `Per Diem (${formatKES(line.per_diem_exempt || 0)} tax-free)` : 'Per Diem', amount: line.per_diem_amount || 0 },
    ...otherVariable.map(v => ({ label: v.name, amount: v.amount })),
    { label: 'Salary arrears (back pay)', amount: line.arrears_amount || 0 },
    { label: 'Leave pay (untaken leave)', amount: line.leave_pay || 0 },
    { label: 'Pay in lieu of notice', amount: line.notice_pay || 0 },
    { label: 'Severance pay', amount: line.severance_pay || 0 },
    { label: (line.gratuity_exempt || 0) > 0 ? `Gratuity (${formatKES(line.gratuity_exempt || 0)} tax-free)` : 'Gratuity',
      amount: line.gratuity_amount || 0 },
    { label: 'Compensation for loss of office', amount: line.compensation_amount || 0 },
  ].filter(v => v.amount > 0);
  const variableTotal = variablePay.reduce((s, v) => s + v.amount, 0);
  const fixedPay = line.basic_salary + Object.values(line.allowances || {}).reduce((s, v) => s + Number(v), 0);
  const absenceDeduction = Math.max(0, fixedPay - (line.gross_pay - variableTotal));
  const otherPayrollDeductions = [
    { label: 'SACCO Contribution', amount: line.sacco_contribution || 0 },
    { label: 'SACCO Loan Repayment', amount: line.sacco_loan_repayment || 0 },
    { label: 'Medical Insurance', amount: line.medical_premium || 0 },
    { label: 'Supplementary Pension', amount: line.supplementary_pension || 0 },
    { label: 'Salary Advance Recovery', amount: line.salary_advance_recovery || 0 },
    { label: `Court Order${line.court_deduction_ref ? ` (${line.court_deduction_ref})` : ''}`, amount: line.court_deduction_amount || 0 },
  ].filter(d => d.amount > 0);
  const taxAdjustments = [
    { label: 'Pension (tax deduction)', amount: line.pension_deduction || 0 },
    { label: 'Mortgage interest (tax deduction)', amount: line.mortgage_interest_deduction || 0 },
    { label: 'Post-retirement medical fund (tax deduction)', amount: line.prmf_deduction || 0 },
    { label: 'Disability exemption', amount: line.disability_exemption || 0 },
  ].filter(t => t.amount > 0);

  return (
    <div className="payslip-body">
      {/* Header */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>FKF — PAYSLIP</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
          {monthName(run.pay_period_month)} {run.pay_period_year}
          {run.working_days_in_period ? ` · ${run.working_days_in_period} working days` : ''}
        </p>
      </div>

      {/* Employee info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 2rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
        <InfoRow label="Name"        value={`${line.profile?.first_name ?? ''} ${line.profile?.last_name ?? ''}`} />
        <InfoRow label="Employee ID" value={line.employee_id ?? '—'} />
        <InfoRow label="KRA PIN"     value={line.profile?.kra_pin ?? 'NOT PROVIDED'} />
        <InfoRow label="Bank A/C"    value={line.profile?.bank_account_number ? `****${line.profile.bank_account_number.slice(-4)}` : '—'} />
        <InfoRow label="Days Paid" value={`${line.days_worked ?? run.working_days_in_period ?? '—'} / ${run.working_days_in_period ?? '—'}`} />
        {hadAbsence ? (
          <InfoRow label="Unpaid Days"
            value={[
              line.leave_days > 0 ? `${line.leave_days} unpaid leave` : '',
              line.ooo_days   > 0 ? `${line.ooo_days} OOO`   : '',
              (line.pre_hire_days ?? 0) > 0 ? `${line.pre_hire_days} before start date` : '',
              (line.att_unpaid_days ?? 0) > 0 ? `${line.att_unpaid_days} absent` : '',
            ].filter(Boolean).join(', ')}
          />
        ) : <span />}
        {line.att_tracked && line.att_scheduled_days != null && (
          <>
            <InfoRow label="Days Present" value={`${Number(line.att_present_days) || 0} / ${Number(line.att_scheduled_days)}`} />
            <InfoRow label="Hours Clocked"
              value={`${(Math.round((Number(line.att_hours_clocked) || 0) * 10) / 10)}` +
                (line.att_hours_expected ? ` / ${Math.round(Number(line.att_hours_expected) * 10) / 10}` : '')} />
          </>
        )}
      </div>

      {/* Earnings */}
      <Section title="EARNINGS">
        <Row label="Basic Salary"  value={formatKES(line.basic_salary)} />
        {allowances.map(([name, amt]) => (
          <Row key={name} label={capitalize(name)} value={formatKES(amt as number)} />
        ))}
        {absenceDeduction > 0 && (
          <Row label="Unpaid Absence Deduction" value={`(${formatKES(absenceDeduction)})`} muted />
        )}
        {variablePay.map(v => <Row key={v.label} label={v.label} value={formatKES(v.amount)} />)}
        <RowBold label="GROSS PAY" value={formatKES(line.gross_pay)} />
      </Section>

      {/* Deductions */}
      <Section title="STATUTORY DEDUCTIONS">
        <Row label="NSSF Tier I"              value={`(${formatKES(line.nssf_tier1)})`} />
        <Row label="NSSF Tier II"             value={`(${formatKES(line.nssf_tier2)})`} />
        <Row label="SHA / SHIF"               value={`(${formatKES(line.sha_amount)})`} />
        <Row label="Housing Levy"             value={`(${formatKES(line.housing_levy_employee)})`} />
        {taxAdjustments.map(t => <Row key={t.label} label={t.label} value={formatKES(t.amount)} muted />)}
        <Row label="Taxable Income"           value={formatKES(line.taxable_income)} />
        <Row label={line.tax_basis === 'secondary' ? 'PAYE (secondary-employment rate)' : 'PAYE (before relief)'}
             value={`(${formatKES(line.paye_before_relief)})`} />
        {line.personal_relief > 0 && <Row label="Personal Relief" value={`+${formatKES(line.personal_relief)}`} />}
        {(line.insurance_relief || 0) > 0 && <Row label="Insurance Relief" value={`+${formatKES(line.insurance_relief)}`} />}
        {(line.arrears_paye || 0) > 0 && <Row label="PAYE on salary arrears (spread back)" value={`(${formatKES(line.arrears_paye || 0)})`} />}
        {(line.terminal_paye || 0) > 0 && <Row label="PAYE on severance, gratuity and compensation" value={`(${formatKES(line.terminal_paye || 0)})`} />}
        <Row label="PAYE"                     value={`(${formatKES(line.paye_amount)})`} />
        {line.helb_amount > 0 && <Row label="HELB" value={`(${formatKES(line.helb_amount)})`} />}
        {otherPayrollDeductions.map(d => <Row key={d.label} label={d.label} value={`(${formatKES(d.amount)})`} />)}
        {otherDeductions.map(d => (
          <Row key={d.name} label={d.name} value={`(${formatKES(d.amount)})`} />
        ))}
        <RowBold label="TOTAL DEDUCTIONS" value={`(${formatKES(line.total_deductions)})`} />
      </Section>

      {/* Net pay highlight */}
      <div style={{
        background: 'var(--primary-light,#eff6ff)',
        border: '1px solid var(--primary,#3b82f6)',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: '1rem 0',
      }}>
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>NET PAY</span>
        <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--primary,#3b82f6)' }}>
          {formatKES(line.net_pay)}
        </span>
      </div>

      {/* Employer contributions info box */}
      <Section title="EMPLOYER CONTRIBUTIONS (for your information, not deducted)">
        <Row label="NSSF Employer"            value={formatKES(line.nssf_employer)} />
        <Row label="Housing Levy (Employer)"  value={formatKES(line.housing_levy_employer)} />
        <RowBold
          label="Total Employer Cost"
          value={formatKES(line.gross_pay + line.nssf_employer + line.housing_levy_employer)}
        />
      </Section>

      <p style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', marginTop: '1rem' }}>
        This payslip was generated by FKF HR System · {new Date().toLocaleDateString('en-KE')}
      </p>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {title && (
        <div style={{
          fontWeight: 700, fontSize: '0.7rem', color: '#64748b',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          borderBottom: '1px solid #e2e8f0', paddingBottom: '0.2rem', marginBottom: '0.25rem',
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '0.15rem 0', fontSize: '0.82rem',
      color: muted ? '#f59e0b' : undefined,
    }}>
      <span style={{ color: muted ? '#f59e0b' : '#64748b' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function RowBold({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '0.25rem 0', fontWeight: 700, fontSize: '0.85rem',
      borderTop: '1px solid #e2e8f0', marginTop: '0.2rem',
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: '0.82rem' }}>
      <span style={{ color: '#94a3b8' }}>{label}: </span>
      <span>{value}</span>
    </div>
  );
}

function capitalize(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
