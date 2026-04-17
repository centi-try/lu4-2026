import type { Item, Character, AuditLog, DashboardMetrics, ItemCategory, SalesCycle } from './types';

const iso = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

// ─── ITEMS COMPARTIDOS ──────────────────────────────────────────────────────
export const mockItems: Item[] = [
  {
    id: 'item-1', name: 'Espada del Caos', normalizedName: 'espada del caos',
    category: 'ARMA', price: 4500, status: 'CONFIRMADO',
    image: { id: 'img-1', publicUrl: 'https://images.unsplash.com/photo-1589656966895-2f33e7653819?auto=format&fit=crop&w=80&q=80', altText: 'Arma' },
    createdAt: iso(120), updatedAt: iso(30), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-1', 'char-2', 'char-3'],
    quantity: 5, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-2', name: 'Armadura de Dragón', normalizedName: 'armadura de dragon',
    category: 'ARMADURA', price: 8200, status: 'CONFIRMADO',
    image: { id: 'img-2', publicUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?auto=format&fit=crop&w=80&q=80', altText: 'Armadura' },
    createdAt: iso(200), updatedAt: iso(50), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-2', 'char-3', 'char-4'],
    quantity: 3, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-3', name: 'Llave Dorada', normalizedName: 'llave dorada',
    category: 'KEY', price: 350, status: 'CONFIRMADO',
    image: { id: 'img-3', publicUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=80&q=80', altText: 'Key' },
    createdAt: iso(180), updatedAt: iso(60), createdBy: 'Nicolas Mapper', updatedBy: 'Admin',
    associatedCharacterIds: ['char-1', 'char-5'],
    quantity: 10, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-4', name: 'Piedra de Encantamiento', normalizedName: 'piedra de encantamiento',
    category: 'MATERIALES', price: 220, status: 'CONFIRMADO',
    image: { id: 'img-4', publicUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=80&q=80', altText: 'Materiales' },
    createdAt: iso(150), updatedAt: iso(20), createdBy: 'Nicolas Mapper', updatedBy: 'Nicolas Mapper',
    associatedCharacterIds: ['char-3', 'char-4', 'char-6'],
    quantity: 20, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-5', name: 'Mapa Antiguo', normalizedName: 'mapa antiguo',
    category: 'QUEST', price: 100, status: 'CONFIRMADO',
    image: { id: 'img-5', publicUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=80&q=80', altText: 'Quest' },
    createdAt: iso(300), updatedAt: iso(90), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-1', 'char-2'],
    quantity: 8, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-6', name: 'Paquete de Hierro', normalizedName: 'paquete de hierro',
    category: 'MATERIALES', price: 75, status: 'CONFIRMADO',
    image: { id: 'img-6', publicUrl: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=80&q=80', altText: 'Materiales' },
    createdAt: iso(250), updatedAt: iso(80), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-4', 'char-5'],
    quantity: 15, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-7', name: 'Adena Premium', normalizedName: 'adena premium',
    category: 'ADENA', price: 1250, status: 'CONFIRMADO',
    image: { id: 'img-7', publicUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=80&q=80', altText: 'Adena' },
    createdAt: iso(400), updatedAt: iso(100), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-1', 'char-3', 'char-5'],
    quantity: 6, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-8', name: 'Llave de Plata', normalizedName: 'llave de plata',
    category: 'KEY', price: 250, status: 'EN_REGISTRO',
    image: { id: 'img-8', publicUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=80&q=80', altText: 'Key' },
    createdAt: iso(30), updatedAt: iso(5), createdBy: 'Nicolas Mapper', updatedBy: 'Nicolas Mapper',
    associatedCharacterIds: ['char-2', 'char-6'],
    quantity: 12, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-9', name: 'Receta de Espada Oscura', normalizedName: 'receta de espada oscura',
    category: 'RECIPE', price: 1800, status: 'CONFIRMADO',
    image: { id: 'img-9', publicUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=80&q=80', altText: 'Recipe' },
    createdAt: iso(500), updatedAt: iso(200), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-1', 'char-4'],
    quantity: 4, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-10', name: 'Cristal de Maná', normalizedName: 'cristal de mana',
    category: 'MATERIALES', price: 430, status: 'EN_REGISTRO',
    image: { id: 'img-10', publicUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=80&q=80', altText: 'Materiales' },
    createdAt: iso(45), updatedAt: iso(10), createdBy: 'Sofia Mapper', updatedBy: 'Sofia Mapper',
    associatedCharacterIds: ['char-3', 'char-5'],
    quantity: 7, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-11', name: 'Escudo de Titanio', normalizedName: 'escudo de titanio',
    category: 'ARMADURA', price: 5600, status: 'CONFIRMADO',
    image: { id: 'img-11', publicUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?auto=format&fit=crop&w=80&q=80', altText: 'Armadura' },
    createdAt: iso(600), updatedAt: iso(150), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-2', 'char-4'],
    quantity: 2, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-12', name: 'Bolsa de Adena', normalizedName: 'bolsa de adena',
    category: 'ADENA', price: 500, status: 'CONFIRMADO',
    image: { id: 'img-12', publicUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=80&q=80', altText: 'Adena' },
    createdAt: iso(700), updatedAt: iso(300), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-1', 'char-6'],
    quantity: 9, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-13', name: 'Daga Élfica', normalizedName: 'daga elfica',
    category: 'ARMA', price: 2100, status: 'EN_REGISTRO',
    image: { id: 'img-13', publicUrl: 'https://images.unsplash.com/photo-1589656966895-2f33e7653819?auto=format&fit=crop&w=80&q=80', altText: 'Arma' },
    createdAt: iso(60), updatedAt: iso(15), createdBy: 'Carlos Mapper', updatedBy: 'Carlos Mapper',
    associatedCharacterIds: ['char-5', 'char-6'],
    quantity: 3, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-14', name: 'Pergamino de Teletransporte', normalizedName: 'pergamino de teletransporte',
    category: 'QUEST', price: 300, status: 'CONFIRMADO',
    image: { id: 'img-14', publicUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=80&q=80', altText: 'Quest' },
    createdAt: iso(800), updatedAt: iso(400), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-2', 'char-3'],
    quantity: 11, quantitySold: 0, quantitySoldInCycle: 0,
  },
  {
    id: 'item-15', name: 'Mineral de Adamantita', normalizedName: 'mineral de adamantita',
    category: 'MATERIALES', price: 890, status: 'CONFIRMADO',
    image: { id: 'img-15', publicUrl: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=80&q=80', altText: 'Materiales' },
    createdAt: iso(900), updatedAt: iso(500), createdBy: 'Admin', updatedBy: 'Admin',
    associatedCharacterIds: ['char-1', 'char-4'],
    quantity: 5, quantitySold: 0, quantitySoldInCycle: 0,
  },
];

// ─── 50 PERSONAJES ──────────────────────────────────────────────────────────
const characterNames = [
	  'UserTest',
	];

const classes = ['Guerrero', 'Mago', 'Arquero', 'Paladín', 'Asesino', 'Clérigo', 'Druida', 'Bardo'];
const avatarColors = ['from-cyan-400 to-blue-600', 'from-fuchsia-400 to-purple-600', 'from-amber-400 to-orange-600', 'from-emerald-400 to-teal-600', 'from-rose-400 to-red-600'];

const allItemIds = mockItems.map(i => i.id);

export const mockCharacters: Character[] = characterNames.map((name, idx) => {
  const role = idx === 0 ? 'USER' : (idx < 6 ? 'SUPER_ADMIN' : 'MAPPER');
  const level = Math.floor(Math.random() * 80) + 20;
  const charClass = classes[idx % classes.length];
  const avatarColor = avatarColors[idx % avatarColors.length];
  // Each character holds 2-6 random items
  const itemCount = 2 + (idx % 5);
  const itemIds = allItemIds.slice(idx % allItemIds.length, (idx % allItemIds.length) + itemCount)
    .concat(allItemIds.slice(0, Math.max(0, itemCount - (allItemIds.length - (idx % allItemIds.length)))))
    .slice(0, itemCount);

  return {
    id: `char-${idx + 1}`,
    name,
    role,
    avatar: avatarColor,
    class: charClass,
    level,
    itemIds,
    totalEarnings: 0,
    currentCycleEarnings: 0,
  };
});

// ─── AUDIT LOGS ─────────────────────────────────────────────────────────────
export const mockAuditLogs: AuditLog[] = [
  { id: 'log-1', itemId: 'item-8', itemName: 'Llave de Plata', actorName: 'Admin', actorRole: 'SUPER_ADMIN', action: 'CREATED_ITEM', detail: 'Creó Llave de Plata con imagen obligatoria y estado EN_REGISTRO.', createdAt: iso(5) },
  { id: 'log-2', itemId: 'item-3', itemName: 'Llave Dorada', actorName: 'Admin', actorRole: 'SUPER_ADMIN', action: 'CORRECTED_IMAGE', detail: 'Corrigió la imagen de Llave Dorada por asignación incorrecta.', createdAt: iso(12) },
  { id: 'log-3', itemId: 'item-4', itemName: 'Piedra de Encantamiento', actorName: 'Admin', actorRole: 'SUPER_ADMIN', action: 'CONFIRMED_ITEM', detail: 'Confirmó Piedra de Encantamiento y bloqueó edición para Mapper.', createdAt: iso(20) },
  { id: 'log-4', itemId: 'item-6', itemName: 'Paquete de Hierro', actorName: 'Nicolas Mapper', actorRole: 'MAPPER', action: 'UPDATED_PRICE', detail: 'Actualizó el precio de Paquete de Hierro según referencia previa.', createdAt: iso(35) },
  { id: 'log-5', itemId: 'item-10', itemName: 'Cristal de Maná', actorName: 'Sofia Mapper', actorRole: 'MAPPER', action: 'CREATED_ITEM', detail: 'Registró Cristal de Maná con imagen de categoría MATERIALES.', createdAt: iso(45) },
  { id: 'log-6', itemId: 'item-13', itemName: 'Daga Élfica', actorName: 'Carlos Mapper', actorRole: 'MAPPER', action: 'CREATED_ITEM', detail: 'Registró Daga Élfica, pendiente de confirmación.', createdAt: iso(60) },
  { id: 'log-7', itemId: 'item-1', itemName: 'Espada del Caos', actorName: 'Admin', actorRole: 'SUPER_ADMIN', action: 'UPDATED_PRICE', detail: 'Actualizó precio de Espada del Caos de $4000 a $4500.', createdAt: iso(90) },
  { id: 'log-8', itemId: 'item-9', itemName: 'Receta de Espada Oscura', actorName: 'Admin', actorRole: 'SUPER_ADMIN', action: 'CONFIRMED_ITEM', detail: 'Confirmó Receta de Espada Oscura. Imagen permanente asignada.', createdAt: iso(120) },
  { id: 'log-9', itemId: 'item-2', itemName: 'Armadura de Dragón', actorName: 'Admin', actorRole: 'SUPER_ADMIN', action: 'CORRECTED_IMAGE', detail: 'Reemplazó imagen de Armadura de Dragón por versión de mayor resolución.', createdAt: iso(150) },
  { id: 'log-10', itemId: 'item-7', itemName: 'Adena Premium', actorName: 'Admin', actorRole: 'SUPER_ADMIN', action: 'CONFIRMED_ITEM', detail: 'Confirmó Adena Premium. Valor de mercado registrado.', createdAt: iso(200) },
];

// ─── CICLOS DE VENTAS ────────────────────────────────────────────────────────
export const mockSalesCycles: SalesCycle[] = [];

// ─── MÉTRICAS ────────────────────────────────────────────────────────────────
export const mockMetrics: DashboardMetrics = {
  totalItems: mockItems.length,
  confirmedItems: mockItems.filter(i => i.status === 'CONFIRMADO').length,
  draftItems: mockItems.filter(i => i.status === 'EN_REGISTRO').length,
  totalValue: mockItems.reduce((sum, i) => sum + (i.price ?? 0), 0),
  byCategory: [
    { category: 'ARMADURA', count: mockItems.filter(i => i.category === 'ARMADURA').length },
    { category: 'ARMA', count: mockItems.filter(i => i.category === 'ARMA').length },
    { category: 'KEY', count: mockItems.filter(i => i.category === 'KEY').length },
    { category: 'RECIPE', count: mockItems.filter(i => i.category === 'RECIPE').length },
    { category: 'MATERIALES', count: mockItems.filter(i => i.category === 'MATERIALES').length },
    { category: 'QUEST', count: mockItems.filter(i => i.category === 'QUEST').length },
    { category: 'ADENA', count: mockItems.filter(i => i.category === 'ADENA').length },
  ],
  byStatus: [
    { status: 'CONFIRMADO', count: mockItems.filter(i => i.status === 'CONFIRMADO').length },
    { status: 'EN_REGISTRO', count: mockItems.filter(i => i.status === 'EN_REGISTRO').length },
  ],
};
