export type ItemCategory = 'ARMADURA' | 'ARMA' | 'KEY' | 'RECIPE' | 'MATERIALES' | 'QUEST' | 'ADENA' | 'JOYA' | 'SCROLL' | 'PERSONAJES' | 'LIFE_STONE';
export type ItemStatus = 'EN_REGISTRO' | 'CONFIRMADO' | 'VENDIDO';
export type UserRole = 'SUPER_ADMIN' | 'MAPPER' | 'USER';

export interface ItemImage {
  id: string;
  publicUrl: string;
  altText: string;
}

// Tienda (vendedor) — nombre reutilizable para anotar dónde quedó un ítem a la
// venta. Solo referencia del Super Admin; no afecta estado del ítem ni ciclos.
export interface Shop {
  id: string;
  name: string;
  createdAt?: string;
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
  // #17: usuario responsable de vender/gestionar el ítem (id) y su nombre resuelto.
  responsibleUserId?: string | null;
  responsibleName?: string | null;
  // Flag de agrupación cooperativa. SOLO afecta la visualización en Ciclos de
  // Venta (separa 🤝 Cooperativo de 👤 Individual). No cambia montos ni reparto.
  isCooperative?: boolean;
  // Tienda (vendedor) donde quedó puesto a la venta el ítem. Solo referencia
  // para el Super Admin; no cambia el estado del ítem ni afecta ciclos/montos.
  shopId?: string | null;
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
  // Desglose de la ganancia según el flag del ítem (solo separación visual).
  coopEarnings?: number;
  indivEarnings?: number;
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
  // Reparto real por usuario acumulado en el ciclo (ya con impuesto y sobrante).
  // Clave = id de usuario, valor = adena que recibió por este ítem. Permite el
  // desglose por usuario cuadrando exacto con su total.
  earningsByCharacter?: Record<string, number>;
  // Marca si el ítem fue vendido como cooperativo (solo separación visual).
  isCooperative?: boolean;
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
