export const FEE_HEAD_LABELS: Record<string, string> = {
  PROCESSING_FEE: 'Admission Fee',
  SECURITY_DEPOSIT: 'Hostel Deposit',
  HOSTEL_FEES: 'First Term Fee',
  MESS_ADVANCE: 'Mess Deposit',
  MESS_MONTHLY_FEE: 'Mess Monthly Fees',
  KEY_DEPOSIT: 'Key Deposit',
  RENEWAL_FEE: 'Renewal Fee',
};

export const CANONICAL_FEE_HEADS = [
  'PROCESSING_FEE',
  'SECURITY_DEPOSIT',
  'HOSTEL_FEES',
  'MESS_ADVANCE',
  'MESS_MONTHLY_FEE',
] as const;

export type CanonicalFeeHead = (typeof CANONICAL_FEE_HEADS)[number];

export const FEE_HEAD_DESCRIPTIONS: Record<string, string> = {
  PROCESSING_FEE: 'One-time admission/processing fee',
  SECURITY_DEPOSIT: 'Refundable hostel deposit',
  HOSTEL_FEES: 'First term hostel fee',
  MESS_ADVANCE: 'Refundable mess deposit',
  MESS_MONTHLY_FEE: 'Monthly mess charges',
  KEY_DEPOSIT: 'Refundable key deposit',
  RENEWAL_FEE: 'Renewal fee',
};

export const FEE_FREQUENCIES = ['ONE_TIME', 'SEMESTER', 'MONTHLY'] as const;
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];

export function feeHeadLabel(feeHead: string): string {
  return FEE_HEAD_LABELS[feeHead] || feeHead;
}

const orderIndex = new Map<string, number>(
  CANONICAL_FEE_HEADS.map((h, i) => [h, i] as const),
);

export function compareFeeHeadOrder(a: string, b: string): number {
  const ai = orderIndex.has(a) ? (orderIndex.get(a) as number) : 999;
  const bi = orderIndex.has(b) ? (orderIndex.get(b) as number) : 999;
  return ai - bi;
}
