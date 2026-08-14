-- Ahuike hospital database schema
-- Run once against your NeonDB database before starting the server.

CREATE TABLE IF NOT EXISTS patients (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);

CREATE TABLE IF NOT EXISTS departments (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  slug        TEXT        UNIQUE NOT NULL,
  description TEXT        NOT NULL,
  image_url   TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctors (
  id               TEXT        PRIMARY KEY,
  name             TEXT        NOT NULL,
  slug             TEXT        UNIQUE NOT NULL,
  specialty        TEXT        NOT NULL,
  department_id    TEXT        NOT NULL REFERENCES departments(id),
  bio              TEXT        NOT NULL DEFAULT '',
  qualifications   TEXT[]      NOT NULL DEFAULT '{}',
  image_url        TEXT,
  rating           NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count     INTEGER     NOT NULL DEFAULT 0,
  consultation_fee INTEGER     NOT NULL DEFAULT 0,
  is_available     BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointment_slots (
  id         TEXT    PRIMARY KEY,
  doctor_id  TEXT    NOT NULL REFERENCES doctors(id),
  slot_date  DATE    NOT NULL,
  start_time TIME    NOT NULL,
  end_time   TIME    NOT NULL,
  is_booked  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id               TEXT        PRIMARY KEY,
  patient_id       TEXT        NOT NULL,
  doctor_id        TEXT        NOT NULL REFERENCES doctors(id),
  department_id    TEXT        NOT NULL REFERENCES departments(id),
  slot_id          TEXT        NOT NULL REFERENCES appointment_slots(id),
  reason_for_visit TEXT        NOT NULL,
  consultation_fee INTEGER     NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointment_status_events (
  id             TEXT        PRIMARY KEY,
  appointment_id TEXT        NOT NULL REFERENCES appointments(id),
  status         TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Medical Records ───────────────────────────────────────────────────────────
-- One record per clinical encounter; linked to patient and optionally to the
-- appointment and doctor that generated it.
CREATE TABLE IF NOT EXISTS medical_records (
  id             TEXT        PRIMARY KEY,
  patient_id     TEXT        NOT NULL,
  doctor_id      TEXT        REFERENCES doctors(id),
  appointment_id TEXT        REFERENCES appointments(id),
  record_type    TEXT        NOT NULL,          -- e.g. 'diagnosis', 'lab_result', 'imaging'
  title          TEXT        NOT NULL,
  description    TEXT        NOT NULL DEFAULT '',
  diagnosis      TEXT,
  treatment_plan TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Prescriptions ─────────────────────────────────────────────────────────────
-- Each prescription belongs to a patient and is issued by a doctor.
CREATE TABLE IF NOT EXISTS prescriptions (
  id              TEXT        PRIMARY KEY,
  patient_id      TEXT        NOT NULL,
  doctor_id       TEXT        REFERENCES doctors(id),
  appointment_id  TEXT        REFERENCES appointments(id),
  medication_name TEXT        NOT NULL,
  dosage          TEXT        NOT NULL,          -- e.g. "500mg"
  frequency       TEXT        NOT NULL,          -- e.g. "Twice daily"
  duration        TEXT        NOT NULL,          -- e.g. "7 days"
  instructions    TEXT        NOT NULL DEFAULT '',
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doctors_department        ON doctors(department_id);
CREATE INDEX IF NOT EXISTS idx_slots_doctor_date         ON appointment_slots(doctor_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient      ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_slot         ON appointments(slot_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_patient   ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient     ON prescriptions(patient_id);
