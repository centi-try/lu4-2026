import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type {
  Item, Character, AuditLog, ItemCategory, ItemStatus, UserRole,
  SalesCycle, CycleCharacterEarning, CycleSoldItem, Purchase, Shop
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
  isExternalSale?: boolean;
}

interface AppContextType {
  isLoading: boolean;
  currentUser: Character;
  setCurrentUser: (c: Character) => void;
  isImpersonating: boolean;
  effectiveRole: string;
  effectiveIsSuperAdmin: boolean;
  items: Item[];
  characters: Character[];
  auditLogs: AuditLog[];
  purchases: Purchase[];
  salesCycles: SalesCycle[];
  currentCycleStartedAt: string | null;
  cycleNumber: number;

  addItem: (item: Omit<Item, 'id' | 'normalizedName' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'quantitySold'>) => void;
  addItemsBatch: (items: Array<Omit<Item, 'id' | 'normalizedName' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'quantitySold' | 'quantitySoldInCycle'>>) => void;
  updateItem: (id: string, updates: Partial<Item>) => void;
  bulkSetItemCooperative: (ids: string[], isCooperative: boolean) => void;
  bulkSetItemPrice: (ids: string[], price: number) => void;
  bulkSetItemShop: (ids: string[], shopId: string | null) => void;
  shops: Shop[];
  createShop: (name: string) => void;
  renameShop: (id: string, name: string) => void;
  deleteShop: (id: string) => Promise<void>;
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
  const isImpersonatingRef = useRef(false);

  useEffect(() => {
    if (!isImpersonatingRef.current) {
      setCurrentUserState(getAuthUserAsCharacter());
    }
  }, [getAuthUserAsCharacter]);

  const setCurrentUser = useCallback((nextUser: Character) => {
    const originalUser = getAuthUserAsCharacter();
    const isOriginalAccount = nextUser.id === originalUser.id || String(nextUser.id) === `auth-${authUser?.id}`;

    if (!authUser) {
      isImpersonatingRef.current = false;
      setCurrentUserState(defaultEmptyCharacter);
      return;
    }

    if (!isAuthSuperAdmin && !isOriginalAccount) {
      isImpersonatingRef.current = false;
      setCurrentUserState(originalUser);
      return;
    }

    isImpersonatingRef.current = !isOriginalAccount;
    setCurrentUserState(nextUser);
  }, [authUser, getAuthUserAsCharacter, isAuthSuperAdmin]);

  const [items, setItems] = useState<Item[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [salesCycles, setSalesCycles] = useState<SalesCycle[]>([]);

  const { data: serverItems, refetch: refetchItems, isLoading: itemsLoading } = trpc.items.list.useQuery(undefined, {
    enabled: !!authUser,
  });
  const { data: serverCharacters, refetch: refetchCharacters, isLoading: charsLoading } = trpc.items.legacyBuyers.useQuery(undefined, {
    enabled: !!authUser,
  });
  const { data: serverPurchases, refetch: refetchPurchases, isLoading: purchasesLoading } = trpc.items.listPurchases.useQuery(undefined, {
    enabled: !!authUser,
  });
  const { data: serverShops, refetch: refetchShops } = trpc.items.shops.list.useQuery(undefined, {
    enabled: !!authUser && isAuthSuperAdmin,
  });
  const { data: serverCycles, refetch: refetchCycles, isLoading: cyclesLoading } = trpc.salesCycles.list.useQuery(undefined, {
    enabled: !!authUser,
  });
  const { data: serverAuditLogs, refetch: refetchAuditLogs, isLoading: logsLoading } = trpc.auditLogs.list.useQuery(undefined, {
    enabled: !!authUser,
  });

  const isLoading = !!authUser && (itemsLoading || charsLoading || purchasesLoading || cyclesLoading || logsLoading);

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
        // #17: responsable del ítem (id de usuario). El nombre se resuelve en la tabla.
        responsibleUserId: item.responsibleUserId !== null && item.responsibleUserId !== undefined ? String(item.responsibleUserId) : null,
        // Tienda asignada (solo referencia). null = sin tienda.
        shopId: item.shopId !== null && item.shopId !== undefined ? String(item.shopId) : null,
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

  // #15: la fuente de verdad de la actividad son los logs PERSISTENTES del
  // servidor. Antes fusionábamos logs temporales del navegador (addLog) que se
  // perdían al refrescar y ensuciaban el feed. Ahora reemplazamos con los del
  // servidor; los optimistas de addLog quedan como preview hasta el próximo
  // refetch (que disparamos tras cada mutación).
  useEffect(() => {
    if (serverAuditLogs) setAuditLogs(serverAuditLogs as any[]);
  }, [serverAuditLogs]);

  const trpcUtils = trpc.useUtils();
  const sellMutation = trpc.items.sell.useMutation({
    onSuccess: () => {
      refetchPurchases();
      refetchItems();
      refetchCharacters();
      refetchAuditLogs();
      trpcUtils.items.reservations.list.invalidate();
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
    onSuccess: () => { refetchItems(); refetchAuditLogs(); }
  });

  const updateItemMutation = trpc.items.update.useMutation({
    onSuccess: () => { refetchItems(); refetchAuditLogs(); }
  });

  const bulkSetCooperativeMutation = trpc.items.bulkSetCooperative.useMutation({
    onSuccess: () => { refetchItems(); refetchAuditLogs(); }
  });

  const bulkSetPriceMutation = trpc.items.bulkSetPrice.useMutation({
    onSuccess: () => { refetchItems(); refetchAuditLogs(); }
  });

  const bulkCreateMutation = trpc.items.bulkCreate.useMutation({
    onSuccess: () => { refetchItems(); refetchAuditLogs(); }
  });

  const bulkSetShopMutation = trpc.items.bulkSetShop.useMutation({
    onSuccess: () => { refetchItems(); }
  });
  const shopCreateMutation = trpc.items.shops.create.useMutation({
    onSuccess: () => { refetchShops(); }
  });
  const shopRenameMutation = trpc.items.shops.rename.useMutation({
    onSuccess: () => { refetchShops(); }
  });
  const shopDeleteMutation = trpc.items.shops.delete.useMutation({
    onSuccess: () => { refetchShops(); refetchItems(); }
  });

  const confirmItemMutation = trpc.items.confirm.useMutation({
    onSuccess: () => { refetchItems(); refetchAuditLogs(); }
  });

  const deleteItemMutation = trpc.items.delete.useMutation({
    onSuccess: () => {
      refetchItems();
      refetchCharacters();
      refetchAuditLogs();
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
      mapperId: parseInt(String(currentUser.id).replace('auth-', '')) || 0,
      associatedCharacterIds: data.associatedCharacterIds.map(id => parseInt(String(id).replace('auth-', '')) || 0).filter(id => id > 0),
      quantity: data.quantity || 1,
      imageUrl: imageUrlToPersist,
      // #17: responsable del ítem (id de usuario).
      responsibleUserId: data.responsibleUserId
        ? (parseInt(String(data.responsibleUserId).replace('auth-', '')) || null)
        : null,
      // Flag cooperativo (solo separación visual en Ciclos de Venta).
      isCooperative: Boolean(data.isCooperative),
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

  // Registra varios ítems con UNA sola llamada al backend (evita N mutaciones
  // al registrar muchas filas de una vez). Optimista en local, mismo formato
  // que addItem por cada fila.
  const addItemsBatch = useCallback((list: Array<Omit<Item, 'id' | 'normalizedName' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'quantitySold' | 'quantitySoldInCycle'>>) => {
    if (currentUser.role === 'USER') return;
    if (list.length === 0) return;

    const payload = list.map(data => ({
      name: data.name,
      category: data.category,
      status: data.status,
      price: data.price || 0,
      mapperId: parseInt(String(currentUser.id).replace('auth-', '')) || 0,
      associatedCharacterIds: data.associatedCharacterIds.map(id => parseInt(String(id).replace('auth-', '')) || 0).filter(id => id > 0),
      quantity: data.quantity || 1,
      imageUrl: String(data.image?.publicUrl || '').trim() || null,
      responsibleUserId: data.responsibleUserId
        ? (parseInt(String(data.responsibleUserId).replace('auth-', '')) || null)
        : null,
      isCooperative: Boolean(data.isCooperative),
    }));
    bulkCreateMutation.mutate({ items: payload });

    const now = new Date().toISOString();
    const newItems: Item[] = list.map(data => ({
      ...data,
      id: `item-${nanoid(6)}`,
      normalizedName: data.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.name,
      updatedBy: currentUser.name,
      quantitySold: 0,
      quantitySoldInCycle: 0,
    }));
    setItems(prev => [...newItems, ...prev]);

    setCharacters(prev => prev.map(char => {
      const extra = newItems.filter(it => it.associatedCharacterIds.includes(char.id) && !char.itemIds.includes(it.id)).map(it => it.id);
      return extra.length > 0 ? { ...char, itemIds: [...char.itemIds, ...extra] } : char;
    }));

    addLog(newItems[0].id, newItems[0].name, 'CREATED_ITEM', `Registró ${newItems.length} ítem(s) en lote.`);
  }, [currentUser, addLog, bulkCreateMutation]);

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
    // #12: convertir associatedCharacterIds (strings, posible prefijo auth-) a
    // números para el backend. #17: idem responsable. quantity = stock editable.
    const assocForServer = updates.associatedCharacterIds !== undefined
      ? updates.associatedCharacterIds.map(cid => parseInt(String(cid).replace('auth-', '')) || 0).filter(cid => cid > 0)
      : undefined;
    const responsibleForServer = updates.responsibleUserId !== undefined
      ? (updates.responsibleUserId ? (parseInt(String(updates.responsibleUserId).replace('auth-', '')) || null) : null)
      : undefined;
    updateItemMutation.mutate({
      id: isNaN(updateNumericId) ? 0 : updateNumericId,
      name: updates.name,
      category: updates.category,
      price: updates.price || undefined,
      imageUrl: incomingImageUrl,
      associatedCharacterIds: assocForServer,
      quantity: updates.quantity !== undefined ? Number(updates.quantity) : undefined,
      responsibleUserId: responsibleForServer,
      isCooperative: updates.isCooperative !== undefined ? Boolean(updates.isCooperative) : undefined,
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

  // Marca/desmarca el flag cooperativo en LOTE con UNA sola llamada al backend
  // (evita disparar N mutaciones cuando son muchos ítems). Optimista en local.
  const bulkSetItemCooperative = useCallback((ids: string[], isCooperative: boolean) => {
    if (currentUser.role === 'USER') return;
    const numericIds = ids
      .map(id => parseInt(String(id).replace('item-', '')))
      .filter(n => !isNaN(n));
    if (numericIds.length === 0) return;
    bulkSetCooperativeMutation.mutate({ ids: numericIds, isCooperative });
    const idSet = new Set(ids);
    setItems(prev => prev.map(item =>
      idSet.has(item.id)
        ? { ...item, isCooperative, updatedAt: new Date().toISOString(), updatedBy: currentUser.name }
        : item
    ));
  }, [currentUser, bulkSetCooperativeMutation]);

  // Aplica un mismo precio base a varios ítems con UNA sola llamada al backend
  // (evita disparar N mutaciones al editar el precio de un grupo grande).
  const bulkSetItemPrice = useCallback((ids: string[], price: number) => {
    if (currentUser.role === 'USER') return;
    const numericIds = ids
      .map(id => parseInt(String(id).replace('item-', '')))
      .filter(n => !isNaN(n));
    if (numericIds.length === 0) return;
    bulkSetPriceMutation.mutate({ ids: numericIds, price });
    const idSet = new Set(ids);
    setItems(prev => prev.map(item =>
      idSet.has(item.id)
        ? { ...item, price, updatedAt: new Date().toISOString(), updatedBy: currentUser.name }
        : item
    ));
  }, [currentUser, bulkSetPriceMutation]);

  // Tiendas (vendedores). Lista derivada del servidor + CRUD. Solo Super Admin.
  const shops: Shop[] = React.useMemo(
    () => (serverShops as any[] | undefined || []).map(s => ({
      id: String(s.id),
      name: String(s.name || ''),
      createdAt: s.createdAt,
    })),
    [serverShops]
  );

  const createShop = useCallback((name: string) => {
    if (currentUser.role !== 'SUPER_ADMIN') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    shopCreateMutation.mutate({ name: trimmed });
  }, [currentUser, shopCreateMutation]);

  const renameShop = useCallback((id: string, name: string) => {
    if (currentUser.role !== 'SUPER_ADMIN') return;
    const numericId = parseInt(String(id), 10);
    const trimmed = name.trim();
    if (isNaN(numericId) || !trimmed) return;
    shopRenameMutation.mutate({ id: numericId, name: trimmed });
  }, [currentUser, shopRenameMutation]);

  const deleteShop = useCallback(async (id: string) => {
    if (currentUser.role !== 'SUPER_ADMIN') return;
    const numericId = parseInt(String(id), 10);
    if (isNaN(numericId)) return;
    await shopDeleteMutation.mutateAsync({ id: numericId });
  }, [currentUser, shopDeleteMutation]);

  // Asigna (o quita, shopId=null) la tienda a varios ítems con UNA sola llamada
  // al backend (evita N mutaciones en grupos grandes). Optimista en local.
  const bulkSetItemShop = useCallback((ids: string[], shopId: string | null) => {
    if (currentUser.role !== 'SUPER_ADMIN') return;
    const numericIds = ids
      .map(id => parseInt(String(id).replace('item-', '')))
      .filter(n => !isNaN(n));
    if (numericIds.length === 0) return;
    const numericShopId = shopId != null ? parseInt(String(shopId), 10) : null;
    bulkSetShopMutation.mutate({ ids: numericIds, shopId: (numericShopId != null && !isNaN(numericShopId)) ? numericShopId : null });
    const idSet = new Set(ids);
    setItems(prev => prev.map(item =>
      idSet.has(item.id)
        ? { ...item, shopId, updatedAt: new Date().toISOString(), updatedBy: currentUser.name }
        : item
    ));
  }, [currentUser, bulkSetShopMutation]);

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

  const sellItem = useCallback(({ itemId, quantityToSell, buyerId, buyerName, isInternalSale, isExternalSale }: SellItemOptions) => {
    // #4: SUPER_ADMIN y MAPPER pueden vender. USER no.
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'MAPPER') return;

    const numericId = parseInt(String(itemId).replace('item-', ''));
    sellMutation.mutate({
      id: isNaN(numericId) ? 0 : numericId,
      quantity: quantityToSell,
      buyerId,
      buyerName,
      isInternalSale: isInternalSale || false,
      isExternalSale: isExternalSale || false,
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

  const isImpersonating = !!(currentUser && !String(currentUser.id).startsWith('auth-') && String(currentUser.id) !== `auth-${authUser?.id}`);
  const effectiveRole = isImpersonating ? String(currentUser?.role || '').toLowerCase() : String(authUser?.role || '').toLowerCase();
  const effectiveIsSuperAdmin = effectiveRole === 'super_admin';

  return (
    <AppContext.Provider value={{
      isLoading,
      currentUser, setCurrentUser, isImpersonating, effectiveRole, effectiveIsSuperAdmin,
      items, characters, auditLogs, purchases, salesCycles,
      currentCycleStartedAt, cycleNumber,
      addItem, addItemsBatch, updateItem, bulkSetItemCooperative, bulkSetItemPrice,
      bulkSetItemShop, shops, createShop, renameShop, deleteShop,
      confirmItem, deleteItem, sellItem, searchItems,
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
