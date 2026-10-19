import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvValue(filePath, key) {
  const text = readFileSync(filePath, "utf8");
  const line = text.split("\n").find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in ${filePath}`);
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

const hmsUri = loadEnvValue(
  resolve(__dirname, "../../../nova_crm/backend/.env"),
  "DATABASE_URL",
);
const attUri = process.env.ATT_DATABASE_URL;
if (!attUri) {
  throw new Error("Set ATT_DATABASE_URL to the Attendance MySQL connection string");
}

function mapRole(code) {
  if (code === "ADMIN") return "admin";
  if (code === "MANAGER") return "manager";
  return "employee";
}

async function main() {
  const hms = await mysql.createConnection({ uri: hmsUri });
  const att = await mysql.createConnection({ uri: attUri });

  const [tenants] = await hms.query(
    "SELECT id FROM tenants WHERE slug=? AND deleted_at IS NULL LIMIT 1",
    ["precision-scales-india"],
  );
  if (!tenants.length) throw new Error("HMS tenant not found");
  const tenantId = tenants[0].id;

  const [roles] = await hms.query(
    "SELECT id, code FROM roles WHERE tenant_id=? AND deleted_at IS NULL",
    [tenantId],
  );
  const [users] = await hms.query(
    "SELECT id, name, email, role_id FROM users WHERE tenant_id=? AND deleted_at IS NULL AND status='ACTIVE'",
    [tenantId],
  );

  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r.code]));
  console.log(
    "HMS users:",
    users.map((u) => `${u.email}=${u.name}`).join(", "),
  );

  const [attTenants] = await att.query(
    "SELECT id FROM tenants WHERE slug='hms'",
  );
  if (!attTenants.length) throw new Error("Attendance tenant hms not found");
  const attTenantId = attTenants[0].id;

  const [emps] = await att.query(
    "SELECT id, email, full_name FROM employees WHERE tenant_id=?",
    [attTenantId],
  );

  const byEmail = new Map(
    users.map((u) => [String(u.email).toLowerCase(), u]),
  );
  let updated = 0;
  let deactivated = 0;

  for (const e of emps) {
    const h = byEmail.get(String(e.email).toLowerCase());
    if (h) {
      const attRole = mapRole(roleMap[h.role_id] || "EMPLOYEE");
      await att.query(
        "UPDATE employees SET full_name=?, external_ref=?, role=?, status='Active' WHERE id=?",
        [h.name, h.id, attRole, e.id],
      );
      await att.query(
        "UPDATE users SET role=?, is_active=1 WHERE employee_id=?",
        [attRole, e.id],
      );
      updated++;
      console.log("updated", e.email, "→", h.name, attRole);
    } else {
      await att.query("UPDATE employees SET status='Inactive' WHERE id=?", [
        e.id,
      ]);
      await att.query("UPDATE users SET is_active=0 WHERE employee_id=?", [
        e.id,
      ]);
      deactivated++;
      console.log("deactivated seed", e.email, e.full_name);
    }
  }

  console.log(JSON.stringify({ updated, deactivated, hmsUsers: users.length }));
  await hms.end();
  await att.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
