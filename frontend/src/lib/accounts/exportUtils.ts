type Primitive = string | number | boolean | null | undefined;

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv<T extends Record<string, Primitive | object>>(
  rows: T[],
  columns: { key: keyof T; header: string }[]
): string {
  const head = columns.map(c => escapeCsvCell(c.header)).join(',');
  const body = rows
    .map(row => columns.map(c => escapeCsvCell(row[c.key])).join(','))
    .join('\r\n');
  return `${head}\r\n${body}`;
}

export function downloadFile(content: string, filename: string, mime: string) {
  // UTF-8 BOM for Excel compatibility on .csv
  const bom = mime.includes('csv') ? '﻿' : '';
  const blob = new Blob([bom + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv<T extends Record<string, Primitive | object>>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
  filename: string
) {
  downloadFile(rowsToCsv(rows, columns), filename, 'text/csv;charset=utf-8');
}

export function downloadXls<T extends Record<string, Primitive | object>>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
  filename: string
) {
  // Excel opens CSV-shaped data with .xls extension when given the right MIME type.
  downloadFile(rowsToCsv(rows, columns), filename, 'application/vnd.ms-excel');
}

export type Period =
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'LAST_3_MONTHS'
  | 'LAST_6_MONTHS'
  | 'THIS_YEAR'
  | 'ALL_TIME';

export function periodToRange(period: Period, now: Date = new Date()): { from: Date | null; to: Date | null } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const startOfMonth = (yr: number, mo: number) => new Date(yr, mo, 1, 0, 0, 0, 0);
  const endOfMonth = (yr: number, mo: number) => new Date(yr, mo + 1, 0, 23, 59, 59, 999);
  switch (period) {
    case 'THIS_MONTH':
      return { from: startOfMonth(y, m), to: endOfMonth(y, m) };
    case 'LAST_MONTH':
      return { from: startOfMonth(y, m - 1), to: endOfMonth(y, m - 1) };
    case 'LAST_3_MONTHS':
      return { from: startOfMonth(y, m - 2), to: endOfMonth(y, m) };
    case 'LAST_6_MONTHS':
      return { from: startOfMonth(y, m - 5), to: endOfMonth(y, m) };
    case 'THIS_YEAR':
      return { from: new Date(y, 0, 1, 0, 0, 0, 0), to: new Date(y, 11, 31, 23, 59, 59, 999) };
    case 'ALL_TIME':
    default:
      return { from: null, to: null };
  }
}

export function isWithinPeriod(dateString: string | null | undefined, period: Period): boolean {
  if (period === 'ALL_TIME') return true;
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return false;
  const { from, to } = periodToRange(period);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
