-- ============================================================================
-- Alumni Module Schema
-- Adds: alumni status enum, alumni table, alumni_references, alumni_events,
-- alumni_jobs, plus seeds ported from frontend/src/data/*.json
-- Boys + Girls only (vertical CHECK enforces this).
-- ============================================================================

-- Alumni live in their own table and have a separate JWT auth path; they
-- intentionally do NOT live in `users`. (We avoid touching the user_role enum
-- because the schema's enum types are owned by a privileged role we don't have.)

CREATE TYPE alumni_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Alumni: registration record. Pre-approval rows have user_id NULL.
CREATE TABLE alumni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical vertical_type NOT NULL CHECK (vertical IN ('BOYS_HOSTEL', 'GIRLS_ASHRAM')),
    user_id UUID REFERENCES users(id),

    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    popular_name VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),

    year_of_joining INT,
    year_of_passing INT,
    years_of_stay_from INT,
    years_of_stay_to INT,

    hometown_city VARCHAR(100),
    hometown_state VARCHAR(100),

    current_city VARCHAR(100),
    current_state VARCHAR(100),
    current_country VARCHAR(100),
    current_designation VARCHAR(255),
    current_organisation VARCHAR(255),
    profession VARCHAR(255),
    linkedin_url VARCHAR(500),
    instagram_url VARCHAR(500),

    graduation VARCHAR(255),
    graduation_year INT,
    highest_qualification VARCHAR(255),
    highest_qualification_year INT,

    department VARCHAR(100),
    roll_number VARCHAR(50),
    hostel_name VARCHAR(100),
    room_number VARCHAR(50),

    profile_photo_path VARCHAR(500),
    proof_document_path VARCHAR(500),

    visibility JSONB NOT NULL DEFAULT '{"email":"alumni-only","phone":"private","batch":"alumni-only"}',
    privacy_consent BOOLEAN NOT NULL DEFAULT false,

    status alumni_status NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    rejected_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alumni_vertical_status ON alumni(vertical, status);
CREATE INDEX idx_alumni_email ON alumni(email);
CREATE INDEX idx_alumni_year_of_passing ON alumni(year_of_passing);
CREATE INDEX idx_alumni_user_id ON alumni(user_id);

CREATE TRIGGER trigger_alumni_updated_at BEFORE UPDATE ON alumni
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- References (≥1 mandatory at registration, enforced in API layer)
CREATE TABLE alumni_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumni_id UUID NOT NULL REFERENCES alumni(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    batch VARCHAR(50),
    email VARCHAR(255),
    phone VARCHAR(20),
    relationship VARCHAR(100),
    consent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alumni_references_alumni ON alumni_references(alumni_id);

-- Alumni Events (read-only for now)
CREATE TABLE alumni_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    event_time VARCHAR(20),
    location VARCHAR(255),
    type VARCHAR(20) NOT NULL CHECK (type IN ('reunion','workshop','celebration')),
    status VARCHAR(20) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','past')),
    vertical vertical_type,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alumni_events_status ON alumni_events(status);
CREATE INDEX idx_alumni_events_date ON alumni_events(event_date);

CREATE TRIGGER trigger_alumni_events_updated_at BEFORE UPDATE ON alumni_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Alumni Jobs (read-only for now)
CREATE TABLE alumni_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    type VARCHAR(50),
    salary VARCHAR(100),
    description TEXT,
    posted_by_alumni_id UUID REFERENCES alumni(id),
    posted_by_name VARCHAR(255),
    posted_by_batch VARCHAR(50),
    posted_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','closed')),
    vertical vertical_type,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alumni_jobs_status ON alumni_jobs(status);
CREATE INDEX idx_alumni_jobs_posted_at ON alumni_jobs(posted_at);

CREATE TRIGGER trigger_alumni_jobs_updated_at BEFORE UPDATE ON alumni_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA (ported from frontend/src/data/*.json)
-- ============================================================================

INSERT INTO alumni (vertical, first_name, last_name, email,
    year_of_joining, year_of_passing, years_of_stay_from, years_of_stay_to,
    department, hostel_name, room_number, status, privacy_consent, visibility, approved_at)
VALUES
    ('BOYS_HOSTEL', 'Rahul', 'Jain', 'rahul.jain@example.com',
        2012, 2016, 2012, 2016, 'Commerce', 'Block A', '204',
        'APPROVED', true, '{"email":"alumni-only","phone":"private","batch":"alumni-only"}', NOW()),
    ('GIRLS_ASHRAM', 'Priya', 'Shah', 'priya.shah@example.com',
        2008, 2012, 2008, 2012, 'Arts', 'Block B', '105',
        'APPROVED', true, '{"email":"alumni-only","phone":"alumni-only","batch":"alumni-only"}', NOW()),
    ('BOYS_HOSTEL', 'Amit', 'Mehta', 'amit.mehta@example.com',
        2015, 2019, 2015, 2019, 'Engineering', 'Block C', '312',
        'PENDING', true, '{"email":"private","phone":"private","batch":"alumni-only"}', NULL),
    ('GIRLS_ASHRAM', 'Sneha', 'Patel', 'sneha.patel@example.com',
        2018, 2022, 2018, 2022, 'Science', 'Block A', '208',
        'APPROVED', true, '{"email":"alumni-only","phone":"private","batch":"alumni-only"}', NOW()),
    ('BOYS_HOSTEL', 'Vikram', 'Singh', 'vikram.singh@example.com',
        2005, 2009, 2005, 2009, 'Law', 'Block B', '401',
        'APPROVED', true, '{"email":"alumni-only","phone":"alumni-only","batch":"alumni-only"}', NOW());

-- One reference per seeded alumnus (mandatory rule)
INSERT INTO alumni_references (alumni_id, name, batch, email, phone, relationship, consent)
SELECT a.id, 'Seed Reference', '2010-2014', 'reference@example.com', '9999999999', 'Senior', true
FROM alumni a;

INSERT INTO alumni_events (title, description, event_date, event_time, location, type, status) VALUES
    ('Annual Alumni Reunion 2025', 'Join us for the grand annual reunion celebrating decades of memories and friendship.',
        '2025-03-15', '10:00 AM', 'Boys'' Hostel Campus, Mumbai', 'reunion', 'upcoming'),
    ('Career Mentorship Workshop', 'Senior alumni share career guidance and mentorship with current residents and recent graduates.',
        '2025-02-20', '2:00 PM', 'Virtual (Zoom)', 'workshop', 'upcoming'),
    ('Hostel Foundation Day Celebration', 'Commemorating 105 years of the Boys'' Hostel with cultural programs and felicitation ceremony.',
        '2025-04-10', '5:00 PM', 'Main Auditorium', 'celebration', 'upcoming'),
    ('Batch of 2010 Silver Jubilee', 'Special reunion for the batch of 2010 celebrating 15 years since graduation.',
        '2024-11-25', '6:00 PM', 'Taj Hotel, Mumbai', 'reunion', 'past');

INSERT INTO alumni_jobs (title, company, location, type, salary, description, posted_by_name, posted_by_batch, posted_at, status) VALUES
    ('Software Engineer', 'TechCorp India', 'Mumbai', 'Full-time', '₹8-12 LPA',
        'Looking for passionate software engineers to join our growing team. Experience in React and Node.js preferred.',
        'Rahul Jain', '2012-2016', '2024-12-15', 'active'),
    ('Marketing Manager', 'Global Retail Ltd', 'Bangalore', 'Full-time', '₹15-20 LPA',
        'Seeking experienced marketing professional to lead brand strategy and digital campaigns.',
        'Priya Shah', '2008-2012', '2024-12-10', 'active'),
    ('Chartered Accountant', 'Shah & Associates', 'Mumbai', 'Full-time', '₹10-15 LPA',
        'CA firm looking for qualified Chartered Accountants with 2+ years of experience in audit and taxation.',
        'Vikram Singh', '2005-2009', '2024-12-20', 'active'),
    ('Internship - Finance', 'InvestRight Capital', 'Mumbai', 'Internship', '₹25,000/month',
        '3-month internship opportunity for final year students interested in investment banking.',
        'Sneha Patel', '2018-2022', '2024-12-18', 'active');
