import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getItems, createItem, updateItem, deleteItem, createAuditLog, createPurchase, getPurchases, getCharacters, saveDbToDisk, dbInstance, getAllUsers,
  // reservations (waitlist sobre items del inventario legacy)
  getItemReservations, createItemReservation, deleteItemReservation,
  markReservationPreSold, unmarkReservationPreSold,
  markReservationSold,
  getClanFundSettings,
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
});

const SellItemSchema = z.object({
  id: z.number(),
  quantity: z.number().positive(),
  buyerId: z.string(),
  buyerName: z.string(),
  isInternalSale: z.boolean().optional(),
});

export const itemsRouter = router({
  list: protectedProcedure.query(async () => {
    return await getItems();
  }),

  legacyBuyers: protectedProcedure.query(async () => {
    const users = await getAllUsers();
    const allItems = await getItems();
    return users
      .filter((u: any) => u.legacyAccess && u.isActive !== false)
      .map((u: any) => {
        const userId = Number(u.id);
        const associatedItems = allItems.filter((i: any) =>
          (i.associatedCharacterIds || []).includes(userId) ||
          (i.associatedCharacterIds || []).includes(String(userId))
        );
        return {
          id: String(u.id),
          name: u.characterName || u.name || u.displayName || 'Sin nombre',
          classMain: u.classMain || '',
          role: u.role || 'user',
          totalEarnings: Number(u.totalEarnings || 0),
          currentCycleEarnings: Number(u.currentCycleEarnings || 0),
          itemCount: associatedItems.length,
          itemIds: associatedItems.map((i: any) => i.id),
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

      const allBefore = await getItems();
      const before = allBefore.find(i => Number(i.id) === Number(input.id));
      await updateItem(input.id, updateData);

      // Registrar en auditoría distinguiendo cambio de precio de cambio genérico.
      const changedKeys = Object.keys(updateData);
      const isPriceOnly = changedKeys.length === 1 && changedKeys[0] === 'price';
      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: isPriceOnly ? 'UPDATE_PRICE' : 'UPDATE_ITEM',
        itemId: String(input.id),
        itemName: before?.name || updateData.name,
        detail: isPriceOnly
          ? `Actualizó el precio del ítem "${before?.name || input.id}" a $${Number(updateData.price).toLocaleString()}.`
          : `Actualizó ${changedKeys.join(', ')} del ítem "${before?.name || input.id}".`,
        details: { itemId: input.id, changes: updateData },
      });

      return { success: true };
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
      const earningsPerChar = Math.floor(revenueAfterTax / associatedCount);

      // FIX: Actualizar ganancias de los personajes en la base de datos
      // Comparar IDs como números para evitar problemas de tipo
      if (dbInstance.characters && associatedCharacterIds.length > 0) {
        dbInstance.characters = dbInstance.characters.map(char => {
          const charIdNum = Number(char.id);
          const matches = associatedCharacterIds.includes(charIdNum);

          if (matches) {
            return {
              ...char,
              totalEarnings: (Number(char.totalEarnings) || 0) + earningsPerChar,
              currentCycleEarnings: (Number(char.currentCycleEarnings) || 0) + earningsPerChar,
              updatedAt: new Date(),
            };
          }
          return char;
        });
        saveDbToDisk();
      }

      // Acumular retención del clan (se registra como transacción al cerrar el ciclo)
      if (clanTaxAmount > 0) {
        dbInstance.clanFundCurrentCycleAccrued = (Number(dbInstance.clanFundCurrentCycleAccrued) || 0) + clanTaxAmount;
        saveDbToDisk();
      }

      // Crear registro de compra persistente
      await createPurchase({
        itemId: String(item.id),
        itemName: item.name,
        buyerId: input.buyerId,
        buyerName: input.buyerName,
        quantity: input.quantity,
        price: effectivePrice,
        total: totalRevenue,
      });

      await createAuditLog({
        userId: ctx.user?.id || 0,
        itemId: String(item.id),
        itemName: item.name,
        actorName: ctx.user?.characterName || ctx.user?.name || "Sistema",
        actorRole: ctx.user?.role || "USER",
        action: "SOLD_ITEM",
        detail: `Vendió ${input.quantity} unidad(es) de "${item.name}" a ${input.buyerName}. Total: $${totalRevenue.toLocaleString()}${clanTaxAmount > 0 ? ` (Clan: $${clanTaxAmount.toLocaleString()})` : ''}${input.isInternalSale ? ' [Venta Interna]' : ''}.`,
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

      // Auto-mark matching reservations as 'sold'
      const itemReservations = await getItemReservations({ itemId: Number(input.id) });
      const buyerNameNorm = String(input.buyerName || '').trim().toLowerCase();
      for (const r of itemReservations) {
        const rName = String(r.characterName || '').trim().toLowerCase();
        if (rName === buyerNameNorm && r.status !== 'sold') {
          await markReservationSold(r.id, Number(ctx.user?.id || 0));
        }
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
            message: 'Solo Mapper, Admin o Super Admin pueden marcar como pre-vendido.',
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
            message: 'Solo Mapper, Admin o Super Admin pueden desmarcar pre-vendido.',
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
