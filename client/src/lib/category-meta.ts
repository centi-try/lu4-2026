import type { ItemCategory, ItemStatus } from './types';

export const categoryMeta: any = {
  ARMADURA:   { label: 'Armadura',   badgeClass: 'badge-armadura',   color: '#7bf1d6', emoji: '🛡️' },
  ARMA:       { label: 'Arma',       badgeClass: 'badge-arma',       color: '#e879f9', emoji: '⚔️' },
  ARMAS:      { label: 'Arma',       badgeClass: 'badge-arma',       color: '#e879f9', emoji: '⚔️' },
  JOYA:       { label: 'Joya',       badgeClass: 'badge-joya',       color: '#f472b6', emoji: '💍' },
  KEY:        { label: 'Key',        badgeClass: 'badge-key',        color: '#fbbf24', emoji: '🗝️' },
  RECIPE:     { label: 'Recipe',     badgeClass: 'badge-recipe',     color: '#a78bfa', emoji: '📜' },
  MATERIALES: { label: 'Materiales', badgeClass: 'badge-materiales', color: '#34d399', emoji: '💎' },
  QUEST:      { label: 'Quest',      badgeClass: 'badge-quest',      color: '#60a5fa', emoji: '🗺️' },
  ADENA:      { label: 'Adena',      badgeClass: 'badge-adena',      color: '#f59e0b', emoji: '💰' },
};

export const statusMeta: Record<ItemStatus, { label: string; badgeClass: string; color: string }> = {
  CONFIRMADO:   { label: '✅ Confirmado',   badgeClass: 'badge-confirmado',   color: '#34d399' },
  EN_REGISTRO:  { label: '🟡 En Registro',  badgeClass: 'badge-en_registro',  color: '#fbbf24' },
  VENDIDO:      { label: '💰 Vendido',      badgeClass: 'badge-vendido',      color: '#a78bfa' },
};

export const CATEGORIES: ItemCategory[] = ['ARMADURA', 'ARMA', 'JOYA', 'KEY', 'RECIPE', 'MATERIALES', 'QUEST', 'ADENA'];
