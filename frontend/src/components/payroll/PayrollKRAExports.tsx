import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  getPayrollRuns,
  getPayrollLines,
  PayrollRun,
  PayrollLine,
  monthName,
} from '../../services/payrollService';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getAnnualSummaries,
  getEmployerKRAPin,
  getOrganisationName,
  generateP9HTML,
  generateP10CSV,
  generateITaxMonthlyCSV,
  generateNSSFCSV,
  generateBankPaymentCSV,
  downloadCSV,
  openAndSaveP9AsPdf,
  AnnualEmployeeSummary,
} from '../../services/kraExportService';

type Tab = 'p9' | 'p10' | 'itax' | 'nssf' | 'bank' | 'import';

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'p9',     label: 'P9 Forms',         description: 'Annual tax deduction card per employee' },
  { id: 'p10',    label: 'P10 Annual',        description: 'Employer annual return summary CSV' },
  { id: 'itax',   label: 'iTax Monthly',      description: 'KRA PAYE monthly return CSV' },
  { id: 'nssf',   label: 'NSSF Monthly',      description: 'NSSF contributions CSV' },
  { id: 'bank',   label: 'Bank Payment',      description: 'Net pay bank transfer file' },
  { id: 'import', label: '📥 Historical P9',  description: 'Import prior-year data to generate P9s' },
];

// ─── CSV template: one row per employee per month ────────────────────────────
// 12 rows per employee. employee_id/first_name/last_name/kra_pin repeat each row.
const IMPORT_HEADERS = [
  'employee_id', 'first_name', 'last_name', 'kra_pin', 'month',
  'basic_salary', 'gross_pay', 'nssf', 'sha', 'housing_levy',
  'taxable_income', 'paye_before_relief', 'personal_relief', 'paye',
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function downloadImportTemplate(): void {
  // Generate 12 example rows for one employee
  const rows = MONTH_NAMES.map((_, i) => [
    'FKF001', 'John', 'Doe', 'A123456789B', String(i + 1),
    '70000', '80000',  '840', '2200', '1200',
    '76160', '20880', '2400', '18480',
  ].join(','));
  const csv = [IMPORT_HEADERS.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'P9_Historical_Monthly_Template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur.trim());
  return cols;
}

function parseImportCSV(text: string): AnnualEmployeeSummary[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('File appears empty — must have a header row + at least one data row');

  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const idx = (col: string) => header.indexOf(col);

  // Group rows by employee_id
  const byEmp: Record<string, {
    employee_id: string; first_name: string; last_name: string; kra_pin: string;
    monthly: AnnualEmployeeSummary['monthly'];
  }> = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCsvLine(line);
    const get = (col: string) => cols[idx(col)] ?? '';
    const num = (col: string) => {
      const v = get(col).replace(/[^0-9.-]/g, '');
      return v ? parseFloat(v) : 0;
    };

    const empId     = get('employee_id') || `ROW${i}`;
    const monthNum  = parseInt(get('month'), 10);

    if (!byEmp[empId]) {
      byEmp[empId] = {
        employee_id: empId,
        first_name:  get('first_name'),
        last_name:   get('last_name'),
        kra_pin:     get('kra_pin'),
        monthly:     [],
      };
    } else {
      // Update name/pin from later rows in case first row was blank
      if (!byEmp[empId].first_name) byEmp[empId].first_name = get('first_name');
      if (!byEmp[empId].kra_pin)    byEmp[empId].kra_pin    = get('kra_pin');
    }

    if (monthNum >= 1 && monthNum <= 12) {
      byEmp[empId].monthly.push({
        month:               monthNum,
        year:                0, // filled in later from selected year
        run_id:              '',
        basic_salary:        num('basic_salary'),
        gross_pay:           num('gross_pay'),
        nssf_total:          num('nssf'),
        sha_amount:          num('sha'),
        housing_levy_employee: num('housing_levy'),
        taxable_income:      num('taxable_income'),
        paye_before_relief:  num('paye_before_relief'),
        personal_relief:     num('personal_relief'),
        paye_amount:         num('paye'),
      });
    }
  }

  if (Object.keys(byEmp).length === 0) throw new Error('No data rows found in the file');

  // Build AnnualEmployeeSummary with computed totals
  return Object.values(byEmp).map(emp => {
    const m = emp.monthly;
    return {
      user_id:     emp.employee_id,
      employee_id: emp.employee_id,
      first_name:  emp.first_name,
      last_name:   emp.last_name,
      kra_pin:     emp.kra_pin,
      monthly:     m,
      total_basic:              m.reduce((s, r) => s + r.basic_salary,        0),
      total_gross:              m.reduce((s, r) => s + r.gross_pay,           0),
      total_nssf:               m.reduce((s, r) => s + r.nssf_total,         0),
      total_sha:                m.reduce((s, r) => s + r.sha_amount,          0),
      total_housing_levy:       m.reduce((s, r) => s + r.housing_levy_employee, 0),
      total_taxable:            m.reduce((s, r) => s + r.taxable_income,      0),
      total_paye_before_relief: m.reduce((s, r) => s + r.paye_before_relief,  0),
      total_personal_relief:    m.reduce((s, r) => s + r.personal_relief,     0),
      total_paye:               m.reduce((s, r) => s + r.paye_amount,         0),
    };
  });
}

export function PayrollKRAExports() {
  const now = new Date();
  const [tab, setTab] = useState<Tab>('p9');
  const [year, setYear] = useState(now.getFullYear());
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // For P9 / P10
  const [summaries, setSummaries] = useState<AnnualEmployeeSummary[]>([]);
  const [summaryYear, setSummaryYear] = useState<number | null>(null);
  const [empKRAPin, setEmpKRAPin] = useState('');
  const [orgName, setOrgName]     = useState('');

  // For monthly tabs
  const [runLines, setRunLines] = useState<PayrollLine[]>([]);
  const [loadedRunId, setLoadedRunId] = useState('');

  // For historical import tab — stored in Supabase so all authorised users see the same data
  const [importYear, setImportYear] = useState(now.getFullYear() - 1);
  const [importedData, setImportedData] = useState<AnnualEmployeeSummary[]>([]);
  const [importLoading,  setImportLoading]  = useState(false);
  const [importError,    setImportError]    = useState('');
  const [importFileName, setImportFileName] = useState('');

  // Employer details settings panel
  const [showOrgSettings,  setShowOrgSettings]  = useState(false);
  const [orgNameEdit,      setOrgNameEdit]      = useState('');
  const [empKRAPinEdit,    setEmpKRAPinEdit]    = useState('');
  const [orgSaving,        setOrgSaving]        = useState(false);
  const [orgSaveError,     setOrgSaveError]     = useState('');
  const [orgSaveSuccess,   setOrgSaveSuccess]   = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  // (migration removed — localStorage data already cleared; users must re-upload CSV if needed)

  // Load historical P9 import from Supabase for a given year
  async function loadImportFromDB(yr: number) {
    setImportLoading(true);
    setImportError('');
    try {
      const { data, error } = await supabase
        .from('p9_historical_imports')
        .select('data, filename')
        .eq('year', yr)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setImportedData(data.data as AnnualEmployeeSummary[]);
        setImportFileName(data.filename ?? '');
      } else {
        setImportedData([]);
        setImportFileName('');
      }
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportLoading(false);
    }
  }

  useEffect(() => {
    getPayrollRuns()
      .then(all => {
        const finished = all.filter(r => r.status === 'approved' || r.status === 'paid');
        setRuns(finished);
        if (finished.length > 0) setSelectedRunId(finished[0].id);
      })
      .catch(e => setError(e.message));

    Promise.all([getEmployerKRAPin(), getOrganisationName()]).then(([pin, name]) => {
      setEmpKRAPin(pin);
      setOrgName(name);
      setEmpKRAPinEdit(pin);
      setOrgNameEdit(name);
    });

    // Load historical import data for the default year
    loadImportFromDB(importYear);
  }, []);

  async function loadAnnualSummaries() {
    setLoading(true);
    setError('');
    try {
      const data = await getAnnualSummaries(year);
      setSummaries(data);
      setSummaryYear(year);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadRunLines() {
    if (!selectedRunId || loadedRunId === selectedRunId) return;
    setLoading(true);
    setError('');
    try {
      const lines = await getPayrollLines(selectedRunId);
      setRunLines(lines);
      setLoadedRunId(selectedRunId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const selectedRun = runs.find(r => r.id === selectedRunId);

  function handleDownloadP9All() {
    if (!summaries.length) return;
    summaries.forEach(emp => {
      const html = generateP9HTML(emp, summaryYear!, orgName, empKRAPin);
      openAndSaveP9AsPdf(html);
    });
  }

  function handleOpenP9(emp: AnnualEmployeeSummary) {
    const html = generateP9HTML(emp, summaryYear!, orgName, empKRAPin);
    openAndSaveP9AsPdf(html);
  }

  function handleDownloadP10() {
    if (!summaries.length) return;
    const csv = generateP10CSV(summaries, summaryYear!, orgName, empKRAPin);
    downloadCSV(csv, `P10_${orgName.replace(/\s+/g, '_')}_${summaryYear}.csv`);
  }

  function handleITaxCSV() {
    if (!selectedRun || !runLines.length) return;
    const csv = generateITaxMonthlyCSV(runLines, selectedRun, empKRAPin);
    downloadCSV(csv, `iTax_PAYE_${selectedRun.pay_period_year}_${String(selectedRun.pay_period_month).padStart(2,'0')}.csv`);
  }

  function handleNSSFCSV() {
    if (!selectedRun || !runLines.length) return;
    const csv = generateNSSFCSV(runLines, selectedRun);
    downloadCSV(csv, `NSSF_${selectedRun.pay_period_year}_${String(selectedRun.pay_period_month).padStart(2,'0')}.csv`);
  }

  function handleBankCSV() {
    if (!selectedRun || !runLines.length) return;
    const csv = generateBankPaymentCSV(runLines, selectedRun);
    downloadCSV(csv, `BankPayment_${selectedRun.pay_period_year}_${String(selectedRun.pay_period_month).padStart(2,'0')}.csv`);
  }

  async function handleSaveOrgSettings() {
    if (!orgNameEdit.trim())   { setOrgSaveError('Employer name is required'); return; }
    if (!empKRAPinEdit.trim()) { setOrgSaveError('KRA PIN is required'); return; }
    setOrgSaving(true);
    setOrgSaveError('');
    setOrgSaveSuccess(false);
    try {
      // Merge into the single settings row (id=1)
      const { data: existing } = await supabase
        .from('system_settings')
        .select('settings')
        .eq('id', 1)
        .maybeSingle();
      const current = (existing?.settings as Record<string, unknown>) ?? {};
      const { error } = await supabase
        .from('system_settings')
        .update({
          settings: {
            ...current,
            organisation: { name: orgNameEdit.trim(), kra_pin: empKRAPinEdit.trim() },
          },
        })
        .eq('id', 1);
      if (error) throw error;
      setEmpKRAPin(empKRAPinEdit.trim());
      setOrgName(orgNameEdit.trim());
      setOrgSaveSuccess(true);
    } catch (e: unknown) {
      setOrgSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrgSaving(false);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseImportCSV(text);
        setImportedData(parsed);
        setImportFileName(file.name);
        await saveImportToDB(importYear, parsed, file.name);
      } catch (err: unknown) {
        setImportError(err instanceof Error ? err.message : String(err));
        setImportedData([]);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  }

  async function saveImportToDB(year: number, data: AnnualEmployeeSummary[], filename: string) {
    const { error } = await supabase
      .from('p9_historical_imports')
      .upsert({ year, data, filename, uploaded_by: (await supabase.auth.getUser()).data.user?.id }, { onConflict: 'year' });
    if (error) throw error;
  }

  async function clearImportFromDB(year: number) {
    const { error } = await supabase
      .from('p9_historical_imports')
      .delete()
      .eq('year', year);
    if (error) throw error;
  }

  function handleImportOpenAll() {
    importedData.forEach(emp => {
      const html = generateP9HTML(emp, importYear, orgName, empKRAPin);
      openAndSaveP9AsPdf(html);
    });
  }

  const isAnnualTab = tab === 'p9' || tab === 'p10';
  const summaryReady = summaries.length > 0 && summaryYear === year;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1>KRA &amp; Statutory Exports</h1>
          <p style={{ color: '#64748b', margin: 0 }}>P9, P10, iTax PAYE, NSSF, and bank payment files</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-sm btn-outline" onClick={() => setShowOrgSettings(v => !v)}>
            ⚙ Employer Details
          </button>
          <NotificationBell />
        </div>
      </div>

      {/* Employer details settings panel */}
      {showOrgSettings && (
        <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #6366f1' }}>
          <div className="card-header">
            <h2 className="card-title">Employer Details — appears on all P9 / P10 forms</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Employer Name (full legal name)</label>
                <input type="text" className="form-control"
                  value={orgNameEdit}
                  onChange={e => setOrgNameEdit(e.target.value)}
                  placeholder="e.g. FOOTBALL KENYA FEDERATION" />
              </div>
              <div className="form-group">
                <label className="form-label">Employer KRA PIN</label>
                <input type="text" className="form-control"
                  value={empKRAPinEdit}
                  onChange={e => setEmpKRAPinEdit(e.target.value.toUpperCase())}
                  placeholder="e.g. P051385995Y" />
              </div>
            </div>
            {orgSaveError && <div className="error-message">{orgSaveError}</div>}
            {orgSaveSuccess && <div style={{ color: '#10b981', fontSize: '0.875rem', marginTop: '0.5rem' }}>✓ Saved — will appear on all new P9/P10 exports</div>}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={handleSaveOrgSettings} disabled={orgSaving}>
                {orgSaving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-outline" onClick={() => { setShowOrgSettings(false); setOrgSaveSuccess(false); }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Annual tabs: P9, P10 */}
      {isAnnualTab && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-body">
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Year of Income</label>
                <select className="form-control" value={year} onChange={e => setYear(Number(e.target.value))}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={loadAnnualSummaries} disabled={loading}>
                {loading ? 'Loading…' : 'Load Annual Data'}
              </button>
              {summaryReady && tab === 'p10' && (
                <button className="btn btn-outline" onClick={handleDownloadP10}>
                  ↓ Download P10 CSV
                </button>
              )}
              {summaryReady && tab === 'p9' && summaries.length > 0 && (
                <button className="btn btn-outline" onClick={handleDownloadP9All}>
                  ↓ Download All P9s
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Monthly tabs: iTax, NSSF, Bank */}
      {!isAnnualTab && tab !== 'import' && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-body">
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Pay Period</label>
                <select
                  className="form-control"
                  value={selectedRunId}
                  onChange={e => { setSelectedRunId(e.target.value); setLoadedRunId(''); }}
                >
                  {runs.length === 0 && <option value="">No approved runs</option>}
                  {runs.map(r => (
                    <option key={r.id} value={r.id}>
                      {monthName(r.pay_period_month)} {r.pay_period_year}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" onClick={loadRunLines} disabled={loading || !selectedRunId}>
                {loading ? 'Loading…' : 'Load'}
              </button>
              {loadedRunId === selectedRunId && runLines.length > 0 && (
                <>
                  {tab === 'itax' && (
                    <button className="btn btn-outline" onClick={handleITaxCSV}>
                      ↓ Download iTax CSV
                    </button>
                  )}
                  {tab === 'nssf' && (
                    <button className="btn btn-outline" onClick={handleNSSFCSV}>
                      ↓ Download NSSF CSV
                    </button>
                  )}
                  {tab === 'bank' && (
                    <button className="btn btn-outline" onClick={handleBankCSV}>
                      ↓ Download Bank Payment CSV
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* P9 employee list */}
      {tab === 'p9' && summaryReady && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">P9 Forms — {year} ({summaries.length} employees)</h2>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>KRA PIN</th>
                  <th>Months</th>
                  <th>Total Gross</th>
                  <th>Total PAYE</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(emp => (
                  <tr key={emp.user_id}>
                    <td>
                      <strong>{emp.first_name} {emp.last_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{emp.employee_id}</div>
                    </td>
                    <td style={{ color: emp.kra_pin ? undefined : '#ef4444' }}>
                      {emp.kra_pin || 'Missing'}
                    </td>
                    <td>{emp.monthly.length}</td>
                    <td>KES {emp.total_gross.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td>KES {emp.total_paye.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => handleOpenP9(emp)}>
                        ↓ Save as PDF
                      </button>
                    </td>
                  </tr>
                ))}
                {summaries.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>No approved payroll runs found for {year}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* P10 preview */}
      {tab === 'p10' && summaryReady && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">P10 Preview — {year}</h2>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>KRA PIN</th>
                  <th>Total Gross</th>
                  <th>Total NSSF</th>
                  <th>Total Taxable</th>
                  <th>Total PAYE</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(emp => (
                  <tr key={emp.user_id}>
                    <td>{emp.first_name} {emp.last_name}</td>
                    <td style={{ color: emp.kra_pin ? undefined : '#ef4444' }}>{emp.kra_pin || 'Missing'}</td>
                    <td>KES {emp.total_gross.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td>KES {emp.total_nssf.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td>KES {emp.total_taxable.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td><strong>KES {emp.total_paye.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Historical Import Tab ── */}
      {tab === 'import' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-body">
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Generate P9s from a prior-year spreadsheet</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 1rem' }}>
                Use this when last year's payroll was processed outside this system.
                Download the template, fill in each employee's annual totals, then upload it here to generate P9 forms instantly.
              </p>

              {/* Step 1 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                <div style={{ flex: '0 0 auto' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Step 1 — Download template</div>
                  <button className="btn btn-outline" onClick={downloadImportTemplate}>
                    ⬇ Download CSV Template
                  </button>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                    Open in Excel / Google Sheets, fill in data, save as CSV
                  </div>
                </div>

                <div style={{ flex: '0 0 auto' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Step 2 — Select year of income</div>
                  <select className="form-control" style={{ width: 140 }} value={importYear}
                    onChange={e => {
                      const yr = Number(e.target.value);
                      setImportYear(yr);
                      loadImportFromDB(yr);
                    }}>
                    {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 5 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '0 0 auto' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Step 3 — Upload your filled CSV</div>
                  <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    📂 Choose CSV File
                    <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleImportFile} />
                  </label>
                  {importFileName && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem' }}>
                      {importFileName}
                    </div>
                  )}
                </div>
              </div>

              {importLoading && <div style={{ color: '#6366f1', fontSize: '0.875rem', marginTop: '0.5rem' }}>Loading saved data…</div>}
              {importError && <div className="error-message">{importError}</div>}

              {/* Column guide */}
              <details style={{ marginTop: '0.75rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#6366f1', fontWeight: 600 }}>
                  What do the CSV columns mean?
                </summary>
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#374151' }}>
                  <p style={{ marginBottom: '0.5rem', color: '#1e40af', background: '#eff6ff', padding: '6px 10px', borderRadius: 6 }}>
                    <strong>Format:</strong> One row per employee per month — so each employee has 12 rows (Jan=1 through Dec=12).
                    Repeat employee_id, first_name, last_name and kra_pin on every row.
                  </p>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Column</th>
                        <th style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Description</th>
                        <th style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Example</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['employee_id',        'Employee number (repeat on all 12 rows)',         'FKF001'],
                        ['first_name',         'First name (repeat on all 12 rows)',              'John'],
                        ['last_name',          'Surname (repeat on all 12 rows)',                 'Doe'],
                        ['kra_pin',            'KRA PIN (repeat on all 12 rows)',                 'A123456789B'],
                        ['month',              'Month number 1–12',                               '1'],
                        ['basic_salary',       'Basic salary for that month',                     '70,000'],
                        ['gross_pay',          'Gross pay for that month (basic + allowances)',   '80,000'],
                        ['nssf',               'NSSF employee deduction that month',              '840'],
                        ['sha',                'SHIF/SHA deduction that month',                   '2,200'],
                        ['housing_levy',       'Housing Levy deduction that month',               '1,200'],
                        ['taxable_income',     'Gross minus NSSF',                                '76,160'],
                        ['paye_before_relief', 'Tax charged before personal relief',              '20,880'],
                        ['personal_relief',    'Personal relief applied (KES 2,400/month)',       '2,400'],
                        ['paye',               'PAYE actually deducted that month',               '18,480'],
                      ].map(([col, desc, ex]) => (
                        <tr key={col}>
                          <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '0.78rem' }}>{col}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0' }}>{desc}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0', color: '#64748b' }}>{ex}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
                    All amounts in KES. Commas in numbers are stripped automatically.
                    If an employee was not paid in a particular month, omit that row entirely.
                    The template download includes 12 example rows for one employee.
                  </p>
                </div>
              </details>
            </div>
          </div>

          {/* Imported employees table + P9 generation */}
          {importedData.length > 0 && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center' }}>
                <h2 className="card-title" style={{ flex: 1 }}>
                  {importedData.length} employee{importedData.length > 1 ? 's' : ''} imported — Year {importYear}
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary" onClick={handleImportOpenAll}>
                    ↓ Save All as PDF
                  </button>
                  <button className="btn btn-outline" style={{ color: '#ef4444', borderColor: '#ef4444' }}
                    onClick={async () => {
                      try {
                        await clearImportFromDB(importYear);
                        setImportedData([]);
                        setImportFileName('');
                      } catch (e: unknown) {
                        setImportError(e instanceof Error ? e.message : String(e));
                      }
                    }}>
                    Clear
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>KRA PIN</th>
                      <th>Annual Gross</th>
                      <th>Annual PAYE</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedData.map((emp, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{emp.first_name} {emp.last_name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{emp.employee_id}</div>
                        </td>
                        <td style={{ color: emp.kra_pin ? undefined : '#ef4444' }}>
                          {emp.kra_pin || 'Missing — P9 will show NOT PROVIDED'}
                        </td>
                        <td>KES {emp.total_gross.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                        <td><strong>KES {emp.total_paye.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong></td>
                        <td>
                          <button className="btn btn-sm btn-primary"
                            onClick={() => openAndSaveP9AsPdf(generateP9HTML(emp, importYear, orgName, empKRAPin))}>
                            ↓ Save as PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Monthly preview */}
      {!isAnnualTab && tab !== 'import' && loadedRunId === selectedRunId && runLines.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {tab === 'itax'  && `iTax PAYE — ${selectedRun ? monthName(selectedRun.pay_period_month) + ' ' + selectedRun.pay_period_year : ''}`}
              {tab === 'nssf'  && `NSSF Contributions — ${selectedRun ? monthName(selectedRun.pay_period_month) + ' ' + selectedRun.pay_period_year : ''}`}
              {tab === 'bank'  && `Bank Payment File — ${selectedRun ? monthName(selectedRun.pay_period_month) + ' ' + selectedRun.pay_period_year : ''}`}
            </h2>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  {tab === 'itax' && <><th>KRA PIN</th><th>Gross Pay</th><th>Taxable</th><th>PAYE</th></>}
                  {tab === 'nssf' && <><th>Gross Pay</th><th>NSSF Employee</th><th>NSSF Employer</th></>}
                  {tab === 'bank' && <><th>Bank</th><th>Account No.</th><th>Net Pay</th></>}
                </tr>
              </thead>
              <tbody>
                {runLines.map(line => (
                  <tr key={line.id}>
                    <td>
                      <div>{line.profile?.first_name} {line.profile?.last_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{line.employee_id}</div>
                    </td>
                    {tab === 'itax' && (
                      <>
                        <td style={{ color: line.profile?.kra_pin ? undefined : '#ef4444' }}>
                          {line.profile?.kra_pin || 'Missing'}
                        </td>
                        <td>KES {line.gross_pay.toLocaleString()}</td>
                        <td>KES {line.taxable_income.toLocaleString()}</td>
                        <td><strong>KES {line.paye_amount.toLocaleString()}</strong></td>
                      </>
                    )}
                    {tab === 'nssf' && (
                      <>
                        <td>KES {line.gross_pay.toLocaleString()}</td>
                        <td>KES {line.nssf_total.toLocaleString()}</td>
                        <td>KES {line.nssf_employer.toLocaleString()}</td>
                      </>
                    )}
                    {tab === 'bank' && (
                      <>
                        <td>{line.profile?.bank_name || '—'}</td>
                        <td>{line.profile?.bank_account_number ? `****${line.profile.bank_account_number.slice(-4)}` : '—'}</td>
                        <td><strong>KES {line.net_pay.toLocaleString()}</strong></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
