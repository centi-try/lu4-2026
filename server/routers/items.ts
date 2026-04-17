import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { getItems, createItem, updateItem, deleteItem, createAuditLog, createPurchase, getPurchases, getCharacters, saveDbToDisk, dbInstance } from "../db";

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
});
