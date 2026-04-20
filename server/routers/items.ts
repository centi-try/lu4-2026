import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getItems, createItem, updateItem, deleteItem, createAuditLog, createPurchase, getPurchases, getCharacters, saveDbToDisk, dbInstance,
  // reservations (waitlist sobre items del inventario legacy)
  getItemReservations, createItemReservation, deleteItemReservation,
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
});

export const itemsRouter = router({
  list: protectedProcedure.query(async () => {
    return await getItems();
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
        imageUrl: null,
        quantity: input.quantity || 1,
        quantitySold: 0,
        quantitySoldInCycle: 0,
        // FIX: Guardar associatedCharacterIds como números
        associatedCharacterIds: input.associatedCharacterIds || [],
      });

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "CREATE_ITEM",
        details: { itemName: input.name },
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

      await updateItem(input.id, updateData);
      return { success: true };
    }),

  confirm: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await updateItem(input.id, { status: "CONFIRMED" });

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "CONFIRM_ITEM",
        details: { itemId: input.id },
      });

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteItem(input.id);

      await createAuditLog({
        userId: ctx.user?.id || 0,
        action: "DELETE_ITEM",
        details: { itemId: input.id },
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
      const totalRevenue = (Number(item.price) || 0) * input.quantity;
      const earningsPerChar = Math.floor(totalRevenue / associatedCount);

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

      // Crear registro de compra persistente
      await createPurchase({
        itemId: String(item.id),
        itemName: item.name,
        buyerId: input.buyerId,
        buyerName: input.buyerName,
        quantity: input.quantity,
        price: Number(item.price),
        total: totalRevenue,
      });

      await createAuditLog({
        userId: ctx.user?.id || 0,
        itemId: String(item.id),
        itemName: item.name,
        actorName: ctx.user?.characterName || ctx.user?.name || "Sistema",
        actorRole: ctx.user?.role || "USER",
        action: "SOLD_ITEM",
        detail: `Vendió ${input.quantity} unidad(es) de "${item.name}" a ${input.buyerName}. Total: $${totalRevenue.toLocaleString()}.`,
        details: {
          itemId: input.id,
          quantity: input.quantity,
          buyerName: input.buyerName,
          totalRevenue: totalRevenue,
        },
      });

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
      }))
      .mutation(async ({ ctx, input }) => {
        // characterName del registro (fallback al name si no tiene).
        const characterName = String(
          (ctx.user as any)?.characterName ||
          ctx.user?.name ||
          ctx.user?.email ||
          ''
        ).trim();
        if (!characterName) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Tu perfil no tiene un personaje configurado. Configuralo antes de reservar.',
          });
        }
        try {
          const reservation = await createItemReservation({
            itemId: input.itemId,
            userId: Number(ctx.user?.id || 0),
            userName: String(ctx.user?.name || ctx.user?.email || 'Usuario').trim(),
            characterName,
            quantity: input.quantity,
          });
          await createAuditLog({
            userId: Number(ctx.user?.id || 0),
            action: 'ITEM_RESERVED',
            actorName: characterName,
            actorRole: String(ctx.user?.role || 'USER'),
            itemId: String(input.itemId),
            detail: `Reservó ${input.quantity} unidad(es) del ítem #${input.itemId}.`,
            details: {
              itemId: input.itemId,
              quantity: input.quantity,
              characterName,
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
  }),
});
