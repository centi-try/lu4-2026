export type ItemCategory = 'ARMADURA' | 'ARMA' | 'KEY' | 'RECIPE' | 'MATERIALES' | 'QUEST' | 'ADENA' | 'JOYA';
export type ItemStatus = 'EN_REGISTRO' | 'CONFIRMADO' | 'VENDIDO';
export type UserRole = 'SUPER_ADMIN' | 'MAPPER' | 'USER';

export interface ItemImage {
  id: string;
  publicUrl: string;
  altText: string;
}

export interface Item {
  id: string;
  name: string;
  normalizedName: string;
  category: ItemCategory;
  price: number | null;
  status: ItemStatus;
  image: ItemImage;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  associatedCharacterIds: string[];
  soldAt?: string;
  soldBy?: string;
  // Cantidad de unidades
  quantity: number;              // Cantidad total registrada
  quantitySold: number;          // Cantidad vendida acumulada (total histórico)
  quantitySoldInCycle: number;   // Cantidad vendida en el ciclo actual
  // Ciclo al que pertenece (id del ciclo activo cuando fue registrado)
  cycleId?: string;
}

export interface Character {
  id: string;
  name: string;
  role: UserRole;
  avatar: string;
  class: string;
  level: number;
  itemIds: string[];
  totalEarnings: number;
  // Ganancias del ciclo actual (se resetea al cerrar ciclo)
  currentCycleEarnings: number;
}

export interface AuditLog {
  id: string;
  itemId: string;
  itemName: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  detail: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  itemId: string;
  itemName: string;
  buyerId: string;
  buyerName: string;
  quantity: number;
  price: number;
  total: number;
  createdAt: string;
}

// Registro de ganancia de un personaje en un ciclo
export interface CycleCharacterEarning {
  characterId: string;
  characterName: string;
  earnings: number;
  // Estado de pago manual (admin marca cuando ya le pagó la adena al personaje)
  paidOut?: boolean;
  paidAt?: string;
  paidBy?: string;
}

// Resumen de un item vendido dentro de un ciclo
export interface CycleSoldItem {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  price: number;
  quantitySold: number;
  totalRevenue: number;
  associatedCharacterIds: string[];
  earningsPerCharacter: number;
}

// Ciclo de ventas (puede ser diario o semanal)
export interface SalesCycle {
  id: string;
  label: string;           // Ej: "Semana 1 - Abr 2026" o "Día 1 - 11/04/2026"
  type: 'DIARIO' | 'SEMANAL';
  startedAt: string;
  closedAt: string;
  closedBy: string;
  totalRevenue: number;    // Ingresos brutos totales
  totalProfit: number;     // Ganancia total generada (suma de ganancias de personajes)
  characterEarnings: CycleCharacterEarning[];
  soldItems: CycleSoldItem[];
  // Items que quedaron sin vender (se acumulan al siguiente ciclo)
  unsoldItemIds: string[];
}

export interface DashboardMetrics {
  totalItems: number;
  confirmedItems: number;
  draftItems: number;
  totalValue: number;
  byCategory: { category: ItemCategory; count: number }[];
  byStatus: { status: ItemStatus; count: number }[];
}

export interface AppState {
  currentUser: Character;
  items: Item[];
  characters: Character[];
  auditLogs: AuditLog[];
  salesCycles: SalesCycle[];
  currentCycleStartedAt: string | null;
}
