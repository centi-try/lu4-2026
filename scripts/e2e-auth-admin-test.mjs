import fs from 'fs';
import path from 'path';
import { appRouter } from '../server/routers.ts';
import { hashStoredPassword, upsertUser } from '../server/db.ts';

const BASE_URL = 'http://127.0.0.1:3000';
const DB_FILE = path.join(process.cwd(), 'data_storage.json');
const TEST_EMAIL = `qa.user.${Date.now()}@inventory.com`;
const TEST_PASSWORD = 'QaUser123!';
const ADMIN_OPS_EMAIL = `qa.adminops.${Date.now()}@inventory.com`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function postJson(url, body, cookie = '') {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return {
    status: response.status,
    data,
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
  };
}

async function getJson(url, cookie = '') {
  const response = await fetch(url, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function createCtx(user) {
  return {
    user,
    req: { protocol: 'http', hostname: '127.0.0.1', get: () => undefined, headers: {} },
    res: { clearCookie() {}, cookie() {}, setHeader() {} },
  };
}

async function run() {
  const summary = [];

  const superLogin = await postJson(`${BASE_URL}/api/auth/login`, {
    email: 'superadmin@inventory.com',
    password: 'SuperAdmin123!',
  });
  assert(superLogin.status === 200, 'El Super Admin por defecto no pudo iniciar sesión');
  assert(superLogin.cookie, 'No se recibió cookie de sesión para el Super Admin');
  summary.push({ test: 'login_super_admin', result: 'ok', detail: 'Inicio de sesión exitoso con cookie persistente.' });

  const sessionCheck = await getJson(`${BASE_URL}/api/auth/me`, superLogin.cookie);
  assert(sessionCheck.status === 200, 'La sesión del Super Admin no se mantuvo al consultar /api/auth/me');
  assert(sessionCheck.data?.user?.role === 'super_admin', 'La sesión persistida no devolvió rol super_admin');
  summary.push({ test: 'session_persistence', result: 'ok', detail: 'La cookie mantiene la sesión del Super Admin.' });

  const register = await postJson(`${BASE_URL}/api/auth/register`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    characterName: 'QA User',
  });
  assert(register.status === 200, 'No fue posible registrar un usuario nuevo');
  summary.push({ test: 'register_user', result: 'ok', detail: `Registro exitoso de ${TEST_EMAIL}.` });

  const dbAfterRegister = readDb();
  const persistedUser = dbAfterRegister.users.find((user) => user.email === TEST_EMAIL);
  assert(!!persistedUser, 'El usuario registrado no quedó persistido en data_storage.json');
  summary.push({ test: 'register_persistence', result: 'ok', detail: 'El usuario registrado quedó persistido en disco.' });

  const userLogin = await postJson(`${BASE_URL}/api/auth/login`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  assert(userLogin.status === 200, 'El usuario recién registrado no pudo iniciar sesión');
  summary.push({ test: 'login_registered_user', result: 'ok', detail: 'El usuario nuevo puede iniciar sesión.' });

  const adminOpsUser = await upsertUser({
    email: ADMIN_OPS_EMAIL,
    openId: `local-${ADMIN_OPS_EMAIL}`,
    characterName: 'QA Admin Ops',
    name: 'QA Admin Ops',
    role: 'user',
    isActive: true,
    loginMethod: 'local',
    passwordHash: hashStoredPassword(TEST_PASSWORD),
  });

  const usersForAdminTests = readDb().users;
  const superAdminUser = usersForAdminTests.find((user) => user.email === 'superadmin@inventory.com');
  const normalUser = usersForAdminTests.find((user) => user.email === ADMIN_OPS_EMAIL) || adminOpsUser;
  assert(superAdminUser && normalUser, 'No se pudieron recuperar usuarios persistidos para pruebas administrativas');

  const superCaller = appRouter.createCaller(createCtx(superAdminUser));
  const userCaller = appRouter.createCaller(createCtx(normalUser));

  const listUsers = await superCaller.adminUsers.listUsers();
  assert(Array.isArray(listUsers) && listUsers.some((user) => user.email === ADMIN_OPS_EMAIL), 'El Super Admin no pudo listar usuarios');
  summary.push({ test: 'list_users_as_super_admin', result: 'ok', detail: 'El Super Admin puede listar usuarios.' });

  const roleChange = await superCaller.adminUsers.updateUserRole({ userId: normalUser.id, role: 'mapper' });
  assert(roleChange.success && roleChange.user.role === 'mapper', 'No fue posible cambiar el rol del usuario a mapper');
  summary.push({ test: 'change_role', result: 'ok', detail: 'El Super Admin puede cambiar roles.' });

  const deactivate = await superCaller.adminUsers.toggleUserActive({ userId: normalUser.id, isActive: false });
  assert(deactivate.success && deactivate.user.isActive === false, 'No fue posible desactivar el usuario');
  summary.push({ test: 'deactivate_user', result: 'ok', detail: 'El Super Admin puede desactivar usuarios.' });

  const blockedLogin = await postJson(`${BASE_URL}/api/auth/login`, {
    email: ADMIN_OPS_EMAIL,
    password: TEST_PASSWORD,
  });
  assert(blockedLogin.status === 403, 'Un usuario desactivado todavía pudo iniciar sesión');
  summary.push({ test: 'inactive_user_blocked', result: 'ok', detail: 'El login de usuarios desactivados queda bloqueado.' });

  const reactivate = await superCaller.adminUsers.toggleUserActive({ userId: normalUser.id, isActive: true });
  assert(reactivate.success && reactivate.user.isActive === true, 'No fue posible reactivar el usuario');
  summary.push({ test: 'reactivate_user', result: 'ok', detail: 'El Super Admin puede reactivar usuarios.' });

  const restoredLogin = await postJson(`${BASE_URL}/api/auth/login`, {
    email: ADMIN_OPS_EMAIL,
    password: TEST_PASSWORD,
  });
  assert(restoredLogin.status === 200, 'Un usuario reactivado no pudo volver a iniciar sesión');
  summary.push({ test: 'reactivated_user_login', result: 'ok', detail: 'El usuario reactivado vuelve a iniciar sesión.' });

  let forbiddenMessage = '';
  try {
    await userCaller.adminUsers.listUsers();
  } catch (error) {
    forbiddenMessage = error?.message || String(error);
  }
  assert(forbiddenMessage, 'Un usuario no super admin logró acceder a la gestión de usuarios');
  summary.push({ test: 'non_super_admin_forbidden', result: 'ok', detail: 'Un usuario común no puede ejecutar acciones administrativas.' });

  const remove = await superCaller.adminUsers.deleteUser({ userId: normalUser.id });
  assert(remove.success, 'No fue posible eliminar el usuario de prueba');
  summary.push({ test: 'delete_user', result: 'ok', detail: 'El Super Admin puede eliminar usuarios.' });

  const deletedLogin = await postJson(`${BASE_URL}/api/auth/login`, {
    email: ADMIN_OPS_EMAIL,
    password: TEST_PASSWORD,
  });
  assert(deletedLogin.status === 401, 'Un usuario eliminado todavía pudo iniciar sesión');
  summary.push({ test: 'deleted_user_blocked', result: 'ok', detail: 'Las cuentas eliminadas ya no pueden autenticarse.' });

  const dbAfterDelete = readDb();
  assert(!dbAfterDelete.users.some((user) => user.email === TEST_EMAIL), 'El usuario eliminado sigue presente en la persistencia');
  summary.push({ test: 'delete_persistence', result: 'ok', detail: 'La eliminación queda persistida en disco.' });

  fs.writeFileSync(
    path.join(process.cwd(), 'test-results-auth-admin.json'),
    JSON.stringify({
      credentials: {
        email: 'superadmin@inventory.com',
        password: 'SuperAdmin123!'
      },
      testUserEmail: TEST_EMAIL,
      summary,
    }, null, 2)
  );

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
