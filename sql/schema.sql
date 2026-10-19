-- =============================================================================
-- HMS Enterprises Attendance Portal — MySQL schema (Chennai HO)
-- Prepared for future backend. App currently uses sessionStorage with the same
-- domain model. Run against MySQL 8.0+.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS hms_attendance
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hms_attendance;

-- -----------------------------------------------------------------------------
-- Company & configuration
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_settings (
  id                    TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  name                  VARCHAR(120) NOT NULL,
  tagline               VARCHAR(160) NULL,
  address               VARCHAR(255) NOT NULL,
  phone                 VARCHAR(80) NOT NULL,
  email                 VARCHAR(120) NOT NULL,
  website               VARCHAR(160) NULL,
  grace_period_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  half_day_threshold_hours DECIMAL(4,2) NOT NULL DEFAULT 4.50,
  overtime_after_hours  DECIMAL(4,2) NOT NULL DEFAULT 9.00,
  require_note_for_early_leave TINYINT(1) NOT NULL DEFAULT 1,
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_company_singleton CHECK (id = 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shifts (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  name            VARCHAR(80) NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  grace_minutes   SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  -- JSON array of weekday numbers: 0=Sun … 6=Sat (default Sunday off)
  weekly_off_json JSON NOT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS holidays (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  holiday_date DATE NOT NULL,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  notes       VARCHAR(255) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_holidays_date_name (holiday_date, name)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- People & auth (auth wired later; password_hash placeholder)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employees (
  id               CHAR(36) NOT NULL PRIMARY KEY,
  employee_code    VARCHAR(32) NOT NULL,
  full_name        VARCHAR(120) NOT NULL,
  email            VARCHAR(160) NOT NULL,
  phone            VARCHAR(32) NULL,
  role             ENUM('admin','manager','employee') NOT NULL DEFAULT 'employee',
  department       ENUM('Sales','Service/Engineering','Warehouse','Admin/Desk','Accounts') NOT NULL,
  branch           ENUM('Chennai') NOT NULL DEFAULT 'Chennai',
  shift_id         CHAR(36) NULL,
  manager_id       CHAR(36) NULL,
  join_date        DATE NOT NULL,
  status           ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  avatar_initials  VARCHAR(4) NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_employees_code (employee_code),
  UNIQUE KEY uq_employees_email (email),
  KEY idx_employees_manager (manager_id),
  KEY idx_employees_dept_status (department, status),
  CONSTRAINT fk_employees_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
  CONSTRAINT fk_employees_manager FOREIGN KEY (manager_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  employee_id     CHAR(36) NOT NULL,
  email           VARCHAR(160) NOT NULL,
  password_hash   VARCHAR(255) NULL COMMENT 'Set when real auth is enabled',
  role            ENUM('admin','manager','employee') NOT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at   DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_employee (employee_id),
  CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Attendance core
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS attendance_records (
  id                    CHAR(36) NOT NULL PRIMARY KEY,
  employee_id           CHAR(36) NOT NULL,
  work_date             DATE NOT NULL,
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
  source                ENUM('punch','regularization','leave','holiday','admin') NOT NULL DEFAULT 'punch',
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_attendance_employee_date (employee_id, work_date),
  KEY idx_attendance_date_status (work_date, status),
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_breaks (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  attendance_id CHAR(36) NOT NULL,
  start_at      DATETIME(3) NOT NULL,
  end_at        DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_breaks_attendance (attendance_id),
  CONSTRAINT fk_breaks_attendance FOREIGN KEY (attendance_id) REFERENCES attendance_records(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Regularization — "I forgot to mark attendance" / punch correction
-- Prefer this over auto-marking absent via scheduled jobs.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS regularization_requests (
  id                   CHAR(36) NOT NULL PRIMARY KEY,
  employee_id          CHAR(36) NOT NULL,
  work_date            DATE NOT NULL,
  request_type         ENUM(
                          'missed_punch',      -- forgot entire day / no punch
                          'missing_clock_in',
                          'missing_clock_out',
                          'wrong_time',
                          'other'
                        ) NOT NULL DEFAULT 'missed_punch',
  proposed_clock_in    DATETIME(3) NULL,
  proposed_clock_out   DATETIME(3) NULL,
  proposed_work_mode   ENUM('Office','Field','WFH') NULL,
  reason               VARCHAR(1000) NOT NULL,
  status               ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  approver_id          CHAR(36) NULL COMMENT 'users.id of approver',
  approver_comment     VARCHAR(500) NULL,
  attendance_id        CHAR(36) NULL COMMENT 'linked record after approval',
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_reg_employee_status (employee_id, status),
  KEY idx_reg_date (work_date),
  CONSTRAINT fk_reg_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_reg_attendance FOREIGN KEY (attendance_id) REFERENCES attendance_records(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- On duty / outdoor duty (field engineers)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS on_duty_requests (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  employee_id       CHAR(36) NOT NULL,
  from_date         DATE NOT NULL,
  to_date           DATE NOT NULL,
  from_time         TIME NULL,
  to_time           TIME NULL,
  location_label    VARCHAR(200) NULL,
  purpose           VARCHAR(1000) NOT NULL,
  status            ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  approver_id       CHAR(36) NULL,
  approver_comment  VARCHAR(500) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_od_employee_status (employee_id, status),
  CONSTRAINT fk_od_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Hourly permission (short exit during shift)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hourly_permissions (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  employee_id       CHAR(36) NOT NULL,
  work_date         DATE NOT NULL,
  from_time         TIME NOT NULL,
  to_time           TIME NOT NULL,
  reason            VARCHAR(500) NOT NULL,
  status            ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  approver_id       CHAR(36) NULL,
  approver_comment  VARCHAR(500) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_hp_employee_date (employee_id, work_date),
  CONSTRAINT fk_hp_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Overtime (computed + optional approval)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS overtime_entries (
  id                CHAR(36) NOT NULL PRIMARY KEY,
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
  CONSTRAINT fk_ot_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_ot_attendance FOREIGN KEY (attendance_id) REFERENCES attendance_records(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Leave
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leave_balances (
  employee_id   CHAR(36) NOT NULL PRIMARY KEY,
  casual_days   DECIMAL(5,1) NOT NULL DEFAULT 0,
  sick_days     DECIMAL(5,1) NOT NULL DEFAULT 0,
  earned_days   DECIMAL(5,1) NOT NULL DEFAULT 0,
  comp_off_days DECIMAL(5,1) NOT NULL DEFAULT 0,
  unpaid_days   DECIMAL(5,1) NOT NULL DEFAULT 0,
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_leave_bal_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leave_requests (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  employee_id       CHAR(36) NOT NULL,
  leave_type        ENUM('Casual','Sick','Earned','Comp-Off','Unpaid') NOT NULL,
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
  KEY idx_leave_employee_status (employee_id, status),
  KEY idx_leave_dates (from_date, to_date),
  CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Notifications & audit (for future real backend)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  user_id     CHAR(36) NOT NULL,
  type        VARCHAR(64) NOT NULL,
  title       VARCHAR(160) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  link        VARCHAR(200) NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notifications_user_read (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id CHAR(36) NULL,
  action       VARCHAR(80) NOT NULL,
  entity_type  VARCHAR(80) NOT NULL,
  entity_id    CHAR(36) NULL,
  payload_json JSON NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Seed company row (optional)
-- -----------------------------------------------------------------------------

INSERT INTO company_settings (
  id, name, tagline, address, phone, email, website
) VALUES (
  1,
  'HMS Enterprises',
  'Attendance Portal',
  '93/4, Jeenis Road, Saidapet, Chennai - 600 015',
  '99529 59595 / 99529 49494',
  'sales@hmsenterprises.in',
  'https://www.hmsenterprises.in'
) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(3);
