// Final dues for a leaver, on their last payslip. Pre-filled from the exit
// request, leave balance and contract; every suggested amount can be changed.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  formatKES,
  getFinalDuesContext,
  previewFinalDues,
  removeFinalDues,
  saveFinalDues,
  type FinalDuesContext,
  type FinalDuesInputs,
  type PayrollLine,
} from '../../services/payrollService';
import {
  GRATUITY_EXEMPT_FROM, completedYears, splitGratuity, suggestLeavePay, suggestNoticePay,
  suggestSeverance, unexpiredMonths, type TerminalTax,
} from '../../services/finalDues';

interface Props { line: PayrollLine; onSaved: () => Promise<void> | void; onClose: () => void }

const EXIT_LABEL: Record<string, string> = {
  resignation: 'Resignation', retirement: 'Retirement', termination: 'Termination',
  contract_end: 'Contract end', mutual_agreement: 'Mutual agreement',
};
const num = (v: string) => Math.max(0, Number(v) || 0);

export function FinalDuesModal({ line, onSaved, onClose }: Props) {
  const [ctx, setCtx]         = useState<FinalDuesContext | null>(null);
  const [f, setF]             = useState<FinalDuesInputs | null>(null);
  const [preview, setPreview] = useState<{ tax: TerminalTax; gross: number; paye: number; net: number } | null>(null);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');

  useEffect(() => {
    getFinalDuesContext(line.id).then(c => {
      setCtx(c);
      if (c.saved) { setF(c.saved); return; }
      const last = c.exit?.last_working_date && c.exit.last_working_date <= c.periodEnd ? c.exit.last_working_date : c.periodEnd;
      const leaveDays = c.leaveDaysRemaining ?? 0;
      const rate = Math.round(c.monthlyPay / 22);
      const noticeMonths = c.exit && ['termination'].includes(c.exit.exit_type) ? 1 : 0;
      const start = (c.contractStart || c.hireDate || '').slice(0, 7);
      setF({
        exitRequestId: c.exit?.id ?? null,
        lastWorkingDate: last,
        daysWorked: c.workingDaysInMonth,
        leaveDays, leaveDailyRate: rate, leavePay: suggestLeavePay(c.monthlyPay, leaveDays),
        noticeMonths, noticePay: suggestNoticePay(c.monthlyPay, noticeMonths),
        severanceYears: 0, severancePay: 0,
        gratuityAmount: 0, gratuityFrom: start, gratuityTo: last.slice(0, 7),
        compensationAmount: 0, compensationBasis: 'none', compensationMonths: 0,
      });
    }).catch(e => setErr(e instanceof Error ? e.message : String(e)));
  }, [line.id]);

  // Working days paid = working days from the 1st to the last working day
  useEffect(() => {
    if (!ctx || !f?.lastWorkingDate || ctx.saved?.lastWorkingDate === f.lastWorkingDate) return;
    if (f.lastWorkingDate < ctx.periodStart) return;
    const end = f.lastWorkingDate > ctx.periodEnd ? ctx.periodEnd : f.lastWorkingDate;
    supabase.rpc('calculate_working_days', { start_date: ctx.periodStart, end_date: end })
      .then(({ data }) => { if (data != null) setF(p => (p ? { ...p, daysWorked: Number(data) } : p)); });
  }, [ctx, f?.lastWorkingDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<FinalDuesInputs>) => { setF(p => (p ? { ...p, ...patch } : p)); setPreview(null); };
  const split = useMemo(() => (f ? splitGratuity(f.gratuityAmount, f.gratuityFrom, f.gratuityTo) : null), [f]);

  if (!ctx || !f) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          {err ? <div className="error-message">{err}</div> : <div className="loading-spinner">Loading…</div>}
        </div>
      </div>
    );
  }

  const years = ctx.hireDate ? completedYears(ctx.hireDate, f.lastWorkingDate) : 0;

  async function workOut() {
    setBusy(true); setErr('');
    try {
      const r = await previewFinalDues(line.id, f!);
      setPreview({ tax: r.tax, gross: r.line.gross_pay, paye: r.line.paye_amount, net: r.line.net_pay });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setErr('');
    try { await saveFinalDues(line.id, f!); await onSaved(); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Remove final dues from this payslip? It goes back to a normal month.')) return;
    setBusy(true); setErr('');
    try { await removeFinalDues(line.id); await onSaved(); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{label}</label>
      {input}
      {hint && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{hint}</div>}
    </div>
  );
  const section = (title: string, children: React.ReactNode) => (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>{title}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem' }}>{children}</div>
    </div>
  );
  const t = preview?.tax;
  const canSave = !!t && t.errors.length === 0 && t.missing.length === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 820, maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 className="modal-title">Final dues — {ctx.employeeName}</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          {ctx.exit
            ? <>Exit: <strong>{EXIT_LABEL[ctx.exit.exit_type] ?? ctx.exit.exit_type}</strong>, last working day {ctx.exit.last_working_date}.</>
            : 'No exit request found — enter the details below.'}
          {' '}Suggested amounts follow the Employment Act; adjust them to the contract where it gives more.
        </p>

        {section('Final month', <>
          {field('Last working day', <input type="date" className="form-control" value={f.lastWorkingDate}
            onChange={e => set({ lastWorkingDate: e.target.value, gratuityTo: e.target.value.slice(0, 7) })} />)}
          {field('Working days paid this month', <input type="number" min={0} step={0.5} className="form-control" value={f.daysWorked}
            onChange={e => set({ daysWorked: num(e.target.value) })} />, `of ${ctx.workingDaysInMonth}`)}
        </>)}

        {section('Leave pay (untaken annual leave)', <>
          {field('Days', <input type="number" min={0} step={0.5} className="form-control" value={f.leaveDays}
            onChange={e => { const d = num(e.target.value); set({ leaveDays: d, leavePay: Math.round(d * f.leaveDailyRate) }); }} />,
            ctx.leaveDaysRemaining != null ? `${ctx.leaveDaysRemaining} days left this year` : 'No annual leave balance found')}
          {field('Daily rate (KES)', <input type="number" min={0} className="form-control" value={f.leaveDailyRate}
            onChange={e => { const r = num(e.target.value); set({ leaveDailyRate: r, leavePay: Math.round(f.leaveDays * r) }); }} />,
            'Monthly pay ÷ 22 working days')}
          {field('Leave pay (KES)', <input type="number" min={0} className="form-control" value={f.leavePay}
            onChange={e => set({ leavePay: num(e.target.value) })} />)}
        </>)}

        {section('Notice', <>
          {field('Months in lieu of notice', <input type="number" min={0} step={0.5} className="form-control" value={f.noticeMonths}
            onChange={e => { const m = num(e.target.value); set({ noticeMonths: m, noticePay: suggestNoticePay(ctx.monthlyPay, m) }); }} />,
            'Paid when notice is not served')}
          {field('Notice pay (KES)', <input type="number" min={0} className="form-control" value={f.noticePay}
            onChange={e => set({ noticePay: num(e.target.value) })} />)}
        </>)}

        {section('Severance (redundancy only)', <>
          {field('Completed years', <input type="number" min={0} className="form-control" value={f.severanceYears}
            onChange={e => { const y = num(e.target.value); set({ severanceYears: y, severancePay: suggestSeverance(ctx.monthlyBasic, y) }); }} />,
            ctx.hireDate ? `${years} completed years since ${ctx.hireDate}` : 'No hire date on file')}
          {field('Severance pay (KES)', <input type="number" min={0} className="form-control" value={f.severancePay}
            onChange={e => set({ severancePay: num(e.target.value) })} />, 'At least 15 days’ basic pay per completed year (s.40)')}
        </>)}

        {section('Gratuity (cash)', <>
          {field('Amount (KES)', <input type="number" min={0} className="form-control" value={f.gratuityAmount}
            onChange={e => set({ gratuityAmount: num(e.target.value) })} />)}
          {field('Service from', <input type="month" className="form-control" value={f.gratuityFrom}
            onChange={e => set({ gratuityFrom: e.target.value })} />)}
          {field('Service to', <input type="month" className="form-control" value={f.gratuityTo}
            onChange={e => set({ gratuityTo: e.target.value })} />)}
          {split && f.gratuityAmount > 0 && (
            <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: '#334155' }}>
              Tax-free (earned from {GRATUITY_EXEMPT_FROM.replace('-', '/')}): <strong>{formatKES(split.exempt)}</strong>
              {' · '}Taxable (earned before): <strong>{formatKES(split.taxable)}</strong>
              {split.taxable > 0 && ' — spread back to the months earned'}
            </div>
          )}
        </>)}

        {section('Compensation for loss of office', <>
          {field('Amount (KES)', <input type="number" min={0} className="form-control" value={f.compensationAmount}
            onChange={e => set({ compensationAmount: num(e.target.value) })} />)}
          {field('Contract', <select className="form-control" value={f.compensationBasis}
            onChange={e => {
              const b = e.target.value as FinalDuesInputs['compensationBasis'];
              const months = b === 'fixed_term' && ctx.contractEnd ? unexpiredMonths(f.lastWorkingDate, ctx.contractEnd) : b === 'no_provision' ? 36 : 0;
              set({ compensationBasis: b, compensationMonths: months });
            }}>
            <option value="none">No compensation</option>
            <option value="fixed_term">Fixed term — spread over the unexpired term</option>
            <option value="no_provision">Contract makes no provision — spread over 3 years</option>
          </select>)}
          {f.compensationBasis !== 'none' && field('Months to spread over', <input type="number" min={1} className="form-control"
            value={f.compensationMonths} onChange={e => set({ compensationMonths: num(e.target.value) })} />,
            f.compensationBasis === 'fixed_term' ? (ctx.contractEnd ? `Contract ends ${ctx.contractEnd}` : 'No contract end date on file') : undefined)}
        </>)}

        {t && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
            {t.errors.map(m => <div key={m} className="error-message">{m}</div>)}
            {t.missing.length > 0 && (
              <div style={{ color: '#b45309' }}>
                The taxable part of the gratuity is spread back to {t.missing.join(', ')}, but the pay originally taxed in
                those months isn't in the system. Import that year's P9 history (Payroll → KRA Exports), then work it out again.
              </div>
            )}
            {canSave && (
              <table style={{ width: '100%' }}>
                <tbody>
                  {t.severanceTax > 0 && <tr><td>PAYE on severance (lump-sum method)</td><td style={{ textAlign: 'right' }}>{formatKES(t.severanceTax)}</td></tr>}
                  {t.gratuityTax > 0 && <tr><td>PAYE on gratuity earned before Jul 2025 (spread back)</td><td style={{ textAlign: 'right' }}>{formatKES(t.gratuityTax)}</td></tr>}
                  {t.gratuityExempt > 0 && <tr><td style={{ color: '#047857' }}>Gratuity tax-free (Finance Act 2025)</td><td style={{ textAlign: 'right', color: '#047857' }}>{formatKES(t.gratuityExempt)}</td></tr>}
                  {t.compensationTax > 0 && <tr><td>PAYE on compensation (spread forward)</td><td style={{ textAlign: 'right' }}>{formatKES(t.compensationTax)}</td></tr>}
                  <tr style={{ borderTop: '1px solid #e2e8f0' }}><td><strong>Final payslip — gross</strong></td><td style={{ textAlign: 'right' }}><strong>{formatKES(preview!.gross)}</strong></td></tr>
                  <tr><td>Total PAYE</td><td style={{ textAlign: 'right' }}>{formatKES(preview!.paye)}</td></tr>
                  <tr><td><strong>Net pay</strong></td><td style={{ textAlign: 'right' }}><strong>{formatKES(preview!.net)}</strong></td></tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {err && <div className="error-message" style={{ marginBottom: '0.75rem' }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" style={{ color: '#ef4444', borderColor: '#fecaca' }} onClick={remove}
            disabled={busy || !ctx.saved}>Remove final dues</button>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-outline" onClick={workOut} disabled={busy}>{busy && !canSave ? 'Working…' : 'Work out'}</button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !canSave}>{busy && canSave ? 'Saving…' : 'Save & recompute'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
