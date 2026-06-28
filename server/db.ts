import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

export const DEFAULT_SUPER_ADMIN_EMAIL = 'eclipce.callejero@gmail.com';
export const DEFAULT_SUPER_ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || '@nicolas#2021';
export const DEFAULT_SUPER_ADMIN_NAME = 'lvlxuxetumareeee';

// ============================================================================
// Rutas de persistencia
// ============================================================================
// Permitimos override completo via env (útil para tests, deploys con volumen
// persistente, o desarrollo con múltiples bases). En ausencia del env var
// caemos al comportamiento histórico: archivo `data_storage.json` en el cwd.
// También exponemos el DIRECTORIO de datos para alojar backups/ al lado.
const DB_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(process.cwd(), 'data_storage.json');
const DATA_DIR = path.dirname(DB_FILE);
const BACKUPS_DIR = process.env.BACKUPS_DIR
  ? path.resolve(process.env.BACKUPS_DIR)
  : path.join(DATA_DIR, 'backups');
const BACKUPS_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.BACKUPS_RETENTION_DAYS) || 30,
);
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const STORAGE_PATHS = {
  dbFile: DB_FILE,
  dataDir: DATA_DIR,
  backupsDir: BACKUPS_DIR,
  retentionDays: BACKUPS_RETENTION_DAYS,
};

// Estructura inicial de la base de datos
interface DatabaseSchema {
  users: any[];
  items: any[];
  characters: any[];
  salesCycles: any[];
  auditLogs: any[];
  purchases: any[];
  settings: any[];
  // Reservas sobre ítems del inventario legacy. Mismo patrón waitlist que
  // las reservas del módulo raid: cualquier usuario logueado puede reservar,
  // múltiples usuarios pueden anotarse aunque la suma supere el stock; solo
  // se valida que la cantidad individual ≤ stock disponible. El dueño o un
  // admin/mapper pueden cancelar.
  itemReservations: any[];
  // ============================================================
  // Módulo Raid Boss (aislado, no interfiere con el sistema viejo)
  // ============================================================
  raidBosses: any[];
  clans: any[];
  raidCycles: any[];
  raidEvents: any[];
  raidEventClans: any[];      // M:N evento-clanes
  raidDropItems: any[];        // items dropeados por evento
  userRaidAccess: any[];       // acceso al módulo raid por usuario
  raidAuditLogs: any[];
  raidSettings: any[];
  raidCategoryIcons: any[];    // iconos por categoría de drop (seteados por super admin)
  // Reservas de compra sobre drops disponibles. Las generan raid_users (y
  // cualquier otro rol raid) para marcar intención de compra. NO descuentan
  // stock real — solo sirven como lista de espera visible al raid_admin /
  // super admin al momento de vender. Se archivan en el audit log y se
  // borran cuando el drop se vende completamente.
  raidDropReservations: any[];
  // Command Parties — sub-grupos dentro de cada clan (para menú raid).
  // Cada CP pertenece a un clan y tiene un leader opcional.
  raidCommandParties: any[];
  // Available character classes (configured by Super Admin for registration dropdown)
  raidAvailableClasses: any[];
  // Secondary characters per user (alts that contribute to a CP)
  secondaryCharacters: any[];
  // Ciclos de VENTA del módulo raid — capa semanal (Lun→Dom) de agregación
  // sobre los raid cycles diarios. Solo agrupa/resume ventas, no modifica
  // drops, eventos ni clanes.
  raidSalesCycles: any[];
  // ============================================================
  // Tokens de autenticación secundaria (reset password + verificación email)
  // ============================================================
  // Cada entry tiene: { id, userId, email, tokenHash, purpose, expiresAt,
  // usedAt?, createdAt, ip?, userAgent? }. Guardamos solo el HASH del token
  // (sha256 hex) para que un leak de data_storage.json no permita reusar
  // tokens pendientes. El token plano solo viaja por email.
  passwordResetTokens: any[];
  emailVerifications: any[];
  clanFundSettings: any;
  clanFundTransactions: any[];
  clanFundCurrentCycleAccrued: number;
  // ============================================================
  // Warehouse Clan (bodega del clan — materiales para crafteo)
  // ============================================================
  warehouseItems: any[];       // ítems en bodega (agrupados por nombre)
  warehouseIncoming: any[];    // registros pendientes de confirmar
  craftRecipes: any[];         // recetas de crafteo (persistentes, reutilizables)
  craftProjects: any[];        // proyectos activos de crafteo
  materialCatalog: any[];      // catálogo persistente de materiales (nombre, categoría, imagen)
  // Warehouse-specific clans & CPs (independent from raid module)
  warehouseClans: any[];       // clanes del warehouse (id, name, createdAt)
  warehouseCPs: any[];         // command parties del warehouse (id, name, clanId, leaderId)
  warehouseCPMembers: any[];   // miembros de CP (id, cpId, userId, addedAt)
  // ============================================================
  // Presentación del login (contenido gestionado por Super Admin)
  // ============================================================
  presentationItems: any[];    // { id, type:'image'|'video'|'text', title, content, order, createdAt }
  carouselImages: any[];       // { id, label, data (base64), width, height, sizeBytes, createdAt, history[] }
  carouselSettings: any;       // { intervalSeconds: number }
  warehouseHistory: any[];     // historial de retiros/eliminaciones
  warehouseSettings: any;      // configuración de visibilidad cross-CP
  warehouseLoans: any[];       // préstamos entre CPs
  warehouseObjectives: any[];  // objetivos diarios por CP
  warehouseAttendance: any[];  // asistencia por objetivo
  warehouseDailyAttendance: any[]; // asistencia diaria por CP
  warehouseDeliveries: any[];  // entregas de materiales por objetivo
}

const initialSchema: DatabaseSchema = {
  users: [],
  items: [],
  characters: [],
  salesCycles: [],
  auditLogs: [],
  purchases: [],
  settings: [],
  itemReservations: [],
  raidBosses: [],
  clans: [],
  raidCycles: [],
  raidEvents: [],
  raidEventClans: [],
  raidDropItems: [],
  userRaidAccess: [],
  raidAuditLogs: [],
  raidSettings: [],
  raidCategoryIcons: [],
  raidDropReservations: [],
  raidCommandParties: [],
  raidAvailableClasses: [],
  secondaryCharacters: [],
  raidSalesCycles: [],
  passwordResetTokens: [],
  emailVerifications: [],
  clanFundSettings: { clanTaxPercent: 0, internalDiscountPercent: 0 },
  clanFundTransactions: [],
  clanFundCurrentCycleAccrued: 0,
  warehouseItems: [],
  warehouseIncoming: [],
  craftRecipes: [],
  craftProjects: [],
  materialCatalog: [],
  warehouseClans: [],
  warehouseCPs: [],
  warehouseCPMembers: [],
  presentationItems: [],
  carouselImages: [],
  carouselSettings: { intervalSeconds: 10 },
  warehouseHistory: [],
  warehouseSettings: { crossCpVisibility: true, crossCpObjectivesVisibility: false },
  warehouseLoans: [],
  warehouseObjectives: [],
  warehouseAttendance: [],
  warehouseDailyAttendance: [],
  warehouseDeliveries: [],
};

// ============================================================================
// Hash de contraseñas (bcrypt + migración transparente del legacy SHA-256)
// ============================================================================
// Nuevos hashes usan bcrypt (work factor 10 — razonable para ~100ms por login).
// Legacy: hashes SHA-256 hex (64 chars). Al hacer login con un hash legacy y
// password correcto, se re-hashea con bcrypt al vuelo (ver `verifyStoredPassword`
// + updateUserPassword en el endpoint de login).
const BCRYPT_ROUNDS = 10;

export function hashLocalPassword(password: string): string {
  // Mantenemos la firma síncrona para no romper llamadas existentes dentro del
  // bootstrap (ensureDefaultSuperAdmin). bcryptjs tiene API síncrona además.
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

// Detecta si un hash ya es bcrypt (empieza con $2a$ / $2b$ / $2y$).
export function isBcryptHash(hash: string | undefined | null): boolean {
  if (!hash) return false;
  return /^\$2[aby]\$/.test(hash);
}

// Verifica contraseña soportando tanto bcrypt como el formato legacy
// SHA-256 (hex de 64 chars). Retorna objeto con el resultado y si el hash
// necesita re-hashearse (migración transparente).
export function verifyStoredPassword(
  password: string,
  hash: string | undefined | null,
): { ok: boolean; needsRehash: boolean } {
  if (!hash) return { ok: false, needsRehash: false };
  if (isBcryptHash(hash)) {
    try {
      return { ok: bcrypt.compareSync(password, hash), needsRehash: false };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }
  // Legacy SHA-256 (64 hex chars)
  if (/^[a-f0-9]{64}$/i.test(hash)) {
    const legacy = crypto.createHash('sha256').update(password).digest('hex');
    const ok = legacy === hash;
    return { ok, needsRehash: ok };
  }
  return { ok: false, needsRehash: false };
}

function normalizeRole(role: unknown): string {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'super_admin' || normalized === 'super admin' || normalized === 'superadmin' || normalized === 'admin') {
    return 'super_admin';
  }
  if (normalized === 'mapper') {
    return 'mapper';
  }
  return 'user';
}

function ensureArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeUser(rawUser: any, index: number) {
  const role = normalizeRole(rawUser?.role);
  const fallbackEmail = role === 'super_admin'
    ? DEFAULT_SUPER_ADMIN_EMAIL
    : rawUser?.email || rawUser?.username
      ? `${rawUser.email || rawUser.username}`
      : `user${index + 1}@inventory.local`;
  const email = String(fallbackEmail).includes('@') ? String(fallbackEmail).toLowerCase() : `${String(fallbackEmail).toLowerCase()}@inventory.local`;
  const openId = rawUser?.openId || `local-${email}`;
  const characterName = rawUser?.characterName || rawUser?.displayName || rawUser?.name || rawUser?.username || (role === 'super_admin' ? DEFAULT_SUPER_ADMIN_NAME : 'Usuario');
  const passwordHash = rawUser?.passwordHash || (rawUser?.password && /^[a-f0-9]{64}$/i.test(String(rawUser.password)) ? rawUser.password : undefined) || (role === 'super_admin' && email === DEFAULT_SUPER_ADMIN_EMAIL ? hashLocalPassword(DEFAULT_SUPER_ADMIN_PASSWORD) : undefined);

  // Flag de verificación de email (PR5). El super admin default arranca
  // verificado; cualquier registro legacy anterior a esta feature (sin el
  // campo) se considera verificado por retrocompatibilidad (no vamos a
  // bloquear usuarios que ya existían). Los registros NUEVOS que pasen por
  // /api/auth/register van a setear explícitamente emailVerified=false.
  const emailVerified = rawUser?.emailVerified === undefined
    ? true
    : Boolean(rawUser.emailVerified);

  // 2FA TOTP (PR6). Por defecto desactivado. `twoFactorSecret` es el base32
  // confirmado y activo. `twoFactorPendingSecret` es el secret emitido por
  // /2fa/setup que aún no fue confirmado con un código válido — se descarta
  // si el user no completa el flow. `twoFactorBackupCodeHashes` son sha256
  // hex de cada backup code; al consumir uno se elimina del array.
  const twoFactorEnabled = Boolean(rawUser?.twoFactorEnabled);
  const twoFactorSecret = twoFactorEnabled ? (rawUser?.twoFactorSecret || null) : null;
  const twoFactorPendingSecret = rawUser?.twoFactorPendingSecret || null;
  const twoFactorBackupCodeHashes = Array.isArray(rawUser?.twoFactorBackupCodeHashes)
    ? rawUser.twoFactorBackupCodeHashes.filter((h: any) => typeof h === 'string')
    : [];

  return {
    ...rawUser,
    id: Number(rawUser?.id) || Math.floor(Math.random() * 1000000),
    email,
    openId,
    name: rawUser?.name || characterName,
    characterName,
    role,
    loginMethod: rawUser?.loginMethod || 'local',
    isActive: rawUser?.isActive !== false,
    passwordHash,
    emailVerified,
    twoFactorEnabled,
    twoFactorSecret,
    twoFactorPendingSecret,
    twoFactorBackupCodeHashes,
    createdAt: rawUser?.createdAt || new Date().toISOString(),
    updatedAt: rawUser?.updatedAt || rawUser?.createdAt || new Date().toISOString(),
    lastSignedIn: rawUser?.lastSignedIn || rawUser?.updatedAt || rawUser?.createdAt || null,
  };
}

function ensureDefaultSuperAdmin(data: any): DatabaseSchema {
  const normalizedUsers = ensureArray(data?.users).map(normalizeUser);
  const existingIndex = normalizedUsers.findIndex((user: any) => normalizeRole(user.role) === 'super_admin' || String(user.email).toLowerCase() === DEFAULT_SUPER_ADMIN_EMAIL);

  if (existingIndex >= 0) {
    normalizedUsers[existingIndex] = {
      ...normalizedUsers[existingIndex],
      email: DEFAULT_SUPER_ADMIN_EMAIL,
      openId: `local-${DEFAULT_SUPER_ADMIN_EMAIL}`,
      name: normalizedUsers[existingIndex].name || DEFAULT_SUPER_ADMIN_NAME,
      characterName: normalizedUsers[existingIndex].characterName || DEFAULT_SUPER_ADMIN_NAME,
      role: 'super_admin',
      loginMethod: 'local',
      isActive: true,
      legacyAccess: true,
      passwordHash: normalizedUsers[existingIndex].passwordHash || hashLocalPassword(DEFAULT_SUPER_ADMIN_PASSWORD),
      updatedAt: new Date().toISOString(),
    };
  } else {
    normalizedUsers.unshift({
      id: 1,
      email: DEFAULT_SUPER_ADMIN_EMAIL,
      openId: `local-${DEFAULT_SUPER_ADMIN_EMAIL}`,
      name: DEFAULT_SUPER_ADMIN_NAME,
      characterName: DEFAULT_SUPER_ADMIN_NAME,
      role: 'super_admin',
      loginMethod: 'local',
      isActive: true,
      legacyAccess: true,
      classMain: 'warlock',
      passwordHash: hashLocalPassword(DEFAULT_SUPER_ADMIN_PASSWORD),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSignedIn: null,
    });
  }

  return {
    ...data,
    ...initialSchema,
    users: normalizedUsers,
    items: ensureArray(data?.items),
    characters: ensureArray(data?.characters),
    salesCycles: ensureArray(data?.salesCycles),
    auditLogs: ensureArray(data?.auditLogs),
    purchases: ensureArray(data?.purchases),
    settings: Array.isArray(data?.settings) ? data.settings : (data?.settings ? [data.settings] : []),
    itemReservations: ensureArray(data?.itemReservations),
    // ============================================================
    // Raid module collections
    // ============================================================
    raidBosses: ensureArray(data?.raidBosses),
    clans: ensureArray(data?.clans),
    raidCycles: ensureArray(data?.raidCycles),
    raidEvents: ensureArray(data?.raidEvents),
    raidEventClans: ensureArray(data?.raidEventClans),
    raidDropItems: ensureArray(data?.raidDropItems),
    userRaidAccess: ensureArray(data?.userRaidAccess),
    raidAuditLogs: ensureArray(data?.raidAuditLogs),
    raidSettings: ensureArray(data?.raidSettings),
    raidCategoryIcons: ensureArray(data?.raidCategoryIcons),
    raidDropReservations: ensureArray(data?.raidDropReservations),
    raidCommandParties: ensureArray(data?.raidCommandParties),
    raidAvailableClasses: ensureArray(data?.raidAvailableClasses),
    secondaryCharacters: ensureArray(data?.secondaryCharacters),
    raidSalesCycles: ensureArray(data?.raidSalesCycles),
    passwordResetTokens: ensureArray(data?.passwordResetTokens),
    emailVerifications: ensureArray(data?.emailVerifications),
    clanFundSettings: data?.clanFundSettings && typeof data.clanFundSettings === 'object'
      ? data.clanFundSettings
      : { clanTaxPercent: 0, internalDiscountPercent: 0 },
    clanFundTransactions: ensureArray(data?.clanFundTransactions),
    clanFundCurrentCycleAccrued: Number(data?.clanFundCurrentCycleAccrued) || 0,
    // ============================================================
    // Warehouse & Crafteo collections
    // ============================================================
    warehouseItems: ensureArray(data?.warehouseItems),
    warehouseIncoming: ensureArray(data?.warehouseIncoming),
    craftRecipes: ensureArray(data?.craftRecipes),
    craftProjects: ensureArray(data?.craftProjects),
    materialCatalog: ensureArray(data?.materialCatalog),
    warehouseClans: ensureArray(data?.warehouseClans),
    warehouseCPs: ensureArray(data?.warehouseCPs),
    warehouseCPMembers: ensureArray(data?.warehouseCPMembers),
    // ============================================================
    // Presentation & additional warehouse collections
    // ============================================================
    presentationItems: ensureArray(data?.presentationItems),
    warehouseHistory: ensureArray(data?.warehouseHistory),
    warehouseSettings: data?.warehouseSettings && typeof data.warehouseSettings === 'object'
      ? data.warehouseSettings
      : { crossCpVisibility: true, crossCpObjectivesVisibility: false },
    warehouseLoans: ensureArray(data?.warehouseLoans),
    warehouseObjectives: ensureArray(data?.warehouseObjectives),
    warehouseAttendance: ensureArray(data?.warehouseAttendance),
    warehouseDailyAttendance: ensureArray(data?.warehouseDailyAttendance),
    warehouseDeliveries: ensureArray(data?.warehouseDeliveries),
  };
}

// ============================================================================
// Helpers de persistencia robusta
// ============================================================================
// 1) Escritura atómica: escribir a `*.tmp` y renombrar. Si el proceso muere en
//    medio, el archivo final queda intacto (o con el contenido anterior).
// 2) Serialización de escrituras con mutex cooperativo: aunque `fs.writeFileSync`
//    es síncrono, exponemos un contador de "pending writes" para poder detectar
//    corrupción al cargar y permitir esperar al flush en tests.
// 3) Carga robusta: si el JSON está corrupto, intentamos cargar el backup más
//    reciente antes de rendirnos y empezar de cero (que sería catastrófico).

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {
    /* ignore */
  }
}

function listBackupFiles(): string[] {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    return fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('data_storage_') && f.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function tryParseDatabase(raw: string): DatabaseSchema | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as DatabaseSchema;
  } catch {
    return null;
  }
}

function loadFromLatestBackup(): DatabaseSchema | null {
  const backups = listBackupFiles();
  for (const file of backups) {
    const full = path.join(BACKUPS_DIR, file);
    try {
      const raw = fs.readFileSync(full, 'utf-8');
      const parsed = tryParseDatabase(raw);
      if (parsed) {
        console.warn(`[db] Recuperando desde backup: ${file}`);
        return parsed;
      }
    } catch {
      /* siguiente */
    }
  }
  return null;
}

// Cargar o inicializar la base de datos
function loadDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = tryParseDatabase(data);
      if (parsed) {
        return ensureDefaultSuperAdmin(parsed);
      }
      console.error(
        `[db] Archivo ${DB_FILE} corrupto o vacío — intentando recuperar desde backup`,
      );
      const recovered = loadFromLatestBackup();
      if (recovered) {
        // Guardar inmediatamente el estado recuperado en el archivo principal
        // para que próximas cargas no toquen el backup de nuevo.
        try {
          writeDbAtomic(recovered);
        } catch (err) {
          console.error('[db] Error reescribiendo archivo principal:', err);
        }
        return ensureDefaultSuperAdmin(recovered);
      }
      console.error('[db] Sin backups recuperables — arrancando con schema vacío');
    }
  } catch (error) {
    console.error('Error loading DB file:', error);
  }
  return ensureDefaultSuperAdmin(JSON.parse(JSON.stringify(initialSchema)));
}

// Escritura atómica: tmp + rename. Esto evita que un crash durante el save
// deje el archivo principal corrupto — o se escribe todo o queda el anterior.
function writeDbAtomic(data: DatabaseSchema) {
  ensureDir(DATA_DIR);
  const tmp = `${DB_FILE}.tmp`;
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, serialized, 'utf-8');
  fs.renameSync(tmp, DB_FILE);
}

// Mutex cooperativo: garantizamos que dos saveDb concurrentes no se pisen. Como
// fs.writeFileSync es síncrono, el riesgo real viene de `JSON.stringify` +
// múltiples mutaciones de `dbInstance` entre calls. Serializamos llamadas con
// una cola simple de promesas.
let saveQueue: Promise<void> = Promise.resolve();

function saveDb(data: DatabaseSchema) {
  saveQueue = saveQueue.then(async () => {
    try {
      writeDbAtomic(data);
    } catch (error) {
      console.error('Error saving DB file:', error);
    }
  });
  return saveQueue;
}

// ============================================================================
// Sistema de backups
// ============================================================================
// - Snapshot diario automático (chequeado al arrancar y cada 24h).
// - Snapshot on-demand (endpoint admin).
// - Snapshot antes de operaciones riesgosas (close cycle, bulk delete).
// - Retención configurable (default 30 días).

export interface BackupInfo {
  file: string;
  fullPath: string;
  createdAt: string;
  sizeBytes: number;
  reason?: string;
}

function formatBackupTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function createBackup(reason: string = 'manual'): BackupInfo | null {
  ensureDir(BACKUPS_DIR);
  try {
    if (!fs.existsSync(DB_FILE)) {
      // Nada para respaldar todavía — primer arranque.
      return null;
    }
    const stamp = formatBackupTimestamp(new Date());
    const sanitizedReason = reason.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'manual';
    const file = `data_storage_${stamp}_${sanitizedReason}.json`;
    const fullPath = path.join(BACKUPS_DIR, file);
    fs.copyFileSync(DB_FILE, fullPath);
    const stat = fs.statSync(fullPath);
    return {
      file,
      fullPath,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      reason: sanitizedReason,
    };
  } catch (err) {
    console.error('[db] Error creando backup:', err);
    return null;
  }
}

export function listBackups(): BackupInfo[] {
  const files = listBackupFiles();
  const result: BackupInfo[] = [];
  for (const file of files) {
    const full = path.join(BACKUPS_DIR, file);
    try {
      const stat = fs.statSync(full);
      // Parseamos el sufijo del archivo: data_storage_YYYY-MM-DD_HHMMSS_<reason>.json.
      // Usamos regex anclado al formato de timestamp para no contaminar `reason`
      // con el horario — antes `(.+?)_(.+)` dejaba reason como "111921_daily".
      const match = file.match(/^data_storage_\d{4}-\d{2}-\d{2}_\d{6}_(.+)\.json$/);
      const reason = match ? match[1] : undefined;
      result.push({
        file,
        fullPath: full,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        reason,
      });
    } catch {
      /* ignore */
    }
  }
  return result;
}

export function pruneOldBackups() {
  try {
    const all = listBackups();
    const cutoff = Date.now() - BACKUPS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const b of all) {
      if (new Date(b.createdAt).getTime() < cutoff) {
        try {
          fs.unlinkSync(b.fullPath);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.error('[db] Error podando backups:', err);
  }
}

export function restoreFromBackup(file: string): boolean {
  const full = path.join(BACKUPS_DIR, path.basename(file));
  if (!fs.existsSync(full)) return false;
  try {
    const raw = fs.readFileSync(full, 'utf-8');
    const parsed = tryParseDatabase(raw);
    if (!parsed) return false;
    // Primero tomamos un backup del estado actual ANTES de restaurar,
    // así nunca se pierde irreversiblemente.
    createBackup('pre-restore');
    const restored = ensureDefaultSuperAdmin(parsed);
    dbInstance = restored;
    writeDbAtomic(restored);
    return true;
  } catch (err) {
    console.error('[db] Error restaurando backup:', err);
    return false;
  }
}

// Export raw DB content as JSON string (for download)
export function getDbRawContent(): string {
  return JSON.stringify(dbInstance, null, 2);
}

// Import DB content from a JSON string (for upload/import)
export function importDbContent(jsonString: string): boolean {
  try {
    const parsed = tryParseDatabase(jsonString);
    if (!parsed) return false;
    createBackup('pre-import');
    const imported = ensureDefaultSuperAdmin(parsed);
    dbInstance = imported;
    writeDbAtomic(imported);
    return true;
  } catch (err) {
    console.error('[db] Error importando backup:', err);
    return false;
  }
}

// Reset database to initial empty state (factory reset)
export function resetDatabase(): boolean {
  try {
    createBackup('pre-reset');
    const fresh = { ...initialSchema };
    const withAdmin = ensureDefaultSuperAdmin(fresh);
    dbInstance = withAdmin;
    writeDbAtomic(withAdmin);
    return true;
  } catch (err) {
    console.error('[db] Error reseteando base de datos:', err);
    return false;
  }
}

// Snapshot diario: al arrancar chequea si hay backup en las últimas 24h. Si
// no, crea uno. Después programa un intervalo de 24h para repetir.
export function startDailyBackupScheduler() {
  const run = () => {
    try {
      const all = listBackups();
      const latestAutomatic = all.find((b) => b.reason === 'daily');
      const shouldBackup =
        !latestAutomatic ||
        Date.now() - new Date(latestAutomatic.createdAt).getTime() >= BACKUP_INTERVAL_MS;
      if (shouldBackup) {
        const info = createBackup('daily');
        if (info) {
          console.log(`[db] Backup diario creado: ${info.file} (${info.sizeBytes} bytes)`);
        }
      }
      pruneOldBackups();
    } catch (err) {
      console.error('[db] Error en scheduler de backups:', err);
    }
  };
  // Primera corrida al arrancar (async para no bloquear el boot).
  setTimeout(run, 5_000);
  // Repetir cada 24h.
  setInterval(run, BACKUP_INTERVAL_MS);
}

// Singleton de la base de datos en memoria sincronizado con disco
export let dbInstance = loadDb();

export const saveDbToDisk = () => saveDb(dbInstance);
export const hashStoredPassword = hashLocalPassword;

export const getDb = async () => {
  return {
    select: () => ({
      from: (table: any) => ({
        where: (condition: any) => ({
          limit: (n: number) => {
            const tableName = (table.name || 'users') as keyof DatabaseSchema;
            const data = dbInstance[tableName] || [];
            if (condition && typeof condition === 'object') {
              const key = Object.keys(condition)[0];
              const value = condition[key];
              return data.filter((item: any) => item[key] === value).slice(0, n);
            }
            return data.slice(0, n);
          },
          execute: () => {
             const tableName = (table.name || 'users') as keyof DatabaseSchema;
             return dbInstance[tableName] || [];
          }
        }),
        limit: (n: number) => {
          const tableName = (table.name || 'users') as keyof DatabaseSchema;
          const data = dbInstance[tableName] || [];
          return data.slice(0, n);
        },
        execute: () => {
           const tableName = (table.name || 'users') as keyof DatabaseSchema;
           return dbInstance[tableName] || [];
        }
      })
    }),
    insert: (table: any) => ({
      values: (values: any) => ({
        returning: () => {
          const tableName = (table.name || 'users') as keyof DatabaseSchema;
          if (!dbInstance[tableName]) dbInstance[tableName] = [];
          const newRecord = { 
            ...values, 
            id: values.id || Math.floor(Math.random() * 1000000),
            createdAt: new Date(),
            updatedAt: new Date()
          };
          dbInstance[tableName].push(newRecord);
          saveDb(dbInstance);
          return [newRecord];
        }
      })
    }),
    update: (table: any) => ({
      set: (values: any) => ({
        where: (condition: any) => {
          const tableName = (table.name || 'users') as keyof DatabaseSchema;
          const key = Object.keys(condition)[0];
          const value = condition[key];
          dbInstance[tableName] = (dbInstance[tableName] || []).map((item: any) => 
            item[key] === value ? { ...item, ...values, updatedAt: new Date() } : item
          );
          saveDb(dbInstance);
          return { execute: () => {} };
        }
      })
    }),
    delete: (table: any) => ({
      where: (condition: any) => {
        const tableName = (table.name || 'users') as keyof DatabaseSchema;
        const key = Object.keys(condition)[0];
        const value = condition[key];
        dbInstance[tableName] = (dbInstance[tableName] || []).filter((item: any) => item[key] !== value);
        saveDb(dbInstance);
        return { execute: () => {} };
      }
    })
  };
};

export const upsertUser = async (userData: any) => {
  if (!dbInstance.users) dbInstance.users = [];
  const normalizedEmail = userData?.email ? String(userData.email).toLowerCase() : undefined;
  const normalizedOpenId = userData?.openId || (normalizedEmail ? `local-${normalizedEmail}` : undefined);
  let userIndex = dbInstance.users.findIndex(u => (normalizedEmail && u.email === normalizedEmail) || (normalizedOpenId && u.openId === normalizedOpenId));
  const now = new Date().toISOString();

  if (userIndex !== -1) {
    dbInstance.users[userIndex] = {
      ...dbInstance.users[userIndex],
      ...userData,
      email: normalizedEmail || dbInstance.users[userIndex].email,
      openId: normalizedOpenId || dbInstance.users[userIndex].openId,
      role: normalizeRole(userData?.role || dbInstance.users[userIndex].role),
      isActive: userData?.isActive !== undefined ? userData.isActive : (dbInstance.users[userIndex].isActive !== false),
      updatedAt: now,
      lastSignedIn: userData?.lastSignedIn !== undefined ? userData.lastSignedIn : dbInstance.users[userIndex].lastSignedIn,
    };
    saveDb(dbInstance);
    return dbInstance.users[userIndex];
  } else {
    const newUser = {
      ...userData,
      id: Number(userData?.id) || Math.floor(Math.random() * 1000000),
      email: normalizedEmail,
      openId: normalizedOpenId,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: userData?.lastSignedIn !== undefined ? userData.lastSignedIn : now,
      role: normalizeRole(userData?.role),
      isActive: userData?.isActive !== undefined ? userData.isActive : true,
      loginMethod: userData?.loginMethod || 'local',
    };
    dbInstance.users.push(newUser);
    saveDb(dbInstance);
    return newUser;
  }
};

// Exportaciones requeridas por los routers
export const getItems = async () => dbInstance.items || [];
export const getRawDb = () => dbInstance;
export const createItem = async (data: any) => {
  const newItem = { 
    ...data, 
    id: Math.floor(Math.random() * 1000000), 
    quantity: data.quantity || 1,
    quantitySold: 0,
    quantitySoldInCycle: 0,
    // FIX: Asegurar que associatedCharacterIds siempre sea un array de números
    associatedCharacterIds: Array.isArray(data.associatedCharacterIds)
      ? data.associatedCharacterIds.map(Number)
      : [],
    createdAt: new Date(),
    updatedAt: new Date() 
  };
  dbInstance.items.push(newItem);
  saveDb(dbInstance);
  return newItem;
};
export const updateItem = async (id: number, data: any) => {
  dbInstance.items = dbInstance.items.map(i => {
    if (i.id === id) {
      const updated = { ...i, ...data, updatedAt: new Date() };
      // FIX: Normalizar associatedCharacterIds si se actualiza
      if (data.associatedCharacterIds !== undefined) {
        updated.associatedCharacterIds = Array.isArray(data.associatedCharacterIds)
          ? data.associatedCharacterIds.map(Number)
          : [];
      }
      return updated;
    }
    return i;
  });
  saveDb(dbInstance);
};
export const deleteItem = async (id: number) => {
  dbInstance.items = dbInstance.items.filter(i => i.id !== id);
  saveDb(dbInstance);
};

export const getCharacters = async (userId?: number) => {
  if (userId) return (dbInstance.characters || []).filter(c => c.userId === userId);
  return dbInstance.characters || [];
};
export const createCharacter = async (data: any) => {
  const newChar = { ...data, id: Math.floor(Math.random() * 1000000), createdAt: new Date() };
  dbInstance.characters.push(newChar);
  saveDb(dbInstance);
  return newChar;
};

export const getSalesCycles = async () => {
  // FIX: Normalizar todos los ciclos al shape correcto antes de retornarlos
  return (dbInstance.salesCycles || []).map(normalizeCycle);
};

/**
 * FIX: Función para normalizar el shape de un ciclo al formato esperado por el cliente.
 * Esto resuelve la inconsistencia entre ciclos creados por distintas rutas de código.
 */
function normalizeCycle(cycle: any): any {
  return {
    id: String(cycle.id),
    label: cycle.label || `Ciclo #${cycle.id}`,
    type: cycle.type || 'SEMANAL',
    status: cycle.status || 'CLOSED',
    // FIX: Unificar campos de fecha (closedAt vs endDate)
    startedAt: cycle.startedAt || cycle.startDate || cycle.createdAt || new Date().toISOString(),
    closedAt: cycle.closedAt || cycle.endDate || new Date().toISOString(),
    closedBy: cycle.closedBy || 'Administrador',
    totalRevenue: Number(cycle.totalRevenue) || 0,
    totalProfit: Number(cycle.totalProfit) || 0,
    // FIX: Normalizar characterEarnings (puede venir como profitByCharacter o characterEarnings)
    characterEarnings: normalizeCharacterEarnings(cycle),
    // FIX: Normalizar soldItems (puede venir como itemsSold o soldItems con shapes distintos)
    soldItems: normalizeSoldItems(cycle),
    // FIX: Normalizar unsoldItemIds siempre como array de strings
    unsoldItemIds: Array.isArray(cycle.unsoldItemIds)
      ? cycle.unsoldItemIds.map(String)
      : [],
    clanFundAmount: Number(cycle.clanFundAmount) || 0,
    clanTaxPercent: Number(cycle.clanTaxPercent) || 0,
    clanFundPaidOut: Boolean(cycle.clanFundPaidOut),
    clanFundPaidAt: cycle.clanFundPaidAt || null,
    clanFundPaidBy: cycle.clanFundPaidBy || null,
  };
}

function normalizeCharacterEarnings(cycle: any): any[] {
  // Si ya tiene el formato correcto
  if (Array.isArray(cycle.characterEarnings) && cycle.characterEarnings.length > 0) {
    return cycle.characterEarnings.map((ce: any) => ({
      characterId: String(ce.characterId),
      characterName: ce.characterName || String(ce.characterId),
      earnings: Number(ce.earnings) || 0,
      paidOut: Boolean(ce.paidOut),
      paidAt: ce.paidAt || null,
      paidBy: ce.paidBy || null,
    }));
  }
  // Si viene como profitByCharacter (objeto { userId: amount })
  if (cycle.profitByCharacter && typeof cycle.profitByCharacter === 'object') {
    const allUsers = dbInstance.users || [];
    return Object.entries(cycle.profitByCharacter)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([uid, amount]) => {
        const user = allUsers.find((u: any) => String(u.id) === String(uid));
        return {
          characterId: String(uid),
          characterName: user?.characterName || user?.name || String(uid),
          earnings: Number(amount) || 0,
        };
      });
  }
  return [];
}

function normalizeSoldItems(cycle: any): any[] {
  // Si ya tiene el formato correcto (soldItems con itemName)
  if (Array.isArray(cycle.soldItems) && cycle.soldItems.length > 0) {
    return cycle.soldItems.map((si: any) => ({
      itemId: String(si.itemId),
      // FIX: Unificar campo nombre (itemName vs name)
      itemName: si.itemName || si.name || String(si.itemId),
      category: si.category || 'ARMA',
      price: Number(si.price) || 0,
      // FIX: Unificar campo cantidad (quantitySold vs quantity)
      quantitySold: Number(si.quantitySold || si.quantity) || 0,
      totalRevenue: Number(si.totalRevenue || si.total) || 0,
      // FIX: Normalizar associatedCharacterIds como strings
      associatedCharacterIds: Array.isArray(si.associatedCharacterIds)
        ? si.associatedCharacterIds.map(String)
        : [],
      earningsPerCharacter: Number(si.earningsPerCharacter) || 0,
    }));
  }
  // Si viene como itemsSold (formato del router: { itemId, quantity })
  if (Array.isArray(cycle.itemsSold) && cycle.itemsSold.length > 0) {
    const allItems = dbInstance.items || [];
    return cycle.itemsSold.map((si: any) => {
      const item = allItems.find((i: any) => i.id === si.itemId || String(i.id) === String(si.itemId));
      const qty = Number(si.quantity) || 0;
      const price = Number(item?.price) || 0;
      const totalRev = price * qty;
      const assocIds = Array.isArray(item?.associatedCharacterIds)
        ? item.associatedCharacterIds.map(String)
        : [];
      const assocCount = assocIds.length || 1;
      return {
        itemId: String(si.itemId),
        itemName: item?.name || String(si.itemId),
        category: item?.category || 'ARMA',
        price,
        quantitySold: qty,
        totalRevenue: totalRev,
        associatedCharacterIds: assocIds,
        earningsPerCharacter: Math.floor(totalRev / assocCount),
      };
    });
  }
  return [];
}

export const createSalesCycle = async (data: any) => {
  const newCycle = { ...data, id: Math.floor(Math.random() * 1000000), status: 'OPEN', createdAt: new Date() };
  dbInstance.salesCycles.push(newCycle);
  saveDb(dbInstance);
  return newCycle;
};

export const closeSalesCycle = async (id: number, data: any) => {
  // 1. Obtener datos actuales para el resumen del ciclo
  const items = dbInstance.items || [];
  const users = dbInstance.users || [];

  // Identificar items vendidos en ESTE ciclo (quantitySoldInCycle > 0)
  const soldItems = items
    .filter(i => (i.quantitySoldInCycle || 0) > 0)
    .map(i => {
      const assocIds = Array.isArray(i.associatedCharacterIds)
        ? i.associatedCharacterIds.map(String)
        : [];
      const associatedCount = assocIds.length || 1;
      const totalRev = (Number(i.price) || 0) * (i.quantitySoldInCycle || 0);
      return {
        itemId: String(i.id),
        itemName: i.name,
        category: i.category || 'ARMA',
        price: Number(i.price) || 0,
        quantitySold: i.quantitySoldInCycle,
        totalRevenue: totalRev,
        associatedCharacterIds: assocIds,
        earningsPerCharacter: Math.floor(totalRev / associatedCount),
      };
    });

  // Identificar ganancias por usuario (1 cuenta = 1 personaje)
  const characterEarnings = users
    .filter((u: any) => (Number(u.currentCycleEarnings) || 0) > 0)
    .map((u: any) => ({
      characterId: String(u.id),
      characterName: u.characterName || u.name || 'Sin nombre',
      earnings: Number(u.currentCycleEarnings) || 0,
    }));

  // FIX: Identificar items no vendidos correctamente
  // Un item no vendido es aquel que tiene stock disponible (quantity > quantitySold)
  // y que NO fue completamente vendido en este ciclo
  const unsoldItemIds = items
    .filter(i => {
      const qty = Number(i.quantity) || 0;
      const sold = Number(i.quantitySold) || 0;
      return qty - sold > 0; // Tiene stock disponible
    })
    .map(i => String(i.id));

  // Calcular totales
  const totalRevenue = data.totalRevenue !== undefined
    ? Number(data.totalRevenue)
    : soldItems.reduce((acc, i) => acc + i.totalRevenue, 0);
  const totalProfit = data.totalProfit !== undefined
    ? Number(data.totalProfit)
    : totalRevenue;

  // FIX: Determinar el número de ciclo correcto
  const closedCyclesCount = (dbInstance.salesCycles || []).filter(c => c.status === 'CLOSED').length;
  const cycleLabel = data.label || `Ciclo #${closedCyclesCount + 1}`;

  // Usar el monto REAL acumulado de retenciones del clan en este ciclo
  // (no recalcular, para evitar discrepancias con las transacciones individuales)
  const clanSettings = dbInstance.clanFundSettings || { clanTaxPercent: 0 };
  const clanTaxPct = Number(clanSettings.clanTaxPercent) || 0;
  const clanFundAmount = data.clanFundAmount !== undefined
    ? Number(data.clanFundAmount)
    : (Number(dbInstance.clanFundCurrentCycleAccrued) || 0);

  // 2. FIX: Guardar el ciclo con el shape UNIFICADO que espera el cliente
  const newCycle = {
    id: Math.floor(Math.random() * 1000000),
    label: cycleLabel,
    type: data.type || 'SEMANAL',
    status: 'CLOSED',
    // FIX: Usar 'closedAt' (no 'endDate') para consistencia con el cliente
    startedAt: data.startedAt || new Date().toISOString(),
    closedAt: new Date().toISOString(),
    closedBy: data.closedBy || 'Administrador',
    totalRevenue,
    totalProfit,
    characterEarnings,
    soldItems,
    unsoldItemIds,
    clanFundAmount,
    clanTaxPercent: clanTaxPct,
    clanFundPaidOut: false,
    clanFundPaidAt: null,
    clanFundPaidBy: null,
  };

  if (!dbInstance.salesCycles) dbInstance.salesCycles = [];
  dbInstance.salesCycles.push(newCycle);

  // Registrar en el log de auditoría
  createAuditLog({
    userId: data.closedByUserId,
    action: 'CYCLE_CLOSED',
    detail: `Cerró ${newCycle.label} (${newCycle.type}) con $${totalRevenue.toLocaleString()} recaudados y ${soldItems.length} venta(s).`,
    details: { cycle: newCycle.label, totalRevenue, sold: soldItems.length },
  });

  // Registrar transacción de retención del clan al cerrar el ciclo (settled=false hasta que se pague)
  if (clanFundAmount > 0) {
    await addClanFundTransaction({
      type: 'income',
      amount: clanFundAmount,
      description: `Retención ${clanTaxPct}% — ${newCycle.label} ($${totalRevenue.toLocaleString()} recaudados)`,
      relatedCycleId: String(newCycle.id),
      settled: false,
      createdBy: data.closedBy || 'Administrador',
      createdByUserId: data.closedByUserId,
    });
  }

  // 3. FIX: Resetear quantitySoldInCycle en todos los items
  // IMPORTANTE: NO resetear quantitySold (es el histórico acumulado)
  // IMPORTANTE: NO tocar associatedCharacterIds (relación permanente)
  if (dbInstance.items) {
    dbInstance.items = dbInstance.items.map(item => ({
      ...item,
      quantitySoldInCycle: 0,
      // FIX: Si el item fue completamente vendido, mantener status VENDIDO
      // Si no, restaurar a CONFIRMED para que siga disponible en el siguiente ciclo
      status: (() => {
        const qty = Number(item.quantity) || 0;
        const sold = Number(item.quantitySold) || 0;
        if (sold >= qty && qty > 0) return 'VENDIDO';
        // Si estaba como VENDIDO pero tiene stock, restaurar a CONFIRMED
        if (item.status === 'VENDIDO' && sold < qty) return 'CONFIRMED';
        return item.status;
      })(),
    }));
  }

  // 4. FIX: Resetear currentCycleEarnings en todos los personajes
  // IMPORTANTE: NO resetear totalEarnings (es el histórico acumulado)
  if (dbInstance.characters) {
    dbInstance.characters = dbInstance.characters.map(char => ({
      ...char,
      currentCycleEarnings: 0,
    }));
  }

  // 5. FIX: Resetear currentCycleEarnings en todos los usuarios
  if (dbInstance.users) {
    dbInstance.users = dbInstance.users.map(user => ({
      ...user,
      currentCycleEarnings: 0,
    }));
  }

  // 6. Resetear acumulado del clan para el próximo ciclo
  dbInstance.clanFundCurrentCycleAccrued = 0;

  saveDb(dbInstance);
  return newCycle;
};

// Marca (o desmarca) el pago manual de la adena a un personaje dentro de un
// ciclo cerrado. Es solo un flag visual de control — no afecta totales ni
// mueve plata, es un recordatorio para el admin de "a éste ya le pagué".
export const setSalesCycleCharacterPaid = async (
  cycleId: string,
  characterId: string,
  paidOut: boolean,
  actorName?: string,
  actorUserId?: number,
) => {
  const cycles = dbInstance.salesCycles || [];
  const idx = cycles.findIndex((c: any) => String(c.id) === String(cycleId));
  if (idx === -1) throw new Error(`Ciclo ${cycleId} no encontrado`);
  const cycle: any = cycles[idx];
  if (!Array.isArray(cycle.characterEarnings)) cycle.characterEarnings = [];
  const ceIdx = cycle.characterEarnings.findIndex(
    (ce: any) => String(ce.characterId) === String(characterId)
  );
  if (ceIdx === -1) throw new Error(`Personaje ${characterId} no registrado en este ciclo`);
  const ce = cycle.characterEarnings[ceIdx];
  ce.paidOut = paidOut;
  ce.paidAt = paidOut ? new Date().toISOString() : null;
  ce.paidBy = paidOut ? (actorName || 'Administrador') : null;
  cycle.characterEarnings[ceIdx] = ce;
  cycles[idx] = cycle;
  dbInstance.salesCycles = cycles;

  await createAuditLog({
    userId: actorUserId,
    action: paidOut ? 'CYCLE_PAYOUT_MARKED' : 'CYCLE_PAYOUT_UNMARKED',
    detail: `${paidOut ? 'Marcó' : 'Desmarcó'} como pagado a ${ce.characterName} ($${(ce.earnings ?? 0).toLocaleString()}) en ${cycle.label || cycle.id}.`,
    details: {
      cycle: cycle.label || String(cycle.id),
      cycleId: String(cycle.id),
      characterId: String(characterId),
      characterName: ce.characterName,
      earnings: ce.earnings,
      paidOut,
    },
  });

  saveDb(dbInstance);
  return normalizeCycle(cycle);
};

// Marca a todos los personajes del ciclo como pagados. Útil cuando el admin
// ya distribuyó la adena completa y quiere cerrar el ciclo de pagos de una.
export const setSalesCycleAllPaid = async (
  cycleId: string,
  actorName?: string,
  actorUserId?: number,
) => {
  const cycles = dbInstance.salesCycles || [];
  const idx = cycles.findIndex((c: any) => String(c.id) === String(cycleId));
  if (idx === -1) throw new Error(`Ciclo ${cycleId} no encontrado`);
  const cycle: any = cycles[idx];
  if (!Array.isArray(cycle.characterEarnings)) cycle.characterEarnings = [];
  const now = new Date().toISOString();
  const by = actorName || 'Administrador';
  let changed = 0;
  cycle.characterEarnings = cycle.characterEarnings.map((ce: any) => {
    if (!ce.paidOut) changed += 1;
    return { ...ce, paidOut: true, paidAt: ce.paidAt || now, paidBy: ce.paidBy || by };
  });
  cycles[idx] = cycle;
  dbInstance.salesCycles = cycles;

  await createAuditLog({
    userId: actorUserId,
    action: 'CYCLE_PAYOUT_ALL_MARKED',
    detail: `Marcó a todos los personajes como pagados (${changed} cambiado(s)) en ${cycle.label || cycle.id}.`,
    details: {
      cycle: cycle.label || String(cycle.id),
      cycleId: String(cycle.id),
      charactersChanged: changed,
      totalCharacters: cycle.characterEarnings.length,
    },
  });

  saveDb(dbInstance);
  return normalizeCycle(cycle);
};

// ---------------------------------------------------------------------------
// Pagos por clan en ciclos de venta de raid. Mismo patrón que el legacy:
// flag manual `paidOut` dentro de cada clan de `summary.clansParticipated`,
// audit log del módulo raid, access control se valida en el router.
// ---------------------------------------------------------------------------
export const setRaidSalesCycleClanPaid = async (
  cycleId: number | string,
  clanId: number | string,
  paidOut: boolean,
  actorName?: string,
  actorUserId?: number,
) => {
  const cycles = dbInstance.raidSalesCycles || [];
  const idx = cycles.findIndex((c: any) => Number(c.id) === Number(cycleId));
  if (idx === -1) throw new Error(`Ciclo de venta raid ${cycleId} no encontrado`);
  const cycle: any = cycles[idx];
  if (!cycle.summary) throw new Error('El ciclo no tiene resumen persistido');
  if (!Array.isArray(cycle.summary.clansParticipated)) {
    cycle.summary.clansParticipated = [];
  }
  const cIdx = cycle.summary.clansParticipated.findIndex(
    (c: any) => Number(c.clanId) === Number(clanId)
  );
  if (cIdx === -1) throw new Error(`Clan ${clanId} no registrado en este ciclo`);
  const clanRow = cycle.summary.clansParticipated[cIdx];
  clanRow.paidOut = paidOut;
  clanRow.paidAt = paidOut ? new Date().toISOString() : null;
  clanRow.paidBy = paidOut ? (actorName || 'Administrador') : null;
  cycle.summary.clansParticipated[cIdx] = clanRow;
  cycle.updatedAt = new Date().toISOString();
  cycles[idx] = cycle;
  dbInstance.raidSalesCycles = cycles;

  await createRaidAuditLog({
    userId: actorUserId || 0,
    action: paidOut ? 'RAID_SALES_CYCLE_CLAN_PAID' : 'RAID_SALES_CYCLE_CLAN_UNPAID',
    details: {
      salesCycleId: Number(cycle.id),
      label: cycle.label,
      clanId: Number(clanId),
      clanName: clanRow.clanName,
      revenueShare: clanRow.revenueShare,
      paidOut,
    },
  });

  saveDb(dbInstance);
  return cycle;
};

export const setRaidSalesCycleAllClansPaid = async (
  cycleId: number | string,
  actorName?: string,
  actorUserId?: number,
) => {
  const cycles = dbInstance.raidSalesCycles || [];
  const idx = cycles.findIndex((c: any) => Number(c.id) === Number(cycleId));
  if (idx === -1) throw new Error(`Ciclo de venta raid ${cycleId} no encontrado`);
  const cycle: any = cycles[idx];
  if (!cycle.summary) throw new Error('El ciclo no tiene resumen persistido');
  if (!Array.isArray(cycle.summary.clansParticipated)) {
    cycle.summary.clansParticipated = [];
  }
  const now = new Date().toISOString();
  const by = actorName || 'Administrador';
  let changed = 0;
  cycle.summary.clansParticipated = cycle.summary.clansParticipated.map((c: any) => {
    if (!c.paidOut) changed += 1;
    return {
      ...c,
      paidOut: true,
      paidAt: c.paidAt || now,
      paidBy: c.paidBy || by,
    };
  });
  cycle.updatedAt = now;
  cycles[idx] = cycle;
  dbInstance.raidSalesCycles = cycles;

  await createRaidAuditLog({
    userId: actorUserId || 0,
    action: 'RAID_SALES_CYCLE_CLAN_ALL_PAID',
    details: {
      salesCycleId: Number(cycle.id),
      label: cycle.label,
      clansChanged: changed,
      totalClans: cycle.summary.clansParticipated.length,
    },
  });

  saveDb(dbInstance);
  return cycle;
};

// Normaliza y enriquece un log de auditoría antes de persistirlo.
// Reglas:
//   1) `createdAt` siempre ISO string (no Date object — el cliente deserializa mal).
//   2) Si falta `actorName` o `actorRole`, se intenta resolver por `userId`
//      buscando en dbInstance.users para que el historial tenga quién hizo qué
//      aunque el call site se haya olvidado de pasarlos.
//   3) `itemId` se castea a string para uniformidad con los logs antiguos.
//   4) Si falta `detail` y `details` tiene info aprovechable, se arma una frase
//      humana en base a la acción (fallback mínimo — el call site sigue siendo
//      responsable de proveer un detail descriptivo cuando puede).
export const createAuditLog = async (data: any) => {
  if (!dbInstance.auditLogs) dbInstance.auditLogs = [];

  const enriched: any = { ...data };

  // 1) createdAt ISO
  const rawCreatedAt = enriched.createdAt;
  if (rawCreatedAt instanceof Date) {
    enriched.createdAt = rawCreatedAt.toISOString();
  } else if (typeof rawCreatedAt === 'string' && rawCreatedAt) {
    enriched.createdAt = rawCreatedAt;
  } else {
    enriched.createdAt = new Date().toISOString();
  }

  // 2) actorName / actorRole por userId si no vienen
  if ((!enriched.actorName || !enriched.actorRole) && enriched.userId != null) {
    const actor = (dbInstance.users || []).find(u => Number(u.id) === Number(enriched.userId));
    if (actor) {
      if (!enriched.actorName) {
        enriched.actorName = String(
          actor.characterName || actor.name || actor.email || 'Usuario'
        ).trim();
      }
      if (!enriched.actorRole) {
        enriched.actorRole = String(actor.role || 'user');
      }
    }
  }
  if (!enriched.actorName) enriched.actorName = 'Sistema';
  if (!enriched.actorRole) enriched.actorRole = 'system';

  // 3) itemId como string (histórico tenía inconsistencias)
  if (enriched.itemId != null) {
    enriched.itemId = String(enriched.itemId);
  }

  // 4) detail fallback
  if (!enriched.detail) {
    const d = enriched.details || {};
    const act = String(enriched.action || '').toUpperCase();
    if (d.itemName && (act.includes('ITEM') || act.includes('PRICE') || act.includes('IMAGE'))) {
      enriched.detail = `${enriched.actorName} ejecutó ${act} sobre "${d.itemName}".`;
      if (!enriched.itemName) enriched.itemName = d.itemName;
    } else if (d.targetEmail) {
      enriched.detail = `${enriched.actorName} ejecutó ${act} sobre ${d.targetEmail}.`;
    } else if (d.cycle) {
      enriched.detail = `${enriched.actorName} ejecutó ${act} sobre ${d.cycle}.`;
    }
  }

  enriched.id = Math.floor(Math.random() * 1000000);
  dbInstance.auditLogs.push(enriched);
  saveDb(dbInstance);
};
export const getAuditLogs = async () => dbInstance.auditLogs || [];

export const createPurchase = async (data: any) => {
  const newPurchase = { ...data, id: Math.floor(Math.random() * 1000000), createdAt: new Date() };
  if (!dbInstance.purchases) dbInstance.purchases = [];
  dbInstance.purchases.push(newPurchase);
  saveDb(dbInstance);
  return newPurchase;
};

export const getPurchases = async () => dbInstance.purchases || [];

export const getDashboardMetrics = async () => {
  const items = dbInstance.items || [];
  const cycles = dbInstance.salesCycles || [];
  const totalInventoryValue = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const currentCycle = cycles.find(c => c.status === 'OPEN' || c.status === 'ACTIVO');
  const cycleProfit = currentCycle ? Number(currentCycle.revenue || currentCycle.totalProfit) || 0 : 0;

  return {
    totalItems: items.length,
    confirmedItems: items.filter(i => i.status === 'CONFIRMED' || i.status === 'CONFIRMADO' || i.status === '✅ Confirmado').length,
    totalInventoryValue,
    cycleProfit,
    currentCycle: currentCycle || null,
    totalRevenue: cycles.reduce((acc, c) => acc + (Number(c.revenue || c.totalRevenue || c.totalProfit) || 0), 0),
    activeCycleNumber: cycles.length > 0 ? cycles.length : 1,
  };
};

// ============================================================================
// Fondo del Clan — funciones de acceso y mutación
// ============================================================================

export const getClanFundSettings = () => {
  return dbInstance.clanFundSettings || { clanTaxPercent: 0, internalDiscountPercent: 0 };
};

export const updateClanFundSettings = async (
  updates: { clanTaxPercent?: number; internalDiscountPercent?: number },
  actorUserId?: number,
) => {
  const prev = dbInstance.clanFundSettings || { clanTaxPercent: 0, internalDiscountPercent: 0 };
  dbInstance.clanFundSettings = { ...prev, ...updates };
  await createAuditLog({
    userId: actorUserId,
    action: 'CLAN_FUND_SETTINGS_UPDATED',
    detail: `Actualizó configuración del fondo del clan: ${JSON.stringify(updates)}.`,
    details: { previous: prev, updated: updates },
  });
  saveDb(dbInstance);
  return dbInstance.clanFundSettings;
};

export const getClanFundTransactions = () => {
  return dbInstance.clanFundTransactions || [];
};

export const addClanFundTransaction = async (tx: {
  type: 'income' | 'expense';
  amount: number;
  description: string;
  evidenceUrl?: string;
  relatedItemId?: string;
  relatedCycleId?: string;
  settled?: boolean;
  createdBy: string;
  createdByUserId?: number;
}) => {
  if (!dbInstance.clanFundTransactions) dbInstance.clanFundTransactions = [];
  const entry = {
    id: Math.floor(Math.random() * 1000000),
    ...tx,
    settled: tx.type === 'expense' ? true : (tx.settled ?? false),
    createdAt: new Date().toISOString(),
  };
  dbInstance.clanFundTransactions.push(entry);
  await createAuditLog({
    userId: tx.createdByUserId,
    action: tx.type === 'income' ? 'CLAN_FUND_INCOME' : 'CLAN_FUND_EXPENSE',
    detail: tx.type === 'income'
      ? `Ingreso al fondo del clan: $${tx.amount.toLocaleString()} — ${tx.description}`
      : `Gasto del fondo del clan: $${tx.amount.toLocaleString()} — ${tx.description}`,
    details: entry,
  });
  saveDb(dbInstance);
  return entry;
};

export const getClanFundSummary = () => {
  const txs = dbInstance.clanFundTransactions || [];
  // Solo contar ingresos de ciclos pagados (settled=true)
  const totalIncome = txs
    .filter((t: any) => t.type === 'income' && t.settled === true)
    .reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
  const totalExpense = txs
    .filter((t: any) => t.type === 'expense')
    .reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
  // Ingresos pendientes (ciclos cerrados pero no pagados)
  const pendingIncome = txs
    .filter((t: any) => t.type === 'income' && t.settled !== true)
    .reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    pendingIncome,
  };
};

export const updateClanFundTransaction = async (
  txId: number,
  updates: { amount?: number; description?: string; evidenceUrl?: string },
  actorUserId?: number,
) => {
  const txs = dbInstance.clanFundTransactions || [];
  const idx = txs.findIndex((t: any) => Number(t.id) === Number(txId));
  if (idx === -1) throw new Error(`Transacción ${txId} no encontrada`);
  const tx = txs[idx] as any;
  if (tx.type !== 'expense') throw new Error('Solo se pueden editar gastos');
  const oldAmount = tx.amount;
  if (updates.amount !== undefined) tx.amount = updates.amount;
  if (updates.description !== undefined) tx.description = updates.description;
  if (updates.evidenceUrl !== undefined) tx.evidenceUrl = updates.evidenceUrl;
  tx.updatedAt = new Date().toISOString();
  txs[idx] = tx;
  dbInstance.clanFundTransactions = txs;
  await createAuditLog({
    userId: actorUserId,
    action: 'CLAN_FUND_EXPENSE_UPDATED',
    detail: `Editó gasto del fondo del clan: $${oldAmount.toLocaleString()} → $${tx.amount.toLocaleString()} — ${tx.description}`,
    details: { txId, oldAmount, newAmount: tx.amount, description: tx.description },
  });
  saveDb(dbInstance);
  return tx;
};

export const deleteClanFundTransaction = async (
  txId: number,
  actorUserId?: number,
) => {
  const txs = dbInstance.clanFundTransactions || [];
  const idx = txs.findIndex((t: any) => Number(t.id) === Number(txId));
  if (idx === -1) throw new Error(`Transacción ${txId} no encontrada`);
  const tx = txs[idx] as any;
  if (tx.type !== 'expense') throw new Error('Solo se pueden eliminar gastos');
  txs.splice(idx, 1);
  dbInstance.clanFundTransactions = txs;
  await createAuditLog({
    userId: actorUserId,
    action: 'CLAN_FUND_EXPENSE_DELETED',
    detail: `Eliminó gasto del fondo del clan: $${tx.amount.toLocaleString()} — ${tx.description}`,
    details: { txId, amount: tx.amount, description: tx.description },
  });
  saveDb(dbInstance);
  return { success: true };
};

export const setSalesCycleClanPaid = async (
  cycleId: string,
  paidOut: boolean,
  actorName?: string,
  actorUserId?: number,
) => {
  const cycles = dbInstance.salesCycles || [];
  const idx = cycles.findIndex((c: any) => String(c.id) === String(cycleId));
  if (idx === -1) throw new Error(`Ciclo ${cycleId} no encontrado`);
  const cycle: any = cycles[idx];
  cycle.clanFundPaidOut = paidOut;
  cycle.clanFundPaidAt = paidOut ? new Date().toISOString() : null;
  cycle.clanFundPaidBy = paidOut ? (actorName || 'Administrador') : null;
  cycles[idx] = cycle;
  dbInstance.salesCycles = cycles;

  // Marcar/desmarcar las transacciones de ingreso del clan como settled
  const txs = dbInstance.clanFundTransactions || [];
  for (const tx of txs) {
    if (tx.type === 'income' && String(tx.relatedCycleId) === String(cycleId)) {
      tx.settled = paidOut;
    }
  }

  await createAuditLog({
    userId: actorUserId,
    action: paidOut ? 'CLAN_FUND_CYCLE_PAID' : 'CLAN_FUND_CYCLE_UNPAID',
    detail: `${paidOut ? 'Marcó' : 'Desmarcó'} como pagado el aporte del clan ($${(cycle.clanFundAmount ?? 0).toLocaleString()}) en ${cycle.label || cycle.id}.`,
    details: {
      cycle: cycle.label || String(cycle.id),
      cycleId: String(cycle.id),
      clanFundAmount: cycle.clanFundAmount,
      paidOut,
    },
  });

  saveDb(dbInstance);
  return normalizeCycle(cycle);
};

export const getUserByOpenId = async (openId: string) => {
  return (dbInstance.users || []).find(u => u.openId === openId);
};

export const getUserByEmail = async (email: string) => {
  return (dbInstance.users || []).find(u => String(u.email || '').toLowerCase() === String(email || '').toLowerCase());
};

// ============================================================
// Funciones de gestión de usuarios (para Super Admin)
// ============================================================

export const getAllUsers = async () => {
  return (dbInstance.users || []).map(u => ({
    id: u.id,
    email: u.email,
    name: u.characterName || u.name || 'Usuario',
    characterName: u.characterName,
    role: u.role || 'user',
    isActive: u.isActive !== undefined ? u.isActive : true,
    legacyAccess: u.legacyAccess === true,
    loginMethod: u.loginMethod,
    createdAt: u.createdAt,
    lastSignedIn: u.lastSignedIn,
    openId: u.openId,
    raidClanId: u.raidClanId || null,
    raidCpId: u.raidCpId || null,
    cpStatus: u.cpStatus || null,
    classMain: u.classMain || null,
    raidAccessLevel: u.raidAccessLevel || null,
    totalEarnings: Number(u.totalEarnings) || 0,
    currentCycleEarnings: Number(u.currentCycleEarnings) || 0,
    lockedUntil: u.lockedUntil || null,
    failedLoginAttempts: u.failedLoginAttempts || 0,
  }));
};

// Update user profile fields (SA only) — email, characterName, clan, CP, class
export const updateUserProfile = async (userId: number, data: {
  email?: string;
  characterName?: string;
  raidClanId?: number | null;
  raidCpId?: number | null;
  classMain?: string | null;
}) => {
  const userIndex = dbInstance.users.findIndex((u: any) => Number(u.id) === Number(userId));
  if (userIndex === -1) return null;
  const user = dbInstance.users[userIndex];

  if (data.email !== undefined) {
    const normalized = data.email.toLowerCase().trim();
    // Check uniqueness
    const dup = dbInstance.users.find(
      (u: any) => u.email === normalized && Number(u.id) !== Number(userId)
    );
    if (dup) throw new Error('EMAIL_DUPLICATE');
    user.email = normalized;
    user.openId = `local-${normalized}`;
  }
  if (data.characterName !== undefined) {
    user.characterName = data.characterName;
    user.name = data.characterName;
  }
  if (data.raidClanId !== undefined) user.raidClanId = data.raidClanId;
  if (data.raidCpId !== undefined) {
    user.raidCpId = data.raidCpId;
    user.cpStatus = data.raidCpId ? 'confirmed' : null;
  }
  if (data.classMain !== undefined) user.classMain = data.classMain;
  user.updatedAt = nowIso();
  saveDb(dbInstance);
  return user;
};

export const setUserActive = async (userId: number, isActive: boolean) => {
  const userIndex = dbInstance.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return null;
  dbInstance.users[userIndex] = { ...dbInstance.users[userIndex], isActive, updatedAt: new Date() };
  saveDb(dbInstance);
  return dbInstance.users[userIndex];
};

export const setUserRole = async (userId: number, role: string) => {
  const userIndex = dbInstance.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return null;
  dbInstance.users[userIndex] = { ...dbInstance.users[userIndex], role: normalizeRole(role), updatedAt: new Date() };
  saveDb(dbInstance);
  return dbInstance.users[userIndex];
};

export const setUserLegacyAccess = async (userId: number, legacyAccess: boolean) => {
  const userIndex = dbInstance.users.findIndex((u: any) => Number(u.id) === Number(userId));
  if (userIndex === -1) return null;
  dbInstance.users[userIndex] = { ...dbInstance.users[userIndex], legacyAccess, updatedAt: new Date().toISOString() };
  saveDb(dbInstance);
  return dbInstance.users[userIndex];
};

export const getUserById = async (userId: number) => {
  return dbInstance.users.find(u => u.id === userId);
};

export const deleteUser = async (userId: number) => {
  const user = dbInstance.users.find(u => u.id === userId);
  if (!user) return null;
  dbInstance.users = dbInstance.users.filter(u => u.id !== userId);
  saveDb(dbInstance);
  return user;
};

export const updateUserPassword = async (userId: number, passwordHash: string) => {
  const userIndex = dbInstance.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return null;
  dbInstance.users[userIndex] = { ...dbInstance.users[userIndex], passwordHash, updatedAt: new Date() };
  saveDb(dbInstance);
  return dbInstance.users[userIndex];
};

// ============================================================================
// 2FA TOTP (PR6)
// ============================================================================

export const setUserTwoFactorPending = async (userId: number, secret: string) => {
  const idx = dbInstance.users.findIndex(u => u.id === userId);
  if (idx === -1) return null;
  dbInstance.users[idx] = {
    ...dbInstance.users[idx],
    twoFactorPendingSecret: secret,
    updatedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return dbInstance.users[idx];
};

export const enableUserTwoFactor = async (
  userId: number,
  secret: string,
  backupCodeHashes: string[],
) => {
  const idx = dbInstance.users.findIndex(u => u.id === userId);
  if (idx === -1) return null;
  dbInstance.users[idx] = {
    ...dbInstance.users[idx],
    twoFactorEnabled: true,
    twoFactorSecret: secret,
    twoFactorPendingSecret: null,
    twoFactorBackupCodeHashes: backupCodeHashes,
    updatedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return dbInstance.users[idx];
};

export const disableUserTwoFactor = async (userId: number) => {
  const idx = dbInstance.users.findIndex(u => u.id === userId);
  if (idx === -1) return null;
  dbInstance.users[idx] = {
    ...dbInstance.users[idx],
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorPendingSecret: null,
    twoFactorBackupCodeHashes: [],
    updatedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return dbInstance.users[idx];
};

// Consume un backup code: si el hash está en la lista lo remueve y devuelve true.
export const consumeBackupCodeHash = async (
  userId: number,
  candidateHash: string,
): Promise<boolean> => {
  const idx = dbInstance.users.findIndex(u => u.id === userId);
  if (idx === -1) return false;
  const list: string[] = Array.isArray(dbInstance.users[idx].twoFactorBackupCodeHashes)
    ? dbInstance.users[idx].twoFactorBackupCodeHashes
    : [];
  const hashIdx = list.indexOf(candidateHash);
  if (hashIdx === -1) return false;
  const newList = [...list.slice(0, hashIdx), ...list.slice(hashIdx + 1)];
  dbInstance.users[idx] = {
    ...dbInstance.users[idx],
    twoFactorBackupCodeHashes: newList,
    updatedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return true;
};

export const markUserEmailVerified = async (userId: number) => {
  const userIndex = dbInstance.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return null;
  if (dbInstance.users[userIndex].emailVerified === true) {
    return dbInstance.users[userIndex];
  }
  dbInstance.users[userIndex] = {
    ...dbInstance.users[userIndex],
    emailVerified: true,
    updatedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return dbInstance.users[userIndex];
};

// ============================================================================
// Tokens de reset de contraseña + verificación de email (PR5)
// ============================================================================
// Guardamos solo el hash del token (sha256 hex de 64 chars) para que si
// data_storage.json se filtra, un atacante no pueda reusar tokens pendientes
// sin tener acceso al mailbox del usuario. El token plano (crypto.randomBytes
// de 32 bytes → 64 chars hex) solo existe en el email y en el link que el
// usuario clickea. Al validar, volvemos a hashear el token que llega y lo
// comparamos contra los hashes almacenados.
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;         // 1 hora
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
// Throttle de re-envío: evitamos que un atacante spamee emails a un buzón
// real. Si hay un token activo (no usado, no expirado) emitido hace menos
// de RESEND_THROTTLE_MS, no creamos uno nuevo.
const RESEND_THROTTLE_MS = 60 * 1000; // 1 minuto

export const PASSWORD_RESET_TTL_MINUTES = Math.round(PASSWORD_RESET_TTL_MS / 60000);
export const EMAIL_VERIFICATION_TTL_HOURS = Math.round(EMAIL_VERIFICATION_TTL_MS / (60 * 60 * 1000));

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function genRawToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

interface IssueTokenContext {
  userId: number;
  email: string;
  ip?: string | null;
  userAgent?: string | null;
}

interface IssuedToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
}

function getActiveTokenFor(
  collection: 'passwordResetTokens' | 'emailVerifications',
  userId: number,
): any | null {
  const now = Date.now();
  const list = dbInstance[collection] || [];
  // Devolvemos el más reciente activo (no usado + no expirado).
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (!t || t.userId !== userId) continue;
    if (t.usedAt) continue;
    const exp = new Date(t.expiresAt).getTime();
    if (Number.isNaN(exp) || exp <= now) continue;
    return t;
  }
  return null;
}

export const issuePasswordResetToken = async (
  ctx: IssueTokenContext,
): Promise<{ issued: IssuedToken | null; throttled: boolean }> => {
  // Si hay un token activo emitido hace < RESEND_THROTTLE_MS, throttle.
  const active = getActiveTokenFor('passwordResetTokens', ctx.userId);
  if (active) {
    const age = Date.now() - new Date(active.createdAt).getTime();
    if (age < RESEND_THROTTLE_MS) {
      return { issued: null, throttled: true };
    }
    // Invalidamos el anterior antes de emitir uno nuevo (evita tener N tokens
    // vivos a la vez). Lo marcamos como usado con una nota.
    const idx = dbInstance.passwordResetTokens.findIndex((t: any) => t.id === active.id);
    if (idx >= 0) {
      dbInstance.passwordResetTokens[idx] = {
        ...active,
        usedAt: new Date().toISOString(),
        supersededAt: new Date().toISOString(),
      };
    }
  }
  const rawToken = genRawToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString();
  const record = {
    id: genId(),
    userId: ctx.userId,
    email: ctx.email,
    tokenHash,
    purpose: 'password_reset',
    createdAt: now.toISOString(),
    expiresAt,
    usedAt: null,
    ip: ctx.ip || null,
    userAgent: (ctx.userAgent || '').slice(0, 200) || null,
  };
  dbInstance.passwordResetTokens.push(record);
  saveDb(dbInstance);
  return { issued: { rawToken, tokenHash, expiresAt }, throttled: false };
};

export const consumePasswordResetToken = async (
  rawToken: string,
): Promise<{ ok: boolean; userId?: number; reason?: 'not_found' | 'expired' | 'used' }> => {
  const tokenHash = hashToken(rawToken);
  const idx = (dbInstance.passwordResetTokens || []).findIndex(
    (t: any) => t.tokenHash === tokenHash,
  );
  if (idx < 0) return { ok: false, reason: 'not_found' };
  const record = dbInstance.passwordResetTokens[idx];
  if (record.usedAt) return { ok: false, reason: 'used' };
  const exp = new Date(record.expiresAt).getTime();
  if (Number.isNaN(exp) || exp <= Date.now()) return { ok: false, reason: 'expired' };
  dbInstance.passwordResetTokens[idx] = {
    ...record,
    usedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return { ok: true, userId: record.userId };
};

export const issueEmailVerificationToken = async (
  ctx: IssueTokenContext,
): Promise<{ issued: IssuedToken | null; throttled: boolean }> => {
  const active = getActiveTokenFor('emailVerifications', ctx.userId);
  if (active) {
    const age = Date.now() - new Date(active.createdAt).getTime();
    if (age < RESEND_THROTTLE_MS) {
      return { issued: null, throttled: true };
    }
    const idx = dbInstance.emailVerifications.findIndex((t: any) => t.id === active.id);
    if (idx >= 0) {
      dbInstance.emailVerifications[idx] = {
        ...active,
        usedAt: new Date().toISOString(),
        supersededAt: new Date().toISOString(),
      };
    }
  }
  const rawToken = genRawToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS).toISOString();
  const record = {
    id: genId(),
    userId: ctx.userId,
    email: ctx.email,
    tokenHash,
    purpose: 'email_verification',
    createdAt: now.toISOString(),
    expiresAt,
    usedAt: null,
    ip: ctx.ip || null,
    userAgent: (ctx.userAgent || '').slice(0, 200) || null,
  };
  dbInstance.emailVerifications.push(record);
  saveDb(dbInstance);
  return { issued: { rawToken, tokenHash, expiresAt }, throttled: false };
};

export const consumeEmailVerificationToken = async (
  rawToken: string,
): Promise<{ ok: boolean; userId?: number; reason?: 'not_found' | 'expired' | 'used' }> => {
  const tokenHash = hashToken(rawToken);
  const idx = (dbInstance.emailVerifications || []).findIndex(
    (t: any) => t.tokenHash === tokenHash,
  );
  if (idx < 0) return { ok: false, reason: 'not_found' };
  const record = dbInstance.emailVerifications[idx];
  if (record.usedAt) return { ok: false, reason: 'used' };
  const exp = new Date(record.expiresAt).getTime();
  if (Number.isNaN(exp) || exp <= Date.now()) return { ok: false, reason: 'expired' };
  dbInstance.emailVerifications[idx] = {
    ...record,
    usedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return { ok: true, userId: record.userId };
};

// Purga de tokens vencidos y usados viejos (> 7 días). Idempotente, barato.
// Conservamos los usados recientes para que el audit log tenga contexto.
export const pruneExpiredAuthTokens = () => {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  let changed = false;
  const filterCollection = (list: any[]): any[] => {
    const filtered = list.filter((t: any) => {
      const exp = new Date(t.expiresAt).getTime();
      const usedAt = t.usedAt ? new Date(t.usedAt).getTime() : null;
      // Si ya se usó hace > 1 semana → descartar.
      if (usedAt && usedAt < weekAgo) return false;
      // Si expiró hace > 1 semana y nunca se usó → descartar.
      if (!usedAt && !Number.isNaN(exp) && exp < weekAgo) return false;
      return true;
    });
    if (filtered.length !== list.length) changed = true;
    return filtered;
  };
  dbInstance.passwordResetTokens = filterCollection(dbInstance.passwordResetTokens || []);
  dbInstance.emailVerifications = filterCollection(dbInstance.emailVerifications || []);
  if (changed) saveDb(dbInstance);
};

// ============================================================================
// Tracking de intentos de login (anti brute-force)
// ============================================================================
// Persistimos en el usuario dos campos nuevos:
//   - failedLoginAttempts: counter que se incrementa en cada fallo y se
//     resetea en cada login exitoso.
//   - lockedUntil: timestamp ISO hasta el cual la cuenta queda bloqueada.
// El backend los lee/escribe a través de estas helpers para evitar tocar
// directamente dbInstance desde los endpoints.
export const LOGIN_MAX_FAILED_ATTEMPTS = 2;
export const LOGIN_LOCKOUT_MINUTES = 5;

// Progressive lockout durations based on number of failed attempts
function getLockoutMinutes(attempts: number): number {
  if (attempts >= 4) return 60 * 24; // 24 hours
  if (attempts >= 3) return 30;       // 30 minutes
  return 5;                           // 5 minutes (2 attempts)
}

export interface LoginLockStatus {
  locked: boolean;
  remainingMs: number;
  until: string | null;
}

export const getLoginLockStatus = (user: any): LoginLockStatus => {
  const lockedUntilRaw = user?.lockedUntil;
  if (!lockedUntilRaw) return { locked: false, remainingMs: 0, until: null };
  const until = new Date(lockedUntilRaw).getTime();
  if (Number.isNaN(until)) return { locked: false, remainingMs: 0, until: null };
  const now = Date.now();
  if (until > now) {
    return { locked: true, remainingMs: until - now, until: new Date(until).toISOString() };
  }
  return { locked: false, remainingMs: 0, until: null };
};

export const registerFailedLogin = async (userId: number) => {
  const idx = dbInstance.users.findIndex(u => u.id === userId);
  if (idx === -1) return null;
  const current = dbInstance.users[idx];
  const attempts = Number(current.failedLoginAttempts || 0) + 1;
  let lockedUntil: string | null = current.lockedUntil || null;
  // Progressive lockout: 2 attempts → 5min, 3 → 30min, 4+ → 24h
  if (attempts >= LOGIN_MAX_FAILED_ATTEMPTS) {
    const lockMinutes = getLockoutMinutes(attempts);
    lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000).toISOString();
  }
  dbInstance.users[idx] = {
    ...current,
    failedLoginAttempts: attempts,
    lockedUntil,
    updatedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return dbInstance.users[idx];
};

export const resetLoginAttempts = async (userId: number) => {
  const idx = dbInstance.users.findIndex(u => u.id === userId);
  if (idx === -1) return null;
  const current = dbInstance.users[idx];
  if (!current.failedLoginAttempts && !current.lockedUntil) return current;
  dbInstance.users[idx] = {
    ...current,
    failedLoginAttempts: 0,
    lockedUntil: null,
    updatedAt: new Date().toISOString(),
  };
  saveDb(dbInstance);
  return dbInstance.users[idx];
};

// ============================================================================
// ============================================================================
// MÓDULO RAID BOSS — persistencia aislada (no interfiere con el sistema viejo)
// ============================================================================
// ============================================================================

// Tipos del nivel de acceso al módulo raid. Solo 3 roles nuevos + viewer_only.
export type RaidAccessLevel = 'raid_admin' | 'raid_mapper' | 'raid_user' | 'viewer_only';

const VALID_RAID_ACCESS_LEVELS: RaidAccessLevel[] = ['raid_admin', 'raid_mapper', 'raid_user', 'viewer_only'];

function genId(): number {
  return Math.floor(Math.random() * 1_000_000_000) + Date.now() % 1_000_000;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------- Raid Bosses (catálogo - solo super admin) -----------------------

export const getRaidBosses = async () => {
  return (dbInstance.raidBosses || []).slice().sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
};

export const getRaidBossById = async (id: number) => {
  return (dbInstance.raidBosses || []).find(b => Number(b.id) === Number(id));
};

export const createRaidBoss = async (data: {
  name: string;
  officialImageUrl?: string | null;
  level?: number | null;
  notes?: string | null;
}) => {
  const newBoss = {
    id: genId(),
    name: data.name.trim(),
    officialImageUrl: data.officialImageUrl || null,
    level: data.level ?? null,
    notes: data.notes || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  dbInstance.raidBosses.push(newBoss);
  saveDb(dbInstance);
  return newBoss;
};

export const updateRaidBoss = async (id: number, data: Partial<{
  name: string;
  officialImageUrl: string | null;
  level: number | null;
  notes: string | null;
}>) => {
  const idx = dbInstance.raidBosses.findIndex(b => Number(b.id) === Number(id));
  if (idx === -1) return null;
  dbInstance.raidBosses[idx] = {
    ...dbInstance.raidBosses[idx],
    ...data,
    updatedAt: nowIso(),
  };
  saveDb(dbInstance);
  return dbInstance.raidBosses[idx];
};

export const deleteRaidBoss = async (id: number) => {
  const boss = dbInstance.raidBosses.find(b => Number(b.id) === Number(id));
  if (!boss) return null;
  dbInstance.raidBosses = dbInstance.raidBosses.filter(b => Number(b.id) !== Number(id));
  saveDb(dbInstance);
  return boss;
};

export const countRaidBossUsage = async (id: number) => {
  return (dbInstance.raidEvents || []).filter(
    e => Number(e.raidBossId) === Number(id)
  ).length;
};

// ---------- Clanes (catálogo - super admin / raid_admin) --------------------

export const getClans = async () => {
  return (dbInstance.clans || []).slice().sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
};

export const getClanById = async (id: number) => {
  return (dbInstance.clans || []).find(c => Number(c.id) === Number(id));
};

export const createClan = async (data: {
  name: string;
  tag?: string | null;
  description?: string | null;
}) => {
  const newClan = {
    id: genId(),
    name: data.name.trim(),
    tag: data.tag || null,
    description: data.description || null,
    totalRaidEarnings: 0,
    currentCycleEarnings: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  dbInstance.clans.push(newClan);
  saveDb(dbInstance);
  return newClan;
};

export const updateClan = async (id: number, data: Partial<{
  name: string;
  tag: string | null;
  description: string | null;
  totalRaidEarnings: number;
  currentCycleEarnings: number;
}>) => {
  const idx = dbInstance.clans.findIndex(c => Number(c.id) === Number(id));
  if (idx === -1) return null;
  dbInstance.clans[idx] = {
    ...dbInstance.clans[idx],
    ...data,
    updatedAt: nowIso(),
  };
  saveDb(dbInstance);
  return dbInstance.clans[idx];
};

export const deleteClan = async (id: number) => {
  const clan = dbInstance.clans.find(c => Number(c.id) === Number(id));
  if (!clan) return null;
  dbInstance.clans = dbInstance.clans.filter(c => Number(c.id) !== Number(id));
  // Limpiar asociaciones en raidEventClans
  dbInstance.raidEventClans = (dbInstance.raidEventClans || []).filter(ec => Number(ec.clanId) !== Number(id));
  saveDb(dbInstance);
  return clan;
};

export const countClanUsage = async (id: number) => {
  return (dbInstance.raidEventClans || []).filter(
    ec => Number(ec.clanId) === Number(id)
  ).length;
};

// ---------- Command Parties (CP) — sub-grupos dentro de clanes ---------------

export const getCommandParties = async () => {
  return (dbInstance.raidCommandParties || []).slice().sort((a: any, b: any) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
};

export const getCommandPartiesByClan = async (clanId: number) => {
  return (dbInstance.raidCommandParties || []).filter(
    (cp: any) => Number(cp.clanId) === Number(clanId)
  );
};

export const getCommandPartyById = async (id: number) => {
  return (dbInstance.raidCommandParties || []).find((cp: any) => Number(cp.id) === Number(id));
};

export const createCommandParty = async (data: { name: string; clanId: number }) => {
  if (!dbInstance.raidCommandParties) dbInstance.raidCommandParties = [];
  const newCp = {
    id: genId(),
    name: data.name.trim(),
    clanId: Number(data.clanId),
    leaderId: null as number | null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  dbInstance.raidCommandParties.push(newCp);
  saveDb(dbInstance);
  return newCp;
};

export const updateCommandParty = async (id: number, data: Partial<{
  name: string;
  clanId: number;
  leaderId: number | null;
  leaderIds: number[];
}>) => {
  if (!dbInstance.raidCommandParties) dbInstance.raidCommandParties = [];
  const idx = dbInstance.raidCommandParties.findIndex((cp: any) => Number(cp.id) === Number(id));
  if (idx === -1) return null;
  dbInstance.raidCommandParties[idx] = {
    ...dbInstance.raidCommandParties[idx],
    ...data,
    updatedAt: nowIso(),
  };
  saveDb(dbInstance);
  return dbInstance.raidCommandParties[idx];
};

export const deleteCommandParty = async (id: number) => {
  if (!dbInstance.raidCommandParties) dbInstance.raidCommandParties = [];
  const cp = dbInstance.raidCommandParties.find((c: any) => Number(c.id) === Number(id));
  if (!cp) return null;
  dbInstance.raidCommandParties = dbInstance.raidCommandParties.filter(
    (c: any) => Number(c.id) !== Number(id)
  );
  // Clear CP assignment from users who belonged to this CP
  (dbInstance.users || []).forEach((u: any) => {
    if (Number(u.raidCpId) === Number(id)) {
      u.raidCpId = null;
      u.cpStatus = 'removed';
    }
  });
  saveDb(dbInstance);
  return cp;
};

// Get users by CP
export const getUsersByCp = async (cpId: number) => {
  return (dbInstance.users || []).filter(
    (u: any) => Number(u.raidCpId) === Number(cpId)
  );
};

// Get users by clan
export const getUsersByClan = async (clanId: number) => {
  return (dbInstance.users || []).filter(
    (u: any) => Number(u.raidClanId) === Number(clanId)
  );
};

// Get users without CP (removed or unassigned)
export const getUsersWithoutCp = async () => {
  return (dbInstance.users || []).filter(
    (u: any) => u.raidClanId && !u.raidCpId && u.cpStatus === 'removed'
  );
};

// Set user CP status (confirm / remove)
export const setUserCpStatus = async (
  userId: number,
  status: 'confirmed' | 'removed',
  actorUserId?: number,
) => {
  const user = (dbInstance.users || []).find((u: any) => Number(u.id) === Number(userId));
  if (!user) throw new Error(`Usuario ${userId} no encontrado`);
  user.cpStatus = status;
  if (status === 'removed') {
    user.raidCpId = null;
  }
  user.updatedAt = nowIso();
  saveDb(dbInstance);
  await createRaidAuditLog({
    userId: actorUserId || 0,
    action: status === 'confirmed' ? 'CP_MEMBER_CONFIRMED' : 'CP_MEMBER_REMOVED',
    details: {
      targetUserId: userId,
      targetUserName: user.name || user.characterName || user.email,
      cpId: user.raidCpId,
      clanId: user.raidClanId,
    },
  });
  return user;
};

// Reassign user to a different CP
export const reassignUserCp = async (
  userId: number,
  clanId: number | null,
  cpId: number | null,
  actorUserId?: number,
) => {
  const user = (dbInstance.users || []).find((u: any) => Number(u.id) === Number(userId));
  if (!user) throw new Error(`Usuario ${userId} no encontrado`);
  user.raidClanId = clanId;
  user.raidCpId = cpId;
  user.cpStatus = cpId ? 'pending' : null;
  user.updatedAt = nowIso();
  saveDb(dbInstance);
  await createRaidAuditLog({
    userId: actorUserId || 0,
    action: 'CP_MEMBER_REASSIGNED',
    details: {
      targetUserId: userId,
      targetUserName: user.name || user.characterName || user.email,
      newClanId: clanId,
      newCpId: cpId,
    },
  });
  return user;
};

// ---------- Available character classes (Super Admin configures) ---------------

export const getAvailableClasses = async () => {
  return (dbInstance.raidAvailableClasses || []).slice().sort((a: any, b: any) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
};

export const addAvailableClass = async (name: string) => {
  if (!dbInstance.raidAvailableClasses) dbInstance.raidAvailableClasses = [];
  const exists = dbInstance.raidAvailableClasses.some(
    (c: any) => String(c.name).toLowerCase() === name.trim().toLowerCase()
  );
  if (exists) throw new Error(`La clase "${name}" ya existe`);
  const entry = { id: genId(), name: name.trim(), createdAt: nowIso() };
  dbInstance.raidAvailableClasses.push(entry);
  saveDb(dbInstance);
  return entry;
};

export const updateAvailableClass = async (id: number, name: string) => {
  if (!dbInstance.raidAvailableClasses) return null;
  const cls = dbInstance.raidAvailableClasses.find((c: any) => Number(c.id) === Number(id));
  if (!cls) return null;
  const trimmed = name.trim();
  const duplicate = dbInstance.raidAvailableClasses.some(
    (c: any) => Number(c.id) !== Number(id) && String(c.name).toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) throw new Error(`La clase "${trimmed}" ya existe`);
  const oldName = cls.name;
  cls.name = trimmed;
  cls.updatedAt = nowIso();
  // Propagate rename to secondary characters that reference the old class name
  if (oldName !== trimmed && dbInstance.secondaryCharacters) {
    for (const sc of dbInstance.secondaryCharacters) {
      if (String(sc.className || '').toLowerCase() === String(oldName).toLowerCase()) {
        sc.className = trimmed;
      }
    }
  }
  saveDb(dbInstance);
  return cls;
};

export const deleteAvailableClass = async (id: number) => {
  if (!dbInstance.raidAvailableClasses) return null;
  const idx = dbInstance.raidAvailableClasses.findIndex((c: any) => Number(c.id) === Number(id));
  if (idx === -1) return null;
  const removed = dbInstance.raidAvailableClasses.splice(idx, 1)[0];
  saveDb(dbInstance);
  return removed;
};

// ---------- Secondary characters (alts per user) ----------------------------

export const getSecondaryCharacters = async (userId: number) => {
  return (dbInstance.secondaryCharacters || []).filter(
    (sc: any) => Number(sc.userId) === Number(userId)
  );
};

export const getSecondaryCharactersByUsers = async (userIds: number[]) => {
  const idSet = new Set(userIds.map(Number));
  return (dbInstance.secondaryCharacters || []).filter(
    (sc: any) => idSet.has(Number(sc.userId))
  );
};

export const addSecondaryCharacter = async (userId: number, data: { name: string; className?: string }) => {
  if (!dbInstance.secondaryCharacters) dbInstance.secondaryCharacters = [];
  const entry = {
    id: genId(),
    userId: Number(userId),
    name: data.name.trim(),
    className: data.className?.trim() || null,
    createdAt: nowIso(),
  };
  dbInstance.secondaryCharacters.push(entry);
  saveDb(dbInstance);
  return entry;
};

export const updateSecondaryCharacter = async (id: number, userId: number, data: { name?: string; className?: string | null }) => {
  if (!dbInstance.secondaryCharacters) return null;
  const sc = dbInstance.secondaryCharacters.find(
    (s: any) => Number(s.id) === Number(id) && Number(s.userId) === Number(userId)
  );
  if (!sc) return null;
  if (data.name !== undefined) sc.name = data.name.trim();
  if (data.className !== undefined) sc.className = data.className?.trim() || null;
  sc.updatedAt = nowIso();
  saveDb(dbInstance);
  return sc;
};

export const deleteSecondaryCharacter = async (id: number, userId: number) => {
  if (!dbInstance.secondaryCharacters) return null;
  const idx = dbInstance.secondaryCharacters.findIndex(
    (sc: any) => Number(sc.id) === Number(id) && Number(sc.userId) === Number(userId)
  );
  if (idx === -1) return null;
  const removed = dbInstance.secondaryCharacters.splice(idx, 1)[0];
  saveDb(dbInstance);
  return removed;
};

// ---------- Acceso al módulo raid por usuario -------------------------------

export const getUserRaidAccess = async (userId: number) => {
  return (dbInstance.userRaidAccess || []).find(a => Number(a.userId) === Number(userId));
};

export const listUserRaidAccess = async () => {
  return dbInstance.userRaidAccess || [];
};

export const setUserRaidAccess = async (
  userId: number,
  accessLevel: RaidAccessLevel | null,
  grantedByUserId?: number
) => {
  if (!VALID_RAID_ACCESS_LEVELS.includes(accessLevel as RaidAccessLevel) && accessLevel !== null) {
    throw new Error(`Nivel de acceso raid inválido: ${accessLevel}`);
  }

  // Si accessLevel es null, se revoca el acceso
  if (accessLevel === null) {
    dbInstance.userRaidAccess = (dbInstance.userRaidAccess || []).filter(a => Number(a.userId) !== Number(userId));
    saveDb(dbInstance);
    return null;
  }

  const existingIdx = (dbInstance.userRaidAccess || []).findIndex(a => Number(a.userId) === Number(userId));
  const record = {
    id: existingIdx >= 0 ? dbInstance.userRaidAccess[existingIdx].id : genId(),
    userId: Number(userId),
    accessLevel,
    grantedBy: grantedByUserId || null,
    grantedAt: nowIso(),
    updatedAt: nowIso(),
  };
  if (existingIdx >= 0) {
    dbInstance.userRaidAccess[existingIdx] = { ...dbInstance.userRaidAccess[existingIdx], ...record };
  } else {
    if (!dbInstance.userRaidAccess) dbInstance.userRaidAccess = [];
    dbInstance.userRaidAccess.push(record);
  }
  saveDb(dbInstance);
  return record;
};

// Bulk: asigna el mismo accessLevel a múltiples usuarios de una sola vez.
export const setBulkUserRaidAccess = async (
  userIds: number[],
  accessLevel: RaidAccessLevel | null,
  grantedByUserId?: number
) => {
  const results: any[] = [];
  for (const userId of userIds) {
    const res = await setUserRaidAccess(userId, accessLevel, grantedByUserId);
    results.push({ userId, access: res });
  }
  return results;
};

// Determina si un usuario puede ver el módulo raid.
// Reglas:
//   - super_admin del sistema viejo → siempre puede (admin total).
//   - usuario con userRaidAccess registrado → puede (nivel según accessLevel).
//   - cualquier otro → no puede.
export const canUserAccessRaidModule = async (user: any): Promise<{
  canAccess: boolean;
  canInteract: boolean;
  canAdmin: boolean;
  accessLevel: RaidAccessLevel | 'super_admin' | null;
}> => {
  if (!user) return { canAccess: false, canInteract: false, canAdmin: false, accessLevel: null };
  const role = String(user.role || '').toLowerCase();
  if (role === 'super_admin') {
    return { canAccess: true, canInteract: true, canAdmin: true, accessLevel: 'super_admin' };
  }
  const access = await getUserRaidAccess(Number(user.id));
  if (!access) return { canAccess: false, canInteract: false, canAdmin: false, accessLevel: null };
  const level = access.accessLevel as RaidAccessLevel;
  const canInteract = level === 'raid_admin' || level === 'raid_mapper';
  const canAdmin = level === 'raid_admin';
  return { canAccess: true, canInteract, canAdmin, accessLevel: level };
};

// ---------- Raid Cycles (uno solo abierto a la vez, como salesCycles) -------

export const getRaidCycles = async () => {
  return (dbInstance.raidCycles || []).slice().sort((a, b) => {
    const sa = String(a.createdAt || a.startedAt || '');
    const sb = String(b.createdAt || b.startedAt || '');
    return sb.localeCompare(sa);
  });
};

export const getCurrentRaidCycle = async () => {
  return (dbInstance.raidCycles || []).find(c => c.status === 'OPEN') || null;
};

export const createRaidCycle = async (data: {
  label?: string | null;
  type?: 'DIARIO' | 'SEMANAL';
  createdByUserId?: number;
}) => {
  // Enforcar: solo un ciclo raid abierto a la vez
  const existingOpen = await getCurrentRaidCycle();
  if (existingOpen) {
    throw new Error('Ya existe un ciclo de raid abierto. Ciérralo antes de abrir uno nuevo.');
  }
  const closedCount = (dbInstance.raidCycles || []).filter(c => c.status === 'CLOSED').length;
  const cycle = {
    id: genId(),
    label: data.label || `Ciclo de Raids #${closedCount + 1}`,
    type: data.type || 'DIARIO',
    status: 'OPEN',
    startedAt: nowIso(),
    closedAt: null,
    closedBy: null,
    totalBosses: 0,
    totalEvents: 0,
    totalRevenue: 0,
    clansParticipated: [],
    bossesKilled: [],
    summary: null,
    createdBy: data.createdByUserId || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  if (!dbInstance.raidCycles) dbInstance.raidCycles = [];
  dbInstance.raidCycles.push(cycle);
  saveDb(dbInstance);
  return cycle;
};

export const closeRaidCycle = async (cycleId: number, closedByUser: any) => {
  const idx = dbInstance.raidCycles.findIndex(c => Number(c.id) === Number(cycleId));
  if (idx === -1) return null;
  const cycle = dbInstance.raidCycles[idx];
  if (cycle.status !== 'OPEN') {
    throw new Error('El ciclo no está abierto.');
  }

  // Agregar eventos del ciclo
  const eventsInCycle = (dbInstance.raidEvents || []).filter(e => Number(e.cycleId) === Number(cycleId));
  const eventIds = eventsInCycle.map(e => Number(e.id));

  // Drop items del ciclo
  const dropsInCycle = (dbInstance.raidDropItems || []).filter(d => eventIds.includes(Number(d.eventId)));

  // Clanes participantes en el ciclo
  const clanLinksInCycle = (dbInstance.raidEventClans || []).filter(l => eventIds.includes(Number(l.eventId)));
  const clanIdsSet = new Set<number>(clanLinksInCycle.map(l => Number(l.clanId)));

  const clans = dbInstance.clans || [];
  const clansParticipated = Array.from(clanIdsSet).map(clanId => {
    const clan = clans.find((c: any) => Number(c.id) === Number(clanId));
    return {
      clanId: Number(clanId),
      clanName: clan?.name || `Clan #${clanId}`,
      eventsParticipated: clanLinksInCycle.filter(l => Number(l.clanId) === Number(clanId)).length,
      revenueShare: Number(clan?.currentCycleEarnings) || 0,
    };
  });

  // Bosses matados en el ciclo (por nombre + conteo)
  const bossCountMap = new Map<number, number>();
  for (const ev of eventsInCycle) {
    const k = Number(ev.raidBossId);
    bossCountMap.set(k, (bossCountMap.get(k) || 0) + 1);
  }
  const bossesKilled = Array.from(bossCountMap.entries()).map(([bossId, count]) => {
    const boss = (dbInstance.raidBosses || []).find((b: any) => Number(b.id) === Number(bossId));
    return {
      bossId: Number(bossId),
      bossName: boss?.name || `Boss #${bossId}`,
      officialImageUrl: boss?.officialImageUrl || null,
      kills: count,
    };
  });

  const totalRevenue = dropsInCycle.reduce(
    (acc, d) => acc + (Number(d.price) || 0) * (Number(d.quantitySoldInCycle) || 0),
    0
  );
  const totalPotentialValue = dropsInCycle.reduce(
    (acc, d) => acc + (Number(d.price) || 0) * (Number(d.quantity) || 0),
    0
  );

  const summary = {
    events: eventsInCycle.length,
    drops: dropsInCycle.length,
    bosses: bossesKilled.reduce((a, b) => a + b.kills, 0),
    clans: clansParticipated.length,
    totalRevenue,
    totalPotentialValue,
  };

  dbInstance.raidCycles[idx] = {
    ...cycle,
    status: 'CLOSED',
    closedAt: nowIso(),
    closedBy: closedByUser?.characterName || closedByUser?.name || closedByUser?.email || 'Super Admin',
    totalBosses: summary.bosses,
    totalEvents: summary.events,
    totalRevenue,
    clansParticipated,
    bossesKilled,
    summary,
    updatedAt: nowIso(),
  };

  // Reset quantitySoldInCycle de los drops del ciclo para que el siguiente ciclo empiece limpio
  // (respetamos quantitySold histórico)
  if (dbInstance.raidDropItems) {
    dbInstance.raidDropItems = dbInstance.raidDropItems.map(d => {
      if (eventIds.includes(Number(d.eventId))) {
        return { ...d, quantitySoldInCycle: 0 };
      }
      return d;
    });
  }

  // Reset currentCycleEarnings en los clanes
  if (dbInstance.clans) {
    dbInstance.clans = dbInstance.clans.map(c => ({
      ...c,
      totalRaidEarnings: (Number(c.totalRaidEarnings) || 0) + (Number(c.currentCycleEarnings) || 0),
      currentCycleEarnings: 0,
    }));
  }

  saveDb(dbInstance);
  await createRaidAuditLog({
    userId: closedByUser?.id || 0,
    action: 'RAID_CYCLE_CLOSED',
    details: {
      cycleId: Number(cycleId),
      label: cycle.label,
      ...summary,
    },
  });
  return dbInstance.raidCycles[idx];
};

// ---------- Raid Events (un "kill" de un boss con evidencia) ----------------

export const getRaidEvents = async (filter?: { cycleId?: number; bossId?: number }) => {
  const events = dbInstance.raidEvents || [];
  let filtered = events;
  if (filter?.cycleId) {
    filtered = filtered.filter(e => Number(e.cycleId) === Number(filter.cycleId));
  }
  if (filter?.bossId) {
    filtered = filtered.filter(e => Number(e.raidBossId) === Number(filter.bossId));
  }
  return filtered.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
};

export const getRaidEventById = async (id: number) => {
  return (dbInstance.raidEvents || []).find(e => Number(e.id) === Number(id));
};

export const createRaidEvent = async (data: {
  raidBossId: number;
  cycleId: number;
  evidenceImageUrl?: string | null;
  reportedByUserId: number;
  notes?: string | null;
  clanIds?: number[];
  dropItems?: Array<{
    name: string;
    category: string;
    price: number;
    quantity: number;
    imageUrl?: string | null;
  }>;
}) => {
  const event = {
    id: genId(),
    raidBossId: Number(data.raidBossId),
    cycleId: Number(data.cycleId),
    evidenceImageUrl: data.evidenceImageUrl || null,
    reportedByUserId: Number(data.reportedByUserId),
    notes: data.notes || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  dbInstance.raidEvents.push(event);

  // Clanes asociados
  const clanIds = Array.isArray(data.clanIds) ? data.clanIds.map(Number) : [];
  if (!dbInstance.raidEventClans) dbInstance.raidEventClans = [];
  for (const clanId of clanIds) {
    dbInstance.raidEventClans.push({
      id: genId(),
      eventId: event.id,
      clanId: Number(clanId),
      createdAt: nowIso(),
    });
  }

  // Drop items (inventario raid)
  const dropItems = Array.isArray(data.dropItems) ? data.dropItems : [];
  const createdDropItems: any[] = [];
  if (!dbInstance.raidDropItems) dbInstance.raidDropItems = [];
  for (const di of dropItems) {
    const drop = {
      id: genId(),
      eventId: event.id,
      raidBossId: Number(data.raidBossId),
      cycleId: Number(data.cycleId),
      name: String(di.name || '').trim(),
      category: String(di.category || 'DROP').trim(),
      price: Number(di.price) || 0,
      quantity: Number(di.quantity) || 1,
      quantitySold: 0,
      quantitySoldInCycle: 0,
      imageUrl: di.imageUrl || null,
      status: 'EN_REGISTRO',
      associatedClanIds: clanIds,
      reportedByUserId: Number(data.reportedByUserId),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    dbInstance.raidDropItems.push(drop);
    createdDropItems.push(drop);
  }

  saveDb(dbInstance);
  return { event, clanIds, dropItems: createdDropItems };
};

export const updateRaidEvent = async (id: number, data: Partial<{
  evidenceImageUrl: string | null;
  notes: string | null;
  clanIds: number[];
}>) => {
  const idx = dbInstance.raidEvents.findIndex(e => Number(e.id) === Number(id));
  if (idx === -1) return null;
  const updateObj: any = { updatedAt: nowIso() };
  if (data.evidenceImageUrl !== undefined) updateObj.evidenceImageUrl = data.evidenceImageUrl;
  if (data.notes !== undefined) updateObj.notes = data.notes;
  dbInstance.raidEvents[idx] = { ...dbInstance.raidEvents[idx], ...updateObj };

  if (Array.isArray(data.clanIds)) {
    dbInstance.raidEventClans = (dbInstance.raidEventClans || []).filter(ec => Number(ec.eventId) !== Number(id));
    for (const clanId of data.clanIds) {
      dbInstance.raidEventClans.push({
        id: genId(),
        eventId: Number(id),
        clanId: Number(clanId),
        createdAt: nowIso(),
      });
    }
    // Reflejar en drops del evento
    dbInstance.raidDropItems = (dbInstance.raidDropItems || []).map(d =>
      Number(d.eventId) === Number(id) ? { ...d, associatedClanIds: data.clanIds!.map(Number) } : d
    );
  }

  saveDb(dbInstance);
  return dbInstance.raidEvents[idx];
};

export const deleteRaidEvent = async (id: number) => {
  const event = await getRaidEventById(id);
  if (!event) return null;
  dbInstance.raidEvents = dbInstance.raidEvents.filter(e => Number(e.id) !== Number(id));
  dbInstance.raidEventClans = (dbInstance.raidEventClans || []).filter(ec => Number(ec.eventId) !== Number(id));
  dbInstance.raidDropItems = (dbInstance.raidDropItems || []).filter(d => Number(d.eventId) !== Number(id));
  saveDb(dbInstance);
  return event;
};

export const getRaidEventClans = async (eventId: number) => {
  const links = (dbInstance.raidEventClans || []).filter(ec => Number(ec.eventId) === Number(eventId));
  const clanIds = links.map(l => Number(l.clanId));
  return (dbInstance.clans || []).filter(c => clanIds.includes(Number(c.id)));
};

// ---------- Raid Drop Items (inventario del módulo raid) --------------------

export const getRaidDropItems = async (filter?: { eventId?: number; cycleId?: number; clanId?: number }) => {
  let drops = dbInstance.raidDropItems || [];
  if (filter?.eventId) drops = drops.filter(d => Number(d.eventId) === Number(filter.eventId));
  if (filter?.cycleId) drops = drops.filter(d => Number(d.cycleId) === Number(filter.cycleId));
  if (filter?.clanId) drops = drops.filter(d => {
    const ids = Array.isArray(d.associatedClanIds) ? d.associatedClanIds.map(Number) : [];
    return ids.includes(Number(filter.clanId));
  });
  return drops.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
};

export const getRaidDropItemById = async (id: number) => {
  return (dbInstance.raidDropItems || []).find(d => Number(d.id) === Number(id));
};

export const updateRaidDropItem = async (id: number, data: Partial<{
  name: string;
  category: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  status: string;
  associatedClanIds: number[];
}>) => {
  const idx = dbInstance.raidDropItems.findIndex(d => Number(d.id) === Number(id));
  if (idx === -1) return null;
  dbInstance.raidDropItems[idx] = {
    ...dbInstance.raidDropItems[idx],
    ...data,
    updatedAt: nowIso(),
  };
  saveDb(dbInstance);
  return dbInstance.raidDropItems[idx];
};

export const deleteRaidDropItem = async (id: number) => {
  const drop = await getRaidDropItemById(id);
  if (!drop) return null;
  dbInstance.raidDropItems = dbInstance.raidDropItems.filter(d => Number(d.id) !== Number(id));
  saveDb(dbInstance);
  return drop;
};

export const sellRaidDropItem = async (
  id: number,
  quantityToSell: number,
  soldByUser: any,
  buyer?: { buyerId: number; buyerName: string } | null
) => {
  const drop = await getRaidDropItemById(id);
  if (!drop) throw new Error('Drop item no encontrado.');
  const qty = Number(drop.quantity) || 0;
  const sold = Number(drop.quantitySold) || 0;
  const available = qty - sold;
  if (quantityToSell > available) {
    throw new Error(`Sólo hay ${available} unidades disponibles.`);
  }
  const newSold = sold + quantityToSell;
  const newSoldInCycle = (Number(drop.quantitySoldInCycle) || 0) + quantityToSell;
  const fullySold = newSold >= qty && qty > 0;
  const revenue = (Number(drop.price) || 0) * quantityToSell;

  await updateRaidDropItem(id, {
    quantitySold: newSold,
    quantitySoldInCycle: newSoldInCycle,
    status: fullySold ? 'VENDIDO' : drop.status,
  } as any);

  // Distribuir ingresos a los clanes asociados
  const clanIds: number[] = Array.isArray(drop.associatedClanIds) ? drop.associatedClanIds.map(Number) : [];
  const associatedCount = clanIds.length || 1;
  const earningsPerClan = Math.floor(revenue / associatedCount);
  if (dbInstance.clans && clanIds.length > 0) {
    dbInstance.clans = dbInstance.clans.map(c => {
      if (clanIds.includes(Number(c.id))) {
        return {
          ...c,
          currentCycleEarnings: (Number(c.currentCycleEarnings) || 0) + earningsPerClan,
        };
      }
      return c;
    });
  }
  saveDb(dbInstance);

  // Si el drop quedó totalmente vendido, archivamos las reservas vivas como
  // snapshot en el audit log y limpiamos la tabla. Si el drop todavía tiene
  // stock, las reservas quedan vivas (pueden seguir compitiendo por las
  // unidades restantes).
  let reservationsSnapshot: RaidDropReservation[] = [];
  if (fullySold) {
    reservationsSnapshot = await clearReservationsForDrop(Number(id));
  }

  await createRaidAuditLog({
    userId: soldByUser?.id || 0,
    action: 'RAID_DROP_SOLD',
    details: {
      dropItemId: Number(id),
      itemName: drop.name,
      quantitySold: quantityToSell,
      revenue,
      clansShared: clanIds,
      buyerId: buyer?.buyerId ?? null,
      buyerName: buyer?.buyerName ?? null,
      reservationsSnapshot: reservationsSnapshot.map(r => ({
        userId: r.userId,
        userName: r.userName,
        characterName: r.characterName,
        quantity: r.quantity,
        createdAt: r.createdAt,
      })),
    },
  });

  return { revenue, earningsPerClan, clanIds, buyer: buyer || null };
};

// ---------- Raid Category Icons (iconos por categoría de drop, super admin) -

// Categorías válidas — deben coincidir con src/lib/category-meta.ts
export const RAID_DROP_CATEGORIES = [
  'ARMADURA', 'ARMA', 'JOYA', 'KEY', 'RECIPE', 'MATERIALES', 'QUEST', 'ADENA',
] as const;

export const getRaidCategoryIcons = async (): Promise<Array<{
  category: string;
  imageUrl: string;
  updatedAt: string;
}>> => {
  return (dbInstance.raidCategoryIcons || []).slice();
};

export const setRaidCategoryIcon = async (category: string, imageUrl: string) => {
  const cat = String(category || '').trim().toUpperCase();
  if (!cat) throw new Error('Categoría vacía.');
  const url = String(imageUrl || '').trim();
  if (!url) throw new Error('URL/archivo de imagen vacío.');
  if (!dbInstance.raidCategoryIcons) dbInstance.raidCategoryIcons = [];
  const idx = dbInstance.raidCategoryIcons.findIndex(
    (x: any) => String(x.category || '').toUpperCase() === cat
  );
  const payload = {
    id: idx === -1 ? genId() : dbInstance.raidCategoryIcons[idx].id,
    category: cat,
    imageUrl: url,
    updatedAt: nowIso(),
  };
  if (idx === -1) dbInstance.raidCategoryIcons.push(payload);
  else dbInstance.raidCategoryIcons[idx] = payload;
  saveDb(dbInstance);
  return payload;
};

export const deleteRaidCategoryIcon = async (category: string) => {
  const cat = String(category || '').trim().toUpperCase();
  if (!dbInstance.raidCategoryIcons) return null;
  const before = dbInstance.raidCategoryIcons.length;
  dbInstance.raidCategoryIcons = dbInstance.raidCategoryIcons.filter(
    (x: any) => String(x.category || '').toUpperCase() !== cat
  );
  if (dbInstance.raidCategoryIcons.length === before) return null;
  saveDb(dbInstance);
  return { category: cat };
};

// ---------- Raid Drop Reservations -----------------------------------------
// Las reservas son señales de intención de compra que cualquier usuario con
// acceso raid puede registrar sobre un drop disponible. NO descuentan stock
// real — solo alimentan la lista de espera que ve el raid_admin / super admin
// al momento de vender. La validación clave es:
//   suma(quantity de reservas vivas) + nueva <= remainingInCycle
// Esto evita que una sola persona "acapare" el stock con reservas.

export interface RaidDropReservation {
  id: number;
  dropItemId: number;
  userId: number;
  userName: string;
  characterName: string;
  quantity: number;
  createdAt: string;
}

export const getRaidDropReservations = async (filter?: {
  dropItemId?: number;
  userId?: number;
}): Promise<RaidDropReservation[]> => {
  let list: RaidDropReservation[] = (dbInstance.raidDropReservations || []).slice();
  if (filter?.dropItemId != null) {
    list = list.filter(r => Number(r.dropItemId) === Number(filter.dropItemId));
  }
  if (filter?.userId != null) {
    list = list.filter(r => Number(r.userId) === Number(filter.userId));
  }
  return list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
};

export const getReservedQuantityForDrop = async (dropItemId: number): Promise<number> => {
  const list = (dbInstance.raidDropReservations || []).filter(
    (r: RaidDropReservation) => Number(r.dropItemId) === Number(dropItemId)
  );
  return list.reduce((acc: number, r: RaidDropReservation) => acc + (Number(r.quantity) || 0), 0);
};

export const createRaidDropReservation = async (data: {
  dropItemId: number;
  userId: number;
  userName: string;
  characterName: string;
  quantity: number;
}): Promise<RaidDropReservation> => {
  const drop = await getRaidDropItemById(data.dropItemId);
  if (!drop) throw new Error('Drop no encontrado.');
  const totalQty = Number(drop.quantity) || 0;
  const sold = Number(drop.quantitySold) || 0;
  const availableStock = Math.max(0, totalQty - sold);
  if (availableStock <= 0) {
    throw new Error('Este drop ya no tiene stock disponible.');
  }
  // Semántica waitlist: múltiples usuarios pueden reservar el mismo drop incluso
  // si la suma total supera el stock. El admin luego decide a quién vender y
  // elimina las reservas sobrantes. Solo se valida que la cantidad individual
  // no supere el stock disponible (reservar 10 de un drop con 3 uds no tiene
  // sentido).
  if (data.quantity <= 0) {
    throw new Error('La cantidad reservada debe ser mayor a 0.');
  }
  if (data.quantity > availableStock) {
    throw new Error(
      `Este drop solo tiene ${availableStock} unidad(es) disponibles — no podés reservar más que eso.`
    );
  }
  if (!dbInstance.raidDropReservations) dbInstance.raidDropReservations = [];
  const reservation: RaidDropReservation = {
    id: genId(),
    dropItemId: Number(data.dropItemId),
    userId: Number(data.userId),
    userName: String(data.userName || '').trim(),
    characterName: String(data.characterName || '').trim(),
    quantity: Number(data.quantity),
    createdAt: nowIso(),
  };
  dbInstance.raidDropReservations.push(reservation);
  saveDb(dbInstance);
  return reservation;
};

export const deleteRaidDropReservation = async (id: number): Promise<RaidDropReservation | null> => {
  if (!dbInstance.raidDropReservations) return null;
  const idx = dbInstance.raidDropReservations.findIndex(
    (r: RaidDropReservation) => Number(r.id) === Number(id)
  );
  if (idx === -1) return null;
  const [removed] = dbInstance.raidDropReservations.splice(idx, 1);
  saveDb(dbInstance);
  return removed;
};

export const clearReservationsForDrop = async (dropItemId: number): Promise<RaidDropReservation[]> => {
  if (!dbInstance.raidDropReservations) return [];
  const matched: RaidDropReservation[] = dbInstance.raidDropReservations.filter(
    (r: RaidDropReservation) => Number(r.dropItemId) === Number(dropItemId)
  );
  dbInstance.raidDropReservations = dbInstance.raidDropReservations.filter(
    (r: RaidDropReservation) => Number(r.dropItemId) !== Number(dropItemId)
  );
  if (matched.length > 0) saveDb(dbInstance);
  return matched;
};

// ---------- Item Reservations (legacy inventory) ---------------------------
// Mismo patrón waitlist que raidDropReservations, pero sobre items del
// inventario legacy. Cualquier usuario logueado puede reservar; múltiples
// usuarios pueden anotarse aunque la suma supere el stock. Solo se valida
// que la cantidad individual <= stock disponible. El dueño o admin/mapper
// pueden cancelar.

export interface ItemReservation {
  id: number;
  itemId: number;
  userId: number;
  userName: string;
  characterName: string;
  quantity: number;
  status: 'active' | 'pre_sold' | 'sold';
  preSoldBy?: number;
  preSoldAt?: string;
  soldBy?: number;
  soldAt?: string;
  createdAt: string;
}

export const getItemReservations = async (filter?: {
  itemId?: number;
  userId?: number;
}): Promise<ItemReservation[]> => {
  let list: ItemReservation[] = (dbInstance.itemReservations || []).slice();
  if (filter?.itemId != null) {
    list = list.filter(r => Number(r.itemId) === Number(filter.itemId));
  }
  if (filter?.userId != null) {
    list = list.filter(r => Number(r.userId) === Number(filter.userId));
  }
  return list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
};

export const getReservedQuantityForItem = async (itemId: number): Promise<number> => {
  const list = (dbInstance.itemReservations || []).filter(
    (r: ItemReservation) => Number(r.itemId) === Number(itemId)
  );
  return list.reduce((acc: number, r: ItemReservation) => acc + (Number(r.quantity) || 0), 0);
};

export const createItemReservation = async (data: {
  itemId: number;
  userId: number;
  userName: string;
  characterName: string;
  quantity: number;
}): Promise<ItemReservation> => {
  const items = dbInstance.items || [];
  const item = items.find((it: any) => Number(it.id) === Number(data.itemId));
  if (!item) throw new Error('Ítem no encontrado.');
  const totalQty = Number(item.quantity) || 0;
  const sold = Number(item.quantitySold) || 0;
  const availableStock = Math.max(0, totalQty - sold);
  if (availableStock <= 0 || String(item.status || '').toUpperCase() === 'VENDIDO') {
    throw new Error('Este ítem ya no tiene stock disponible.');
  }
  if (data.quantity <= 0) {
    throw new Error('La cantidad reservada debe ser mayor a 0.');
  }
  if (data.quantity > availableStock) {
    throw new Error(
      `Este ítem solo tiene ${availableStock} unidad(es) disponibles — no podés reservar más que eso.`
    );
  }
  if (!dbInstance.itemReservations) dbInstance.itemReservations = [];
  const reservation: ItemReservation = {
    id: genId(),
    itemId: Number(data.itemId),
    userId: Number(data.userId),
    userName: String(data.userName || '').trim(),
    characterName: String(data.characterName || '').trim(),
    quantity: Number(data.quantity),
    status: 'active',
    createdAt: nowIso(),
  };
  dbInstance.itemReservations.push(reservation);
  saveDb(dbInstance);
  return reservation;
};

export const deleteItemReservation = async (id: number): Promise<ItemReservation | null> => {
  if (!dbInstance.itemReservations) return null;
  const idx = dbInstance.itemReservations.findIndex(
    (r: ItemReservation) => Number(r.id) === Number(id)
  );
  if (idx === -1) return null;
  const [removed] = dbInstance.itemReservations.splice(idx, 1);
  saveDb(dbInstance);
  return removed;
};

export const clearReservationsForItem = async (itemId: number): Promise<ItemReservation[]> => {
  if (!dbInstance.itemReservations) return [];
  const matched: ItemReservation[] = dbInstance.itemReservations.filter(
    (r: ItemReservation) => Number(r.itemId) === Number(itemId)
  );
  dbInstance.itemReservations = dbInstance.itemReservations.filter(
    (r: ItemReservation) => Number(r.itemId) !== Number(itemId)
  );
  if (matched.length > 0) saveDb(dbInstance);
  return matched;
};

export const markReservationPreSold = async (reservationId: number, preSoldByUserId: number): Promise<ItemReservation | null> => {
  if (!dbInstance.itemReservations) return null;
  const idx = dbInstance.itemReservations.findIndex(
    (r: ItemReservation) => Number(r.id) === Number(reservationId)
  );
  if (idx === -1) return null;
  dbInstance.itemReservations[idx] = {
    ...dbInstance.itemReservations[idx],
    status: 'pre_sold',
    preSoldBy: preSoldByUserId,
    preSoldAt: nowIso(),
  };
  saveDb(dbInstance);
  return dbInstance.itemReservations[idx];
};

export const markReservationSold = async (reservationId: number, soldByUserId: number): Promise<ItemReservation | null> => {
  if (!dbInstance.itemReservations) return null;
  const idx = dbInstance.itemReservations.findIndex(
    (r: ItemReservation) => Number(r.id) === Number(reservationId)
  );
  if (idx === -1) return null;
  dbInstance.itemReservations[idx] = {
    ...dbInstance.itemReservations[idx],
    status: 'sold',
    soldBy: soldByUserId,
    soldAt: nowIso(),
  };
  saveDb(dbInstance);
  return dbInstance.itemReservations[idx];
};

export const unmarkReservationSold = async (reservationId: number): Promise<ItemReservation | null> => {
  if (!dbInstance.itemReservations) return null;
  const idx = dbInstance.itemReservations.findIndex(
    (r: ItemReservation) => Number(r.id) === Number(reservationId)
  );
  if (idx === -1) return null;
  const prev = dbInstance.itemReservations[idx];
  dbInstance.itemReservations[idx] = {
    ...prev,
    status: prev.preSoldBy ? 'pre_sold' : 'active',
    soldBy: undefined,
    soldAt: undefined,
  };
  saveDb(dbInstance);
  return dbInstance.itemReservations[idx];
};

export const unmarkReservationPreSold = async (reservationId: number): Promise<ItemReservation | null> => {
  if (!dbInstance.itemReservations) return null;
  const idx = dbInstance.itemReservations.findIndex(
    (r: ItemReservation) => Number(r.id) === Number(reservationId)
  );
  if (idx === -1) return null;
  dbInstance.itemReservations[idx] = {
    ...dbInstance.itemReservations[idx],
    status: 'active',
    preSoldBy: undefined,
    preSoldAt: undefined,
  };
  saveDb(dbInstance);
  return dbInstance.itemReservations[idx];
};

// ---------- Raid Audit Logs -------------------------------------------------

export const createRaidAuditLog = async (data: {
  userId: number;
  action: string;
  details?: any;
}) => {
  const log = {
    id: genId(),
    userId: Number(data.userId),
    action: data.action,
    details: data.details || null,
    createdAt: nowIso(),
  };
  if (!dbInstance.raidAuditLogs) dbInstance.raidAuditLogs = [];
  dbInstance.raidAuditLogs.push(log);
  saveDb(dbInstance);
  return log;
};

export const getRaidAuditLogs = async (limit = 100) => {
  const logs = (dbInstance.raidAuditLogs || []).slice().sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  return logs.slice(0, limit);
};

// ---------- Raid Dashboard Metrics ------------------------------------------

export const getRaidDashboardMetrics = async () => {
  const bosses = dbInstance.raidBosses || [];
  const clans = dbInstance.clans || [];
  const events = dbInstance.raidEvents || [];
  const drops = dbInstance.raidDropItems || [];
  const cycles = dbInstance.raidCycles || [];
  const links = dbInstance.raidEventClans || [];

  const currentCycle = cycles.find(c => c.status === 'OPEN') || null;
  const closedCycles = cycles.filter(c => c.status === 'CLOSED');
  const lastClosedCycle = closedCycles
    .slice()
    .sort((a, b) => String(b.closedAt || '').localeCompare(String(a.closedAt || '')))[0] || null;

  const eventsInCurrentCycle = currentCycle
    ? events.filter(e => Number(e.cycleId) === Number(currentCycle.id))
    : [];

  const dropsInCurrentCycle = currentCycle
    ? drops.filter(d => Number(d.cycleId) === Number(currentCycle.id))
    : [];

  // Valor total drops en ciclo (precio * quantity)
  const totalPotentialValue = dropsInCurrentCycle.reduce(
    (acc, d) => acc + (Number(d.price) || 0) * (Number(d.quantity) || 0),
    0
  );
  const totalRevenue = dropsInCurrentCycle.reduce(
    (acc, d) => acc + (Number(d.price) || 0) * (Number(d.quantitySoldInCycle) || 0),
    0
  );

  // Top 5 bosses más cazados en el ciclo actual (o histórico si no hay ciclo)
  const eventsForRanking = eventsInCurrentCycle.length > 0 ? eventsInCurrentCycle : events;
  const bossKillMap = new Map<number, number>();
  for (const e of eventsForRanking) {
    const k = Number(e.raidBossId);
    bossKillMap.set(k, (bossKillMap.get(k) || 0) + 1);
  }
  const topBosses = Array.from(bossKillMap.entries())
    .map(([bossId, kills]) => {
      const b = bosses.find((x: any) => Number(x.id) === Number(bossId));
      return {
        bossId: Number(bossId),
        bossName: b?.name || `Boss #${bossId}`,
        officialImageUrl: b?.officialImageUrl || null,
        kills,
      };
    })
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 5);

  // Top 5 clanes más activos (eventos participados en el ciclo actual o histórico)
  const currentEventIds = new Set(eventsForRanking.map(e => Number(e.id)));
  const linksForRanking = links.filter(l => currentEventIds.has(Number(l.eventId)));
  const clanParticipationMap = new Map<number, number>();
  for (const l of linksForRanking) {
    const k = Number(l.clanId);
    clanParticipationMap.set(k, (clanParticipationMap.get(k) || 0) + 1);
  }
  const topClans = Array.from(clanParticipationMap.entries())
    .map(([clanId, events]) => {
      const c = clans.find((x: any) => Number(x.id) === Number(clanId));
      return {
        clanId: Number(clanId),
        clanName: c?.name || `Clan #${clanId}`,
        events,
        currentCycleEarnings: Number(c?.currentCycleEarnings) || 0,
      };
    })
    .sort((a, b) => b.events - a.events)
    .slice(0, 5);

  // Timeline del ciclo actual (últimos 20 eventos)
  const timeline = eventsInCurrentCycle
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 20)
    .map(e => {
      const b = bosses.find((x: any) => Number(x.id) === Number(e.raidBossId));
      const evDrops = drops.filter(d => Number(d.eventId) === Number(e.id));
      return {
        eventId: Number(e.id),
        bossName: b?.name || `Boss #${e.raidBossId}`,
        bossImageUrl: b?.officialImageUrl || null,
        evidenceImageUrl: e.evidenceImageUrl || null,
        dropsCount: evDrops.length,
        createdAt: e.createdAt,
      };
    });

  // Comparativa con ciclo anterior
  const comparison = lastClosedCycle
    ? {
        previousLabel: lastClosedCycle.label,
        previousBosses: Number(lastClosedCycle.totalBosses) || 0,
        previousRevenue: Number(lastClosedCycle.totalRevenue) || 0,
        previousEvents: Number(lastClosedCycle.totalEvents) || 0,
        currentBosses: eventsInCurrentCycle.length,
        currentRevenue: totalRevenue,
        currentEvents: eventsInCurrentCycle.length,
      }
    : null;

  return {
    currentCycle,
    totalBossesCatalogued: bosses.length,
    totalClans: clans.length,
    totalEventsCurrentCycle: eventsInCurrentCycle.length,
    totalDropsCurrentCycle: dropsInCurrentCycle.length,
    totalRevenue,
    totalPotentialValue,
    topBosses,
    topClans,
    timeline,
    comparison,
    closedCyclesCount: closedCycles.length,
  };
};

// ---------- Clan stats (ranking de clanes) ----------------------------------

export const getClanStats = async () => {
  const clans = dbInstance.clans || [];
  const links = dbInstance.raidEventClans || [];
  const drops = dbInstance.raidDropItems || [];

  return clans.map(c => {
    const clanId = Number(c.id);
    const eventsParticipated = links.filter(l => Number(l.clanId) === clanId).length;
    const clanDrops = drops.filter(d => {
      const ids = Array.isArray(d.associatedClanIds) ? d.associatedClanIds.map(Number) : [];
      return ids.includes(clanId);
    });
    const dropItemsAssociated = clanDrops.length;
    const potentialValue = clanDrops.reduce(
      (acc, d) => acc + (Number(d.price) || 0) * (Number(d.quantity) || 0),
      0
    );
    return {
      id: clanId,
      name: c.name,
      tag: c.tag || null,
      description: c.description || null,
      totalRaidEarnings: Number(c.totalRaidEarnings) || 0,
      currentCycleEarnings: Number(c.currentCycleEarnings) || 0,
      eventsParticipated,
      dropItemsAssociated,
      potentialValue,
      createdAt: c.createdAt,
    };
  }).sort((a, b) => b.totalRaidEarnings + b.currentCycleEarnings - (a.totalRaidEarnings + a.currentCycleEarnings));
};

// ---------- Raid Sales Cycles (semanales, agregan raid cycles diarios) -----
//
// Diseño:
//  * Una sola ciclo de ventas OPEN a la vez.
//  * Mientras está abierto, solo persistimos startedAt, label, status.
//  * El "estado en vivo" se calcula on-demand leyendo raidAuditLogs entre
//    startedAt y NOW (sin materializar nada) — función
//    `computeRaidSalesCycleLiveSnapshot`.
//  * Al cerrar, el snapshot se materializa en `cycle.summary` y queda
//    inmutable. Esta filosofía es idéntica a la de los raid cycles.
//  * NO tocamos `raidDropItems.quantitySold`, `clans.currentCycleEarnings`
//    ni ningún campo de los raid cycles diarios — los sales cycles solo
//    LEEN y agrupan.

const salesCycleLabelFor = (startedAtIso: string, closedCount: number) => {
  try {
    const d = new Date(startedAtIso);
    const fmt = d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    return `Ciclo de Ventas #${closedCount + 1} · desde ${fmt}`;
  } catch {
    return `Ciclo de Ventas #${closedCount + 1}`;
  }
};

export const getRaidSalesCycles = async () => {
  return (dbInstance.raidSalesCycles || []).slice().sort((a, b) => {
    const sa = String(a.createdAt || a.startedAt || '');
    const sb = String(b.createdAt || b.startedAt || '');
    return sb.localeCompare(sa);
  });
};

/**
 * El ciclo de ventas es IMPLÍCITO: no hay concepto de "abrir".
 *
 * El periodo actual arranca desde:
 *   - el `closedAt` del último ciclo de ventas CERRADO, o
 *   - si nunca se cerró ninguno, desde el `createdAt` del primer audit log
 *     (o epoch si no hay logs) para capturar todo el histórico.
 *
 * El usuario solo aprieta "Cerrar ciclo" → se materializa el snapshot
 * y el contador vuelve a 0 automáticamente para el siguiente periodo.
 */
export const getCurrentRaidSalesCyclePeriodStart = async (): Promise<string> => {
  const closed = (dbInstance.raidSalesCycles || []).filter(c => c.status === 'CLOSED');
  if (closed.length > 0) {
    // El cierre más reciente marca el inicio del periodo actual.
    const latest = closed
      .slice()
      .sort((a, b) => String(b.closedAt || '').localeCompare(String(a.closedAt || '')))[0];
    return String(latest.closedAt || '');
  }
  // Nunca se cerró ninguno — arrancamos desde el primer audit log existente
  // para que el primer cierre capture todo el histórico acumulado.
  const firstLog = (dbInstance.raidAuditLogs || [])
    .slice()
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))[0];
  return String(firstLog?.createdAt || '1970-01-01T00:00:00.000Z');
};

export const getCurrentRaidSalesCycle = async () => {
  // Mantenido por compatibilidad con consumidores viejos — siempre devuelve
  // un "pseudo-cycle" con status=OPEN calculado al vuelo desde la fecha de
  // inicio implícita. No hay registro persistido mientras está abierto.
  const startedAt = await getCurrentRaidSalesCyclePeriodStart();
  const closedCount = (dbInstance.raidSalesCycles || []).filter(
    c => c.status === 'CLOSED'
  ).length;
  return {
    id: 0,
    label: salesCycleLabelFor(startedAt, closedCount),
    status: 'OPEN' as const,
    startedAt,
    closedAt: null,
    closedBy: null,
    summary: null,
    createdAt: startedAt,
    updatedAt: nowIso(),
  };
};

/**
 * Calcula el estado en vivo de un sales cycle entre `startedAt` y `endIso`
 * (por defecto NOW). Se usa tanto para el "livePreview" mientras está
 * abierto como para materializar el summary al cerrar.
 *
 * Fuente de verdad: `raidAuditLogs` tipo `RAID_DROP_SOLD`. Cada entry ya
 * trae `revenue` (price * quantity vendida), `clanIds`, `dropItemId`,
 * `itemName`, etc. — no hay que leer los raidDropItems para los totales.
 *
 * Los "items sin vender" sí se calculan sobre `raidDropItems` del rango
 * (via `raidEvents.createdAt`) para listar el stock remanente.
 */
export const computeRaidSalesCycleLiveSnapshot = async (
  startedAtIso: string,
  endIso?: string | null
) => {
  const start = String(startedAtIso || '');
  const end = String(endIso || nowIso());
  const logs = (dbInstance.raidAuditLogs || []).filter(l => {
    if (l.action !== 'RAID_DROP_SOLD') return false;
    const t = String(l.createdAt || '');
    return t >= start && t <= end;
  });

  // Totales por clan a partir del payload del log.
  // Cada log de venta trae: { revenue, revenuePerClan, clanIds, quantitySold,
  //   itemName, dropItemId, eventId, buyerId, buyerName, ... }
  // Usamos revenuePerClan * (num clanes del log) si existe; si no, dividimos
  // revenue proporcionalmente.
  const clans = dbInstance.clans || [];
  const clanNameOf = (clanId: number) => {
    const c = clans.find((x: any) => Number(x.id) === Number(clanId));
    return c?.name || `Clan #${clanId}`;
  };

  const clanSharesMap = new Map<number, { revenueShare: number; salesCount: number }>();
  const bossesHitMap = new Map<string, number>();
  let totalRevenue = 0;
  let totalUnitsSold = 0;
  const buyersMap = new Map<string, { buyerName: string; revenue: number; units: number }>();

  for (const log of logs) {
    const d = log.details || {};
    const revenue = Number(d.revenue) || 0;
    const qty = Number(d.quantitySold) || 0;
    // FIX: Back-compat — logs viejos guardaban `clansShared` en vez de `clanIds`.
    const rawClanIds = Array.isArray(d.clanIds)
      ? d.clanIds
      : Array.isArray(d.clansShared)
        ? d.clansShared
        : [];
    const clanIds: number[] = rawClanIds.map(Number);
    totalRevenue += revenue;
    totalUnitsSold += qty;

    if (clanIds.length > 0) {
      const perClan = revenue / clanIds.length;
      for (const cid of clanIds) {
        const prev = clanSharesMap.get(cid) || { revenueShare: 0, salesCount: 0 };
        clanSharesMap.set(cid, {
          revenueShare: prev.revenueShare + perClan,
          salesCount: prev.salesCount + 1,
        });
      }
    }

    if (d.bossName) {
      bossesHitMap.set(String(d.bossName), (bossesHitMap.get(String(d.bossName)) || 0) + qty);
    }

    const buyerKey = d.buyerId ? String(d.buyerId) : (d.buyerName ? `name:${d.buyerName}` : '');
    if (buyerKey) {
      const prev = buyersMap.get(buyerKey) || { buyerName: d.buyerName || 'Desconocido', revenue: 0, units: 0 };
      buyersMap.set(buyerKey, {
        buyerName: prev.buyerName,
        revenue: prev.revenue + revenue,
        units: prev.units + qty,
      });
    }
  }

  const clansParticipated = Array.from(clanSharesMap.entries())
    .map(([clanId, v]) => ({
      clanId,
      clanName: clanNameOf(clanId),
      revenueShare: Math.round(v.revenueShare),
      salesCount: v.salesCount,
    }))
    .sort((a, b) => b.revenueShare - a.revenueShare);

  const topBosses = Array.from(bossesHitMap.entries())
    .map(([bossName, units]) => ({ bossName, units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 10);

  const topBuyers = Array.from(buyersMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Items SIN vender del ciclo (solo drops cuyo evento cayó en el rango).
  const eventsInRange = (dbInstance.raidEvents || []).filter(e => {
    const t = String(e.createdAt || '');
    return t >= start && t <= end;
  });
  const eventIds = new Set<number>(eventsInRange.map(e => Number(e.id)));
  const raidDropItems = dbInstance.raidDropItems || [];
  const dropsInRange = raidDropItems.filter(d => eventIds.has(Number(d.eventId)));
  const unsoldItems = dropsInRange
    .map(d => {
      const qty = Number(d.quantity) || 0;
      const sold = Number(d.quantitySold) || 0;
      const remaining = Math.max(0, qty - sold);
      if (remaining <= 0) return null;
      const boss = (dbInstance.raidBosses || []).find((b: any) => Number(b.id) === Number(d.raidBossId));
      const event = eventsInRange.find(e => Number(e.id) === Number(d.eventId));
      return {
        dropItemId: Number(d.id),
        itemName: d.name,
        category: d.category || null,
        price: Number(d.price) || 0,
        quantity: qty,
        quantitySold: sold,
        remainingQty: remaining,
        potentialRevenue: (Number(d.price) || 0) * remaining,
        bossName: boss?.name || null,
        bossImageUrl: boss?.officialImageUrl || null,
        eventCreatedAt: event?.createdAt || null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.potentialRevenue - a.potentialRevenue);

  const totalDropsInRange = dropsInRange.length;
  const totalItemsSold = dropsInRange.filter(d =>
    (Number(d.quantitySold) || 0) >= (Number(d.quantity) || 0)
  ).length;
  const totalItemsPartiallySold = dropsInRange.filter(d => {
    const sold = Number(d.quantitySold) || 0;
    const qty = Number(d.quantity) || 0;
    return sold > 0 && sold < qty;
  }).length;
  const totalItemsUnsold = unsoldItems.length;

  // Raid cycles que se cerraron dentro del rango (info contextual).
  const raidCyclesClosed = (dbInstance.raidCycles || [])
    .filter(c => {
      if (c.status !== 'CLOSED') return false;
      const t = String(c.closedAt || '');
      return t >= start && t <= end;
    })
    .map(c => ({
      cycleId: Number(c.id),
      label: c.label,
      closedAt: c.closedAt,
      totalRevenue: Number(c.totalRevenue) || 0,
      totalEvents: Number(c.totalEvents) || 0,
      totalBosses: Number(c.totalBosses) || 0,
    }))
    .sort((a, b) => String(b.closedAt || '').localeCompare(String(a.closedAt || '')));

  const potentialRemaining = unsoldItems.reduce((acc, it) => acc + it.potentialRevenue, 0);

  return {
    range: { startedAt: start, endAt: end },
    totals: {
      totalRevenue: Math.round(totalRevenue),
      totalUnitsSold,
      totalSalesCount: logs.length,
      totalDropsInRange,
      totalItemsSold,
      totalItemsPartiallySold,
      totalItemsUnsold,
      totalEventsInRange: eventsInRange.length,
      potentialRemaining: Math.round(potentialRemaining),
    },
    clansParticipated,
    topBosses,
    topBuyers,
    unsoldItems,
    raidCyclesClosed,
  };
};

/**
 * Cierra el ciclo de ventas actual (implícito). Crea un nuevo registro
 * CLOSED con startedAt=getCurrentRaidSalesCyclePeriodStart(), closedAt=NOW
 * y el snapshot materializado. Al terminar, el siguiente periodo empieza
 * automáticamente desde este `closedAt`.
 *
 * No requiere `cycleId` porque no hay registro OPEN previo.
 */
export const closeRaidSalesCycle = async (closedByUser: any) => {
  const startedAt = await getCurrentRaidSalesCyclePeriodStart();
  const closedAt = nowIso();

  const snapshot = await computeRaidSalesCycleLiveSnapshot(startedAt, closedAt);

  const closedCount = (dbInstance.raidSalesCycles || []).filter(
    c => c.status === 'CLOSED'
  ).length;

  const cycle = {
    id: genId(),
    label: salesCycleLabelFor(startedAt, closedCount),
    status: 'CLOSED' as const,
    startedAt,
    closedAt,
    closedBy:
      closedByUser?.characterName ||
      closedByUser?.name ||
      closedByUser?.email ||
      'Super Admin',
    createdBy: closedByUser?.id || null,
    summary: snapshot,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (!dbInstance.raidSalesCycles) dbInstance.raidSalesCycles = [];
  dbInstance.raidSalesCycles.push(cycle);
  saveDb(dbInstance);

  await createRaidAuditLog({
    userId: closedByUser?.id || 0,
    action: 'RAID_SALES_CYCLE_CLOSED',
    details: {
      salesCycleId: Number(cycle.id),
      label: cycle.label,
      startedAt,
      closedAt,
      totalRevenue: snapshot.totals.totalRevenue,
      totalUnitsSold: snapshot.totals.totalUnitsSold,
      totalItemsUnsold: snapshot.totals.totalItemsUnsold,
      clansCount: snapshot.clansParticipated.length,
      raidCyclesClosed: snapshot.raidCyclesClosed.length,
    },
  });

  return cycle;
};

// ----------------------------------------------------------------------------
// Migración one-shot (idempotente): recalcular `summary` de los ciclos de venta
// de raid ya cerrados que tengan `clansParticipated: []` pero cuyos logs del
// período sí tenían clanes. Era un bug: `sellRaidDropItem` guardaba `clansShared`
// mientras que el builder del summary leía `clanIds` → todos los cycles cerrados
// antes del fix quedaron con clan breakdown vacío.
// ----------------------------------------------------------------------------
(async () => {
  try {
    const cycles = dbInstance.raidSalesCycles || [];
    let fixed = 0;
    for (const cycle of cycles) {
      if (cycle.status !== 'CLOSED') continue;
      const currentClans = cycle.summary?.clansParticipated;
      if (Array.isArray(currentClans) && currentClans.length > 0) continue;
      if (!cycle.startedAt || !cycle.closedAt) continue;
      const snapshot = await computeRaidSalesCycleLiveSnapshot(
        String(cycle.startedAt),
        String(cycle.closedAt)
      );
      if (
        !snapshot.clansParticipated ||
        snapshot.clansParticipated.length === 0
      ) continue;
      cycle.summary = snapshot;
      cycle.updatedAt = nowIso();
      fixed += 1;
    }
    if (fixed > 0) {
      saveDb(dbInstance);
      // eslint-disable-next-line no-console
      console.log(`[migration] Backfilled clansParticipated en ${fixed} ciclo(s) de venta raid`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[migration] backfill raid sales clansParticipated falló:', err);
  }
})();

// ============================================================================
// Warehouse Clans & CPs (independent from raid module)
// ============================================================================

export const getWarehouseClans = async () => {
  return (dbInstance.warehouseClans || []).slice().sort((a: any, b: any) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
};

export const getWarehouseClanById = async (id: number) => {
  return (dbInstance.warehouseClans || []).find((c: any) => Number(c.id) === Number(id));
};

export const createWarehouseClan = async (data: { name: string }) => {
  if (!dbInstance.warehouseClans) dbInstance.warehouseClans = [];
  const newClan = {
    id: genId(),
    name: data.name.trim(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  dbInstance.warehouseClans.push(newClan);
  saveDb(dbInstance);
  return newClan;
};

export const updateWarehouseClan = async (id: number, data: { name?: string }) => {
  if (!dbInstance.warehouseClans) dbInstance.warehouseClans = [];
  const idx = dbInstance.warehouseClans.findIndex((c: any) => Number(c.id) === Number(id));
  if (idx === -1) return null;
  if (data.name) dbInstance.warehouseClans[idx].name = data.name.trim();
  dbInstance.warehouseClans[idx].updatedAt = nowIso();
  saveDb(dbInstance);
  return dbInstance.warehouseClans[idx];
};

export const deleteWarehouseClan = async (id: number) => {
  if (!dbInstance.warehouseClans) dbInstance.warehouseClans = [];
  const clan = dbInstance.warehouseClans.find((c: any) => Number(c.id) === Number(id));
  if (!clan) return null;
  dbInstance.warehouseClans = dbInstance.warehouseClans.filter((c: any) => Number(c.id) !== Number(id));
  // Also remove all CPs of this clan
  if (dbInstance.warehouseCPs) {
    dbInstance.warehouseCPs = dbInstance.warehouseCPs.filter((cp: any) => Number(cp.clanId) !== Number(id));
  }
  saveDb(dbInstance);
  return clan;
};

export const getWarehouseCPs = async () => {
  return (dbInstance.warehouseCPs || []).slice().sort((a: any, b: any) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
};

export const getWarehouseCPsByClan = async (clanId: number) => {
  return (dbInstance.warehouseCPs || []).filter(
    (cp: any) => Number(cp.clanId) === Number(clanId)
  );
};

export const getWarehouseCPById = async (id: number) => {
  return (dbInstance.warehouseCPs || []).find((cp: any) => Number(cp.id) === Number(id));
};

export const createWarehouseCP = async (data: { name: string; clanId: number }) => {
  if (!dbInstance.warehouseCPs) dbInstance.warehouseCPs = [];
  const newCp = {
    id: genId(),
    name: data.name.trim(),
    clanId: Number(data.clanId),
    leaderId: null as number | null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  dbInstance.warehouseCPs.push(newCp);
  saveDb(dbInstance);
  return newCp;
};

export const updateWarehouseCP = async (id: number, data: Partial<{
  name: string;
  leaderId: number | null;
  leaderIds: number[];
}>) => {
  if (!dbInstance.warehouseCPs) dbInstance.warehouseCPs = [];
  const idx = dbInstance.warehouseCPs.findIndex((cp: any) => Number(cp.id) === Number(id));
  if (idx === -1) return null;
  dbInstance.warehouseCPs[idx] = {
    ...dbInstance.warehouseCPs[idx],
    ...data,
    updatedAt: nowIso(),
  };
  saveDb(dbInstance);
  return dbInstance.warehouseCPs[idx];
};

export const deleteWarehouseCP = async (id: number) => {
  if (!dbInstance.warehouseCPs) dbInstance.warehouseCPs = [];
  const cp = dbInstance.warehouseCPs.find((c: any) => Number(c.id) === Number(id));
  if (!cp) return null;
  dbInstance.warehouseCPs = dbInstance.warehouseCPs.filter(
    (c: any) => Number(c.id) !== Number(id)
  );
  // Also remove all members of this CP
  if (dbInstance.warehouseCPMembers) {
    dbInstance.warehouseCPMembers = dbInstance.warehouseCPMembers.filter(
      (m: any) => Number(m.cpId) !== Number(id)
    );
  }
  saveDb(dbInstance);
  return cp;
};

// ─── Warehouse CP Members ───────────────────────────────────────────────

export const getWarehouseCPMembers = async (cpId?: number) => {
  const members = (dbInstance.warehouseCPMembers || []).slice();
  if (cpId !== undefined) return members.filter((m: any) => Number(m.cpId) === Number(cpId));
  return members;
};

export const addWarehouseCPMember = async (cpId: number, userId: number) => {
  if (!dbInstance.warehouseCPMembers) dbInstance.warehouseCPMembers = [];
  // Check if already a member
  const existing = dbInstance.warehouseCPMembers.find(
    (m: any) => Number(m.cpId) === Number(cpId) && Number(m.userId) === Number(userId)
  );
  if (existing) return existing;
  const entry = {
    id: genId(),
    cpId: Number(cpId),
    userId: Number(userId),
    addedAt: nowIso(),
  };
  dbInstance.warehouseCPMembers.push(entry);
  saveDb(dbInstance);
  return entry;
};

export const removeWarehouseCPMember = async (cpId: number, userId: number) => {
  if (!dbInstance.warehouseCPMembers) dbInstance.warehouseCPMembers = [];
  const idx = dbInstance.warehouseCPMembers.findIndex(
    (m: any) => Number(m.cpId) === Number(cpId) && Number(m.userId) === Number(userId)
  );
  if (idx === -1) return null;
  const removed = dbInstance.warehouseCPMembers.splice(idx, 1)[0];
  saveDb(dbInstance);
  return removed;
};
