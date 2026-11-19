import { useState, useEffect } from 'react';
import { getPayrollRuns, PayrollRun, formatKES, monthName } from '../../services/payrollService';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface MonthStat {
  month: number;
  year: number;
  label: string;
  gross: number;
  net: number;
  paye: number;
  nssf: number;
  sha: number;
  housing: number;
  employer_cost: number;  // gross + nssf_employer + housing_employer
  nssf_employer: number;
  housing_employer: number;
  status: string;
}

export function PayrollAnalytics() {
  const now = new Date();
  const [year, setYear]     = useState(now.getFullYear());
  const [runs, setRuns]     = useState<PayrollRun[]>([]);
  const [stats, setStats]   = useState<MonthStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 1 + i);

  useEffect(() => {
    getPayrollRuns()
      .then(all => { setRuns(all); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const yearRuns = runs.filter(r => r.pay_period_year === year);
    const built: MonthStat[] = yearRuns.map(r => ({
      month:  r.pay_period_month,
      year:   r.pay_period_year,
      label:  MONTH_SHORT[r.pay_period_month - 1],
      gross:  r.total_gross  ?? 0,
      net:    r.total_net    ?? 0,
      paye:   r.total_paye   ?? 0,
      nssf:   r.total_nssf_employee ?? 0,
      sha:    r.total_sha    ?? 0,
      housing: r.total_housing_levy_employee ?? 0,
      nssf_employer:    r.total_nssf_employer ?? 0,
      housing_employer: r.total_housing_levy_employer ?? 0,
      employer_cost:    (r.total_gross ?? 0) + (r.total_nssf_employer ?? 0) + (r.total_housing_levy_employer ?? 0),
      status: r.status,
    }));
    built.sort((a, b) => a.month - b.month);
    setStats(built);
  }, [runs, year]);

  if (loading) return <div className="loading-spinner">Loading analytics…</div>;
  if (error)   return <div className="error-message">{error}</div>;

  // Latest completed run
  const withData = stats.filter(s => s.gross > 0);
  const latest = withData[withData.length - 1] ?? null;
  const prev   = withData[withData.length - 2] ?? null;

  const ytdGross = stats.reduce((s, r) => s + r.gross, 0);
  const ytdPAYE  = stats.reduce((s, r) => s + r.paye,  0);
  const ytdNet   = stats.reduce((s, r) => s + r.net,   0);
  const ytdEmployerCost = stats.reduce((s, r) => s + r.employer_cost, 0);

  const maxGross = Math.max(...stats.map(s => s.gross), 1);
  const maxEmployerCost = Math.max(...stats.map(s => s.employer_cost), 1);

  const momChange = latest && prev && prev.net > 0
    ? ((latest.net - prev.net) / prev.net) * 100
    : null;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1>Payroll Analytics</h1>
          <p style={{ color: '#64748b', margin: 0 }}>Trends, costs, and statutory summary</p>
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

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <KPICard
          label={`${year} YTD Gross`}
          value={formatKES(ytdGross)}
          sub={`${stats.length} payroll run${stats.length !== 1 ? 's' : ''}`}
          color="#3b82f6"
        />
        <KPICard
          label={`${year} YTD Net Pay`}
          value={formatKES(ytdNet)}
          sub={`${ytdGross > 0 ? ((ytdNet/ytdGross)*100).toFixed(1) : 0}% of gross`}
          color="#10b981"
        />
        <KPICard
          label={`${year} YTD PAYE`}
          value={formatKES(ytdPAYE)}
          sub={`${ytdGross > 0 ? ((ytdPAYE/ytdGross)*100).toFixed(1) : 0}% effective rate`}
          color="#f59e0b"
        />
        <KPICard
          label={`${year} Total Employer Cost`}
          value={formatKES(ytdEmployerCost)}
          sub="Gross + NSSF + Housing (employer)"
          color="#8b5cf6"
        />
        {latest && (
          <KPICard
            label={`Latest: ${monthName(latest.month)}`}
            value={formatKES(latest.net)}
            sub={momChange !== null
              ? `${momChange >= 0 ? '▲' : '▼'} ${Math.abs(momChange).toFixed(1)}% vs prev month`
              : 'Net pay'}
            color={momChange === null ? '#64748b' : momChange >= 0 ? '#10b981' : '#ef4444'}
          />
        )}
      </div>

      {stats.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '3rem' }}>
            <p>No payroll runs found for {year}.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Gross vs Net bar chart */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2 className="card-title">Monthly Gross vs Net Pay — {year}</h2>
            </div>
            <div style={{ padding: '1rem 1.5rem 1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
                <LegendDot color="#3b82f6" label="Gross Pay" />
                <LegendDot color="#10b981" label="Net Pay" />
                <LegendDot color="#f59e0b" label="PAYE" />
              </div>
              <BarChart stats={stats} maxVal={maxGross} />
            </div>
          </div>

          {/* Statutory breakdown table */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2 className="card-title">Statutory Deductions Breakdown — {year}</h2>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Gross Pay</th>
                    <th>NSSF (Emp)</th>
                    <th>SHA</th>
                    <th>Housing (Emp)</th>
                    <th>PAYE</th>
                    <th>Net Pay</th>
                    <th>Employer Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(s => (
                    <tr key={s.month}>
                      <td><strong>{s.label}</strong></td>
                      <td>{formatKES(s.gross)}</td>
                      <td>{formatKES(s.nssf)}</td>
                      <td>{formatKES(s.sha)}</td>
                      <td>{formatKES(s.housing)}</td>
                      <td>{formatKES(s.paye)}</td>
                      <td><strong>{formatKES(s.net)}</strong></td>
                      <td style={{ color: '#8b5cf6' }}>{formatKES(s.employer_cost)}</td>
                      <td>
                        <StatusDot status={s.status} />
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--table-header-bg, #f8fafc)', fontWeight: 700 }}>
                    <td>TOTAL</td>
                    <td>{formatKES(stats.reduce((s, r) => s + r.gross, 0))}</td>
                    <td>{formatKES(stats.reduce((s, r) => s + r.nssf, 0))}</td>
                    <td>{formatKES(stats.reduce((s, r) => s + r.sha, 0))}</td>
                    <td>{formatKES(stats.reduce((s, r) => s + r.housing, 0))}</td>
                    <td>{formatKES(stats.reduce((s, r) => s + r.paye, 0))}</td>
                    <td>{formatKES(ytdNet)}</td>
                    <td style={{ color: '#8b5cf6' }}>{formatKES(ytdEmployerCost)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Employer cost chart */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Total Employer Cost — {year}</h2>
            </div>
            <div style={{ padding: '1rem 1.5rem 1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
                <LegendDot color="#8b5cf6" label="Total Employer Cost (Gross + NSSF employer + Housing employer)" />
              </div>
              <EmployerCostChart stats={stats} maxVal={maxEmployerCost} />
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="stat-label" style={{ fontSize: '0.75rem', color: '#64748b' }}>{label}</div>
      <div className="stat-value" style={{ fontSize: '1.1rem', color }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function BarChart({ stats, maxVal }: { stats: MonthStat[]; maxVal: number }) {
  const BAR_H = 160;
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: BAR_H + 36, overflowX: 'auto' }}>
      {stats.map(s => (
        <div key={s.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 52 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: BAR_H }}>
            <Bar height={(s.gross / maxVal) * BAR_H} color="#3b82f6" title={formatKES(s.gross)} />
            <Bar height={(s.net   / maxVal) * BAR_H} color="#10b981" title={formatKES(s.net)} />
            <Bar height={(s.paye  / maxVal) * BAR_H} color="#f59e0b" title={formatKES(s.paye)} />
          </div>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function EmployerCostChart({ stats, maxVal }: { stats: MonthStat[]; maxVal: number }) {
  const BAR_H = 120;
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: BAR_H + 36, overflowX: 'auto' }}>
      {stats.map(s => (
        <div key={s.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 44 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: BAR_H }}>
            <Bar height={(s.employer_cost / maxVal) * BAR_H} color="#8b5cf6" title={formatKES(s.employer_cost)} width={28} />
          </div>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function Bar({ height, color, title, width = 14 }: { height: number; color: string; title: string; width?: number }) {
  return (
    <div
      title={title}
      style={{
        width,
        height: Math.max(height, 2),
        background: color,
        borderRadius: '3px 3px 0 0',
        transition: 'height 0.3s ease',
        cursor: 'default',
      }}
    />
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8', pending_hr: '#f59e0b', pending_finance: '#3b82f6',
  pending_ceo: '#8b5cf6', approved: '#10b981', rejected: '#ef4444', paid: '#059669',
};

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#94a3b8';
  return (
    <span style={{ fontSize: '0.72rem', color, background: color + '18', padding: '2px 8px', borderRadius: 9999 }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
