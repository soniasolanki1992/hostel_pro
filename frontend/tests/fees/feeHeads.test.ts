/**
 * Unit tests for the shared fee-head label module.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  FEE_HEAD_LABELS,
  CANONICAL_FEE_HEADS,
  feeHeadLabel,
  compareFeeHeadOrder,
} from '@/lib/fees/feeHeads';

describe('feeHeads module', () => {
  it('maps the 5 canonical fee_heads to the user-facing labels', () => {
    expect(FEE_HEAD_LABELS.PROCESSING_FEE).toBe('Admission Fee');
    expect(FEE_HEAD_LABELS.SECURITY_DEPOSIT).toBe('Hostel Deposit');
    expect(FEE_HEAD_LABELS.HOSTEL_FEES).toBe('First Term Fee');
    expect(FEE_HEAD_LABELS.MESS_ADVANCE).toBe('Mess Deposit');
    expect(FEE_HEAD_LABELS.MESS_MONTHLY_FEE).toBe('Mess Monthly Fees');
  });

  it('exposes CANONICAL_FEE_HEADS in the institutional sequence', () => {
    expect([...CANONICAL_FEE_HEADS]).toEqual([
      'PROCESSING_FEE',
      'SECURITY_DEPOSIT',
      'HOSTEL_FEES',
      'MESS_ADVANCE',
      'MESS_MONTHLY_FEE',
    ]);
  });

  it('feeHeadLabel falls back to the raw fee_head when unknown', () => {
    expect(feeHeadLabel('PROCESSING_FEE')).toBe('Admission Fee');
    expect(feeHeadLabel('UNKNOWN_HEAD')).toBe('UNKNOWN_HEAD');
  });

  it('compareFeeHeadOrder sorts canonical heads by sequence; unknown heads sink to the bottom', () => {
    const inputs = ['MESS_MONTHLY_FEE', 'PROCESSING_FEE', 'KEY_DEPOSIT', 'HOSTEL_FEES', 'SECURITY_DEPOSIT', 'MESS_ADVANCE'];
    const sorted = [...inputs].sort(compareFeeHeadOrder);
    expect(sorted).toEqual([
      'PROCESSING_FEE',
      'SECURITY_DEPOSIT',
      'HOSTEL_FEES',
      'MESS_ADVANCE',
      'MESS_MONTHLY_FEE',
      'KEY_DEPOSIT',
    ]);
  });
});
