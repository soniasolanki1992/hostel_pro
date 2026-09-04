'use client';

import { useState } from 'react';
import { Button } from '@/components/shadcn/button-extended';

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerated?: () => void;
}

const VERTICALS = ['BOYS_HOSTEL', 'GIRLS_ASHRAM', 'DHARAMSHALA'];
const VERTICAL_LABELS: Record<string, string> = {
  BOYS_HOSTEL: 'Boys Hostel',
  GIRLS_ASHRAM: 'Girls Ashram',
  DHARAMSHALA: 'Dharamshala',
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function GenerateMonthlyMessModal({ open, onClose, onGenerated }: Props) {
  const [month, setMonth] = useState<string>(currentMonth());
  const [vertical, setVertical] = useState<string>('ALL');
  const [dueDay, setDueDay] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ generated: number; skipped: number; failed: number; due_date?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/fees/generate-monthly-mess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          month,
          vertical: vertical === 'ALL' ? undefined : vertical,
          due_day: dueDay,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Generation failed');
      setResult(json.data || json);
      if (onGenerated) onGenerated();
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Generate Monthly Mess Fees</h2>
          <button onClick={() => !loading && onClose()} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <p className="text-xs text-gray-600 mb-4">
          Creates a <strong>Mess Monthly Fees</strong> charge for every active resident matching the selected vertical.
          Already-generated rows for the same month are skipped automatically.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Month *</label>
            <input
              type="month"
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Vertical</label>
            <select
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
            >
              <option value="ALL">All Verticals</option>
              {VERTICALS.map((v) => <option key={v} value={v}>{VERTICAL_LABELS[v]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Due Day of Month</label>
            <input
              type="number"
              min={1}
              max={28}
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
              value={dueDay}
              onChange={(e) => setDueDay(Math.max(1, Math.min(28, Number(e.target.value) || 10)))}
            />
          </div>

          {error && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          {result && (
            <div className="p-3 rounded bg-green-50 border border-green-200 text-sm text-green-800">
              <div><strong>Generated:</strong> {result.generated}</div>
              <div><strong>Skipped (already existed):</strong> {result.skipped}</div>
              {result.failed > 0 && <div><strong>Failed:</strong> {result.failed}</div>}
              {result.due_date && <div><strong>Due date:</strong> {result.due_date}</div>}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button variant="primary" size="sm" onClick={submit} loading={loading} disabled={loading}>
              Generate
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
