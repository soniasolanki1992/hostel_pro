import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdmissionFeeNotice } from '@/components/forms/AdmissionFeeNotice';

describe('AdmissionFeeNotice', () => {
  it('renders the ₹500 non-refundable fee heading', () => {
    render(<AdmissionFeeNotice />);
    expect(
      screen.getByText(/Admission Fee — ₹500 \(Non-Refundable\)/i),
    ).toBeInTheDocument();
  });

  it('explains the fee is required to submit the application', () => {
    render(<AdmissionFeeNotice />);
    expect(
      screen.getByText(/non-refundable admission fee of ₹500 is required/i),
    ).toBeInTheDocument();
  });

  it('mentions adjustment against hostel fees on confirmation', () => {
    render(<AdmissionFeeNotice />);
    expect(
      screen.getByText(/adjusted against your hostel fees/i),
    ).toBeInTheDocument();
  });
});
