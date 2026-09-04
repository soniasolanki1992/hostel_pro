-- ============================================================================
-- Workflow Statuses: Sequential Sup ↔ Trustee approval pipeline
-- Adds intermediate states used by the new state machine.
-- ============================================================================

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'TRUSTEE_REVIEW';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'SHORTLISTED';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'TRUSTEE_FINAL_REVIEW';
