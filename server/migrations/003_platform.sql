-- =============================================================================
-- Platform owner (Meister Solutions) console: operators, client lifecycle, invites
-- =============================================================================

-- People at the platform owner who onboard and manage client companies.
-- Deliberately separate from tenant users: a platform admin never belongs to a tenant.
CREATE TABLE platform_admins (
  id             CHAR(36) NOT NULL PRIMARY KEY,
  email          VARCHAR(160) NOT NULL,
  full_name      VARCHAR(120) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at  DATETIME(3) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_platform_admins_email (email)
) ENGINE=InnoDB;

ALTER TABLE tenants
  ADD COLUMN seat_limit     INT UNSIGNED NULL COMMENT 'max active employees; NULL = unlimited' AFTER plan,
  ADD COLUMN trial_ends_on  DATE NULL AFTER seat_limit,
  ADD COLUMN contact_name   VARCHAR(120) NULL AFTER trial_ends_on,
  ADD COLUMN contact_email  VARCHAR(160) NULL AFTER contact_name,
  ADD COLUMN contact_phone  VARCHAR(40) NULL AFTER contact_email,
  ADD COLUMN notes          VARCHAR(1000) NULL AFTER contact_phone;

ALTER TABLE tenant_settings
  ADD COLUMN employee_code_prefix VARCHAR(16) NULL AFTER primary_color,
  ADD COLUMN setup_completed_at   DATETIME(3) NULL AFTER employee_code_prefix;

-- Existing tenants were set up by hand; don't show them the setup checklist.
UPDATE tenant_settings SET setup_completed_at = CURRENT_TIMESTAMP(3) WHERE setup_completed_at IS NULL;

-- One-time "set your password" links for client admins and employees.
CREATE TABLE user_invites (
  id                     CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id              CHAR(36) NOT NULL,
  user_id                CHAR(36) NOT NULL,
  token_hash             CHAR(64) NOT NULL COMMENT 'SHA-256 of the token; the token itself is never stored',
  expires_at             DATETIME(3) NOT NULL,
  used_at                DATETIME(3) NULL,
  created_by_user_id     CHAR(36) NULL,
  created_by_platform_id CHAR(36) NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_invites_token (token_hash),
  KEY idx_user_invites_user (user_id),
  CONSTRAINT fk_user_invites_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_invites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
