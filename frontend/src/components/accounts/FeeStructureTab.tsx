'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/shadcn/button-extended';
import { Card } from '@/components/data/Card';
import { Badge } from '@/components/shadcn/badge-extended';
import {
  FEE_HEAD_LABELS,
  CANONICAL_FEE_HEADS,
  FEE_FREQUENCIES,
  feeHeadLabel,
} from '@/lib/fees/feeHeads';

interface FeeConfigRow {
  id: string;
  vertical: string;
  academic_session: string;
  fee_head: string;
  amount: number | string;
  frequency: string;
  is_refundable: boolean;
  valid_from: string;
  valid_until: string | null;
}

interface FormState {
  id?: string;
  vertical: string;
  academic_session: string;
  fee_head: string;
  amount: string;
  frequency: string;
  is_refundable: boolean;
  valid_from: string;
  valid_until: string;
}

const VERTICALS = ['BOYS_HOSTEL', 'GIRLS_ASHRAM', 'DHARAMSHALA'];
const VERTICAL_LABELS: Record<string, string> = {
  BOYS_HOSTEL: 'Boys Hostel',
  GIRLS_ASHRAM: 'Girls Ashram',
  DHARAMSHALA: 'Dharamshala',
};

const defaultSession = () => {
  const now = new Date();
  const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
};

const emptyForm = (): FormState => ({
  vertical: 'BOYS_HOSTEL',
  academic_session: defaultSession(),
  fee_head: 'PROCESSING_FEE',
  amount: '',
  frequency: 'ONE_TIME',
  is_refundable: false,
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: '',
});

export function FeeStructureTab() {
  const [rows, setRows] = useState<FeeConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterVertical, setFilterVertical] = useState<string>('ALL');
  const [filterSession, setFilterSession] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const authHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchRows = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/fee-configuration', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load fee configuration');
      const json = await res.json();
      setRows(Array.isArray(json.data) ? json.data : []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load fee configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, []);

  const sessions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.academic_session))).sort().reverse(),
    [rows],
  );

  const filtered = useMemo(
    () => rows.filter((r) =>
      (filterVertical === 'ALL' || r.vertical === filterVertical) &&
      (filterSession === 'ALL' || r.academic_session === filterSession),
    ),
    [rows, filterVertical, filterSession],
  );

  const openCreate = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (row: FeeConfigRow) => {
    setForm({
      id: row.id,
      vertical: row.vertical,
      academic_session: row.academic_session,
      fee_head: row.fee_head,
      amount: String(row.amount),
      frequency: row.frequency,
      is_refundable: !!row.is_refundable,
      valid_from: (row.valid_from || '').slice(0, 10),
      valid_until: row.valid_until ? row.valid_until.slice(0, 10) : '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        ...(form.id ? { id: form.id } : {}),
        vertical: form.vertical,
        academic_session: form.academic_session,
        fee_head: form.fee_head,
        amount: parseFloat(form.amount),
        frequency: form.frequency,
        is_refundable: form.is_refundable,
        valid_from: form.valid_from,
        valid_until: form.valid_until || null,
      };
      const res = await fetch('/api/fee-configuration', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Failed to save');
      setModalOpen(false);
      await fetchRows();
    } catch (e: any) {
      alert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: FeeConfigRow) => {
    if (!confirm(`Delete ${feeHeadLabel(row.fee_head)} for ${VERTICAL_LABELS[row.vertical]} (${row.academic_session})?`)) return;
    try {
      const res = await fetch(`/api/fee-configuration?id=${row.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Delete failed');
      await fetchRows();
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    }
  };

  return (
    <div>
      <div className="mb-6 p-4 rounded-lg flex flex-wrap items-center gap-4" style={{ background: 'var(--surface-primary)' }}>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Vertical:</label>
          <select
            className="px-3 py-1.5 border rounded text-sm"
            value={filterVertical}
            onChange={(e) => setFilterVertical(e.target.value)}
          >
            <option value="ALL">All</option>
            {VERTICALS.map((v) => (
              <option key={v} value={v}>{VERTICAL_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Session:</label>
          <select
            className="px-3 py-1.5 border rounded text-sm"
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value)}
          >
            <option value="ALL">All</option>
            {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={openCreate}>+ Add Fee</Button>
      </div>

      {loading ? (
        <Card padding="lg" shadow="md">
          <p className="text-center text-sm text-gray-600 py-8">Loading fee structure…</p>
        </Card>
      ) : error ? (
        <Card padding="lg" shadow="md">
          <p className="text-center text-sm text-red-600 py-8">{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card padding="lg" shadow="md">
          <p className="text-center text-sm text-gray-600 py-8">No fee structure rows. Click <strong>+ Add Fee</strong> to create one.</p>
        </Card>
      ) : (
        <Card padding="md" shadow="md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th className="text-left py-2 px-3 font-medium">Vertical</th>
                  <th className="text-left py-2 px-3 font-medium">Session</th>
                  <th className="text-left py-2 px-3 font-medium">Fee Head</th>
                  <th className="text-right py-2 px-3 font-medium">Amount</th>
                  <th className="text-left py-2 px-3 font-medium">Frequency</th>
                  <th className="text-left py-2 px-3 font-medium">Refundable</th>
                  <th className="text-left py-2 px-3 font-medium">Valid</th>
                  <th className="text-right py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border-gray-200)' }}>
                    <td className="py-2 px-3">{VERTICAL_LABELS[row.vertical] || row.vertical}</td>
                    <td className="py-2 px-3">{row.academic_session}</td>
                    <td className="py-2 px-3">
                      <div className="font-medium">{feeHeadLabel(row.fee_head)}</div>
                      <div className="text-xs text-gray-500">{row.fee_head}</div>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold">₹{Number(row.amount).toLocaleString('en-IN')}</td>
                    <td className="py-2 px-3"><Badge variant="info" size="sm">{row.frequency}</Badge></td>
                    <td className="py-2 px-3">
                      {row.is_refundable
                        ? <Badge variant="success" size="sm">Yes</Badge>
                        : <Badge variant="default" size="sm">No</Badge>}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600">
                      {(row.valid_from || '').slice(0, 10)}
                      {row.valid_until ? ` → ${row.valid_until.slice(0, 10)}` : ''}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="secondary" size="xs" onClick={() => openEdit(row)}>Edit</Button>
                        <Button variant="ghost" size="xs" onClick={() => remove(row)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{form.id ? 'Edit Fee' : 'Add Fee'}</h2>
              <button onClick={() => !saving && setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Vertical *</label>
                  <select
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                    value={form.vertical}
                    onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                  >
                    {VERTICALS.map((v) => <option key={v} value={v}>{VERTICAL_LABELS[v]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Academic Session *</label>
                  <input
                    type="text"
                    placeholder="2025-2026"
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                    value={form.academic_session}
                    onChange={(e) => setForm({ ...form, academic_session: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Fee Head *</label>
                <select
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                  value={form.fee_head}
                  onChange={(e) => {
                    const fh = e.target.value;
                    const next = { ...form, fee_head: fh };
                    if (fh === 'MESS_MONTHLY_FEE') next.frequency = 'MONTHLY';
                    else if (fh === 'HOSTEL_FEES') next.frequency = 'SEMESTER';
                    else if (next.frequency === 'MONTHLY') next.frequency = 'ONE_TIME';
                    if (fh === 'SECURITY_DEPOSIT' || fh === 'MESS_ADVANCE' || fh === 'KEY_DEPOSIT') next.is_refundable = true;
                    setForm(next);
                  }}
                >
                  {CANONICAL_FEE_HEADS.map((fh) => (
                    <option key={fh} value={fh}>{FEE_HEAD_LABELS[fh]} ({fh})</option>
                  ))}
                  <option value="KEY_DEPOSIT">{FEE_HEAD_LABELS.KEY_DEPOSIT} (KEY_DEPOSIT)</option>
                  <option value="RENEWAL_FEE">{FEE_HEAD_LABELS.RENEWAL_FEE} (RENEWAL_FEE)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Frequency *</label>
                  <select
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  >
                    {FEE_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Valid From *</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                    value={form.valid_from}
                    onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valid Until (optional)</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                    value={form.valid_until}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_refundable}
                  onChange={(e) => setForm({ ...form, is_refundable: e.target.checked })}
                />
                Refundable on exit
              </label>
            </div>

            <div className="flex gap-3 justify-end pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={saving}>
                {form.id ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
