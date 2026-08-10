import { z } from "zod";
import ExcelJS from "exceljs";
import { router, cpProcedure } from "../_core/trpc";
import {
  dbInstance,
  saveDbToDisk,
  getCpParticipants,
  getCpVendors,
  getCpItems,
  getCpHistory,
  pushCpHistory,
} from "../db";

// ============================================================================
// Reparticiones CP — módulo 100% independiente del inventario. Solo Super
// Admin (cpProcedure). No toca ítems del inventario, personajes, ciclos ni
// montos: tiene su propia data persistente (CPs, vendedores, ítems a repartir)
// y su propio historial de trazabilidad.
// ============================================================================

const newId = () => Math.floor(Math.random() * 1000000);
const actor = (ctx: any) =>
  String(ctx?.user?.characterName || ctx?.user?.name || ctx?.user?.email || "Super Admin");

// ----------------------------------------------------------------------------
// Scope: el módulo tiene DOS espacios de trabajo independientes con la misma
// funcionalidad. "control" = pestaña "Ítems de la CP" (contiene la data ya
// existente); "reparto" = pestaña "A repartir". Cada registro (CP, vendedor,
// ítem, historial) lleva su scope. Los registros antiguos sin scope se tratan
// como "control" para no mover la data que ya estaba.
// ----------------------------------------------------------------------------
type CpScope = "control" | "reparto";
const scopeSchema = z.enum(["control", "reparto"]).optional().default("control");
const scopeOf = (rec: any): CpScope => (rec?.scope === "reparto" ? "reparto" : "control");

const partsOf = (scope: CpScope) => getCpParticipants().filter((c: any) => scopeOf(c) === scope);
const vendorsOf = (scope: CpScope) => getCpVendors().filter((v: any) => scopeOf(v) === scope);
const itemsOf = (scope: CpScope) => getCpItems().filter((it: any) => scopeOf(it) === scope);

// remainderAlloc: mapa CP → unidades EXTRA del sobrante que se le asignan a esa
// CP. Lo que no se asigne del sobrante queda "a vender". Ej.: 5 ítems / 4 CP →
// base 1·1·1·1, sobrante 1; { "CP Oeste": 1 } → 1·1·1·2. Con sobrante 2 se
// puede repartir a gusto: { "CP Norte": 1, "CP Sur": 1 }.
type RemainderAlloc = Record<string, number>;

// Convierte el ítem a un remainderAlloc normalizado, tolerando el modelo viejo
// (remainderAction/assignedCp) por si quedaran registros antiguos.
function remainderAllocOf(item: any): RemainderAlloc {
  if (item && item.remainderAlloc && typeof item.remainderAlloc === "object") {
    return item.remainderAlloc as RemainderAlloc;
  }
  if (item && item.remainderAction === "ASSIGN" && item.assignedCp) {
    return { [String(item.assignedCp)]: Number.MAX_SAFE_INTEGER };
  }
  return {};
}

// Reparto equitativo por ítem: cada CP recibe floor(cantidad / nCP). El
// sobrante (resto) por defecto va "a vender"; el Super Admin puede repartir ese
// sobrante entre las CPs con remainderAlloc.
export function computeAllocation(
  quantity: number,
  cpNames: string[],
  remainderAlloc: RemainderAlloc,
) {
  const n = cpNames.length;
  const qty = Math.max(0, Number(quantity) || 0);
  const perCp = n > 0 ? Math.floor(qty / n) : 0;
  const remainder = n > 0 ? qty - perCp * n : qty;
  const alloc: Record<string, number> = {};
  for (const name of cpNames) alloc[name] = perCp;
  let assigned = 0;
  if (remainder > 0 && remainderAlloc) {
    for (const name of cpNames) {
      if (assigned >= remainder) break;
      const want = Math.max(0, Math.floor(Number(remainderAlloc[name]) || 0));
      const give = Math.min(want, remainder - assigned);
      if (give > 0) {
        alloc[name] += give;
        assigned += give;
      }
    }
  }
  const toSell = remainder - assigned;
  return { perCp, remainder, alloc, toSell };
}

// CPs efectivas de un ítem: los ítems confirmados/vendidos usan el snapshot
// congelado al confirmar (para que el reparto histórico no cambie si luego se
// editan las CPs); los borradores usan la lista actual de CPs participantes.
function effectiveCpNames(item: any, scope: CpScope): string[] {
  if ((item.status === "CONFIRMED" || item.status === "SOLD") && Array.isArray(item.cpNamesSnapshot)) {
    return item.cpNamesSnapshot.map((s: any) => String(s));
  }
  return partsOf(scope).map((c: any) => String(c.name));
}

const normName = (s: any) => String(s ?? "").trim().toLowerCase();

// Precio con descuento: precio normal × (1 − %/100), redondeado.
function discountedPrice(normal: number, pct: number): number {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return Math.round((Number(normal) || 0) * (1 - p / 100));
}

// Vista calculada de un ítem: reparto por CP, unidades disponibles a vender y
// unidades ya vendidas. Los BORRADORES calculan el reparto en vivo sobre la
// cantidad en mano (quantity, que ya excluye lo vendido). Los ENTREGADOS
// (CONFIRMED) usan el reparto congelado al entregar (deliveredAlloc) y su
// sellRemaining, para que vender después no altere lo ya repartido/entregado.
function viewOf(item: any, scope: CpScope): {
  cpNames: string[];
  alloc: Record<string, number>;
  available: number;
  deliveredTotal: number;
  soldUnits: number;
} {
  const sales: any[] = Array.isArray(item?.sales) ? item.sales : [];
  const soldUnits = sales.reduce((s, x) => s + (Number(x?.units) || 0), 0);
  const cpNames = effectiveCpNames(item, scope);
  // Ítems SIN dividir (divide === false): quedan registrados con su cantidad
  // pero no se reparten entre CPs ni se marcan "a vender" (A vender = 0).
  if (item?.divide === false) {
    const alloc: Record<string, number> = {};
    for (const n of cpNames) alloc[n] = 0;
    return { cpNames, alloc, available: 0, deliveredTotal: 0, soldUnits };
  }
  if (item?.status === "CONFIRMED" && item?.deliveredAlloc && typeof item.deliveredAlloc === "object") {
    const alloc: Record<string, number> = {};
    for (const n of cpNames) alloc[n] = Number(item.deliveredAlloc[n]) || 0;
    const deliveredTotal = cpNames.reduce((s, n) => s + (alloc[n] || 0), 0);
    const available = Math.max(0, Number(item.sellRemaining) || 0);
    return { cpNames, alloc, available, deliveredTotal, soldUnits };
  }
  const { alloc, toSell } = computeAllocation(item.quantity, cpNames, remainderAllocOf(item));
  return { cpNames, alloc, available: toSell, deliveredTotal: 0, soldUnits };
}

// Dos conjuntos de CPs son "iguales" si tienen los mismos nombres (sin importar
// el orden). Se usa para decidir si un ítem nuevo puede agruparse con uno
// existente (mismo nombre + mismas CPs participantes).
function cpSetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map(String).sort();
  const sb = [...b].map(String).sort();
  return sa.every((v, i) => v === sb[i]);
}

const nameInput = z.object({ name: z.string().trim().min(1).max(60) });

function assertUniqueName(list: any[], name: string, excludeId?: number) {
  const exists = list.some(
    (x: any) =>
      Number(x.id) !== Number(excludeId ?? -1) &&
      String(x.name).trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (exists) throw new Error("Ya existe un registro con ese nombre");
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; ext: "png" | "jpeg" | "gif" } | null> {
  try {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    let ext: "png" | "jpeg" | "gif" = "png";
    if (ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g($|\?)/i.test(url)) ext = "jpeg";
    else if (ct.includes("gif") || /\.gif($|\?)/i.test(url)) ext = "gif";
    else if (ct.includes("png") || /\.png($|\?)/i.test(url)) ext = "png";
    const arr = Buffer.from(await res.arrayBuffer());
    if (arr.length === 0 || arr.length > 3_000_000) return null;
    return { buffer: arr, ext };
  } catch {
    return null;
  }
}

export const cpSplitRouter = router({
  // -------- CPs participantes (nombres persistentes) --------
  participants: router({
    list: cpProcedure.input(z.object({ scope: scopeSchema }).optional()).query(async ({ input }) => partsOf(input?.scope ?? "control")),
    create: cpProcedure.input(nameInput.extend({ scope: scopeSchema })).mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "control";
      assertUniqueName(partsOf(scope), input.name);
      if (!dbInstance.cpParticipants) dbInstance.cpParticipants = [];
      const cp = { id: newId(), name: input.name.trim(), scope, createdAt: new Date().toISOString() };
      dbInstance.cpParticipants.push(cp);
      pushCpHistory("CP_CREADA", `Registró la CP "${cp.name}"`, actor(ctx), scope);
      saveDbToDisk();
      return cp;
    }),
    rename: cpProcedure
      .input(z.object({ id: z.number(), name: z.string().trim().min(1).max(60), scope: scopeSchema }))
      .mutation(async ({ input, ctx }) => {
        const scope = input.scope ?? "control";
        assertUniqueName(partsOf(scope), input.name, input.id);
        const prev = getCpParticipants().find((c: any) => Number(c.id) === Number(input.id));
        dbInstance.cpParticipants = getCpParticipants().map((c: any) =>
          Number(c.id) === Number(input.id) ? { ...c, name: input.name.trim() } : c,
        );
        pushCpHistory("CP_RENOMBRADA", `Renombró CP "${prev?.name ?? input.id}" → "${input.name.trim()}"`, actor(ctx), scope);
        saveDbToDisk();
        return { success: true };
      }),
    delete: cpProcedure.input(z.object({ id: z.number(), scope: scopeSchema })).mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "control";
      const prev = getCpParticipants().find((c: any) => Number(c.id) === Number(input.id));
      dbInstance.cpParticipants = getCpParticipants().filter((c: any) => Number(c.id) !== Number(input.id));
      // Si alguna CP borrada tenía asignado sobrante en un ítem borrador, se
      // quita ese extra (vuelve a "a vender") para no apuntar a una CP muerta.
      // Solo afecta a los ítems del MISMO scope.
      dbInstance.cpItems = getCpItems().map((it: any) => {
        if (scopeOf(it) !== scope || it.status === "CONFIRMED" || !it.remainderAlloc || !prev?.name) return it;
        if (it.remainderAlloc[prev.name] == null) return it;
        const next = { ...it.remainderAlloc };
        delete next[prev.name];
        return { ...it, remainderAlloc: next };
      });
      pushCpHistory("CP_ELIMINADA", `Eliminó la CP "${prev?.name ?? input.id}"`, actor(ctx), scope);
      saveDbToDisk();
      return { success: true };
    }),
  }),

  // -------- Vendedores (lista propia del módulo) --------
  vendors: router({
    list: cpProcedure.input(z.object({ scope: scopeSchema }).optional()).query(async ({ input }) => vendorsOf(input?.scope ?? "control")),
    create: cpProcedure.input(nameInput.extend({ scope: scopeSchema })).mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "control";
      assertUniqueName(vendorsOf(scope), input.name);
      if (!dbInstance.cpVendors) dbInstance.cpVendors = [];
      const v = { id: newId(), name: input.name.trim(), scope, createdAt: new Date().toISOString() };
      dbInstance.cpVendors.push(v);
      pushCpHistory("VENDEDOR_CREADO", `Registró el vendedor "${v.name}"`, actor(ctx), scope);
      saveDbToDisk();
      return v;
    }),
    rename: cpProcedure
      .input(z.object({ id: z.number(), name: z.string().trim().min(1).max(60), scope: scopeSchema }))
      .mutation(async ({ input, ctx }) => {
        const scope = input.scope ?? "control";
        assertUniqueName(vendorsOf(scope), input.name, input.id);
        const prev = getCpVendors().find((v: any) => Number(v.id) === Number(input.id));
        dbInstance.cpVendors = getCpVendors().map((v: any) =>
          Number(v.id) === Number(input.id) ? { ...v, name: input.name.trim() } : v,
        );
        pushCpHistory("VENDEDOR_RENOMBRADO", `Renombró vendedor "${prev?.name ?? input.id}" → "${input.name.trim()}"`, actor(ctx), scope);
        saveDbToDisk();
        return { success: true };
      }),
    delete: cpProcedure.input(z.object({ id: z.number(), scope: scopeSchema })).mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "control";
      const prev = getCpVendors().find((v: any) => Number(v.id) === Number(input.id));
      dbInstance.cpVendors = getCpVendors().filter((v: any) => Number(v.id) !== Number(input.id));
      // Ítems (del mismo scope) que apuntaban a ese vendedor quedan sin vendedor.
      dbInstance.cpItems = getCpItems().map((it: any) =>
        scopeOf(it) === scope && Number(it.vendorId) === Number(input.id) ? { ...it, vendorId: null } : it,
      );
      pushCpHistory("VENDEDOR_ELIMINADO", `Eliminó el vendedor "${prev?.name ?? input.id}"`, actor(ctx), scope);
      saveDbToDisk();
      return { success: true };
    }),
  }),

  // -------- Ítems a repartir --------
  items: router({
    list: cpProcedure.input(z.object({ scope: scopeSchema }).optional()).query(async ({ input }) => itemsOf(input?.scope ?? "control")),
    create: cpProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(120),
          category: z.string().trim().max(80).optional().default(""),
          imageUrl: z.string().trim().max(1000).optional().default(""),
          quantity: z.number().int().min(1).max(100000),
          discountPercent: z.number().min(0).max(100).optional().default(20),
          divide: z.boolean().optional().default(true),
          scope: scopeSchema,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const scope = input.scope ?? "control";
        if (!dbInstance.cpItems) dbInstance.cpItems = [];
        const participants = partsOf(scope).map((c: any) => String(c.name));
        const name = input.name.trim();
        const divide = input.divide !== false;

        // #6c — Agrupar: solo se agrupa con BORRADORES (aún en tu poder, sin
        // entregar) del mismo nombre y mismas CPs, DENTRO del mismo scope. Los
        // confirmados ya se entregaron/repartieron, así que NO se re-suman ni
        // re-reparten (eso descuadraba las métricas al registrar más unidades).
        const match = itemsOf(scope).find(
          (it: any) =>
            it.status === "DRAFT" &&
            (it.divide !== false) === divide &&
            normName(it.name) === normName(name) &&
            cpSetEqual(effectiveCpNames(it, scope), participants),
        );
        if (match) {
          const newQty = Number(match.quantity) + input.quantity;
          dbInstance.cpItems = getCpItems().map((it: any) =>
            Number(it.id) === Number(match.id) ? { ...it, quantity: newQty } : it,
          );
          const merged = getCpItems().find((it: any) => Number(it.id) === Number(match.id));
          const { toSell } = computeAllocation(newQty, effectiveCpNames(merged, scope), remainderAllocOf(merged));
          const vName = merged.vendorId
            ? getCpVendors().find((v: any) => Number(v.id) === Number(merged.vendorId))?.name
            : null;
          const pend =
            toSell > 0
              ? ` · Faltan ${toSell} u. por enviar${vName ? ` a ${vName}` : " (sin vendedor)"}`
              : "";
          pushCpHistory(
            "ITEM_AGRUPADO",
            `Agrupó "${name}" +${input.quantity} u. (total ${newQty} u.) y re-repartió${pend}`,
            actor(ctx),
            scope,
          );
          saveDbToDisk();
          return { ...merged, _merged: true, _toSell: toSell, _vendorName: vName ?? null };
        }

        const item = {
          id: newId(),
          name,
          category: input.category?.trim() || "",
          imageUrl: input.imageUrl?.trim() || "",
          quantity: input.quantity,
          divide,
          scope,
          remainderAlloc: {} as RemainderAlloc,
          price: null as number | null,
          discountPercent: input.discountPercent ?? 20,
          vendorId: null as number | null,
          status: "DRAFT" as "DRAFT" | "CONFIRMED",
          cpNamesSnapshot: null as string[] | null,
          deliveredAlloc: null as Record<string, number> | null,
          sellRemaining: null as number | null,
          sales: [] as any[],
          createdAt: new Date().toISOString(),
          confirmedAt: null as string | null,
        };
        dbInstance.cpItems.push(item);
        saveDbToDisk();
        return item;
      }),
    update: cpProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().trim().min(1).max(120).optional(),
          category: z.string().trim().max(80).optional(),
          imageUrl: z.string().trim().max(1000).optional(),
          quantity: z.number().int().min(1).max(100000).optional(),
          remainderAlloc: z.record(z.string(), z.number().int().min(0)).optional(),
          price: z.number().min(0).nullable().optional(),
          discountPercent: z.number().min(0).max(100).optional(),
          vendorId: z.number().nullable().optional(),
          divide: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...patch } = input;
        let found = false;
        dbInstance.cpItems = getCpItems().map((it: any) => {
          if (Number(it.id) !== Number(id)) return it;
          found = true;
          // En lotes ENTREGADOS el reparto está congelado: no se puede cambiar
          // nombre, cantidad, el reparto del sobrante ni el modo de división.
          // Sí se permite ajustar precio/descuento/vendedor de lo que queda a vender.
          if (it.status !== "DRAFT") {
            if (patch.quantity != null || patch.remainderAlloc != null || patch.name != null || patch.category != null || patch.divide != null) {
              throw new Error("El lote ya fue entregado; solo puedes cambiar precio, descuento o vendedor");
            }
          }
          return { ...it, ...patch };
        });
        if (!found) throw new Error("Ítem no encontrado");
        saveDbToDisk();
        return { success: true };
      }),
    confirm: cpProcedure.input(z.object({ id: z.number(), scope: scopeSchema })).mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "control";
      const participants = partsOf(scope).map((c: any) => String(c.name));
      if (participants.length === 0) {
        throw new Error("Registra al menos una CP participante antes de confirmar");
      }
      const item = getCpItems().find((it: any) => Number(it.id) === Number(input.id));
      if (!item) throw new Error("Ítem no encontrado");
      if (item.status !== "DRAFT") throw new Error("El ítem ya fue entregado");
      // Ítem SIN dividir: se marca como entregado como simple registro, sin
      // reparto entre CPs ni unidades a vender.
      if (item.divide === false) {
        const emptyAlloc: Record<string, number> = {};
        for (const n of participants) emptyAlloc[n] = 0;
        dbInstance.cpItems = getCpItems().map((it: any) =>
          Number(it.id) === Number(input.id)
            ? {
                ...it,
                status: "CONFIRMED",
                cpNamesSnapshot: participants,
                deliveredAlloc: emptyAlloc,
                sellRemaining: 0,
                confirmedAt: new Date().toISOString(),
              }
            : it,
        );
        pushCpHistory(
          "ITEM_ENTREGADO",
          `Registró "${item.name}" (${item.quantity} u.) sin dividir entre CPs`,
          actor(ctx),
          scope,
        );
        saveDbToDisk();
        return { success: true };
      }
      // Congelamos el reparto en el momento de entregar: el reparto por CP
      // (deliveredAlloc) y las unidades que quedan a vender (sellRemaining) no
      // volverán a recalcularse aunque cambien las CPs o se registren más ítems.
      const { alloc, toSell } = computeAllocation(
        item.quantity,
        participants,
        remainderAllocOf(item),
      );
      const deliveredAlloc: Record<string, number> = {};
      for (const n of participants) deliveredAlloc[n] = alloc[n] ?? 0;
      dbInstance.cpItems = getCpItems().map((it: any) =>
        Number(it.id) === Number(input.id)
          ? {
              ...it,
              status: "CONFIRMED",
              cpNamesSnapshot: participants,
              deliveredAlloc,
              sellRemaining: toSell,
              confirmedAt: new Date().toISOString(),
            }
          : it,
      );
      const repartoTxt = participants.map((n) => `${n}: ${alloc[n] ?? 0}`).join(" · ");
      pushCpHistory(
        "ITEM_ENTREGADO",
        `Entregó "${item.name}" (${item.quantity} u.) → ${repartoTxt}${toSell > 0 ? ` · A vender: ${toSell}` : ""}`,
        actor(ctx),
        scope,
      );
      saveDbToDisk();
      return { success: true };
    }),
    // Vender (parcial y acumulable): se venden `units` de las unidades a vender
    // (funciona en borrador y en entregado). Cada venta guarda su precio real:
    // precio normal, % descuento y si se aplicó → precio efectivo. La adena se
    // divide en partes iguales entre las CPs del ítem (snapshot si está
    // entregado). Las unidades vendidas salen del total en mano (quantity) y de
    // sellRemaining si el lote ya fue entregado.
    sell: cpProcedure
      .input(z.object({ id: z.number(), units: z.number().int().min(1), applyDiscount: z.boolean().optional().default(false), scope: scopeSchema }))
      .mutation(async ({ input, ctx }) => {
        const scope = input.scope ?? "control";
        const item = getCpItems().find((it: any) => Number(it.id) === Number(input.id));
        if (!item) throw new Error("Ítem no encontrado");
        const v = viewOf(item, scope);
        if (v.available <= 0) throw new Error("Este ítem no tiene unidades a vender");
        if (input.units > v.available) throw new Error(`Solo hay ${v.available} u. a vender`);
        if (item.price == null || Number(item.price) <= 0) throw new Error("Asigna un precio antes de vender");
        const cps = v.cpNames;
        const nCp = cps.length;
        if (nCp === 0) throw new Error("No hay CPs participantes para dividir la adena");
        const normalPrice = Number(item.price);
        const pct = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
        const effectivePrice = input.applyDiscount ? discountedPrice(normalPrice, pct) : normalPrice;
        const total = effectivePrice * input.units;
        const adenaPerCp = Math.floor(total / nCp);
        const adenaRemainder = total - adenaPerCp * nCp;
        const vName = item.vendorId
          ? getCpVendors().find((vv: any) => Number(vv.id) === Number(item.vendorId))?.name
          : null;
        const sale = {
          id: newId(),
          units: input.units,
          normalPrice,
          discountPercent: pct,
          discountApplied: !!input.applyDiscount,
          effectivePrice,
          total,
          cpNames: cps,
          adenaPerCp,
          adenaRemainder,
          vendorId: item.vendorId ?? null,
          vendorName: vName ?? null,
          soldAt: new Date().toISOString(),
        };
        dbInstance.cpItems = getCpItems().map((it: any) => {
          if (Number(it.id) !== Number(input.id)) return it;
          const next = {
            ...it,
            sales: [...(Array.isArray(it.sales) ? it.sales : []), sale],
            quantity: Math.max(0, Number(it.quantity) - input.units),
          };
          if (it.status === "CONFIRMED") next.sellRemaining = Math.max(0, (Number(it.sellRemaining) || 0) - input.units);
          return next;
        });
        pushCpHistory(
          "ITEM_VENDIDO",
          `Vendió ${input.units} u. de "${item.name}" a ${effectivePrice.toLocaleString("es-CL")}${input.applyDiscount ? ` (con ${pct}% desc.)` : ""} = ${total.toLocaleString("es-CL")} adena → ${adenaPerCp.toLocaleString("es-CL")} por CP entre ${nCp} CPs${adenaRemainder > 0 ? ` (sobran ${adenaRemainder})` : ""}`,
          actor(ctx),
          scope,
        );
        saveDbToDisk();
        return { success: true };
      }),
    // Revertir una venta puntual (por si te equivocaste): devuelve sus unidades
    // al total en mano y a sellRemaining si el lote estaba entregado.
    revertSale: cpProcedure
      .input(z.object({ id: z.number(), saleId: z.number(), scope: scopeSchema }))
      .mutation(async ({ input, ctx }) => {
        const scope = input.scope ?? "control";
        const item = getCpItems().find((it: any) => Number(it.id) === Number(input.id));
        if (!item) throw new Error("Ítem no encontrado");
        const sale = (Array.isArray(item.sales) ? item.sales : []).find((s: any) => Number(s.id) === Number(input.saleId));
        if (!sale) throw new Error("Venta no encontrada");
        dbInstance.cpItems = getCpItems().map((it: any) => {
          if (Number(it.id) !== Number(input.id)) return it;
          const next = {
            ...it,
            sales: (it.sales || []).filter((s: any) => Number(s.id) !== Number(input.saleId)),
            quantity: Number(it.quantity) + Number(sale.units),
          };
          if (it.status === "CONFIRMED") next.sellRemaining = (Number(it.sellRemaining) || 0) + Number(sale.units);
          return next;
        });
        pushCpHistory("VENTA_REVERTIDA", `Revirtió una venta de ${sale.units} u. de "${item.name}"`, actor(ctx), scope);
        saveDbToDisk();
        return { success: true };
      }),
    delete: cpProcedure.input(z.object({ id: z.number(), scope: scopeSchema })).mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "control";
      const item = getCpItems().find((it: any) => Number(it.id) === Number(input.id));
      // No permitir borrar un ítem con ventas registradas: perderíamos su adena
      // recaudada del Excel. Para deshacer una venta usa "Revertir".
      const salesCount = Array.isArray(item?.sales) ? item.sales.length : 0;
      if (salesCount > 0) {
        throw new Error(
          `No puedes borrar este ítem: tiene ${salesCount} venta(s) registrada(s). Revierte las ventas primero si necesitas eliminarlo.`,
        );
      }
      dbInstance.cpItems = getCpItems().filter((it: any) => Number(it.id) !== Number(input.id));
      if (item?.status === "CONFIRMED") {
        pushCpHistory("ITEM_ELIMINADO", `Eliminó el ítem confirmado "${item?.name ?? input.id}"`, actor(ctx), scope);
      }
      saveDbToDisk();
      return { success: true };
    }),
  }),

  // -------- Historial (solo lectura, Super Admin) --------
  history: router({
    list: cpProcedure.input(z.object({ scope: scopeSchema }).optional()).query(async ({ input }) => {
      const scope = input?.scope ?? "control";
      return getCpHistory().filter((h: any) => scopeOf(h) === scope);
    }),
  }),

  // -------- Reiniciar todo el módulo (Super Admin) --------
  // Deja el scope indicado en cero: borra ítems, CPs, vendedores e historial de
  // ESE scope. Antes de borrar guarda un snapshot (cpResetBackup[scope]) para
  // poder deshacer el reinicio si fue por accidente (rollback).
  resetAll: cpProcedure.input(z.object({ scope: scopeSchema }).optional()).mutation(async ({ input, ctx }) => {
    const scope = input?.scope ?? "control";
    const snapshot = {
      items: itemsOf(scope),
      participants: partsOf(scope),
      vendors: vendorsOf(scope),
      history: getCpHistory().filter((h: any) => scopeOf(h) === scope),
      savedAt: new Date().toISOString(),
      savedBy: actor(ctx),
    };
    if (!dbInstance.cpResetBackup || typeof dbInstance.cpResetBackup !== "object") dbInstance.cpResetBackup = {};
    dbInstance.cpResetBackup[scope] = snapshot;
    // Borramos SOLO los registros de este scope; el otro scope queda intacto.
    dbInstance.cpItems = getCpItems().filter((it: any) => scopeOf(it) !== scope);
    dbInstance.cpParticipants = getCpParticipants().filter((c: any) => scopeOf(c) !== scope);
    dbInstance.cpVendors = getCpVendors().filter((v: any) => scopeOf(v) !== scope);
    dbInstance.cpHistory = getCpHistory().filter((h: any) => scopeOf(h) !== scope);
    // El historial del reinicio se guarda ya en el scope reiniciado para dejar
    // rastro (queda como primer registro tras vaciar).
    pushCpHistory(
      "MODULO_REINICIADO",
      `Reinició la pestaña "${scope === "reparto" ? "A repartir" : "Ítems de la CP"}" (ítems: ${snapshot.items.length}, CPs: ${snapshot.participants.length}, vendedores: ${snapshot.vendors.length}). Se guardó un respaldo para deshacer.`,
      actor(ctx),
      scope,
    );
    saveDbToDisk();
    return { success: true, backup: { items: snapshot.items.length, participants: snapshot.participants.length, vendors: snapshot.vendors.length } };
  }),

  // Info del respaldo disponible por scope (para habilitar "Deshacer reinicio").
  resetBackupInfo: cpProcedure.input(z.object({ scope: scopeSchema }).optional()).query(async ({ input }) => {
    const scope = input?.scope ?? "control";
    const b = dbInstance.cpResetBackup?.[scope];
    if (!b) return { available: false as const };
    return {
      available: true as const,
      savedAt: b.savedAt ?? null,
      savedBy: b.savedBy ?? null,
      counts: {
        items: Array.isArray(b.items) ? b.items.length : 0,
        participants: Array.isArray(b.participants) ? b.participants.length : 0,
        vendors: Array.isArray(b.vendors) ? b.vendors.length : 0,
      },
    };
  }),

  // Deshacer el último reinicio de un scope: restaura ítems, CPs, vendedores e
  // historial guardados en el snapshot. Reemplaza la data actual de ESE scope
  // (que tras un reinicio está vacía) por la respaldada. No toca el otro scope.
  restoreLastReset: cpProcedure.input(z.object({ scope: scopeSchema }).optional()).mutation(async ({ input, ctx }) => {
    const scope = input?.scope ?? "control";
    const b = dbInstance.cpResetBackup?.[scope];
    if (!b) throw new Error("No hay un respaldo disponible para restaurar en esta pestaña.");
    // Aseguramos que cada registro restaurado conserve su scope correcto.
    const stampScope = (arr: any[]) => (Array.isArray(arr) ? arr.map((r) => ({ ...r, scope })) : []);
    // Quitamos lo que hubiera del scope actual y volvemos a poner lo respaldado.
    dbInstance.cpItems = [...getCpItems().filter((it: any) => scopeOf(it) !== scope), ...stampScope(b.items)];
    dbInstance.cpParticipants = [...getCpParticipants().filter((c: any) => scopeOf(c) !== scope), ...stampScope(b.participants)];
    dbInstance.cpVendors = [...getCpVendors().filter((v: any) => scopeOf(v) !== scope), ...stampScope(b.vendors)];
    dbInstance.cpHistory = [...getCpHistory().filter((h: any) => scopeOf(h) !== scope), ...stampScope(b.history)];
    // Consumimos el respaldo: ya se usó.
    delete dbInstance.cpResetBackup[scope];
    pushCpHistory(
      "MODULO_RESTAURADO",
      `Restauró la pestaña "${scope === "reparto" ? "A repartir" : "Ítems de la CP"}" desde el respaldo (ítems: ${Array.isArray(b.items) ? b.items.length : 0}).`,
      actor(ctx),
      scope,
    );
    saveDbToDisk();
    return { success: true };
  }),

  // -------- Export Excel detallado --------
  exportExcel: cpProcedure
    .input(z.object({ onlyConfirmed: z.boolean().optional().default(false), scope: scopeSchema }).optional())
    .mutation(async ({ input }) => {
      const scope = input?.scope ?? "control";
      const onlyConfirmed = input?.onlyConfirmed ?? false;
      const allItems = itemsOf(scope).filter((it: any) => (onlyConfirmed ? it.status === "CONFIRMED" : true));
      const vendors = vendorsOf(scope);
      const vendorName = (id: any) => vendors.find((v: any) => Number(v.id) === Number(id))?.name || "";

      // Columnas dinámicas por CP: unión de las CPs del reparto (snapshot para
      // entregados, lista actual para borradores) MÁS las CPs registradas en
      // cada venta (por si una CP se renombró/borró después de vender, para no
      // perder su adena en el Excel).
      const cpSet = new Set<string>();
      for (const it of allItems) {
        for (const n of effectiveCpNames(it, scope)) cpSet.add(n);
        for (const s of Array.isArray(it.sales) ? it.sales : []) {
          for (const n of Array.isArray(s.cpNames) ? s.cpNames : []) cpSet.add(String(n));
        }
      }
      const cpCols = Array.from(cpSet);

      const wb = new ExcelJS.Workbook();
      wb.creator = "RaptorSquad";
      wb.created = new Date();
      const ws = wb.addWorksheet("Reparticiones CP");

      const fmtDate = (iso: any) => {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        return `${dd}/${mm}/${d.getFullYear()}`;
      };
      const statusLabel = (it: any) => (it.status === "CONFIRMED" ? "Entregado" : "Borrador");

      // Orden estable: por nombre (agrupa visualmente los ítems iguales) y luego
      // por fecha de registro.
      const sorted = [...allItems].sort((a: any, b: any) => {
        const byName = normName(a.name).localeCompare(normName(b.name));
        if (byName !== 0) return byName;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      });

      // Anchos de columna (aplican a las columnas A..). Ambas secciones
      // comparten las mismas posiciones de las columnas por CP al final.
      const baseCols = [
        { key: "img", width: 12 },
        { key: "createdAt", width: 14 },
        { key: "name", width: 28 },
        { key: "category", width: 18 },
        { key: "quantity", width: 14 },
        { key: "extra1", width: 16 },
        { key: "extra2", width: 16 },
        { key: "extra3", width: 12 },
        { key: "extra4", width: 12 },
        { key: "extra5", width: 18 },
        { key: "extra6", width: 14 },
      ];
      ws.columns = [...baseCols, ...cpCols.map((n) => ({ key: `cp_${n}`, width: 14 }))];

      // ---- Sección 1: Reparto por CP (todos los ítems, divididos) ----
      // Precio y Vendedor se incluyen para que el Excel se pueda VOLVER A SUBIR
      // (Importar) y reconstruir los ítems. El % de descuento se recupera desde
      // la columna "Descuento" de "Por vender", y si el ítem se divide o no se
      // deduce de "Repartido" / "A vender".
      const t1 = ws.addRow(["Reparto por CP"]);
      t1.font = { bold: true, size: 12 };
      const header1 = ws.addRow(["Imagen", "Fecha registro", "Ítem", "Categoría", "Cantidad ítem", "A vender", "Repartido", "Precio", "Vendedor", ...cpCols, "Estado"]);
      header1.font = { bold: true };
      header1.alignment = { vertical: "middle", horizontal: "center" };
      let rowIdx = header1.number + 1;
      for (const it of sorted) {
        const { alloc, available } = viewOf(it, scope);
        const repartidoTotal = cpCols.reduce((s, n) => s + (Number(alloc[n]) || 0), 0);
        // Cantidad ítem = total de unidades del ítem (repartidas + a vender).
        // A vender = unidades pendientes de venta (0 si el ítem no se divide).
        const cantidadItem = it.divide === false ? (Number(it.quantity) || 0) : repartidoTotal + available;
        const rowArr: any[] = ["", fmtDate(it.createdAt), it.name, it.category || "", cantidadItem, available, repartidoTotal, it.price != null ? Number(it.price) : "", vendorName(it.vendorId)];
        for (const n of cpCols) rowArr.push(alloc[n] ? alloc[n] : "");
        rowArr.push(statusLabel(it));
        const row = ws.addRow(rowArr);
        row.alignment = { vertical: "middle" };

        const img = await fetchImageBuffer(it.imageUrl);
        if (img) {
          row.height = 34;
          const imageId = wb.addImage({ buffer: img.buffer as any, extension: img.ext });
          ws.addImage(imageId, {
            tl: { col: 0.15, row: rowIdx - 1 + 0.1 },
            ext: { width: 40, height: 40 },
            editAs: "oneCell",
          });
        } else if (it.imageUrl) {
          ws.getCell(`A${rowIdx}`).value = { text: "ver", hyperlink: it.imageUrl } as any;
        }
        rowIdx += 1;
      }

      // ---- Sección 2: Por vender (pendientes + cada venta con su adena por CP) ----
      // Columnas por CP a partir de la 10ª posición (índice 9), para que "Total
      // por CP" quede alineado bajo el nombre de cada CP.
      const cpStartIdx = 10;
      const sellHeader = ["Fecha", "Ítem", "Categoría", "Unidades", "Tipo", "Precio normal", "Precio c/desc", "Descuento", "Vendedor", "Adena recaudada", ...cpCols];
      ws.addRow([]);
      const t2 = ws.addRow(["Por vender"]);
      t2.font = { bold: true, size: 12 };
      const header2 = ws.addRow(sellHeader);
      header2.font = { bold: true };
      header2.alignment = { vertical: "middle", horizontal: "center" };

      const totalPerCp: Record<string, number> = {};
      for (const n of cpCols) totalPerCp[n] = 0;
      let adenaTotal = 0;
      let anySell = false;

      for (const it of sorted) {
        const v = viewOf(it, scope);
        const sales: any[] = Array.isArray(it.sales) ? it.sales : [];
        // Unidades aún pendientes de vender.
        if (v.available > 0) {
          anySell = true;
          const normal = it.price != null ? Number(it.price) : "";
          const withDisc = it.price != null ? discountedPrice(Number(it.price), it.discountPercent) : "";
          const pctPend = Math.min(100, Math.max(0, Number(it.discountPercent) || 0));
          const arr: any[] = [fmtDate(it.createdAt), it.name, it.category || "", v.available, "Pendiente", normal, withDisc, `${pctPend}%`, vendorName(it.vendorId), ""];
          for (let i = 0; i < cpCols.length; i++) arr.push("");
          ws.addRow(arr);
        }
        // Una fila por cada venta realizada (guarda su precio real).
        for (const s of sales) {
          anySell = true;
          const arr: any[] = [
            fmtDate(s.soldAt),
            it.name,
            it.category || "",
            Number(s.units) || 0,
            s.discountApplied ? `Vendida (${Number(s.discountPercent) || 0}% desc.)` : "Vendida",
            Number(s.normalPrice) || 0,
            s.discountApplied ? Number(s.effectivePrice) || 0 : "",
            s.discountApplied ? `${Number(s.discountPercent) || 0}%` : "0%",
            s.vendorName || "",
            Number(s.total) || 0,
          ];
          adenaTotal += Number(s.total) || 0;
          const perCp = Number(s.adenaPerCp) || 0;
          const saleCps: string[] = Array.isArray(s.cpNames) ? s.cpNames.map(String) : [];
          for (const n of cpCols) {
            if (saleCps.includes(n)) {
              arr.push(perCp);
              totalPerCp[n] += perCp;
            } else {
              arr.push("");
            }
          }
          ws.addRow(arr);
        }
      }

      if (anySell) {
        const totalArr: any[] = ["Total recaudado / por CP", "", "", "", "", "", "", "", "", adenaTotal];
        for (const n of cpCols) totalArr.push(totalPerCp[n] || 0);
        const totalRow = ws.addRow(totalArr);
        totalRow.font = { bold: true };
        totalRow.getCell(cpStartIdx).font = { bold: true };
        for (let c = cpStartIdx + 1; c <= cpStartIdx + cpCols.length; c++) {
          totalRow.getCell(c).font = { bold: true };
        }
      }

      const buffer = await wb.xlsx.writeBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const stamp = new Date().toISOString().slice(0, 10);
      return { filename: `reparticiones_cp_${stamp}.xlsx`, base64 };
    }),

  // -------- Importar Excel (mismo formato que exporta la página) --------
  // Lee la sección "Reparto por CP" y crea los ítems como BORRADORES en la
  // pestaña indicada, reconstruyendo nombre, categoría, cantidad, precio y
  // % descuento. Es NO destructivo: agrega los ítems del Excel (no borra los
  // existentes); para partir de cero usa "Reiniciar todo" (tiene respaldo).
  importExcel: cpProcedure
    .input(z.object({ base64: z.string().min(1), scope: scopeSchema }))
    .mutation(async ({ input, ctx }) => {
      const scope = input.scope ?? "control";
      // Normaliza texto de encabezado: minúsculas, sin acentos ni espacios extra.
      const norm = (v: any) =>
        String(v ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
      // Extrae el valor "plano" de una celda (soporta texto enriquecido,
      // hipervínculos y fórmulas).
      const cellText = (cell: any): string => {
        const v = cell?.value;
        if (v == null) return "";
        if (typeof v === "object") {
          if (typeof v.text === "string") return v.text;
          if (typeof v.result !== "undefined") return String(v.result);
          if (typeof v.richText !== "undefined" && Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join("");
          return "";
        }
        return String(v);
      };
      const toNum = (s: string): number => {
        const n = Number(String(s).replace(/[^0-9.-]/g, ""));
        return Number.isFinite(n) ? n : 0;
      };

      let buf: Buffer;
      try {
        buf = Buffer.from(input.base64, "base64");
      } catch {
        throw new Error("Archivo inválido.");
      }
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(buf as any);
      } catch {
        throw new Error("No se pudo leer el Excel. Sube el archivo .xlsx que descargaste de esta página.");
      }
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("El Excel no tiene hojas.");

      // Localiza la fila de encabezado de la sección "Reparto por CP": aquella
      // que contenga una celda "Ítem". Guardamos también el texto CRUDO por
      // columna para poder detectar las columnas dinámicas por CP.
      let headerRowNum = -1;
      let colOf: Record<string, number> = {};
      let headerCells: { col: number; raw: string; key: string }[] = [];
      ws.eachRow((row, rn) => {
        if (headerRowNum !== -1) return;
        const map: Record<string, number> = {};
        const cells: { col: number; raw: string; key: string }[] = [];
        let hasItem = false;
        row.eachCell((cell, cn) => {
          const raw = cellText(cell).trim();
          const key = norm(raw);
          if (key === "item") hasItem = true;
          if (key) map[key] = cn;
          cells.push({ col: cn, raw, key });
        });
        if (hasItem) { headerRowNum = rn; colOf = map; headerCells = cells; }
      });
      if (headerRowNum === -1) {
        throw new Error('No se encontró la sección "Reparto por CP". Sube el Excel descargado de esta página.');
      }

      const cName = colOf["item"];
      const cCat = colOf["categoria"];
      const cQty = colOf["cantidad item"] ?? colOf["cantidad"];
      const cPrice = colOf["precio"];
      const cDisc = colOf["% desc."] ?? colOf["% desc"] ?? colOf["descuento"];
      const cDivide = colOf["dividir"];
      const cSell = colOf["a vender"];
      const cGiven = colOf["repartido"];
      const cVendor = colOf["vendedor"];
      const cImg = colOf["imagen"];
      const cDate = colOf["fecha registro"];
      // "28/07/2026" → ISO. Si no se puede interpretar, usamos la fecha dada.
      const parseDate = (txt: string, fallback: string): string => {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt).trim());
        if (m) {
          const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
          if (!isNaN(d.getTime())) return d.toISOString();
        }
        const d2 = new Date(txt);
        return isNaN(d2.getTime()) ? fallback : d2.toISOString();
      };
      if (!cName || !cQty) {
        throw new Error('El Excel no tiene las columnas esperadas ("Ítem" y "Cantidad ítem").');
      }

      // Columnas dinámicas por CP: las que no son ninguno de los encabezados
      // fijos y están antes de "Estado". Su texto crudo es el nombre de la CP.
      const fixedKeys = new Set([
        "imagen", "fecha registro", "item", "categoria", "cantidad item", "cantidad",
        "a vender", "repartido", "precio", "% desc.", "% desc", "descuento", "dividir",
        "vendedor", "estado", "",
      ]);
      const estadoCol = colOf["estado"] ?? Number.MAX_SAFE_INTEGER;
      const cpCols: { col: number; name: string }[] = headerCells
        .filter((h) => h.col < estadoCol && h.col > (cVendor ?? cDivide ?? cQty) && !fixedKeys.has(h.key) && h.raw)
        .map((h) => ({ col: h.col, name: h.raw }));

      // Recupera imagen por nombre desde el catálogo de materiales (misma
      // lógica que el resto del sitio: el nombre manda). No guardamos la imagen
      // embebida del Excel como base64 para no inflar el JSON de datos.
      const catalog: any[] = Array.isArray(dbInstance.materialCatalog) ? dbInstance.materialCatalog : [];
      const imageFromCatalog = (name: string): string => {
        const nl = norm(name);
        const hit = catalog.find((m: any) => norm(m?.nameLower ?? m?.name) === nl);
        return hit?.imageUrl ? String(hit.imageUrl) : "";
      };
      // Fallback: la celda "Imagen" del export guarda un hipervínculo a la URL
      // original cuando la imagen no se pudo embeber.
      const linkOf = (cell: any): string => {
        const v = cell?.value;
        const link = (v && typeof v === "object" && v.hyperlink) || cell?.hyperlink;
        return typeof link === "string" ? link : "";
      };

      if (!dbInstance.cpItems) dbInstance.cpItems = [];
      if (!dbInstance.cpParticipants) dbInstance.cpParticipants = [];
      if (!dbInstance.cpVendors) dbInstance.cpVendors = [];

      // Asegura que exista una CP participante con ese nombre en el scope.
      const ensureParticipant = (name: string) => {
        const nm = String(name).trim();
        if (!nm) return;
        const exists = partsOf(scope).some((c: any) => normName(c.name) === normName(nm));
        if (!exists) dbInstance.cpParticipants.push({ id: newId(), name: nm.slice(0, 80), scope, createdAt: new Date().toISOString() });
      };
      // Asegura que exista un vendedor con ese nombre en el scope; devuelve su id.
      const ensureVendor = (name: string): number | null => {
        const nm = String(name).trim();
        if (!nm) return null;
        const found = vendorsOf(scope).find((v: any) => normName(v.name) === normName(nm));
        if (found) return Number(found.id);
        const v = { id: newId(), name: nm.slice(0, 80), scope, createdAt: new Date().toISOString() };
        dbInstance.cpVendors.push(v);
        return v.id;
      };

      // Primero recreamos las CPs participantes del Excel (para que el reparto
      // se calcule igual y las columnas por CP tengan sentido).
      let cpsCreated = 0;
      for (const c of cpCols) {
        const before = partsOf(scope).length;
        ensureParticipant(c.name);
        if (partsOf(scope).length > before) cpsCreated += 1;
      }
      const nCp = partsOf(scope).length;

      const created: any[] = [];
      let imagesRecovered = 0;
      let vendorsCreated = 0;
      const total = ws.rowCount;
      for (let rn = headerRowNum + 1; rn <= total; rn++) {
        const row = ws.getRow(rn);
        const name = cellText(row.getCell(cName)).trim();
        // Fila vacía o inicio de otra sección ("Por vender") → terminamos.
        if (!name) break;
        const low = norm(name);
        if (low === "por vender" || low === "reparto por cp" || low === "total recaudado / por cp") break;
        // Cantidad 0 es válida: son ítems cuyas unidades ya se vendieron por
        // completo (sus ventas se recuperan desde la sección "Por vender").
        const qty = Math.max(0, Math.floor(toNum(cellText(row.getCell(cQty)))));
        const price = cPrice ? toNum(cellText(row.getCell(cPrice))) : 0;
        const disc = cDisc ? Math.min(100, Math.max(0, Math.floor(toNum(cellText(row.getCell(cDisc)))))) : null;
        // Si el Excel no trae la columna "Dividir" lo deducimos: un ítem NO
        // dividido es el único con unidades en mano pero nada repartido ni a
        // vender (si se dividiera, esas unidades irían a las CPs o a "A vender").
        // Los ítems ya vendidos por completo (cantidad 0) se toman como divididos,
        // porque un ítem sin dividir no tiene unidades que vender.
        let divide = true;
        if (cDivide) {
          divide = norm(cellText(row.getCell(cDivide))) !== "no";
        } else if (qty > 0 && cSell && cGiven) {
          const aVender = Math.floor(toNum(cellText(row.getCell(cSell))));
          const repartido = Math.floor(toNum(cellText(row.getCell(cGiven))));
          divide = !(aVender === 0 && repartido === 0);
        }
        const category = cCat ? cellText(row.getCell(cCat)).trim() : "";

        // Vendedor: lo recreamos y guardamos su id.
        const vendorName2 = cVendor ? cellText(row.getCell(cVendor)).trim() : "";
        const beforeV = vendorsOf(scope).length;
        const vendorId = vendorName2 ? ensureVendor(vendorName2) : null;
        if (vendorName2 && vendorsOf(scope).length > beforeV) vendorsCreated += 1;

        // Imagen: catálogo por nombre; si no está, el enlace de la celda Imagen.
        let imageUrl = imageFromCatalog(name);
        if (!imageUrl && cImg) imageUrl = linkOf(row.getCell(cImg));
        if (imageUrl) imagesRecovered += 1;

        // Reparto: reconstruimos remainderAlloc a partir de las columnas por CP
        // (lo que exceda del reparto base floor(qty/nCP) es asignación manual
        // del sobrante) para que el reparto quede idéntico al del Excel.
        const remainderAlloc: RemainderAlloc = {};
        if (divide && nCp > 0) {
          const perCp = Math.floor(qty / nCp);
          for (const c of cpCols) {
            const val = Math.floor(toNum(cellText(row.getCell(c.col))));
            const extra = val - perCp;
            if (extra > 0) remainderAlloc[c.name] = extra;
          }
        }

        const item = {
          id: newId(),
          name: name.slice(0, 120),
          category: category.slice(0, 80),
          imageUrl,
          quantity: qty,
          divide,
          scope,
          remainderAlloc,
          price: price > 0 ? price : null,
          discountPercent: disc ?? 20,
          // Marcamos qué campos NO venían en la hoja 1 (formato antiguo) para
          // poder completarlos desde la sección "Por vender".
          _needPrice: !(price > 0),
          _needDisc: disc == null,
          vendorId,
          status: "DRAFT" as const,
          cpNamesSnapshot: null as string[] | null,
          deliveredAlloc: null as Record<string, number> | null,
          sellRemaining: null as number | null,
          sales: [] as any[],
          // Conservamos la fecha de registro original que trae el Excel.
          createdAt: cDate ? parseDate(cellText(row.getCell(cDate)), new Date().toISOString()) : new Date().toISOString(),
          confirmedAt: null as string | null,
        };
        dbInstance.cpItems.push(item);
        created.push(item);
      }

      if (created.length === 0) {
        throw new Error("No se encontraron ítems para importar en el Excel.");
      }

      // ------------------------------------------------------------------
      // Sección "Por vender": recupera el precio normal, el % de descuento y
      // el vendedor de cada ítem (única fuente en el formato antiguo, donde la
      // hoja 1 no traía esas columnas) y reconstruye cada VENTA con su precio
      // real, descuento, adena recaudada y el desglose por CP.
      // ------------------------------------------------------------------
      const byName = new Map<string, any>();
      for (const it of created) if (!byName.has(normName(it.name))) byName.set(normName(it.name), it);

      let sellHdr = -1;
      let sellCells: { col: number; raw: string; key: string }[] = [];
      ws.eachRow((row, rn) => {
        if (sellHdr !== -1 || rn <= headerRowNum) return;
        const cells: { col: number; raw: string; key: string }[] = [];
        let hasItem = false;
        let hasUnits = false;
        row.eachCell((cell, cn) => {
          const raw = cellText(cell).trim();
          const key = norm(raw);
          if (key === "item") hasItem = true;
          if (key === "unidades") hasUnits = true;
          cells.push({ col: cn, raw, key });
        });
        if (hasItem && hasUnits) { sellHdr = rn; sellCells = cells; }
      });

      let salesRecovered = 0;
      let pricesRecovered = 0;
      if (sellHdr !== -1) {
        const s = (k: string) => sellCells.find((h) => h.key === k)?.col;
        const sDate = s("fecha");
        const sName = s("item");
        const sUnits = s("unidades");
        const sType = s("tipo");
        const sNormal = s("precio normal");
        const sEff = s("precio c/desc");
        const sDisc = s("descuento");
        const sVendor = s("vendedor");
        const sTotal = s("adena recaudada");
        const sellFixed = new Set(["fecha", "item", "categoria", "unidades", "tipo", "precio normal", "precio c/desc", "descuento", "vendedor", "adena recaudada", ""]);
        const sellCpCols = sellCells.filter((h) => !sellFixed.has(h.key) && h.raw).map((h) => ({ col: h.col, name: h.raw }));
        if (sName && sUnits) {
          for (let rn = sellHdr + 1; rn <= total; rn++) {
            const row = ws.getRow(rn);
            const nm = cellText(row.getCell(sName)).trim();
            if (!nm) break;
            if (norm(nm).startsWith("total recaudado")) break;
            const it = byName.get(normName(nm));
            if (!it) continue;

            const typeTxt = sType ? norm(cellText(row.getCell(sType))) : "";
            const normalPrice = sNormal ? toNum(cellText(row.getCell(sNormal))) : 0;
            const pct = sDisc ? Math.min(100, Math.max(0, Math.floor(toNum(cellText(row.getCell(sDisc)))))) : 0;
            const vName = sVendor ? cellText(row.getCell(sVendor)).trim() : "";

            // Precio / descuento / vendedor del ítem (los rellena la primera
            // fila que los traiga; la hoja 1 tiene prioridad si ya los tenía).
            if (it._needPrice && normalPrice > 0) { it.price = normalPrice; it._needPrice = false; pricesRecovered += 1; }
            if (it._needDisc && (typeTxt === "pendiente" || pct > 0)) { it.discountPercent = pct; it._needDisc = false; }
            if (vName && it.vendorId == null) {
              const beforeV2 = vendorsOf(scope).length;
              it.vendorId = ensureVendor(vName);
              if (vendorsOf(scope).length > beforeV2) vendorsCreated += 1;
            }

            if (!typeTxt.startsWith("vendida")) continue;

            // --- Venta: reconstruimos el registro histórico completo ---
            const discountApplied = typeTxt.includes("desc");
            const units = Math.max(1, Math.floor(toNum(cellText(row.getCell(sUnits)))));
            const effFromCell = sEff ? toNum(cellText(row.getCell(sEff))) : 0;
            const effectivePrice = discountApplied
              ? (effFromCell > 0 ? effFromCell : discountedPrice(normalPrice, pct))
              : normalPrice;
            const totalCell = sTotal ? toNum(cellText(row.getCell(sTotal))) : 0;
            const saleTotal = totalCell > 0 ? totalCell : effectivePrice * units;
            const saleCps: string[] = [];
            let perCpVal = 0;
            for (const c of sellCpCols) {
              const v = toNum(cellText(row.getCell(c.col)));
              if (v > 0) { saleCps.push(c.name); perCpVal = v; }
            }
            const cpsForSale = saleCps.length > 0 ? saleCps : cpCols.map((c) => c.name);
            const adenaPerCp = perCpVal > 0 ? perCpVal : (cpsForSale.length ? Math.floor(saleTotal / cpsForSale.length) : 0);
            const vendorIdForSale = vName ? ensureVendor(vName) : (it.vendorId ?? null);
            it.sales.push({
              id: newId(),
              units,
              normalPrice,
              // Cuando la venta no aplicó descuento el Excel escribe "0%", así
              // que heredamos el % del ítem (no afecta montos, es informativo).
              discountPercent: discountApplied ? pct : (Number(it.discountPercent) || pct),
              discountApplied,
              effectivePrice,
              total: saleTotal,
              cpNames: cpsForSale,
              adenaPerCp,
              adenaRemainder: Math.max(0, saleTotal - adenaPerCp * cpsForSale.length),
              vendorId: vendorIdForSale,
              vendorName: vName || null,
              soldAt: sDate ? parseDate(cellText(row.getCell(sDate)), new Date().toISOString()) : new Date().toISOString(),
            });
            salesRecovered += 1;
          }
        }
      }

      // Limpiamos las marcas auxiliares antes de persistir.
      for (const it of created) { delete it._needPrice; delete it._needDisc; }

      pushCpHistory(
        "ITEMS_IMPORTADOS",
        `Importó ${created.length} ítem(s) desde Excel a "${scope === "reparto" ? "A repartir" : "Ítems de la CP"}" (CPs: ${cpsCreated}, vendedores: ${vendorsCreated}, imágenes: ${imagesRecovered}, precios: ${pricesRecovered}, ventas: ${salesRecovered}).`,
        actor(ctx),
        scope,
      );
      saveDbToDisk();
      return { imported: created.length, cpsCreated, vendorsCreated, imagesRecovered, pricesRecovered, salesRecovered };
    }),
});
