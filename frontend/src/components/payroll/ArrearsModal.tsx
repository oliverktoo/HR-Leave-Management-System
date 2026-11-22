// Salary arrears for one payroll line: enter back pay, see the tax worked out by
// spreading it back to the months it relates to, then save.
import { useEffect, useState } from 'react';
import {
  formatKES,
  getArrearsForLine,
  previewArrearsForLine,
  saveArrearsForLine,
  type ArrearsBase,
  type PayrollLine,
} from '../../services/payrollService';
import { rulesFor, type ArrearsEntry, type ArrearsResult, type Month } from '../../services/arrears';

interface Props {
  line: PayrollLine;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (m: Month) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const SOURCE_LABEL: Record<ArrearsBase['source'], string> = { payroll: 'payroll run', p9: 'P9 import', manual: 'entered' };

const blank = (): ArrearsEntry => ({ description: 'Salary arrears', amount: 0, from: '', to: '' });

export function ArrearsModal({ line, onSaved, onClose }: Props) {
  const [entries, setEntries]   = useState<ArrearsEntry[]>([]);
  const [manual, setManual]     = useState<Record<Month, number>>({});
  const [preview, setPreview]   = useState<{ result: ArrearsResult; bases: Record<Month, ArrearsBase>; paymentMonth: Month } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [working, setWorking]   = useState(false);
  const [err, setErr]           = useState('');

  const name = line.profile ? `${line.profile.first_name} ${line.profile.last_name}` : line.employee_id || '';

  useEffect(() => {
    getArrearsForLine(line.id)
      .then(saved => setEntries(saved.length ? saved.map(({ description, amount, from, to }) => ({ description, amount, from, to })) : [blank()]))
      .catch(e => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [line.id]);

  const update = (i: number, patch: Partial<ArrearsEntry>) => {
    setEntries(prev => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    setPreview(null);
  };
  const filled = entries.filter(e => e.amount > 0 || e.from || e.to);

  async function workOut() {
    setWorking(true); setErr('');
    try { setPreview(await previewArrearsForLine(line.id, filled, manual)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(false); }
  }

  async function save() {
    setWorking(true); setErr('');
    try { await saveArrearsForLine(line.id, filled, manual); await onSaved(); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(false); }
  }

  async function removeAll() {
    if (!window.confirm('Remove all arrears from this payslip?')) return;
    setWorking(true); setErr('');
    try { await saveArrearsForLine(line.id, []); await onSaved(); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(false); }
  }

  const r = preview?.result;
  const canSave = !!r && filled.length > 0 && r.errors.length === 0 && r.missing.length === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 className="modal-title">Salary arrears — {name}</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          Back pay for earlier months, paid on this payslip. Tax is worked out by spreading it back to the months
          it relates to, at the rates in force then; only the extra tax is deducted now. Arrears more than four
          years old are treated as income of the fifth year back.
        </p>

        {loading ? <div className="loading-spinner">Loading…</div> : (
          <>
            {entries.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end', marginBottom: '0.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Description</label>
                  <input className="form-control" value={e.description} onChange={ev => update(i, { description: ev.target.value })}
                    placeholder="e.g. Backdated increment" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Amount (KES)</label>
                  <input type="number" min={0} className="form-control" value={e.amount || ''}
                    onChange={ev => update(i, { amount: Number(ev.target.value) || 0 })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">From month</label>
                  <input type="month" className="form-control" value={e.from} onChange={ev => update(i, { from: ev.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">To month</label>
                  <input type="month" className="form-control" value={e.to} onChange={ev => update(i, { to: ev.target.value })} />
                </div>
                <button className="btn btn-sm" style={{ color: '#ef4444', marginBottom: 4 }} title="Remove"
                  onClick={() => { setEntries(prev => prev.filter((_, j) => j !== i)); setPreview(null); }}>✕</button>
              </div>
            ))}
            <button className="btn btn-sm btn-outline" onClick={() => { setEntries(prev => [...prev, blank()]); setPreview(null); }}>
              + Add another
            </button>

            {r && (
              <div style={{ marginTop: '1rem' }}>
                {r.errors.map(m => <div key={m} className="error-message" style={{ marginBottom: 6 }}>{m}</div>)}
                {r.months.length > 0 && (
                  <div className="table-container">
                    <table className="data-table" style={{ fontSize: '0.82rem' }}>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th style={{ textAlign: 'right' }}>Arrears share</th>
                          <th style={{ textAlign: 'right' }}>Taxable pay then</th>
                          <th style={{ textAlign: 'right' }}>Tax then</th>
                          <th style={{ textAlign: 'right' }}>Tax with arrears</th>
                          <th style={{ textAlign: 'right' }}>Extra PAYE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.months.map(m => {
                          const base = preview!.bases[m.month];
                          return (
                            <tr key={m.month}>
                              <td>
                                {label(m.month)}
                                {m.deemed && <div style={{ fontSize: '0.7rem', color: '#92400e' }}>older than 4 years — taxed in this year</div>}
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{rulesFor(m.month)?.note}</div>
                              </td>
                              <td style={{ textAlign: 'right' }}>{formatKES(m.share)}</td>
                              <td style={{ textAlign: 'right' }}>
                                {base && base.source !== 'manual' ? (
                                  <>{formatKES(base.taxable)}<div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>from {SOURCE_LABEL[base.source]}</div></>
                                ) : (
                                  <input type="number" min={0} className="form-control" style={{ maxWidth: 130, marginLeft: 'auto', textAlign: 'right' }}
                                    placeholder="From payslip"
                                    value={manual[m.month] ?? ''}
                                    onChange={ev => { setManual(prev => ({ ...prev, [m.month]: Number(ev.target.value) })); }} />
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>{m.base == null ? '—' : formatKES(m.taxBefore)}</td>
                              <td style={{ textAlign: 'right' }}>{m.base == null ? '—' : formatKES(m.taxAfter)}</td>
                              <td style={{ textAlign: 'right' }}><strong>{m.base == null ? '—' : formatKES(m.extra)}</strong></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {r.missing.length > 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#b45309', marginTop: 6 }}>
                    Enter the taxable pay that was taxed in {r.missing.map(label).join(', ')} (from that month's payslip or P9),
                    then click <em>Work out tax</em> again.
                  </div>
                ) : r.errors.length === 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, padding: '0.6rem 0.9rem', marginTop: 8 }}>
                    <span>Arrears paid now: <strong>{formatKES(r.totalArrears)}</strong></span>
                    <span>Extra PAYE deducted now: <strong>{formatKES(r.extraPaye)}</strong></span>
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 6 }}>
                  SHIF and Housing Levy are also charged on the arrears this month. NSSF for past months is not recomputed.
                </div>
              </div>
            )}

            {err && <div className="error-message" style={{ marginTop: '0.75rem' }}>{err}</div>}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" style={{ color: '#ef4444', borderColor: '#fecaca' }} onClick={removeAll}
                disabled={working || !(line.arrears_amount && line.arrears_amount > 0)}>
                Remove arrears
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-outline" onClick={onClose}>Cancel</button>
                <button className="btn btn-outline" onClick={workOut} disabled={working || filled.length === 0}>
                  {working && !canSave ? 'Working…' : 'Work out tax'}
                </button>
                <button className="btn btn-primary" onClick={save} disabled={working || !canSave}>
                  {working && canSave ? 'Saving…' : 'Save & recompute'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
