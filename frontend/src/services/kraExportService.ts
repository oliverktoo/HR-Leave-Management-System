// KRA Export Service — P9, P10, and iTax CSV generation
// Formats follow KRA iTax requirements for PAYE returns

import { supabase } from '../lib/supabaseClient';
import { getPayrollLines, getPayrollRuns, PayrollLine, PayrollRun } from './payrollService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnnualEmployeeSummary {
  user_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  kra_pin: string;
  monthly: Array<{
    month: number;
    year: number;
    run_id: string;
    basic_salary: number;
    gross_pay: number;
    nssf_total: number;
    sha_amount: number;
    housing_levy_employee: number;
    taxable_income: number;
    paye_before_relief: number;
    personal_relief: number;
    paye_amount: number;
  }>;
  // Computed annual totals
  total_basic: number;
  total_gross: number;
  total_nssf: number;
  total_sha: number;
  total_housing_levy: number;
  total_taxable: number;
  total_paye_before_relief: number;
  total_personal_relief: number;
  total_paye: number;
}

// ─── Data loader ─────────────────────────────────────────────────────────────

export async function getAnnualSummaries(year: number): Promise<AnnualEmployeeSummary[]> {
  // Load all approved/paid runs for the year
  const allRuns = await getPayrollRuns();
  const yearRuns = allRuns.filter(
    r => r.pay_period_year === year && (r.status === 'approved' || r.status === 'paid')
  );

  if (yearRuns.length === 0) return [];

  // Load lines for all runs in parallel
  const allLines = await Promise.all(yearRuns.map(r => getPayrollLines(r.id)));

  // Build map: user_id -> monthly entries
  const byEmployee: Record<string, AnnualEmployeeSummary> = {};

  yearRuns.forEach((run, idx) => {
    const lines = allLines[idx];
    lines.forEach(line => {
      if (!byEmployee[line.user_id]) {
        byEmployee[line.user_id] = {
          user_id: line.user_id,
          employee_id: line.employee_id ?? '',
          first_name: line.profile?.first_name ?? '',
          last_name:  line.profile?.last_name ?? '',
          kra_pin:    line.profile?.kra_pin ?? '',
          monthly: [],
          total_basic: 0, total_gross: 0, total_nssf: 0, total_sha: 0,
          total_housing_levy: 0, total_taxable: 0,
          total_paye_before_relief: 0, total_personal_relief: 0, total_paye: 0,
        };
      }

      const entry = byEmployee[line.user_id];
      entry.monthly.push({
        month: run.pay_period_month,
        year: run.pay_period_year,
        run_id: run.id,
        basic_salary: line.basic_salary,
        gross_pay: line.gross_pay,
        nssf_total: line.nssf_total,
        sha_amount: line.sha_amount,
        housing_levy_employee: line.housing_levy_employee,
        taxable_income: line.taxable_income,
        paye_before_relief: line.paye_before_relief,
        personal_relief: line.personal_relief,
        paye_amount: line.paye_amount,
      });

      entry.total_basic             += line.basic_salary;
      entry.total_gross             += line.gross_pay;
      entry.total_nssf              += line.nssf_total;
      entry.total_sha               += line.sha_amount;
      entry.total_housing_levy      += line.housing_levy_employee;
      entry.total_taxable           += line.taxable_income;
      entry.total_paye_before_relief += line.paye_before_relief;
      entry.total_personal_relief   += line.personal_relief;
      entry.total_paye              += line.paye_amount;
    });
  });

  // Sort monthly entries by month
  for (const emp of Object.values(byEmployee)) {
    emp.monthly.sort((a, b) => a.month - b.month);
  }

  return Object.values(byEmployee).sort((a, b) =>
    a.employee_id.localeCompare(b.employee_id)
  );
}

export async function getEmployerKRAPin(): Promise<string> {
  const { data } = await supabase
    .from('system_settings')
    .select('settings')
    .eq('id', 1)
    .maybeSingle();
  const s = data?.settings as Record<string, unknown> | null;
  return (s?.organisation as Record<string, string> | null)?.kra_pin ?? '';
}

export async function getOrganisationName(): Promise<string> {
  const { data } = await supabase
    .from('system_settings')
    .select('settings')
    .eq('id', 1)
    .maybeSingle();
  const s = data?.settings as Record<string, unknown> | null;
  return (s?.organisation as Record<string, string> | null)?.name ?? 'FOOTBALL KENYA FEDERATION';
}

// ─── P9 — Individual Annual Tax Deduction Card ───────────────────────────────

export function generateP9HTML(
  emp: AnnualEmployeeSummary,
  year: number,
  employerName: string,
  employerKRAPin: string
): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const rows = MONTHS.map((m, i) => {
    const mo = emp.monthly.find(e => e.month === i + 1);
    if (!mo) {
      return `<tr><td>${m}</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>`;
    }
    return `<tr>
      <td>${m}</td>
      <td>${fmt(mo.basic_salary)}</td>
      <td>${fmt(mo.gross_pay)}</td>
      <td>${fmt(mo.nssf_total)}</td>
      <td>${fmt(mo.taxable_income)}</td>
      <td>${fmt(mo.paye_before_relief)}</td>
      <td>${fmt(mo.personal_relief)}</td>
      <td><strong>${fmt(mo.paye_amount)}</strong></td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>P9 — ${emp.first_name} ${emp.last_name} — ${year}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #000; }
  h2 { text-align: center; margin: 0; font-size: 14px; }
  h3 { text-align: center; margin: 4px 0 16px; font-size: 12px; font-weight: normal; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; }
  .meta span { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 4px 6px; text-align: right; }
  th { background: #d0d0d0; text-align: center; }
  td:first-child, th:first-child { text-align: left; }
  .totals td { background: #f0f0f0; font-weight: bold; }
  @media print { body { margin: 8mm; } }
</style>
</head>
<body>
<h2>P9 FORM — TAX DEDUCTION CARD</h2>
<h3>Year of Income: ${year}</h3>
<div class="meta">
  <span><strong>Employer Name:</strong> ${employerName}</span>
  <span><strong>Employer PIN:</strong> ${employerKRAPin}</span>
  <span><strong>Employee Name:</strong> ${emp.first_name} ${emp.last_name}</span>
  <span><strong>Employee PIN:</strong> ${emp.kra_pin || 'NOT PROVIDED'}</span>
  <span><strong>Employee ID:</strong> ${emp.employee_id}</span>
</div>
<table>
  <thead>
    <tr>
      <th>Month</th>
      <th>Basic Pay (KES)</th>
      <th>Gross Pay (KES)</th>
      <th>NSSF (KES)</th>
      <th>Taxable Pay (KES)</th>
      <th>Tax Charged (KES)</th>
      <th>Personal Relief (KES)</th>
      <th>PAYE (KES)</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="totals">
      <td>TOTAL</td>
      <td>${fmt(emp.total_basic)}</td>
      <td>${fmt(emp.total_gross)}</td>
      <td>${fmt(emp.total_nssf)}</td>
      <td>${fmt(emp.total_taxable)}</td>
      <td>${fmt(emp.total_paye_before_relief)}</td>
      <td>${fmt(emp.total_personal_relief)}</td>
      <td>${fmt(emp.total_paye)}</td>
    </tr>
  </tbody>
</table>
</body>
</html>`;
}

// ─── P10 — Employer Annual Return Summary ────────────────────────────────────

export function generateP10CSV(
  summaries: AnnualEmployeeSummary[],
  year: number,
  employerName: string,
  employerKRAPin: string
): string {
  const header = [
    'Employer Name', 'Employer PIN', 'Year',
    'Employee PIN', 'Employee Name', 'Employee ID',
    'Total Basic (KES)', 'Total Gross (KES)', 'Total NSSF (KES)',
    'Total SHA (KES)', 'Total Housing Levy (KES)', 'Total Taxable (KES)',
    'Total PAYE Before Relief (KES)', 'Total Personal Relief (KES)',
    'Net PAYE (KES)',
  ].join(',');

  const rows = summaries.map(emp =>
    [
      csvEsc(employerName),
      csvEsc(employerKRAPin),
      year,
      csvEsc(emp.kra_pin),
      csvEsc(`${emp.first_name} ${emp.last_name}`),
      csvEsc(emp.employee_id),
      emp.total_basic.toFixed(2),
      emp.total_gross.toFixed(2),
      emp.total_nssf.toFixed(2),
      emp.total_sha.toFixed(2),
      emp.total_housing_levy.toFixed(2),
      emp.total_taxable.toFixed(2),
      emp.total_paye_before_relief.toFixed(2),
      emp.total_personal_relief.toFixed(2),
      emp.total_paye.toFixed(2),
    ].join(',')
  );

  return [header, ...rows].join('\r\n');
}

// ─── iTax Monthly PAYE CSV ────────────────────────────────────────────────────
// Format: KRA iTax PAYE return (monthly submission)

export function generateITaxMonthlyCSV(
  lines: PayrollLine[],
  run: PayrollRun,
  employerKRAPin: string
): string {
  // KRA iTax PAYE monthly CSV columns
  const header = [
    'Employer PIN',
    'Return Period (YYYY-MM)',
    'Employee PIN',
    'Employee Name',
    'Employee ID',
    'Basic Pay',
    'Benefits in Kind',
    'Other Allowances',
    'Total Gross Pay',
    'NSSF Contribution',
    'Taxable Pay',
    'PAYE Tax Charged',
    'Personal Relief',
    'Insurance Relief',
    'Net PAYE',
  ].join(',');

  const period = `${run.pay_period_year}-${String(run.pay_period_month).padStart(2, '0')}`;

  const rows = lines.map(line => {
    const allowancesTotal = Object.values(line.allowances || {}).reduce(
      (s, v) => s + (Number(v) || 0), 0
    );
    const bik = line.benefits_in_kind || 0;
    // iTax Total Gross = cash gross + BIK; taxable_income already includes BIK
    const totalGross = line.gross_pay + bik;
    return [
      csvEsc(employerKRAPin),
      period,
      csvEsc(line.profile?.kra_pin ?? ''),
      csvEsc(`${line.profile?.first_name ?? ''} ${line.profile?.last_name ?? ''}`),
      csvEsc(line.employee_id ?? ''),
      line.basic_salary.toFixed(2),
      bik.toFixed(2),
      allowancesTotal.toFixed(2),
      totalGross.toFixed(2),
      line.nssf_total.toFixed(2),
      line.taxable_income.toFixed(2),
      line.paye_before_relief.toFixed(2),
      line.personal_relief.toFixed(2),
      (line.insurance_relief || 0).toFixed(2),
      line.paye_amount.toFixed(2),
    ].join(',');
  });

  return [header, ...rows].join('\r\n');
}

// ─── NSSF Monthly CSV ────────────────────────────────────────────────────────

export function generateNSSFCSV(
  lines: PayrollLine[],
  _run: PayrollRun
): string {
  const header = [
    'Employee Name', 'Employee ID', 'NSSF Number',
    'Gross Pay', 'NSSF Tier I (Employee)', 'NSSF Tier II (Employee)',
    'Total NSSF Employee', 'Total NSSF Employer',
  ].join(',');

  const rows = lines.map(line => [
    csvEsc(`${line.profile?.first_name ?? ''} ${line.profile?.last_name ?? ''}`),
    csvEsc(line.employee_id ?? ''),
    csvEsc(line.profile?.nssf_number ?? ''),
    line.gross_pay.toFixed(2),
    line.nssf_tier1.toFixed(2),
    line.nssf_tier2.toFixed(2),
    line.nssf_total.toFixed(2),
    line.nssf_employer.toFixed(2),
  ].join(','));

  return [header, ...rows].join('\r\n');
}

// ─── Bank payment file ────────────────────────────────────────────────────────

export function generateBankPaymentCSV(lines: PayrollLine[], _run: PayrollRun): string {
  const header = [
    'Employee Name', 'Employee ID', 'Bank Name', 'Bank Account',
    'Net Pay (KES)',
  ].join(',');

  const rows = lines.map(line => [
    csvEsc(`${line.profile?.first_name ?? ''} ${line.profile?.last_name ?? ''}`),
    csvEsc(line.employee_id ?? ''),
    csvEsc(line.profile?.bank_name ?? ''),
    csvEsc(line.profile?.bank_account_number ?? ''),
    line.net_pay.toFixed(2),
  ].join(','));

  return [header, ...rows].join('\r\n');
}

// ─── Download helpers ─────────────────────────────────────────────────────────

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadHTML(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printHTML(html: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

// Opens P9 in a new tab and immediately triggers browser Print → Save as PDF
export function openAndSaveP9AsPdf(html: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  // Inject an auto-print script so the save dialog opens automatically
  const htmlWithAutoPrint = html.replace(
    '</body>',
    '<script>window.onload=function(){window.print();}<\/script></body>'
  );
  win.document.write(htmlWithAutoPrint);
  win.document.close();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function csvEsc(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
