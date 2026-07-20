import { router, protectedProcedure, publicProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getItems, createItem, updateItem, deleteItem, createAuditLog, createPurchase, getPurchases, saveDbToDisk, dbInstance, getAllUsers,
  // reservations (waitlist sobre items del inventario legacy)
  getItemReservations, createItemReservation, deleteItemReservation,
  markReservationPreSold, unmarkReservationPreSold,
  markReservationSold,
  getClanFundSettings,
  // Tiendas (vendedores) — anotación de dónde quedó puesto a la venta un ítem.
  getShops, createShop, renameShop, deleteShop,
} from "../db";

const CreateItemSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  status: z.string().default("PENDING"),
  price: z.number().positive(),
  mapperId: z.number(),
  // FIX: Aceptar associatedCharacterIds en la creación
  associatedCharacterIds: z.array(z.number()).optional(),
  quantity: z.number().positive().optional(),
  // #17: responsable del ítem (id de usuario que se encarga de venderlo).
  responsibleUserId: z.number().nullable().optional(),
  // Flag cooperativo (solo separación visual en Ciclos de Venta).
  isCooperative: z.boolean().optional(),
  // Icono por categoría (seteado en /raids/settings) o URL manual. El cliente
  // lo resuelve y lo envía; el backend lo persiste tal cual. Antes se forzaba
  // a null en el insert, por eso los ítems recién creados no mostraban imagen.
  imageUrl: z.string().nullable().optional(),
});

const UpdateItemSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  category: z.string().optional(),
  price: z.number().positive().optional(),
  imageUrl: z.string().optional(),
  // FIX: Permitir actualizar associatedCharacterIds
  associatedCharacterIds: z.array(z.number()).optional(),
  // #12: permitir editar el stock (cantidad total).
  quantity: z.number().int().positive().optional(),
  // #17: responsable del ítem (id de usuario) o null para quitarlo.
  responsibleUserId: z.number().nullable().optional(),
  // Flag cooperativo (solo separación visual en Ciclos de Venta).
  isCooperative: z.boolean().optional(),
});

const SellItemSchema = z.object({
  id: z.number(),
  quantity: z.number().positive(),
  buyerId: z.string(),
  buyerName: z.string(),
  isInternalSale: z.boolean().optional(),
  isExternalSale: z.boolean().optional(),
});

export const itemsRouter = router({
  list: protectedProcedure.query(async () => {
    return await getItems();
  }),

  legacyBuyers: protectedProcedure.query(async () => {
    const [users, allItems] = await Promise.all([
      getAllUsers(), getItems(),
    ]);

    return users
      .filter((u: any) => u.legacyAccess && u.isActive !== false)
      .map((u: any) => {
        const userId = Number(u.id);
        const userName = String(u.characterName || u.name || '');

        // Items associated with this user's ID
        const associatedItems = allItems.filter((i: any) => {
          const assocIds = (i.associatedCharacterIds || []).map((id: any) => String(id));
          return assocIds.includes(String(userId));
        });

        return {
          id: String(u.id),
          name: userName || 'Sin nombre',
          classMain: u.classMain || '',
          role: u.role || 'user',
          totalEarnings: Number(u.totalEarnings) || 0,
          currentCycleEarnings: Number(u.currentCycleEarnings) || 0,
          itemCount: associatedItems.length,
          itemIds: associatedItems.map((i: any) => i.id),
          characterId: String(u.id),
        };
      });
  }),

  create: protectedProcedure
    .input(CreateItemSchema)
    .mutation(async ({ ctx, input }) => {
      await createItem({
        name: input.name,
        category: input.category,
        status: input.status,
        price: input.price,
        mapperId: input.mapperId,
        imageUrl: input.imageUrl ?? null,
        quantity: input.quantity || 1,
        quantitySold: 0,
        quantitySoldInCycle: 0,
        // FIX: Guardar associatedCharacterIds como números
        associatedCharacterIds: input.associatedCharacterIds || [],
        // #17: responsable del ítem
        responsibleUserId: input.responsibleUserId ?? null,
        // Flag cooperativo (default false = venta individual).
        isCooperative: input.isCooperative ?? false,
      });

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "CREATE_ITEM",
        itemName: input.name,
        detail: `Creó el ítem "${input.name}" (${input.quantity || 1} unidad(es)) en categoría ${input.category}.`,
        details: { itemName: input.name, category: input.category, quantity: input.quantity || 1 },
      });

      return { success: true };
    }),

  update: protectedProcedure
    .input(UpdateItemSchema)
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {};
      if (input.name) updateData.name = input.name;
      if (input.category) updateData.category = input.category;
      if (input.price) updateData.price = input.price;
      if (input.imageUrl) updateData.imageUrl = input.imageUrl;
      // FIX: Actualizar associatedCharacterIds si se proporciona
      if (input.associatedCharacterIds !== undefined) {
        updateData.associatedCharacterIds = input.associatedCharacterIds;
      }
      // #12: permitir editar el stock. No dejamos bajar la cantidad por debajo
      // de lo ya vendido para no romper la contabilidad.
      const allBefore = await getItems();
      const before = allBefore.find(i => Number(i.id) === Number(input.id));
      if (input.quantity !== undefined) {
        const sold = Number(before?.quantitySold) || 0;
        if (input.quantity < sold) {
          throw new Error(`El stock no puede ser menor a las unidades ya vendidas (${sold}).`);
        }
        updateData.quantity = input.quantity;
      }
      // #17: responsable del ítem (permite null para quitarlo)
      if (input.responsibleUserId !== undefined) {
        updateData.responsibleUserId = input.responsibleUserId;
      }
      // Flag cooperativo (solo separación visual en Ciclos de Venta)
      if (input.isCooperative !== undefined) {
        updateData.isCooperative = input.isCooperative;
      }

      await updateItem(input.id, updateData);

      // Registrar en auditoría distinguiendo cambio de precio de cambio genérico.
      const changedKeys = Object.keys(updateData);
      const isPriceOnly = changedKeys.length === 1 && changedKeys[0] === 'price';
      // #12: descripción legible de los cambios (viejo → nuevo) para el historial.
      const labelMap: Record<string, string> = {
        name: 'nombre', price: 'precio', quantity: 'stock',
        category: 'categoría', associatedCharacterIds: 'personajes',
        responsibleUserId: 'responsable', imageUrl: 'imagen',
        isCooperative: 'cooperativo',
      };
      const humanChanges = changedKeys.map((k) => {
        if (k === 'price' || k === 'quantity') {
          const oldV = Number((before as any)?.[k]);
          return `${labelMap[k] || k}: ${Number.isFinite(oldV) ? oldV.toLocaleString() : '—'} → ${Number(updateData[k]).toLocaleString()}`;
        }
        if (k === 'name') return `nombre: "${before?.name || '—'}" → "${updateData.name}"`;
        return labelMap[k] || k;
      });
      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: isPriceOnly ? 'UPDATE_PRICE' : 'UPDATE_ITEM',
        itemId: String(input.id),
        itemName: before?.name || updateData.name,
        detail: isPriceOnly
          ? `Actualizó el precio del ítem "${before?.name || input.id}" a $${Number(updateData.price).toLocaleString()}.`
          : `Editó el ítem "${before?.name || input.id}" (${humanChanges.join('; ')}).`,
        details: { itemId: input.id, changes: updateData },
      });

      return { success: true };
    }),

  // Marca/desmarca el flag cooperativo en LOTE. Una sola escritura a disco y un
  // solo log de auditoría, para no gatillar N mutaciones cuando son muchos ítems
  // (ej. 80) desde el Resumen de Inventario. Solo separación visual en Ciclos.
  bulkSetCooperative: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), isCooperative: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const idSet = new Set(input.ids.map(Number));
      let updated = 0;
      dbInstance.items = dbInstance.items.map((i: any) => {
        if (idSet.has(Number(i.id))) {
          updated += 1;
          return { ...i, isCooperative: input.isCooperative, updatedAt: new Date() };
        }
        return i;
      });
      saveDbToDisk();

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "UPDATE_ITEM",
        detail: `Marcó ${updated} ítem(s) como ${input.isCooperative ? "Cooperativo" : "Individual"} (en lote).`,
        details: { ids: input.ids, isCooperative: input.isCooperative, count: updated },
      });

      return { success: true, count: updated };
    }),

  // Aplica un mismo precio base a varios ítems en LOTE. Una sola escritura a
  // disco y un solo log de auditoría, para no gatillar N mutaciones al editar
  // el precio de un grupo grande (ej. 80 ítems) desde el Resumen de Inventario.
  // Solo cambia el precio base; el descuento de clan y KPIs se calculan igual.
  bulkSetPrice: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), price: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const idSet = new Set(input.ids.map(Number));
      let updated = 0;
      dbInstance.items = dbInstance.items.map((i: any) => {
        if (idSet.has(Number(i.id))) {
          updated += 1;
          return { ...i, price: input.price, updatedAt: new Date() };
        }
        return i;
      });
      saveDbToDisk();

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "UPDATE_PRICE",
        detail: `Actualizó el precio de ${updated} ítem(s) a $${input.price.toLocaleString()} (en lote).`,
        details: { ids: input.ids, price: input.price, count: updated },
      });

      return { success: true, count: updated };
    }),

  // Asigna (o quita) la TIENDA de varios ítems en LOTE. shopId=null quita la
  // asignación. Una sola escritura a disco. Es solo una anotación de referencia:
  // no cambia el estado del ítem ni afecta ciclos/montos. Solo Super Admin.
  bulkSetShop: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), shopId: z.number().nullable() }))
    .mutation(async ({ input }) => {
      const idSet = new Set(input.ids.map(Number));
      const shop = input.shopId != null
        ? getShops().find((s: any) => Number(s.id) === Number(input.shopId))
        : null;
      if (input.shopId != null && !shop) throw new Error("Tienda no encontrada");
      let updated = 0;
      dbInstance.items = dbInstance.items.map((i: any) => {
        if (idSet.has(Number(i.id))) {
          updated += 1;
          return { ...i, shopId: input.shopId, updatedAt: new Date() };
        }
        return i;
      });
      saveDbToDisk();

      return { success: true, count: updated };
    }),

  // Tiendas (vendedores): CRUD de nombres reutilizables para anotar dónde quedó
  // puesto a la venta un ítem. Solo referencia; no afecta estado ni ciclos.
  // Solo Super Admin y sin registro en el Historial.
  shops: router({
    list: adminProcedure.query(async () => {
      return getShops();
    }),
    create: adminProcedure
      .input(z.object({ name: z.string().trim().min(1).max(60) }))
      .mutation(async ({ input }) => {
        const exists = getShops().some((s: any) => String(s.name).trim().toLowerCase() === input.name.trim().toLowerCase());
        if (exists) throw new Error("Ya existe una tienda con ese nombre");
        return createShop(input.name);
      }),
    rename: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().trim().min(1).max(60) }))
      .mutation(async ({ input }) => {
        const exists = getShops().some((s: any) => Number(s.id) !== Number(input.id) && String(s.name).trim().toLowerCase() === input.name.trim().toLowerCase());
        if (exists) throw new Error("Ya existe una tienda con ese nombre");
        renameShop(input.id, input.name);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        deleteShop(input.id);
        return { success: true };
      }),

    // Resumen por vendedor/tienda: agrupa por tienda los ítems asignados con
    // stock (referencia de lo que "tiene" el enano) y las ventas ya realizadas
    // (precio real + interna/externa, persistente vía purchases). Devuelve la
    // adena esperada como referencia para cuadrar montos. Solo Super Admin.
    summary: adminProcedure.query(async () => {
      const shops = getShops();
      const items = await getItems();
      const purchases = await getPurchases();

      return shops.map((shop: any) => {
        const sid = Number(shop.id);
        const activeItems = items
          .filter((i: any) => Number(i.shopId) === sid && ((Number(i.quantity) || 0) - (Number(i.quantitySold) || 0)) > 0)
          .map((i: any) => {
            const remaining = (Number(i.quantity) || 0) - (Number(i.quantitySold) || 0);
            return {
              id: i.id,
              name: i.name,
              category: i.category || "",
              imageUrl: i.imageUrl || "",
              remaining,
              price: Number(i.price) || 0,
              expected: (Number(i.price) || 0) * remaining,
            };
          });
        const sales = purchases
          .filter((p: any) => Number(p.shopId) === sid)
          .map((p: any) => ({
            itemName: p.itemName,
            quantity: Number(p.quantity) || 0,
            price: Number(p.price) || 0,
            total: Number(p.total) || 0,
            isInternalSale: !!p.isInternalSale,
            isExternalSale: !!p.isExternalSale,
            createdAt: p.createdAt,
          }))
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const expectedActive = activeItems.reduce((s: number, i: any) => s + i.expected, 0);
        const soldTotal = sales.reduce((s: number, x: any) => s + x.total, 0);
        return {
          shopId: shop.id,
          shopName: shop.name,
          activeItems,
          sales,
          expectedActive,
          soldTotal,
          expectedTotal: expectedActive + soldTotal,
        };
      });
    }),

    // Resetear vendedores: deja todas las tiendas "en 0" — quita la asignación
    // de tienda de todos los ítems y limpia la referencia de tienda de las
    // ventas ya registradas (sin borrar las compras ni tocar montos/ciclos).
    // Se usa cuando ya se cuadraron los montos y se quiere empezar de nuevo.
    reset: adminProcedure.mutation(async () => {
      let items = 0;
      dbInstance.items = (dbInstance.items || []).map((i: any) => {
        if (i.shopId != null) { items += 1; return { ...i, shopId: null }; }
        return i;
      });
      let sales = 0;
      dbInstance.purchases = (dbInstance.purchases || []).map((p: any) => {
        if (p.shopId != null) { sales += 1; return { ...p, shopId: null, shopName: null }; }
        return p;
      });
      saveDbToDisk();
      return { success: true, items, sales };
    }),
  }),

  // Crea varios ítems en LOTE. Una sola escritura a disco y un solo log de
  // auditoría, para no gatillar N mutaciones al registrar muchas filas de una
  // vez desde el panel de Registro. Mismo formato/validación que `create`.
  bulkCreate: protectedProcedure
    .input(z.object({ items: z.array(CreateItemSchema).min(1) }))
    .mutation(async ({ ctx, input }) => {
      for (const it of input.items) {
        const newItem = {
          name: it.name,
          category: it.category,
          status: it.status,
          price: it.price,
          mapperId: it.mapperId,
          imageUrl: it.imageUrl ?? null,
          quantity: it.quantity || 1,
          quantitySold: 0,
          quantitySoldInCycle: 0,
          associatedCharacterIds: Array.isArray(it.associatedCharacterIds)
            ? it.associatedCharacterIds.map(Number)
            : [],
          responsibleUserId: it.responsibleUserId ?? null,
          isCooperative: Boolean(it.isCooperative),
          id: Math.floor(Math.random() * 1000000),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        dbInstance.items.push(newItem);
      }
      saveDbToDisk();

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "CREATE_ITEM",
        detail: `Registró ${input.items.length} ítem(s) en lote.`,
        details: { count: input.items.length, names: input.items.map((i) => i.name) },
      });

      return { success: true, count: input.items.length };
    }),

  confirm: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const allBefore = await getItems();
      const before = allBefore.find(i => Number(i.id) === Number(input.id));
      await updateItem(input.id, { status: "CONFIRMED" });

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "CONFIRM_ITEM",
        itemId: String(input.id),
        itemName: before?.name,
        detail: `Confirmó el ítem "${before?.name || input.id}".`,
        details: { itemId: input.id, itemName: before?.name },
      });

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const allBefore = await getItems();
      const before = allBefore.find(i => Number(i.id) === Number(input.id));
      await deleteItem(input.id);

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "DELETE_ITEM",
        itemId: String(input.id),
        itemName: before?.name,
        detail: `Eliminó el ítem "${before?.name || input.id}".`,
        details: { itemId: input.id, itemName: before?.name },
      });

      return { success: true };
    }),

  sell: protectedProcedure
    .input(SellItemSchema)
    .mutation(async ({ ctx, input }) => {
      const allItems = await getItems();
      const itemIndex = allItems.findIndex(i => i.id === input.id);
      if (itemIndex === -1) throw new Error("Item not found");
      const item = allItems[itemIndex];

      const available = (item.quantity || 0) - (item.quantitySold || 0);
      if (input.quantity > available) throw new Error("Not enough quantity available");

      const newQuantitySold = (item.quantitySold || 0) + input.quantity;
      const newQuantitySoldInCycle = (item.quantitySoldInCycle || 0) + input.quantity;
      const isFullySold = newQuantitySold >= (item.quantity || 0);

      // Actualizar el item
      await updateItem(input.id, {
        quantitySold: newQuantitySold,
        quantitySoldInCycle: newQuantitySoldInCycle,
        status: isFullySold ? "VENDIDO" : item.status,
      });

      // FIX: Calcular ganancias para los personajes asociados
      // Normalizar IDs a números para comparación consistente
      const associatedCharacterIds: number[] = Array.isArray(item.associatedCharacterIds)
        ? item.associatedCharacterIds.map(Number)
        : [];
      const associatedCount = associatedCharacterIds.length || 1;

      // Clan fund: apply internal discount and clan tax
      const clanSettings = getClanFundSettings();
      const basePrice = Number(item.price) || 0;
      const discountPct = input.isInternalSale ? (Number(clanSettings.internalDiscountPercent) || 0) : 0;
      const effectivePrice = Math.floor(basePrice * (1 - discountPct / 100));
      const totalRevenue = effectivePrice * input.quantity;
      const clanTaxPct = Number(clanSettings.clanTaxPercent) || 0;
      const clanTaxAmount = Math.floor(totalRevenue * clanTaxPct / 100);
      const revenueAfterTax = totalRevenue - clanTaxAmount;
      // FIX #14: repartir el sobrante del redondeo. Math.floor por personaje
      // perdía adena (ej: 2.600.000 / 3 = 866.666 × 3 = 2.599.998, se pierden 2).
      // Distribuimos el resto de a 1 adena entre los primeros personajes para
      // que la suma reparta EXACTAMENTE revenueAfterTax y todo cuadre.
      const baseEarnings = Math.floor(revenueAfterTax / associatedCount);
      let remainder = revenueAfterTax - baseEarnings * associatedCount;
      const earningsByCharId = new Map<number, number>();
      associatedCharacterIds.forEach((cid) => {
        const extra = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder -= 1;
        earningsByCharId.set(Number(cid), baseEarnings + extra);
      });

      // Flag cooperativo del ítem: SOLO sirve para separar visualmente en Ciclos
      // de Venta (🤝 Cooperativo vs 👤 Individual). No cambia el reparto ni los
      // montos: acumulamos la MISMA `share` en un contador u otro según el flag.
      const isCoop = Boolean(item.isCooperative);

      // Actualizar ganancias directamente en los USUARIOS asociados
      // (associatedCharacterIds contiene IDs de usuario)
      if (dbInstance.users && associatedCharacterIds.length > 0) {
        dbInstance.users = dbInstance.users.map((u: any) => {
          const uid = Number(u.id);
          if (earningsByCharId.has(uid)) {
            const share = earningsByCharId.get(uid) || 0;
            return {
              ...u,
              totalEarnings: (Number(u.totalEarnings) || 0) + share,
              currentCycleEarnings: (Number(u.currentCycleEarnings) || 0) + share,
              // Desglose para la separación visual del ciclo.
              currentCycleEarningsCoop: (Number(u.currentCycleEarningsCoop) || 0) + (isCoop ? share : 0),
              currentCycleEarningsIndiv: (Number(u.currentCycleEarningsIndiv) || 0) + (isCoop ? 0 : share),
              updatedAt: new Date().toISOString(),
            };
          }
          return u;
        });
        saveDbToDisk();
      }

      // Acumular el reparto REAL por (ítem, usuario) del ciclo actual, para poder
      // desglosar en Ciclos de Venta qué ítems le sumaron adena a cada usuario y
      // que la suma cuadre EXACTA con su total (ya incluye impuesto y sobrante).
      const prevByChar = (item.cycleEarningsByChar && typeof item.cycleEarningsByChar === 'object')
        ? item.cycleEarningsByChar as Record<string, number>
        : {};
      const nextByChar: Record<string, number> = { ...prevByChar };
      earningsByCharId.forEach((share, cid) => {
        nextByChar[String(cid)] = (Number(nextByChar[String(cid)]) || 0) + share;
      });
      // Acumular el REVENUE REAL de cada venta con el precio del momento. Al
      // cerrar el ciclo el total se toma de aquí (no se recalcula con el precio
      // actual), así editar el precio después de vender no descuadra el ciclo.
      const prevCycleRevenue = Number(item.cycleRevenue) || 0;
      await updateItem(input.id, {
        cycleEarningsByChar: nextByChar,
        cycleRevenue: prevCycleRevenue + totalRevenue,
      });

      // Acumular retención del clan (se registra como transacción al cerrar el ciclo)
      if (clanTaxAmount > 0) {
        dbInstance.clanFundCurrentCycleAccrued = (Number(dbInstance.clanFundCurrentCycleAccrued) || 0) + clanTaxAmount;
        saveDbToDisk();
      }

      // Tienda (vendedor) asignada al ítem al momento de la venta. Se persiste
      // en la compra para que el resumen por vendedor conserve la referencia y
      // el valor real aunque el ítem se venda por completo. Solo referencia.
      const saleShop = item.shopId != null
        ? getShops().find((s: any) => Number(s.id) === Number(item.shopId))
        : null;

      // Crear registro de compra persistente
      await createPurchase({
        itemId: String(item.id),
        itemName: item.name,
        buyerId: input.buyerId,
        buyerName: input.buyerName,
        quantity: input.quantity,
        price: effectivePrice,
        originalPrice: item.price,
        total: totalRevenue,
        isInternalSale: input.isInternalSale || false,
        isExternalSale: input.isExternalSale || false,
        discountPct: discountPct || 0,
        clanTax: clanTaxAmount,
        shopId: item.shopId ?? null,
        shopName: saleShop?.name ?? null,
      });

      await createAuditLog({
        userId: ctx.user?.id || 0,
        itemId: String(item.id),
        itemName: item.name,
        actorName: ctx.user?.characterName || ctx.user?.name || "Sistema",
        actorRole: ctx.user?.role || "USER",
        action: "SOLD_ITEM",
        detail: `Vendió ${input.quantity} unidad(es) de "${item.name}"${input.isExternalSale ? ' [Venta Externa - City]' : ` a ${input.buyerName}`}. Total: $${totalRevenue.toLocaleString()}${clanTaxAmount > 0 ? ` (Clan: $${clanTaxAmount.toLocaleString()})` : ''}${input.isInternalSale ? ' [Venta Interna]' : ''}.`,
        details: {
          itemId: input.id,
          quantity: input.quantity,
          buyerName: input.buyerName,
          totalRevenue,
          clanTaxAmount,
          isInternalSale: input.isInternalSale || false,
          effectivePrice,
          discountPct,
        },
      });

      // Auto-mark matching reservations as 'sold' — sequentially (oldest first),
      // only enough to cover the quantity being sold in THIS transaction.
      const itemReservations = await getItemReservations({ itemId: Number(input.id) });
      const buyerNameNorm = String(input.buyerName || '').trim().toLowerCase();
      let remainingToMark = input.quantity;
      // Sort by creation date ascending (oldest first = top to bottom)
      const sorted = itemReservations
        .filter((r: any) => {
          const rName = String(r.characterName || '').trim().toLowerCase();
          return rName === buyerNameNorm && r.status !== 'sold';
        })
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const r of sorted) {
        if (remainingToMark <= 0) break;
        await markReservationSold(r.id, Number(ctx.user?.id || 0));
        remainingToMark -= Number(r.quantity) || 1;
      }

      return { success: true };
    }),

  listPurchases: protectedProcedure.query(async () => {
    return await getPurchases();
  }),

  // ---------------- Reservas de compra sobre items legacy --------------------
  // Misma semántica waitlist que las reservas del módulo raid: cualquier
  // usuario logueado puede reservar, múltiples usuarios pueden anotarse aunque
  // la suma supere el stock. Solo se valida que la cantidad individual no
  // supere el stock disponible. El dueño o un admin/mapper pueden cancelar.
  reservations: router({
    list: protectedProcedure
      .input(z.object({
        itemId: z.number().int().optional(),
        userId: z.number().int().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await getItemReservations(input);
      }),
    create: protectedProcedure
      .input(z.object({
        itemId: z.number().int(),
        quantity: z.number().int().min(1),
        asUserId: z.number().int().optional(),
        asCharacterName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Si el super admin pasa asUserId/asCharacterName, se usa para la reserva (impersonación)
        const isSA = String(ctx.user?.role || '').toLowerCase() === 'super_admin';
        const effectiveUserId = (isSA && input.asUserId) ? input.asUserId : Number(ctx.user?.id || 0);
        const effectiveCharName = (isSA && input.asCharacterName) ? input.asCharacterName : String(
          (ctx.user as any)?.characterName ||
          ctx.user?.name ||
          ctx.user?.email ||
          ''
        ).trim();
        const effectiveUserName = effectiveCharName;
        if (!effectiveCharName) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Tu perfil no tiene un personaje configurado. Configuralo antes de reservar.',
          });
        }
        // Resolve role for impersonated user
        let effectiveRole = String(ctx.user?.role || 'USER');
        if (isSA && input.asUserId) {
          const allUsers = await getAllUsers();
          const target = allUsers.find((u: any) => Number(u.id) === input.asUserId);
          if (target) effectiveRole = String(target.role || 'user');
        }
        try {
          const reservation = await createItemReservation({
            itemId: input.itemId,
            userId: effectiveUserId,
            userName: effectiveUserName,
            characterName: effectiveCharName,
            quantity: input.quantity,
          });
          await createAuditLog({
            userId: effectiveUserId,
            action: 'ITEM_RESERVED',
            actorName: effectiveCharName,
            actorRole: effectiveRole,
            itemId: String(input.itemId),
            detail: `Reservó ${input.quantity} unidad(es) del ítem #${input.itemId}.`,
            details: {
              itemId: input.itemId,
              quantity: input.quantity,
              characterName: effectiveCharName,
            },
          });
          return { success: true, reservation };
        } catch (err: any) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: err?.message || 'No se pudo registrar la reserva.',
          });
        }
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const all = await getItemReservations();
        const target = all.find(r => Number(r.id) === Number(input.id));
        if (!target) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Reserva no encontrada.',
          });
        }
        const role = String(ctx.user?.role || '').toLowerCase();
        const isAdmin = role === 'super_admin' || role === 'mapper';
        const isOwner = Number(target.userId) === Number(ctx.user?.id || -1);
        if (!isOwner && !isAdmin) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'No tenés permiso para borrar esta reserva.',
          });
        }
        const removed = await deleteItemReservation(input.id);
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'ITEM_RESERVATION_DELETED',
          actorName: String((ctx.user as any)?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          itemId: String(target.itemId),
          detail: `Canceló reserva #${input.id} (${isOwner ? 'propia' : 'ajena'}) del ítem #${target.itemId}.`,
          details: {
            reservationId: input.id,
            itemId: target.itemId,
            deletedBy: isOwner ? 'owner' : 'admin',
          },
        });
        return { success: true, reservation: removed };
      }),
    markPreSold: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin' && role !== 'mapper' && role !== 'admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo Mapper, Admin o Administrador del Sistema pueden marcar como pre-vendido.',
          });
        }
        const all = await getItemReservations();
        const target = all.find(r => Number(r.id) === Number(input.id));
        if (!target) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reserva no encontrada.' });
        }
        const updated = await markReservationPreSold(input.id, Number(ctx.user?.id || 0));
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'ITEM_RESERVATION_PRE_SOLD',
          actorName: String((ctx.user as any)?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          itemId: String(target.itemId),
          detail: `Marcó reserva de ${target.characterName} como pre-vendido en ítem #${target.itemId}.`,
          details: { reservationId: input.id, itemId: target.itemId, characterName: target.characterName },
        });
        return { success: true, reservation: updated };
      }),
    unmarkPreSold: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin' && role !== 'mapper' && role !== 'admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo Mapper, Admin o Administrador del Sistema pueden desmarcar pre-vendido.',
          });
        }
        const all = await getItemReservations();
        const target = all.find(r => Number(r.id) === Number(input.id));
        if (!target) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reserva no encontrada.' });
        }
        const updated = await unmarkReservationPreSold(input.id);
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'ITEM_RESERVATION_UNMARK_PRE_SOLD',
          actorName: String((ctx.user as any)?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          itemId: String(target.itemId),
          detail: `Desmarcó pre-venta de ${target.characterName} en ítem #${target.itemId}.`,
          details: { reservationId: input.id, itemId: target.itemId },
        });
        return { success: true, reservation: updated };
      }),

  }),
});
