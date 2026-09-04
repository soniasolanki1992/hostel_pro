-- Migration 007: Add missing password-management columns on users.
-- API routes (admin reset, login, first-time-setup, change-password,
-- reset-password, applications APPROVE flow) reference these columns
-- but they were never added to the schema.

ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
