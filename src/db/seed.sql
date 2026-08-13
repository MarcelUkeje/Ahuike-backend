-- Ahuike seed data — run after schema.sql
-- Safe to re-run (ON CONFLICT DO NOTHING).

INSERT INTO departments (id, name, slug, description, is_active) VALUES
  ('dept-general',     'General Practice', 'general-practice', 'Primary healthcare and general consultations for all ages.', true),
  ('dept-cardiology',  'Cardiology',       'cardiology',       'Specialist care for heart and cardiovascular conditions.',   true),
  ('dept-pediatrics',  'Pediatrics',       'pediatrics',       'Healthcare for infants, children, and adolescents.',         true),
  ('dept-orthopedics', 'Orthopedics',      'orthopedics',      'Bone, joint, and musculoskeletal care.',                     true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO doctors
  (id, name, slug, specialty, department_id, bio, qualifications, rating, rating_count, consultation_fee, is_available)
VALUES
  (
    'dr-amaka-obi', 'Dr. Amaka Obi', 'dr-amaka-obi',
    'General Practitioner', 'dept-general',
    'Dr. Amaka Obi is a compassionate GP with over 10 years of experience in primary care.',
    ARRAY['MBBS (University of Lagos)', 'FMCGP'],
    4.80, 312, 15000, true
  ),
  (
    'dr-emeka-nwosu', 'Dr. Emeka Nwosu', 'dr-emeka-nwosu',
    'Cardiologist', 'dept-cardiology',
    'Dr. Emeka Nwosu specialises in interventional cardiology and cardiac rehabilitation.',
    ARRAY['MBBS (UNILAG)', 'FMCP (Cardiology)', 'Fellowship — Lagos Heart Institute'],
    4.90, 187, 25000, true
  ),
  (
    'dr-chioma-eze', 'Dr. Chioma Eze', 'dr-chioma-eze',
    'Pediatrician', 'dept-pediatrics',
    'Dr. Chioma Eze provides compassionate, evidence-based care for children from birth to 18.',
    ARRAY['MBBS (UNIBEN)', 'FMCP (Paediatrics)'],
    4.75, 423, 18000, true
  )
ON CONFLICT (id) DO NOTHING;

-- Appointment slots for the next 3 working days (relative dates)
INSERT INTO appointment_slots (id, doctor_id, slot_date, start_time, end_time, is_booked) VALUES
  ('slot-amaka-001', 'dr-amaka-obi',   CURRENT_DATE + 1, '09:00', '09:30', false),
  ('slot-amaka-002', 'dr-amaka-obi',   CURRENT_DATE + 1, '09:30', '10:00', false),
  ('slot-amaka-003', 'dr-amaka-obi',   CURRENT_DATE + 1, '10:00', '10:30', false),
  ('slot-amaka-004', 'dr-amaka-obi',   CURRENT_DATE + 2, '09:00', '09:30', false),
  ('slot-amaka-005', 'dr-amaka-obi',   CURRENT_DATE + 2, '09:30', '10:00', false),
  ('slot-emeka-001', 'dr-emeka-nwosu', CURRENT_DATE + 1, '14:00', '14:30', false),
  ('slot-emeka-002', 'dr-emeka-nwosu', CURRENT_DATE + 1, '14:30', '15:00', false),
  ('slot-emeka-003', 'dr-emeka-nwosu', CURRENT_DATE + 3, '14:00', '14:30', false),
  ('slot-chioma-001','dr-chioma-eze',  CURRENT_DATE + 1, '11:00', '11:30', false),
  ('slot-chioma-002','dr-chioma-eze',  CURRENT_DATE + 2, '11:00', '11:30', false)
ON CONFLICT (id) DO NOTHING;
