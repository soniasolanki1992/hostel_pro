-- ============================================================================
-- 008_fee_structure_module.sql
-- Canonical fee structure: Admission Fee, Hostel Deposit, First Term Fee,
-- Mess Deposit, Mess Monthly Fees. Reuses existing fee_heads where possible
-- and adds MESS_MONTHLY_FEE for the monthly mess billing cycle.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Mess Deposit semantics: MESS_ADVANCE is now refundable (treated as deposit).
UPDATE fee_configuration
   SET is_refundable = true
 WHERE fee_head = 'MESS_ADVANCE';

-- 2. Seed canonical fee_configuration rows for the active session.
--    (vertical, academic_session, fee_head) is the natural key — guard with NOT EXISTS.
DO $$
DECLARE
    v_session VARCHAR(20) := '2025-2026';
    v_valid_from DATE := DATE '2025-06-01';
BEGIN
    -- Boys Hostel
    INSERT INTO fee_configuration (vertical, academic_session, fee_head, amount, frequency, is_refundable, valid_from)
    SELECT 'BOYS_HOSTEL', v_session, 'MESS_MONTHLY_FEE', 3500.00, 'MONTHLY', false, v_valid_from
    WHERE NOT EXISTS (
        SELECT 1 FROM fee_configuration
         WHERE vertical = 'BOYS_HOSTEL' AND academic_session = v_session AND fee_head = 'MESS_MONTHLY_FEE'
    );

    -- Girls Ashram
    INSERT INTO fee_configuration (vertical, academic_session, fee_head, amount, frequency, is_refundable, valid_from)
    SELECT 'GIRLS_ASHRAM', v_session, 'MESS_MONTHLY_FEE', 3500.00, 'MONTHLY', false, v_valid_from
    WHERE NOT EXISTS (
        SELECT 1 FROM fee_configuration
         WHERE vertical = 'GIRLS_ASHRAM' AND academic_session = v_session AND fee_head = 'MESS_MONTHLY_FEE'
    );

    -- Dharamshala
    INSERT INTO fee_configuration (vertical, academic_session, fee_head, amount, frequency, is_refundable, valid_from)
    SELECT 'DHARAMSHALA', v_session, 'MESS_MONTHLY_FEE', 3000.00, 'MONTHLY', false, v_valid_from
    WHERE NOT EXISTS (
        SELECT 1 FROM fee_configuration
         WHERE vertical = 'DHARAMSHALA' AND academic_session = v_session AND fee_head = 'MESS_MONTHLY_FEE'
    );
END $$;
