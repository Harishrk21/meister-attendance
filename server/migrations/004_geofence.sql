-- Tenant-level geofence toggle (branch lat/lng/radius already on branches).
ALTER TABLE tenant_settings
  ADD COLUMN geofence_enabled TINYINT(1) NOT NULL DEFAULT 0
    AFTER require_note_for_early_leave;
