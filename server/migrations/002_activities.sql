-- What the person is working on when they clock in (Jibble-style activities)
ALTER TABLE attendance_records ADD COLUMN activity VARCHAR(80) NULL AFTER work_mode;

-- Tenant-managed list of activities offered at clock-in; NULL means use the app defaults
ALTER TABLE tenant_settings ADD COLUMN activities_json JSON NULL AFTER require_note_for_early_leave;
