import { describe, it, expect } from 'vitest';

describe('Clan Fund — Calculation Logic', () => {
  function calcEffectivePrice(basePrice: number, isInternal: boolean, discountPct: number): number {
    const pct = isInternal ? discountPct : 0;
    return Math.floor(basePrice * (1 - pct / 100));
  }

  function calcClanTax(totalRevenue: number, taxPct: number): number {
    return Math.floor(totalRevenue * taxPct / 100);
  }

  function calcCharacterEarnings(totalRevenue: number, clanTax: number, numCharacters: number): number {
    const netRevenue = totalRevenue - clanTax;
    return Math.floor(netRevenue / numCharacters);
  }

  describe('Retención del clan', () => {
    it('debería aplicar 10% de retención sobre 1,000,000', () => {
      expect(calcClanTax(1_000_000, 10)).toBe(100_000);
    });
    it('debería retornar 0 si el porcentaje es 0', () => {
      expect(calcClanTax(1_000_000, 0)).toBe(0);
    });
    it('debería manejar 100% de retención', () => {
      expect(calcClanTax(500_000, 100)).toBe(500_000);
    });
    it('debería truncar decimales (floor)', () => {
      expect(calcClanTax(999_999, 10)).toBe(99_999);
    });
  });

  describe('Descuento venta interna', () => {
    it('debería aplicar 20% de descuento sobre 1,000,000', () => {
      expect(calcEffectivePrice(1_000_000, true, 20)).toBe(800_000);
    });
    it('no debería aplicar descuento si no es venta interna', () => {
      expect(calcEffectivePrice(1_000_000, false, 20)).toBe(1_000_000);
    });
    it('debería manejar 0% de descuento', () => {
      expect(calcEffectivePrice(1_000_000, true, 0)).toBe(1_000_000);
    });
  });

  describe('Descuento + Retención combinados', () => {
    it('1M con 20% desc + 10% clan = 80k clan, 720k para 3 personajes', () => {
      const eff = calcEffectivePrice(1_000_000, true, 20);
      expect(eff).toBe(800_000);
      const tax = calcClanTax(eff, 10);
      expect(tax).toBe(80_000);
      const perChar = calcCharacterEarnings(eff, tax, 3);
      expect(perChar).toBe(240_000);
      expect(perChar * 3 + tax).toBeLessThanOrEqual(eff);
    });
    it('500k sin desc + 5% clan', () => {
      const tax = calcClanTax(500_000, 5);
      expect(tax).toBe(25_000);
      const perChar = calcCharacterEarnings(500_000, tax, 2);
      expect(perChar).toBe(237_500);
      expect(perChar * 2 + tax).toBeLessThanOrEqual(500_000);
    });
  });

  describe('Coherencia de métricas', () => {
    it('totalRevenue = charEarnings + clanTax + residual (siempre coherente)', () => {
      const cases = [
        { revenue: 999_999, taxPct: 7, chars: 4 },
        { revenue: 1_500_000, taxPct: 15, chars: 1 },
        { revenue: 100, taxPct: 3, chars: 2 },
        { revenue: 0, taxPct: 10, chars: 1 },
        { revenue: 50_000_000, taxPct: 25, chars: 10 },
      ];
      for (const tc of cases) {
        const tax = calcClanTax(tc.revenue, tc.taxPct);
        const perChar = calcCharacterEarnings(tc.revenue, tax, tc.chars);
        const total = perChar * tc.chars + tax;
        expect(total).toBeLessThanOrEqual(tc.revenue);
        expect(tc.revenue - total).toBeLessThan(tc.chars);
      }
    });
  });

  describe('Retrocompatibilidad — ciclos sin datos de clan', () => {
    it('debería interpretar campos ausentes como 0/false', () => {
      const legacy: any = { id: '1', totalRevenue: 500_000, characterEarnings: [{ earnings: 250_000 }, { earnings: 250_000 }] };
      expect(Number(legacy.clanFundAmount) || 0).toBe(0);
      expect(Boolean(legacy.clanFundPaidOut)).toBe(false);
      expect(Number(legacy.clanTaxPercent) || 0).toBe(0);
    });
  });

  describe('Fondo del clan — summary', () => {
    it('balance = ingresos - gastos', () => {
      const txs = [
        { type: 'income', amount: 100_000 },
        { type: 'income', amount: 50_000 },
        { type: 'expense', amount: 30_000 },
      ];
      const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      expect(income).toBe(150_000);
      expect(expense).toBe(30_000);
      expect(income - expense).toBe(120_000);
    });
  });

  describe('Ganancias de personajes cuando clan está activo', () => {
    it('debería reducir ganancias proporcionales al impuesto', () => {
      const perCharNoClan = calcCharacterEarnings(1_000_000, 0, 2);
      expect(perCharNoClan).toBe(500_000);
      const tax = calcClanTax(1_000_000, 10);
      const perCharWithClan = calcCharacterEarnings(1_000_000, tax, 2);
      expect(perCharWithClan).toBe(450_000);
      expect(perCharNoClan - perCharWithClan).toBe(50_000);
    });
  });
});
