import { describe, it, expect } from 'vitest';
import { renderApplicationRejected } from './application-rejected';
import { renderInterviewScheduled } from './interview-scheduled';
import { renderAlumniDecision } from './alumni-decision';
import { renderLeaveDecision } from './leave-decision';
import { renderPaymentReceipt } from './payment-receipt';

describe('renderApplicationRejected', () => {
  it('includes tracking number in subject and body', () => {
    const out = renderApplicationRejected({
      name: 'Riya',
      trackingNumber: 'HG-2026-00006',
      reason: 'Documents incomplete',
    });
    expect(out.subject).toContain('HG-2026-00006');
    expect(out.html).toContain('HG-2026-00006');
    expect(out.html).toContain('Documents incomplete');
    expect(out.text).toContain('Riya');
  });

  it('omits reason block when reason is null', () => {
    const out = renderApplicationRejected({ name: 'Riya', trackingNumber: 'HG-1', reason: null });
    expect(out.html).not.toContain('Reason:');
  });

  it('escapes HTML in name and reason', () => {
    const out = renderApplicationRejected({
      name: '<script>',
      trackingNumber: 'HG-1',
      reason: 'a<b',
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('a&lt;b');
  });
});

describe('renderInterviewScheduled', () => {
  it('contains tracking, mode, and tracking URL', () => {
    const out = renderInterviewScheduled({
      name: 'Riya',
      trackingNumber: 'HG-2026-00006',
      scheduleTime: '2026-05-10T10:30:00.000Z',
      mode: 'IN_PERSON',
      trackUrl: 'https://h.example.com/track/HG-2026-00006',
    });
    expect(out.html).toContain('HG-2026-00006');
    expect(out.html).toContain('IN_PERSON');
    expect(out.html).toContain('https://h.example.com/track/HG-2026-00006');
    expect(out.subject).toContain('HG-2026-00006');
  });
});

describe('renderAlumniDecision', () => {
  it('uses welcome subject when approved', () => {
    const out = renderAlumniDecision({
      name: 'Rahul',
      decision: 'APPROVED',
      portalUrl: 'https://h.example.com/alumni/login',
    });
    expect(out.subject.toLowerCase()).toContain('approved');
    expect(out.html).toContain('alumni portal');
    expect(out.html).toContain('https://h.example.com/alumni/login');
  });

  it('includes reason when rejected', () => {
    const out = renderAlumniDecision({
      name: 'Rahul',
      decision: 'REJECTED',
      reason: 'Could not verify references',
      portalUrl: 'https://h.example.com/alumni/login',
    });
    expect(out.html).toContain('Could not verify references');
    expect(out.subject.toLowerCase()).not.toContain('approved');
  });
});

describe('renderLeaveDecision', () => {
  it('includes leave type, period in approved email', () => {
    const out = renderLeaveDecision({
      name: 'Riya',
      decision: 'APPROVED',
      leaveType: 'WEEKEND',
      startTime: '2026-05-10T08:00:00.000Z',
      endTime: '2026-05-12T18:00:00.000Z',
    });
    expect(out.subject).toContain('WEEKEND');
    expect(out.html).toContain('approved');
    expect(out.html).toContain('WEEKEND');
  });

  it('includes reason in rejected email', () => {
    const out = renderLeaveDecision({
      name: 'Riya',
      decision: 'REJECTED',
      leaveType: 'EMERGENCY',
      startTime: '2026-05-10T08:00:00.000Z',
      endTime: '2026-05-12T18:00:00.000Z',
      reason: 'Conflicts with exam schedule',
    });
    expect(out.html).toContain('Conflicts with exam schedule');
    expect(out.html.toLowerCase()).toContain('not approved');
  });
});

describe('renderPaymentReceipt', () => {
  it('formats amount with rupee symbol and includes order/txn ids', () => {
    const out = renderPaymentReceipt({
      name: 'Riya',
      amount: 500,
      orderId: 'ADM-1234',
      transactionId: 'TXN-9999',
      feeHead: 'ADMISSION',
    });
    expect(out.html).toContain('₹500');
    expect(out.html).toContain('ADM-1234');
    expect(out.html).toContain('TXN-9999');
    expect(out.html).toContain('ADMISSION');
    expect(out.subject).toContain('ADM-1234');
  });

  it('omits fee head row when feeHead is null', () => {
    const out = renderPaymentReceipt({
      name: 'Riya',
      amount: 500,
      orderId: 'ADM-1234',
      transactionId: 'TXN-9999',
      feeHead: null,
    });
    expect(out.html).not.toContain('Fee Head');
  });
});
