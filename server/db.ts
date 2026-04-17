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
}

const initialSchema: DatabaseSchema = {
  users: [],
  items: [],
  characters: [],
  salesCycles: [],
  auditLogs: [],
  purchases: [],
  settings: []
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
