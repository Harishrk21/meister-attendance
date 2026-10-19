-- =============================================================================
-- Attendance Platform — multi-tenant schema (MySQL 8.0+)
-- Every business table carries tenant_id; the API scopes every query by it.
-- All DATETIME columns are stored in UTC. DATE columns are tenant-local dates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tenants (one row per onboarded company)
-- -----------------------------------------------------------------------------

CREATE TABLE tenants (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  slug        VARCHAR(64) NOT NULL,
  name        VARCHAR(160) NOT NULL,
  status      ENUM('trial','active','suspended') NOT NULL DEFAULT 'trial',
  plan        VARCHAR(32) NOT NULL DEFAULT 'starter',
  timezone    VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tenants_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE tenant_settings (
  tenant_id                     CHAR(36) NOT NULL PRIMARY KEY,
  display_name                  VARCHAR(160) NOT NULL,
  tagline                       VARCHAR(160) NULL,
  address                       VARCHAR(255) NULL,
  phone                         VARCHAR(80) NULL,
  email                         VARCHAR(160) NULL,
  website                       VARCHAR(200) NULL,
  logo_url                      VARCHAR(500) NULL,
  primary_color                 VARCHAR(16) NULL,
  grace_period_minutes          SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  half_day_threshold_hours      DECIMAL(4,2) NOT NULL DEFAULT 4.50,
  overtime_after_hours          DECIMAL(4,2) NOT NULL DEFAULT 9.00,
  require_note_for_early_leave  TINYINT(1) NOT NULL DEFAULT 1,
  updated_at                    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Organisation structure
-- -----------------------------------------------------------------------------

CREATE TABLE branches (
  id                    CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id             CHAR(36) NOT NULL,
  name                  VARCHAR(120) NOT NULL,
  address               VARCHAR(255) NULL,
  geofence_lat          DECIMAL(10,7) NULL,
  geofence_lng          DECIMAL(10,7) NULL,
  geofence_radius_m     INT UNSIGNED NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_branches_tenant_name (tenant_id, name),
  CONSTRAINT fk_branches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE departments (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id   CHAR(36) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_departments_tenant_name (tenant_id, name),
  CONSTRAINT fk_departments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE shifts (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id       CHAR(36) NOT NULL,
  name            VARCHAR(80) NOT NULL,
  start_time      CHAR(5) NOT NULL COMMENT 'HH:mm tenant-local',
  end_time        CHAR(5) NOT NULL COMMENT 'HH:mm tenant-local',
  grace_minutes   SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  weekly_off_json JSON NOT NULL COMMENT 'weekday numbers, 0 = Sunday',
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_shifts_tenant (tenant_id),
  CONSTRAINT fk_shifts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE holidays (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id       CHAR(36) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  holiday_date    DATE NOT NULL,
  applies_to_all  TINYINT(1) NOT NULL DEFAULT 1,
  is_recurring    TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_holidays_tenant_date (tenant_id, holiday_date),
  CONSTRAINT fk_holidays_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE holiday_branches (
  holiday_id  CHAR(36) NOT NULL,
  branch_id   CHAR(36) NOT NULL,
  PRIMARY KEY (holiday_id, branch_id),
  CONSTRAINT fk_hb_holiday FOREIGN KEY (holiday_id) REFERENCES holidays(id) ON DELETE CASCADE,
  CONSTRAINT fk_hb_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- People & auth
-- -----------------------------------------------------------------------------

CREATE TABLE employees (
  id               CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id        CHAR(36) NOT NULL,
  employee_code    VARCHAR(32) NOT NULL,
  external_ref     VARCHAR(120) NULL COMMENT 'ID of this person in the host ERP',
  full_name        VARCHAR(120) NOT NULL,
  email            VARCHAR(160) NOT NULL,
  phone            VARCHAR(32) NULL,
  role             ENUM('admin','manager','employee') NOT NULL DEFAULT 'employee',
  department_id    CHAR(36) NULL,
  branch_id        CHAR(36) NULL,
  shift_id         CHAR(36) NULL,
  manager_id       CHAR(36) NULL,
  join_date        DATE NOT NULL,
  status           ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  avatar_initials  VARCHAR(4) NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_employees_tenant_code (tenant_id, employee_code),
  UNIQUE KEY uq_employees_tenant_email (tenant_id, email),
  KEY idx_employees_tenant_external (tenant_id, external_ref),
  KEY idx_employees_tenant_status (tenant_id, status),
  CONSTRAINT fk_employees_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_employees_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_employees_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
  CONSTRAINT fk_employees_manager FOREIGN KEY (manager_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE users (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id       CHAR(36) NOT NULL,
  employee_id     CHAR(36) NOT NULL,
  email           VARCHAR(160) NOT NULL,
  password_hash   VARCHAR(255) NULL COMMENT 'NULL for SSO-only users',
  role            ENUM('admin','manager','employee') NOT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at   DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_tenant_email (tenant_id, email),
  UNIQUE KEY uq_users_employee (employee_id),
  KEY idx_users_email (email),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Attendance
-- -----------------------------------------------------------------------------

CREATE TABLE attendance_records (
  id                    CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id             CHAR(36) NOT NULL,
  employee_id           CHAR(36) NOT NULL,
  work_date             DATE NOT NULL,
  branch_id             CHAR(36) NULL,
  clock_in_at           DATETIME(3) NULL,
  clock_out_at          DATETIME(3) NULL,
  total_work_minutes    INT NOT NULL DEFAULT 0,
  total_break_minutes   INT NOT NULL DEFAULT 0,
  status                ENUM('Present','Late','Absent','Half-Day','On Leave','Holiday') NOT NULL,
  work_mode             ENUM('Office','Field','WFH') NULL,
  location_lat          DECIMAL(10,7) NULL,
  location_lng          DECIMAL(10,7) NULL,
  location_captured_at  DATETIME(3) NULL,
  notes                 VARCHAR(500) NULL,
  early_leave_note      VARCHAR(500) NULL,
  is_on_break           TINYINT(1) NOT NULL DEFAULT 0,
  source                ENUM('punch','regularization','leave','holiday','admin','import') NOT NULL DEFAULT 'punch',
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_attendance_employee_date (employee_id, work_date),
  KEY idx_attendance_tenant_date (tenant_id, work_date, status),
  CONSTRAINT fk_attendance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;

CREATE TABLE attendance_breaks (
  id             CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id      CHAR(36) NOT NULL,
  attendance_id  CHAR(36) NOT NULL,
  start_at       DATETIME(3) NOT NULL,
  end_at         DATETIME(3) NULL,
  KEY idx_breaks_attendance (attendance_id),
  CONSTRAINT fk_breaks_attendance FOREIGN KEY (attendance_id) REFERENCES attendance_records(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Requests: regularization, on duty, hourly permission, overtime
-- -----------------------------------------------------------------------------

CREATE TABLE regularization_requests (
  id                  CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id           CHAR(36) NOT NULL,
  employee_id         CHAR(36) NOT NULL,
  work_date           DATE NOT NULL,
  request_type        ENUM('missed_punch','missing_clock_in','missing_clock_out','wrong_time','other') NOT NULL,
  proposed_clock_in   DATETIME(3) NULL,
  proposed_clock_out  DATETIME(3) NULL,
  proposed_work_mode  ENUM('Office','Field','WFH') NULL,
  reason              VARCHAR(1000) NOT NULL,
  status              ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  approver_id         CHAR(36) NULL,
  approver_comment    VARCHAR(500) NULL,
  attendance_id       CHAR(36) NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_reg_tenant_status (tenant_id, status),
  KEY idx_reg_employee_date (employee_id, work_date),
  CONSTRAINT fk_reg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_attendance FOREIGN KEY (attendance_id) REFERENCES attendance_records(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE on_duty_requests (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id         CHAR(36) NOT NULL,
  employee_id       CHAR(36) NOT NULL,
  from_date         DATE NOT NULL,
  to_date           DATE NOT NULL,
  location_label    VARCHAR(200) NULL,
  purpose           VARCHAR(1000) NOT NULL,
  status            ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  approver_id       CHAR(36) NULL,
  approver_comment  VARCHAR(500) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_od_tenant_status (tenant_id, status),
  CONSTRAINT fk_od_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_od_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE hourly_permissions (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id         CHAR(36) NOT NULL,
  employee_id       CHAR(36) NOT NULL,
  work_date         DATE NOT NULL,
  from_time         CHAR(5) NOT NULL,
  to_time           CHAR(5) NOT NULL,
  reason            VARCHAR(500) NOT NULL,
  status            ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  approver_id       CHAR(36) NULL,
  approver_comment  VARCHAR(500) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_hp_tenant_date (tenant_id, work_date),
  CONSTRAINT fk_hp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_hp_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE overtime_entries (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id         CHAR(36) NOT NULL,
  employee_id       CHAR(36) NOT NULL,
  work_date         DATE NOT NULL,
  attendance_id     CHAR(36) NULL,
  overtime_minutes  INT NOT NULL DEFAULT 0,
  status            ENUM('Draft','Pending','Approved','Rejected') NOT NULL DEFAULT 'Draft',
  notes             VARCHAR(500) NULL,
  approver_id       CHAR(36) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ot_employee_date (employee_id, work_date),
  CONSTRAINT fk_ot_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ot_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_ot_attendance FOREIGN KEY (attendance_id) REFERENCES attendance_records(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Leave (leave types are configurable per tenant)
-- -----------------------------------------------------------------------------

CREATE TABLE leave_types (
  tenant_id     CHAR(36) NOT NULL,
  code          VARCHAR(32) NOT NULL,
  name          VARCHAR(80) NOT NULL,
  annual_quota  DECIMAL(5,1) NOT NULL DEFAULT 0,
  is_paid       TINYINT(1) NOT NULL DEFAULT 1,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, code),
  CONSTRAINT fk_leave_types_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE leave_balances (
  tenant_id        CHAR(36) NOT NULL,
  employee_id      CHAR(36) NOT NULL,
  leave_type_code  VARCHAR(32) NOT NULL,
  balance_days     DECIMAL(5,1) NOT NULL DEFAULT 0,
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (employee_id, leave_type_code),
  KEY idx_leave_bal_tenant (tenant_id),
  CONSTRAINT fk_leave_bal_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_bal_type FOREIGN KEY (tenant_id, leave_type_code) REFERENCES leave_types(tenant_id, code)
) ENGINE=InnoDB;

CREATE TABLE leave_requests (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id         CHAR(36) NOT NULL,
  employee_id       CHAR(36) NOT NULL,
  leave_type_code   VARCHAR(32) NOT NULL,
  from_date         DATE NOT NULL,
  to_date           DATE NOT NULL,
  half_day          TINYINT(1) NOT NULL DEFAULT 0,
  half_day_period   ENUM('AM','PM') NULL,
  days              DECIMAL(5,1) NOT NULL,
  reason            VARCHAR(1000) NOT NULL,
  attachment_note   VARCHAR(500) NULL,
  status            ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  approver_id       CHAR(36) NULL,
  approver_comment  VARCHAR(500) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_leave_tenant_status (tenant_id, status),
  KEY idx_leave_employee_dates (employee_id, from_date, to_date),
  CONSTRAINT fk_leave_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_type FOREIGN KEY (tenant_id, leave_type_code) REFERENCES leave_types(tenant_id, code)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Notifications & audit
-- -----------------------------------------------------------------------------

CREATE TABLE notifications (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id   CHAR(36) NOT NULL,
  user_id     CHAR(36) NOT NULL,
  type        VARCHAR(64) NOT NULL,
  title       VARCHAR(160) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  link        VARCHAR(200) NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notifications_user (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id      CHAR(36) NULL,
  actor_user_id  CHAR(36) NULL,
  action         VARCHAR(80) NOT NULL,
  entity_type    VARCHAR(80) NOT NULL,
  entity_id      CHAR(36) NULL,
  payload_json   JSON NULL,
  ip_address     VARCHAR(64) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_tenant_created (tenant_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Integration layer: SSO, API keys, webhooks
-- -----------------------------------------------------------------------------

CREATE TABLE sso_configs (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id         CHAR(36) NOT NULL,
  provider          ENUM('jwt_ticket','oidc','saml') NOT NULL DEFAULT 'jwt_ticket',
  issuer            VARCHAR(200) NOT NULL COMMENT 'iss claim the host system signs with',
  shared_secret     VARCHAR(255) NULL COMMENT 'HS256 secret for jwt_ticket',
  public_key_pem    TEXT NULL COMMENT 'RS256/ES256 public key for jwt_ticket',
  auto_provision    TINYINT(1) NOT NULL DEFAULT 1,
  sync_role         TINYINT(1) NOT NULL DEFAULT 0,
  default_role      ENUM('admin','manager','employee') NOT NULL DEFAULT 'employee',
  allowed_origins   JSON NULL COMMENT 'origins allowed to embed the app',
  is_enabled        TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sso_issuer (issuer),
  KEY idx_sso_tenant (tenant_id),
  CONSTRAINT fk_sso_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE sso_ticket_uses (
  tenant_id   CHAR(36) NOT NULL,
  jti         VARCHAR(128) NOT NULL,
  used_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (tenant_id, jti),
  KEY idx_sso_uses_expires (expires_at),
  CONSTRAINT fk_sso_uses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE api_keys (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id     CHAR(36) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  key_prefix    VARCHAR(16) NOT NULL,
  key_hash      CHAR(64) NOT NULL COMMENT 'SHA-256 of the full key',
  scopes_json   JSON NOT NULL,
  last_used_at  DATETIME(3) NULL,
  revoked_at    DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_api_keys_hash (key_hash),
  KEY idx_api_keys_tenant (tenant_id),
  CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE webhook_endpoints (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id    CHAR(36) NOT NULL,
  url          VARCHAR(500) NOT NULL,
  secret       VARCHAR(255) NOT NULL COMMENT 'used to sign payloads (HMAC-SHA256)',
  events_json  JSON NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_webhooks_tenant (tenant_id),
  CONSTRAINT fk_webhooks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE webhook_deliveries (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id      CHAR(36) NOT NULL,
  endpoint_id    CHAR(36) NOT NULL,
  event          VARCHAR(80) NOT NULL,
  payload_json   JSON NOT NULL,
  status         ENUM('pending','delivered','failed') NOT NULL DEFAULT 'pending',
  attempts       INT NOT NULL DEFAULT 0,
  response_code  INT NULL,
  next_retry_at  DATETIME(3) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_deliveries_status (status, next_retry_at),
  CONSTRAINT fk_deliveries_endpoint FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE
) ENGINE=InnoDB;
