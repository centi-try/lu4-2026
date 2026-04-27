import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type {
  Item, Character, AuditLog, ItemCategory, ItemStatus, UserRole,
  SalesCycle, CycleCharacterEarning, CycleSoldItem, Purchase
} from '../lib/types';
import { nanoid } from 'nanoid';
import { useAuth } from './AuthContext';
import { trpc } from '../lib/trpc';

interface SellItemOptions {
  itemId: string;
  quantityToSell: number;
  buyerId: string;
  buyerName: string;
  isInternalSale?: boolean;
}

interface AppContextType {
  currentUser: Character;
  setCurrentUser: (c: Character) => void;
  items: Item[];
  characters: Character[];
  auditLogs: AuditLog[];
  purchases: Purchase[];
  salesCycles: SalesCycle[];
  currentCycleStartedAt: string | null;
  cycleNumber: number;

  addItem: (item: Omit<Item, 'id' | 'normalizedName' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'quantitySold'>) => void;
  updateItem: (id: string, updates: Partial<Item>) => void;
  confirmItem: (id: string) => void;
  deleteItem: (id: string) => void;
  sellItem: (opts: SellItemOptions) => void;
  searchItems: (query: string) => Item[];

  startCycle: (type: 'DIARIO' | 'SEMANAL') => void;
  closeCycle: (type: 'DIARIO' | 'SEMANAL') => void;
}

const AppContext = createContext<AppContextType | null>(null);

const defaultEmptyCharacter: Character = {
  id: 'guest',
  name: 'Invitado',
  role: 'USER',
  avatar: 'from-gray-400 to-gray-600',
  class: 'Visitante',
  level: 1,
  itemIds: [],
  totalEarnings: 0,
  currentCycleEarnings: 0,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();

  const isAuthSuperAdmin = authUser?.role === 'super_admin' || authUser?.role === 'SUPER_ADMIN';

  const getAuthUserAsCharacter = useCallback((): Character => {
    if (!authUser) return defaultEmptyCharacter;
    const role = (authUser.role === 'super_admin' || authUser.role === 'SUPER_ADMIN')
      ? 'SUPER_ADMIN' as UserRole
      : (authUser.role === 'mapper' || authUser.role === 'MAPPER')
        ? 'MAPPER' as UserRole
        : 'USER' as UserRole;
    return {
      id: `auth-${authUser.id}`,
      name: authUser.characterName || authUser.name || 'Usuario',
      role,
      avatar: role === 'SUPER_ADMIN' ? 'from-cyan-400 to-blue-600' : role === 'MAPPER' ? 'from-amber-400 to-orange-600' : 'from-fuchsia-400 to-purple-600',
      class: role === 'SUPER_ADMIN' ? 'Administrador' : role === 'MAPPER' ? 'Mapper' : 'Usuario',
      level: 99,
      itemIds: [],
      totalEarnings: 0,
      currentCycleEarnings: 0,
    };
  }, [authUser]);

  const [currentUser, setCurrentUserState] = useState<Character>(() => getAuthUserAsCharacter());

  useEffect(() => {
    setCurrentUserState(getAuthUserAsCharacter());
  }, [getAuthUserAsCharacter]);

  const setCurrentUser = useCallback((nextUser: Character) => {
    const originalUser = getAuthUserAsCharacter();
    const isOriginalAccount = nextUser.id === originalUser.id;

    if (!authUser) {
      setCurrentUserState(defaultEmptyCharacter);
      return;
    }

    if (!isAuthSuperAdmin && !isOriginalAccount) {
      setCurrentUserState(originalUser);
      return;
    }

    setCurrentUserState(nextUser);
  }, [authUser, getAuthUserAsCharacter, isAuthSuperAdmin]);

  const [items, setItems] = useState<Item[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [salesCycles, setSalesCycles] = useState<SalesCycle[]>([]);

  const { data: serverItems, refetch: refetchItems } = trpc.items.list.useQuery(undefined, {
    enabled: !!authUser,
  });
  const { data: serverCharacters, refetch: refetchCharacters } = trpc.characters.list.useQuery(undefined, {
    enabled: !!authUser,
  });
  const { data: serverPurchases, refetch: refetchPurchases } = trpc.items.listPurchases.useQuery(undefined, {
    enabled: !!authUser,
  });
  const { data: serverCycles, refetch: refetchCycles } = trpc.salesCycles.list.useQuery(undefined, {
    enabled: !!authUser,
  });
  const { data: serverAuditLogs, refetch: refetchAuditLogs } = trpc.auditLogs.list.useQuery(undefined, {
    enabled: !!authUser,
  });

  useEffect(() => {
    if (serverItems) {
      const transformed = (serverItems as any[]).map((item: any) => ({
        ...item,
        id: String(item.id),
        normalizedName: (item.name || '').toLowerCase(),
        status: (() => {
          const s = item.status || 'EN_REGISTRO';
          if (s === 'CONFIRMED' || s === 'CONFIRMADO') return 'CONFIRMADO';
          if (s === 'PENDING' || s === 'EN_REGISTRO') return 'EN_REGISTRO';
          if (s === 'VENDIDO' || s === 'SOLD') return 'VENDIDO';
          return 'EN_REGISTRO';
        })(),
        price: item.price !== null && item.price !== undefined ? Number(item.price) : null,
        quantity: Number(item.quantity) || 1,
        quantitySold: Number(item.quantitySold) || 0,
        quantitySoldInCycle: Number(item.quantitySoldInCycle) || 0,
        associatedCharacterIds: Array.isArray(item.associatedCharacterIds) ? item.associatedCharacterIds.map(String) : [],
        image: item.image || {
          id: `img-${item.id}`,
          publicUrl: item.imageUrl || '',
          altText: item.name || '',
        },
        createdBy: item.createdBy || '',
        updatedBy: item.updatedBy || '',
      }));
      setItems(transformed);
    }
  }, [serverItems]);

  useEffect(() => {
    if (serverCharacters) {
      const transformed = (serverCharacters as any[]).map((char: any) => ({
        ...char,
        id: String(char.id),
        role: (() => {
          const r = (char.role || '').toLowerCase();
          if (r === 'super_admin' || r === 'admin') return 'SUPER_ADMIN';
          if (r === 'mapper') return 'MAPPER';
          return 'USER';
        })(),
        avatar: char.avatar || 'from-gray-400 to-gray-600',
        class: char.class || 'Aventurero',
        level: Number(char.level) || 1,
        itemIds: Array.isArray(char.itemIds) ? char.itemIds.map(String) : [],
        totalEarnings: Number(char.totalEarnings) || 0,
        currentCycleEarnings: Number(char.currentCycleEarnings) || 0,
      }));
      setCharacters(transformed);
    }
  }, [serverCharacters]);

  useEffect(() => {
    if (serverPurchases) setPurchases(serverPurchases as any);
  }, [serverPurchases]);

  useEffect(() => {
    if (serverCycles) {
      const normalized = (serverCycles as any[]).map((cycle: any) => ({
        ...cycle,
        id: String(cycle.id),
        totalRevenue: Number(cycle.totalRevenue) || 0,
        totalProfit: Number(cycle.totalProfit) || 0,
        characterEarnings: Array.isArray(cycle.characterEarnings) ? cycle.characterEarnings : [],
        soldItems: Array.isArray(cycle.soldItems) ? cycle.soldItems : [],
        unsoldItemIds: Array.isArray(cycle.unsoldItemIds) ? cycle.unsoldItemIds.map(String) : [],
      }));
      setSalesCycles(normalized);
    }
  }, [serverCycles]);

  useEffect(() => {
    if (serverAuditLogs) setAuditLogs(prev => {
      const serverIds = new Set((serverAuditLogs as any[]).map((l: any) => l.id));
      const localOnly = prev.filter(l => !serverIds.has(l.id));
      return [...localOnly, ...(serverAuditLogs as any[])];
    });
  }, [serverAuditLogs]);

  const sellMutation = trpc.items.sell.useMutation({
    onSuccess: () => {
      refetchPurchases();
      refetchItems();
      refetchCharacters();
    }
  });

  const closeCycleMutation = trpc.salesCycles.close.useMutation({
    onSuccess: () => {
      refetchCycles();
      refetchItems();
      refetchCharacters();
    }
  });

  const createItemMutation = trpc.items.create.useMutation({
    onSuccess: () => refetchItems()
  });

  const updateItemMutation = trpc.items.update.useMutation({
    onSuccess: () => refetchItems()
  });

  const confirmItemMutation = trpc.items.confirm.useMutation({
    onSuccess: () => refetchItems()
  });

  const deleteItemMutation = trpc.items.delete.useMutation({
    onSuccess: () => {
      refetchItems();
      refetchCharacters();
    }
  });
  const [currentCycleStartedAt, setCurrentCycleStartedAt] = useState<string | null>(
    new Date().toISOString()
  );
  const [cycleNumber, setCycleNumber] = useState<number>(1);

  useEffect(() => {
    if (serverCycles && (serverCycles as any[]).length > 0) {
      setCycleNumber((serverCycles as any[]).length + 1);
    }
  }, [serverCycles]);

  const addLog = useCallback((itemId: string, itemName: string, action: string, detail: string) => {
    const log: AuditLog = {
      id: `log-${nanoid(6)}`,
      itemId,
      itemName,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      action,
      detail,
      createdAt: new Date().toISOString(),
    };
    setAuditLogs(prev => [log, ...prev]);
  }, [currentUser]);

  const addItem = useCallback((data: Omit<Item, 'id' | 'normalizedName' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'quantitySold' | 'quantitySoldInCycle'>) => {
    if (currentUser.role === 'USER') return;

    // Enviamos imageUrl para que el backend persista el icono global de la
    // categoría (seteado en /raids/settings) o la URL manual ingresada. Antes
    // este campo no viajaba al server y el item quedaba con imageUrl=null.
    const imageUrlToPersist = String(data.image?.publicUrl || '').trim() || null;
    createItemMutation.mutate({
      name: data.name,
      category: data.category,
      status: data.status,
      price: data.price || 0,
      mapperId: parseInt(currentUser.id.replace('auth-', '')) || 0,
      associatedCharacterIds: data.associatedCharacterIds.map(id => parseInt(String(id).replace('auth-', '')) || 0).filter(id => id > 0),
      quantity: data.quantity || 1,
      imageUrl: imageUrlToPersist,
    });

    const now = new Date().toISOString();
    const item: Item = {
      ...data,
      id: `item-${nanoid(6)}`,
      normalizedName: data.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.name,
      updatedBy: currentUser.name,
      quantitySold: 0,
      quantitySoldInCycle: 0,
    };
    setItems(prev => [item, ...prev]);

    if (data.associatedCharacterIds.length > 0) {
      setCharacters(prev => prev.map(char => {
        if (data.associatedCharacterIds.includes(char.id) && !char.itemIds.includes(item.id)) {
          return { ...char, itemIds: [...char.itemIds, item.id] };
        }
        return char;
      }));
    }

    addLog(item.id, item.name, 'CREATED_ITEM', `Registró "${item.name}" en categoría ${item.category}.`);
  }, [currentUser, addLog, createItemMutation]);

  const updateItem = useCallback((id: string, updates: Partial<Item>) => {
    if (currentUser.role === 'USER') return;

    const updateNumericId = parseInt(String(id).replace('item-', ''));
    // Propagar la URL de imagen al backend. Si no se propaga, el cambio solo
    // vive en el estado local y se pierde al recargar (bug observado en
    // /images del menú antiguo: la nueva URL no se persistía en DB).
    const incomingImageUrl =
      (updates as any).imageUrl ??
      updates.image?.publicUrl ??
      undefined;
    updateItemMutation.mutate({
      id: isNaN(updateNumericId) ? 0 : updateNumericId,
      name: updates.name,
      category: updates.category,
      price: updates.price || undefined,
      imageUrl: incomingImageUrl,
    });

    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return { ...item, ...updates, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
    }));

    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) addLog(id, item.name, 'UPDATED_ITEM', `Actualizó datos de "${item.name}".`);
      return prev;
    });
  }, [currentUser, addLog, updateItemMutation]);

  const confirmItem = useCallback((id: string) => {
    if (currentUser.role === 'USER') return;
    if (currentUser.role !== 'SUPER_ADMIN') return;

    const confirmNumericId = parseInt(String(id).replace('item-', ''));
    confirmItemMutation.mutate({ id: isNaN(confirmNumericId) ? 0 : confirmNumericId });

    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'CONFIRMADO' as ItemStatus, updatedAt: new Date().toISOString(), updatedBy: currentUser.name } : item
    ));
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) addLog(id, item.name, 'CONFIRMED_ITEM', `Confirmó "${item.name}". Imagen bloqueada para Mapper.`);
      return prev;
    });
  }, [currentUser, addLog, confirmItemMutation]);

  const deleteItem = useCallback((id: string) => {
    if (currentUser.role === 'USER') return;
    if (currentUser.role !== 'SUPER_ADMIN') return;

    const deleteNumericId = parseInt(String(id).replace('item-', ''));
    deleteItemMutation.mutate({ id: isNaN(deleteNumericId) ? 0 : deleteNumericId });

    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) addLog(id, item.name, 'DELETED_ITEM', `Eliminó "${item.name}" del inventario.`);
      return prev.filter(i => i.id !== id);
    });
    setCharacters(prev => prev.map(char => ({
      ...char,
      itemIds: char.itemIds.filter(iid => iid !== id),
    })));
  }, [currentUser, addLog, deleteItemMutation]);

  const sellItem = useCallback(({ itemId, quantityToSell, buyerId, buyerName, isInternalSale }: SellItemOptions) => {
    if (currentUser.role === 'USER') return;
    if (currentUser.role !== 'SUPER_ADMIN') return;

    const numericId = parseInt(String(itemId).replace('item-', ''));
    sellMutation.mutate({
      id: isNaN(numericId) ? 0 : numericId,
      quantity: quantityToSell,
      buyerId,
      buyerName,
      isInternalSale: isInternalSale || false,
    });

    setItems(prevItems => {
      const item = prevItems.find(i => i.id === itemId);
      if (!item || item.status === 'VENDIDO') return prevItems;

      const remaining = item.quantity - item.quantitySold;
      if (quantityToSell <= 0 || quantityToSell > remaining) return prevItems;

      const newQuantitySold = item.quantitySold + quantityToSell;
      const newQuantitySoldInCycle = item.quantitySoldInCycle + quantityToSell;
      const isFullySold = newQuantitySold >= item.quantity;

      const associatedCount = item.associatedCharacterIds.length || 1;
      const revenueThisSale = (item.price ?? 0) * quantityToSell;
      const earningsPerChar = Math.floor(revenueThisSale / associatedCount);

      const purchase: Purchase = {
        id: `pur-temp-${nanoid(4)}`,
        itemId,
        itemName: item.name,
        buyerId,
        buyerName,
        quantity: quantityToSell,
        price: item.price ?? 0,
        total: revenueThisSale,
        createdAt: new Date().toISOString(),
      };
      setPurchases(prev => [purchase, ...prev]);

      setCharacters(prevChars => prevChars.map(char => {
        if (item.associatedCharacterIds.includes(char.id)) {
          return {
            ...char,
            totalEarnings: char.totalEarnings + earningsPerChar,
            currentCycleEarnings: char.currentCycleEarnings + earningsPerChar,
          };
        }
        return char;
      }));

      if (item.associatedCharacterIds.includes(currentUser.id)) {
        setCurrentUserState(prev => ({
          ...prev,
          totalEarnings: prev.totalEarnings + earningsPerChar,
          currentCycleEarnings: prev.currentCycleEarnings + earningsPerChar,
        }));
      }

      const newRemaining = item.quantity - newQuantitySold;
      addLog(
        itemId,
        item.name,
        'SOLD_ITEM',
        `Vendió ${quantityToSell} unidad(es) de "${item.name}" a $${item.price?.toLocaleString()} c/u a ${buyerName}. ` +
        `Total: $${revenueThisSale.toLocaleString()}. Ganancia por personaje: $${earningsPerChar.toLocaleString()} × ${associatedCount}. ` +
        (isFullySold ? 'Ítem completamente vendido.' : `Quedan ${newRemaining} unidad(es) disponibles.`)
      );

      return prevItems.map(i => {
        if (i.id !== itemId) return i;
        return {
          ...i,
          quantitySold: newQuantitySold,
          quantitySoldInCycle: newQuantitySoldInCycle,
          status: isFullySold ? ('VENDIDO' as ItemStatus) : i.status,
          soldAt: isFullySold ? new Date().toISOString() : i.soldAt,
          soldBy: isFullySold ? currentUser.name : i.soldBy,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name,
        };
      });
    });
  }, [currentUser, addLog, sellMutation]);

  const searchItems = useCallback((query: string): Item[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return items.filter(i => i.normalizedName.includes(q) || i.category.toLowerCase().includes(q)).slice(0, 10);
  }, [items]);

  const startCycle = useCallback((type: 'DIARIO' | 'SEMANAL') => {
    if (currentUser.role === 'USER') return;
    if (currentUser.role !== 'SUPER_ADMIN') return;
    setCurrentCycleStartedAt(new Date().toISOString());
    addLog('system', 'Sistema', 'CYCLE_STARTED', `Inició nuevo ciclo de ventas (${type}).`);
  }, [currentUser, addLog]);

  const closeCycle = useCallback((type: 'DIARIO' | 'SEMANAL') => {
    if (currentUser.role === 'USER') return;
    if (currentUser.role !== 'SUPER_ADMIN') return;

    const now = new Date().toISOString();

    const cycleSoldItems: CycleSoldItem[] = items
      .filter(i => i.quantitySoldInCycle > 0)
      .map(i => {
        const assocCount = i.associatedCharacterIds.length || 1;
        const totalRev = (i.price ?? 0) * i.quantitySoldInCycle;
        return {
          itemId: i.id,
          itemName: i.name,
          category: i.category,
          price: i.price ?? 0,
          quantitySold: i.quantitySoldInCycle,
          totalRevenue: totalRev,
          associatedCharacterIds: i.associatedCharacterIds,
          earningsPerCharacter: Math.floor(totalRev / assocCount),
        };
      });

    const totalRevenue = cycleSoldItems.reduce((sum, item) => sum + item.totalRevenue, 0);
    const profitByChar: Record<string, number> = {};
    characters.forEach(c => {
      if (c.currentCycleEarnings > 0) profitByChar[c.id] = c.currentCycleEarnings;
    });

    const closedCyclesCount = salesCycles.length;
    const newCycleLabel = `Ciclo #${closedCyclesCount + 1}`;

    closeCycleMutation.mutate({
      type,
      label: newCycleLabel,
      totalRevenue,
      totalProfit: totalRevenue,
      profitByCharacter: profitByChar,
      itemsSold: cycleSoldItems.map(i => ({
        itemId: parseInt(String(i.itemId).replace('item-', '')) || 0,
        quantity: i.quantitySold,
      })),
      closedBy: currentUser.name,
      startedAt: currentCycleStartedAt || now,
    });

    setCycleNumber(prev => prev + 1);
    setCurrentCycleStartedAt(now);

    setItems(prev => prev.map(i => ({
      ...i,
      quantitySoldInCycle: 0,
      status: (() => {
        if (i.quantitySold >= i.quantity && i.quantity > 0) return 'VENDIDO' as const;
        if (i.status === 'VENDIDO' && i.quantitySold < i.quantity) return 'CONFIRMADO' as const;
        return i.status;
      })(),
    })));
    setCharacters(prev => prev.map(c => ({ ...c, currentCycleEarnings: 0 })));
    setCurrentUserState(prev => ({ ...prev, currentCycleEarnings: 0 }));

    addLog('system', 'Sistema', 'CYCLE_CLOSED', `Cerró ${newCycleLabel} (${type}) con $${totalRevenue.toLocaleString()} recaudados.`);
  }, [currentUser, items, characters, salesCycles, currentCycleStartedAt, addLog, closeCycleMutation]);

  return (
    <AppContext.Provider value={{
      currentUser, setCurrentUser, items, characters, auditLogs, purchases, salesCycles,
      currentCycleStartedAt, cycleNumber,
      addItem, updateItem, confirmItem, deleteItem, sellItem, searchItems,
      startCycle, closeCycle
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
