import fs from 'fs';
import path from 'path';
import { appRouter } from '../server/routers.ts';
import { hashStoredPassword, upsertUser } from '../server/db.ts';

const DB_FILE = path.join(process.cwd(), 'data_storage.json');
const TEMP_EMAIL = `qa.cleanup.${Date.now()}@inventory.com`;
const TEMP_PASSWORD = 'QaUser123!';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function ctx(user) {
  return {
    user,
    req: { protocol: 'http', hostname: '127.0.0.1', get: () => undefined, headers: {} },
    res: { clearCookie() {}, cookie() {}, setHeader() {} },
  };
}

async function main() {
  const seeded = await upsertUser({
    email: TEMP_EMAIL,
    openId: `local-${TEMP_EMAIL}`,
    characterName: 'QA Cleanup',
    name: 'QA Cleanup',
    role: 'user',
    isActive: true,
    loginMethod: 'local',
    passwordHash: hashStoredPassword(TEMP_PASSWORD),
  });

  const db = readDb();
  const superAdmin = db.users.find((user) => user.email === 'superadmin@inventory.com');
  const tempUser = db.users.find((user) => user.email === TEMP_EMAIL) || seeded;
  assert(superAdmin, 'No existe el Super Admin por defecto');
  assert(tempUser, 'No se pudo sembrar el usuario temporal');

  const superCaller = appRouter.createCaller(ctx(superAdmin));
  const userCaller = appRouter.createCaller(ctx(tempUser));

  const results = [];

  const listed = await superCaller.adminUsers.listUsers();
  assert(listed.some((user) => user.email === TEMP_EMAIL), 'El Super Admin no pudo listar el usuario temporal');
  results.push('listado_ok');

  const changedRole = await superCaller.adminUsers.updateUserRole({ userId: tempUser.id, role: 'mapper' });
  assert(changedRole.success && changedRole.user.role === 'mapper', 'No se pudo cambiar el rol a mapper');
  results.push('rol_ok');

  const deactivated = await superCaller.adminUsers.toggleUserActive({ userId: tempUser.id, isActive: false });
  assert(deactivated.success && deactivated.user.isActive === false, 'No se pudo desactivar la cuenta');
  results.push('desactivar_ok');

  const reactivated = await superCaller.adminUsers.toggleUserActive({ userId: tempUser.id, isActive: true });
  assert(reactivated.success && reactivated.user.isActive === true, 'No se pudo reactivar la cuenta');
  results.push('reactivar_ok');

  let blocked = false;
  try {
    await userCaller.adminUsers.listUsers();
  } catch {
    blocked = true;
  }
  assert(blocked, 'Un usuario no super admin accedió a funciones administrativas');
  results.push('bloqueo_no_super_admin_ok');

  const deleted = await superCaller.adminUsers.deleteUser({ userId: tempUser.id });
  assert(deleted.success, 'No se pudo eliminar la cuenta temporal');
  const afterDelete = readDb();
  assert(!afterDelete.users.some((user) => user.email === TEMP_EMAIL), 'La cuenta temporal sigue persistida tras eliminarla');
  results.push('eliminar_ok');

  fs.writeFileSync(
    path.join(process.cwd(), 'test-results-admin-permissions.json'),
    JSON.stringify({ ok: true, tempEmail: TEMP_EMAIL, results }, null, 2)
  );

  console.log(JSON.stringify({ ok: true, tempEmail: TEMP_EMAIL, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
