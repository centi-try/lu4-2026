import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const DEFAULT_SUPER_ADMIN_EMAIL = 'superadmin@inventory.com';
export const DEFAULT_SUPER_ADMIN_PASSWORD = 'SuperAdmin123!';
export const DEFAULT_SUPER_ADMIN_NAME = 'Super Admin';

// Definir la ruta del archivo de base de datos persistente
const DB_FILE = path.join(process.cwd(), 'data_storage.json');

// Estructura inicial de la base de datos
interface DatabaseSchema {
  users: any[];
  items: any[];
  characters: any[];
  salesCycles: any[];
  auditLogs: any[];
  purchases: any[];
  settings: any[];
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
}

const initialSchema: DatabaseSchema = {
  users: [],
  items: [],
  characters: [],
  salesCycles: [],
  auditLogs: [],
  purchases: [],
  settings: [],
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
};

function hashLocalPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
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
  };
}

// Cargar o inicializar la base de datos
function loadDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return ensureDefaultSuperAdmin(JSON.parse(data));
    }
  } catch (error) {
    console.error('Error loading DB file:', error);
  }
  return ensureDefaultSuperAdmin(JSON.parse(JSON.stringify(initialSchema)));
}

// Guardar la base de datos en disco
function saveDb(data: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving DB file:', error);
  }
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
  };
}

function normalizeCharacterEarnings(cycle: any): any[] {
  // Si ya tiene el formato correcto
  if (Array.isArray(cycle.characterEarnings) && cycle.characterEarnings.length > 0) {
    return cycle.characterEarnings.map((ce: any) => ({
      characterId: String(ce.characterId),
      characterName: ce.characterName || String(ce.characterId),
      earnings: Number(ce.earnings) || 0,
    }));
  }
  // Si viene como profitByCharacter (objeto { charId: amount })
  if (cycle.profitByCharacter && typeof cycle.profitByCharacter === 'object') {
    const chars = dbInstance.characters || [];
    return Object.entries(cycle.profitByCharacter)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([charId, amount]) => {
        const char = chars.find((c: any) => String(c.id) === String(charId));
        return {
          characterId: String(charId),
          characterName: char?.name || String(charId),
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
  const chars = dbInstance.characters || [];

  // FIX: Identificar items vendidos en ESTE ciclo (quantitySoldInCycle > 0)
  const soldItems = items
    .filter(i => (i.quantitySoldInCycle || 0) > 0)
    .map(i => {
      // FIX: Normalizar associatedCharacterIds como strings para consistencia
      const assocIds = Array.isArray(i.associatedCharacterIds)
        ? i.associatedCharacterIds.map(String)
        : [];
      const associatedCount = assocIds.length || 1;
      const totalRev = (Number(i.price) || 0) * (i.quantitySoldInCycle || 0);
      return {
        itemId: String(i.id),
        // FIX: Usar 'itemName' consistentemente (no 'name')
        itemName: i.name,
        category: i.category || 'ARMA',
        price: Number(i.price) || 0,
        // FIX: Usar 'quantitySold' consistentemente (no 'quantity')
        quantitySold: i.quantitySoldInCycle,
        totalRevenue: totalRev,
        associatedCharacterIds: assocIds,
        earningsPerCharacter: Math.floor(totalRev / associatedCount),
      };
    });

  // Identificar ganancias por personaje
  const characterEarnings = chars
    .filter(c => (c.currentCycleEarnings || 0) > 0)
    .map(c => ({
      characterId: String(c.id),
      characterName: c.name,
      earnings: Number(c.currentCycleEarnings) || 0,
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
  };

  if (!dbInstance.salesCycles) dbInstance.salesCycles = [];
  dbInstance.salesCycles.push(newCycle);

  // Registrar en el log de auditoría
  createAuditLog({
    action: 'CYCLE_CLOSED',
    detail: `Cerró ${newCycle.label} (${newCycle.type}) con $${totalRevenue.toLocaleString()} recaudados y ${soldItems.length} venta(s).`,
    createdAt: new Date(),
  });

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

  saveDb(dbInstance);
  return newCycle;
};

export const createAuditLog = async (data: any) => {
  if (!dbInstance.auditLogs) dbInstance.auditLogs = [];
  dbInstance.auditLogs.push({ ...data, id: Math.floor(Math.random() * 1000000), createdAt: new Date() });
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
    loginMethod: u.loginMethod,
    createdAt: u.createdAt,
    lastSignedIn: u.lastSignedIn,
    openId: u.openId,
  }));
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
    },
  });

  return { revenue, earningsPerClan, clanIds, buyer: buyer || null };
};

// ---------- Raid Category Icons (iconos por categoría de drop, super admin) -

// Categorías válidas — deben coincidir con src/lib/category-meta.ts
export const RAID_DROP_CATEGORIES = [
  'ARMADURA', 'ARMA', 'KEY', 'RECIPE', 'MATERIALES', 'QUEST', 'ADENA',
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
