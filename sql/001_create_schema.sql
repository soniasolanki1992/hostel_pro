-- ============================================================================
-- Hostel Management Application - Database Schema
-- Target: PostgreSQL 18.3 at 51.68.196.242:5432/hostel_pro_new
-- Generated: 2026-03-31
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM ('STUDENT', 'SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS', 'PARENT');
CREATE TYPE vertical_type AS ENUM ('BOYS_HOSTEL', 'GIRLS_ASHRAM', 'DHARAMSHALA');
CREATE TYPE application_status AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEW', 'TRUSTEE_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'TRUSTEE_FINAL_REVIEW', 'WAITLIST', 'APPROVED', 'REJECTED', 'ARCHIVED');
CREATE TYPE document_status AS ENUM ('PENDING', 'UPLOADED', 'VERIFIED', 'REJECTED');
CREATE TYPE interview_mode AS ENUM ('IN_PERSON', 'ZOOM', 'GOOGLE_MEET', 'WHATSAPP_VIDEO', 'PHONE_CALL');
CREATE TYPE interview_status AS ENUM ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');
CREATE TYPE room_status AS ENUM ('AVAILABLE', 'PARTIAL', 'FULL', 'MAINTENANCE', 'CLOSED');
CREATE TYPE allocation_status AS ENUM ('ACTIVE', 'VACATED', 'TRANSFERRED');
CREATE TYPE fee_status AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED');
CREATE TYPE payment_method AS ENUM ('UPI', 'BANK_TRANSFER', 'CARD', 'CASH', 'CHEQUE', 'QR_CODE', 'ONLINE');
CREATE TYPE transaction_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');
CREATE TYPE leave_type_enum AS ENUM ('SHORT_LEAVE', 'NIGHT_OUT', 'MULTI_DAY', 'HOME_VISIT', 'MEDICAL', 'EMERGENCY', 'EXTENDED');
CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE renewal_status AS ENUM ('PENDING', 'RENEWED', 'EXPIRED', 'EXTENDED');
CREATE TYPE exit_reason AS ENUM ('GRADUATION', 'DISCIPLINE', 'FINANCIAL', 'MEDICAL', 'PERSONAL', 'FAMILY_CIRCUMSTANCES', 'OTHER');
CREATE TYPE clearance_item_type AS ENUM ('ROOM_CLEARED', 'KEY_RETURNED', 'ID_CARD_RETURNED', 'BOOKS_RETURNED', 'FEES_SETTLED', 'PROPERTY_CHECKED', 'NO_DUE_CERTIFICATE');
CREATE TYPE comm_channel AS ENUM ('SMS', 'WHATSAPP', 'EMAIL', 'PUSH_NOTIFICATION');
CREATE TYPE comm_purpose AS ENUM ('INTERVIEW_INVITE', 'APPROVAL_NOTIFICATION', 'REJECTION_NOTIFICATION', 'FEE_REMINDER', 'PAYMENT_CONFIRMATION', 'LEAVE_NOTIFICATION', 'RENEWAL_REMINDER', 'EXIT_NOTIFICATION', 'EMERGENCY_ALERT', 'OTHER');
CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'APPROVAL', 'REJECTION', 'DOCUMENT_VERIFY', 'COMMUNICATION_SEND', 'FILE_UPLOAD', 'FILE_DELETE', 'LOGIN', 'LOGOUT');
CREATE TYPE consent_type AS ENUM ('RULES_ACCEPTANCE', 'TERMS_CONDITIONS', 'PRIVACY_POLICY', 'DATA_PROCESSING', 'PARENT_AUTHORIZATION', 'DISCIPLINE_ACKNOWLEDGEMENT', 'RENEWAL_CONSENT');

-- ============================================================================
-- IDENTITY & AUTH TABLES
-- ============================================================================

-- Users: All roles (students, staff, parents, admin)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    mobile VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    vertical vertical_type,
    date_of_birth DATE,
    is_active BOOLEAN DEFAULT true,
    profile_data JSONB,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_mobile ON users(mobile);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_vertical ON users(vertical);

-- Sessions: Active login sessions (replaces Supabase Auth sessions)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- OTP Verifications: Phone/email OTP codes (replaces Supabase Auth OTP)
CREATE TABLE otp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    attempts INT DEFAULT 0,
    verified BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_otp_identifier ON otp_verifications(identifier);
CREATE INDEX idx_otp_purpose ON otp_verifications(purpose);
CREATE INDEX idx_otp_expires_at ON otp_verifications(expires_at);

-- ============================================================================
-- APPLICATION & ADMISSIONS TABLES
-- ============================================================================

-- Applications: Core admission entity (Guest-first architecture)
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_number VARCHAR(20) UNIQUE NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'NEW',
    vertical vertical_type NOT NULL,
    applicant_mobile VARCHAR(20) NOT NULL,
    applicant_email VARCHAR(255),
    applicant_name VARCHAR(255) NOT NULL,
    student_user_id UUID REFERENCES users(id),
    parent_application_id UUID REFERENCES applications(id),
    current_status application_status NOT NULL DEFAULT 'DRAFT',
    data JSONB NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    waitlisted_at TIMESTAMPTZ,
    payment_status VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_applications_tracking ON applications(tracking_number);
CREATE INDEX idx_applications_vertical ON applications(vertical);
CREATE INDEX idx_applications_status ON applications(current_status);
CREATE INDEX idx_applications_mobile ON applications(applicant_mobile);
CREATE INDEX idx_applications_student ON applications(student_user_id);

-- Documents: File metadata for all uploaded documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    student_user_id UUID REFERENCES users(id),
    document_type VARCHAR(50) NOT NULL,
    category VARCHAR(20) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT,
    mime_type VARCHAR(100),
    verification_status document_status DEFAULT 'PENDING',
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_documents_application ON documents(application_id);
CREATE INDEX idx_documents_student ON documents(student_user_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_verification ON documents(verification_status);

-- Interviews: Scheduling and evaluation
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID UNIQUE NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    trustee_id UUID NOT NULL REFERENCES users(id),
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    mode interview_mode NOT NULL,
    location_or_link VARCHAR(500),
    duration_minutes INT DEFAULT 30,
    status interview_status DEFAULT 'SCHEDULED',
    score DECIMAL(3,2),
    evaluation JSONB,
    recommendation VARCHAR(20),
    internal_remarks TEXT,
    reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_interviews_application ON interviews(application_id);
CREATE INDEX idx_interviews_trustee ON interviews(trustee_id);
CREATE INDEX idx_interviews_date ON interviews(scheduled_date);
CREATE INDEX idx_interviews_status ON interviews(status);

-- ============================================================================
-- STAY & OPERATIONS TABLES
-- ============================================================================

-- Rooms: Hostel room inventory
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_number VARCHAR(20) NOT NULL,
    vertical vertical_type NOT NULL,
    floor INT NOT NULL,
    building VARCHAR(50),
    capacity INT NOT NULL,
    occupied_count INT DEFAULT 0,
    room_type VARCHAR(20),
    amenities JSONB,
    status room_status DEFAULT 'AVAILABLE',
    rent_per_head DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rooms_vertical ON rooms(vertical);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_number ON rooms(room_number);

-- Room Allocations: Who lives where (historical tracking)
CREATE TABLE room_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id),
    room_id UUID NOT NULL REFERENCES rooms(id),
    status allocation_status DEFAULT 'ACTIVE',
    allocated_at TIMESTAMPTZ DEFAULT NOW(),
    vacated_at TIMESTAMPTZ,
    check_in_confirmed BOOLEAN DEFAULT false,
    check_in_confirmed_at TIMESTAMPTZ,
    check_in_inventory JSONB,
    allocation_reason VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_allocations_student ON room_allocations(student_id);
CREATE INDEX idx_allocations_room ON room_allocations(room_id);
CREATE INDEX idx_allocations_status ON room_allocations(status);

-- Leave Requests: Leave management with governance
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id),
    leave_type leave_type_enum NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    destination VARCHAR(255),
    emergency_contact VARCHAR(20),
    is_emergency BOOLEAN DEFAULT false,
    status leave_status DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    approval_remarks TEXT,
    parent_notified_at TIMESTAMPTZ,
    checkout_at TIMESTAMPTZ,
    return_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_leaves_student ON leave_requests(student_id);
CREATE INDEX idx_leaves_status ON leave_requests(status);
CREATE INDEX idx_leaves_start ON leave_requests(start_time);
CREATE INDEX idx_leaves_emergency ON leave_requests(is_emergency);

-- Leave Types: Configurable leave rules
CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    code leave_type_enum NOT NULL,
    requires_approval BOOLEAN DEFAULT true,
    max_days INT,
    parent_notification VARCHAR(20) DEFAULT 'ON_APPROVAL',
    is_active BOOLEAN DEFAULT true,
    vertical vertical_type,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_leave_types_code ON leave_types(code);
CREATE INDEX idx_leave_types_active ON leave_types(is_active);

-- Blackout Dates: No-leave periods
CREATE TABLE blackout_dates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    vertical vertical_type,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_blackout_dates ON blackout_dates(start_date, end_date);
CREATE INDEX idx_blackout_vertical ON blackout_dates(vertical);

-- ============================================================================
-- FINANCIAL TABLES
-- ============================================================================

-- Fees: Fee structure and tracking (multi-head accounting)
CREATE TABLE fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES users(id),
    application_id UUID REFERENCES applications(id),
    fee_head VARCHAR(50) NOT NULL,
    description TEXT,
    academic_session VARCHAR(20),
    amount DECIMAL(10,2) NOT NULL,
    paid_amount DECIMAL(10,2) DEFAULT 0,
    fine_applied DECIMAL(10,2) DEFAULT 0,
    status fee_status DEFAULT 'PENDING',
    due_date DATE,
    payment_method payment_method,
    paid_at TIMESTAMPTZ,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fees_student ON fees(student_id);
CREATE INDEX idx_fees_application ON fees(application_id);
CREATE INDEX idx_fees_head ON fees(fee_head);
CREATE INDEX idx_fees_status ON fees(status);
CREATE INDEX idx_fees_due_date ON fees(due_date);

-- Transactions: Payment records (audit trail)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_id UUID NOT NULL REFERENCES fees(id),
    amount DECIMAL(10,2) NOT NULL,
    payment_method payment_method NOT NULL,
    transaction_ref VARCHAR(100) UNIQUE,
    gateway_response JSONB,
    status transaction_status DEFAULT 'PENDING',
    payment_notes TEXT,
    processed_by UUID REFERENCES users(id),
    receipt_number VARCHAR(50),
    receipt_path VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_transactions_fee ON transactions(fee_id);
CREATE INDEX idx_transactions_ref ON transactions(transaction_ref);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at);

-- Fee Configuration: Dynamic fee structure per vertical/session
CREATE TABLE fee_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical vertical_type,
    academic_session VARCHAR(20) NOT NULL,
    fee_head VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    is_refundable BOOLEAN DEFAULT false,
    valid_from DATE NOT NULL,
    valid_until DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RENEWALS & EXIT TABLES
-- ============================================================================

-- Renewals: 6-month renewal cycle management
CREATE TABLE renewals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id),
    application_id UUID REFERENCES applications(id),
    renewal_period VARCHAR(20) NOT NULL,
    due_date DATE NOT NULL,
    status renewal_status DEFAULT 'PENDING',
    documents_updated BOOLEAN DEFAULT false,
    fees_paid BOOLEAN DEFAULT false,
    consent_signed_at TIMESTAMPTZ,
    renewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_renewals_student ON renewals(student_id);
CREATE INDEX idx_renewals_period ON renewals(renewal_period);
CREATE INDEX idx_renewals_status ON renewals(status);
CREATE INDEX idx_renewals_due_date ON renewals(due_date);

-- Exit Requests: Student departure tracking
CREATE TABLE exit_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id),
    reason exit_reason NOT NULL,
    reason_details TEXT,
    requested_date DATE NOT NULL,
    actual_exit_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id),
    clearance_status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_exit_student ON exit_requests(student_id);
CREATE INDEX idx_exit_status ON exit_requests(status);

-- Exit Clearance Items: Departure checklist
CREATE TABLE exit_clearance_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exit_request_id UUID NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
    item_type clearance_item_type NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    remarks TEXT
);
CREATE INDEX idx_clearance_exit ON exit_clearance_items(exit_request_id);

-- ============================================================================
-- COMMUNICATION TABLES
-- ============================================================================

-- Communications: Immutable message log
CREATE TABLE communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES users(id),
    recipient_contact VARCHAR(255) NOT NULL,
    channel comm_channel NOT NULL,
    purpose comm_purpose NOT NULL,
    subject VARCHAR(255),
    message_body TEXT NOT NULL,
    related_entity_type VARCHAR(50),
    related_entity_id UUID,
    sent_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'PENDING',
    external_message_id VARCHAR(100),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comm_recipient ON communications(recipient_id);
CREATE INDEX idx_comm_purpose ON communications(purpose);
CREATE INDEX idx_comm_entity ON communications(related_entity_id);
CREATE INDEX idx_comm_created ON communications(created_at);

-- Notification Rules: Admin-configurable triggers
CREATE TABLE notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    recipient_type VARCHAR(20) NOT NULL,
    channels JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    vertical vertical_type,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUDIT & COMPLIANCE TABLES
-- ============================================================================

-- Audit Logs: Immutable event history (INSERT-ONLY)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action audit_action NOT NULL,
    old_value JSONB,
    new_value JSONB,
    performed_by UUID REFERENCES users(id),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    performed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_performed_at ON audit_logs(performed_at);
CREATE INDEX idx_audit_performed_by ON audit_logs(performed_by);

-- Prevent UPDATE and DELETE on audit_logs
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- Consent Logs: DPDP Act compliance (digital fingerprints)
CREATE TABLE consent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    application_id UUID REFERENCES applications(id),
    consent_type consent_type NOT NULL,
    consent_version VARCHAR(20) NOT NULL,
    accepted BOOLEAN NOT NULL,
    digital_fingerprint VARCHAR(255),
    ip_address VARCHAR(45),
    valid_until TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_consent_user ON consent_logs(user_id);
CREATE INDEX idx_consent_application ON consent_logs(application_id);
CREATE INDEX idx_consent_type ON consent_logs(consent_type);

-- ============================================================================
-- CONFIGURATION TABLES
-- ============================================================================

-- Verticals: Hostel division configuration
CREATE TABLE verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code vertical_type UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    superintendent_id UUID REFERENCES users(id),
    max_capacity INT,
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

-- System Settings: Global key-value configuration
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUTO-UPDATE TRIGGER FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_interviews_updated_at BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_leave_requests_updated_at BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_fees_updated_at BEFORE UPDATE ON fees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_renewals_updated_at BEFORE UPDATE ON renewals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_exit_requests_updated_at BEFORE UPDATE ON exit_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_notification_rules_updated_at BEFORE UPDATE ON notification_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Verticals
INSERT INTO verticals (code, display_name, description) VALUES
    ('BOYS_HOSTEL', 'Boys Hostel', 'Seth Hirachand Gumanji Boys'' Hostel'),
    ('GIRLS_ASHRAM', 'Girls Ashram', 'Seth Hirachand Gumanji Girls'' Hostel'),
    ('DHARAMSHALA', 'Dharamshala', 'Hirachand Gumanji Dharamshala');

-- Leave Types
INSERT INTO leave_types (name, code, requires_approval, max_days, parent_notification) VALUES
    ('Short Leave', 'SHORT_LEAVE', false, 1, 'NEVER'),
    ('Night Out', 'NIGHT_OUT', true, 1, 'ON_APPROVAL'),
    ('Multi-Day Leave', 'MULTI_DAY', true, 7, 'ON_APPROVAL'),
    ('Home Visit', 'HOME_VISIT', true, 30, 'ALWAYS'),
    ('Medical Leave', 'MEDICAL', true, 15, 'ALWAYS'),
    ('Emergency Leave', 'EMERGENCY', true, 3, 'ALWAYS'),
    ('Extended Leave', 'EXTENDED', true, 90, 'ALWAYS');

-- System Settings
INSERT INTO system_settings (key, value, description) VALUES
    ('renewal_reminder_days', '30,15,7', 'Days before renewal deadline to send reminders'),
    ('fee_due_reminder_days', '15,7,3,0', 'Days before fee due date to send reminders'),
    ('otp_expiry_minutes', '5', 'OTP validity duration in minutes'),
    ('max_otp_attempts', '3', 'Maximum OTP verification attempts'),
    ('session_expiry_hours', '24', 'Login session duration in hours'),
    ('tracking_number_prefix_boys', 'BH', 'Tracking number prefix for Boys Hostel'),
    ('tracking_number_prefix_girls', 'GA', 'Tracking number prefix for Girls Ashram'),
    ('tracking_number_prefix_dharamshala', 'DH', 'Tracking number prefix for Dharamshala');

-- Fee Configuration (2025-2026 session)
INSERT INTO fee_configuration (vertical, academic_session, fee_head, amount, frequency, is_refundable, valid_from) VALUES
    (NULL, '2025-2026', 'PROCESSING_FEE', 500.00, 'ONE_TIME', false, '2025-04-01'),
    ('BOYS_HOSTEL', '2025-2026', 'HOSTEL_FEES', 30000.00, 'SEMESTER', false, '2025-04-01'),
    ('BOYS_HOSTEL', '2025-2026', 'SECURITY_DEPOSIT', 5000.00, 'ONE_TIME', true, '2025-04-01'),
    ('BOYS_HOSTEL', '2025-2026', 'KEY_DEPOSIT', 500.00, 'ONE_TIME', true, '2025-04-01'),
    ('BOYS_HOSTEL', '2025-2026', 'MESS_ADVANCE', 10000.00, 'SEMESTER', false, '2025-04-01'),
    ('GIRLS_ASHRAM', '2025-2026', 'HOSTEL_FEES', 25000.00, 'SEMESTER', false, '2025-04-01'),
    ('GIRLS_ASHRAM', '2025-2026', 'SECURITY_DEPOSIT', 5000.00, 'ONE_TIME', true, '2025-04-01'),
    ('GIRLS_ASHRAM', '2025-2026', 'KEY_DEPOSIT', 500.00, 'ONE_TIME', true, '2025-04-01'),
    ('GIRLS_ASHRAM', '2025-2026', 'MESS_ADVANCE', 10000.00, 'SEMESTER', false, '2025-04-01'),
    ('DHARAMSHALA', '2025-2026', 'HOSTEL_FEES', 500.00, 'ONE_TIME', false, '2025-04-01');
