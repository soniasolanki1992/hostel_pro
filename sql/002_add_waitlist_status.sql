-- ============================================================================
-- Migration: Add WAITLIST application status
-- Adds a WAITLIST state for applications that are interview-cleared and
-- trustee-approved but cannot yet be allocated a room (no beds available).
-- ============================================================================

-- Add WAITLIST to the application_status enum (positioned before APPROVED).
-- Postgres requires this be done outside a transaction block.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'WAITLIST'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status')
    ) THEN
        ALTER TYPE application_status ADD VALUE 'WAITLIST' BEFORE 'APPROVED';
    END IF;
END$$;

-- Track when an application entered the waitlist (for FIFO ordering).
ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS waitlisted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_applications_waitlisted_at ON applications(waitlisted_at);
