-- Admin-configurable short-break and lunch allowances (minutes).
ALTER TABLE tenant_settings
  ADD COLUMN max_break_minutes INT UNSIGNED NOT NULL DEFAULT 20
    AFTER geofence_enabled,
  ADD COLUMN max_lunch_minutes INT UNSIGNED NOT NULL DEFAULT 30
    AFTER max_break_minutes;

-- Distinguish short break vs lunch on each break segment.
ALTER TABLE attendance_breaks
  ADD COLUMN kind ENUM('break', 'lunch') NOT NULL DEFAULT 'break'
    AFTER attendance_id;
