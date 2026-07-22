import { z } from "zod";
import ExcelJS from "exceljs";
import { router, adminProcedure } from "../_core/trpc";
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
// Admin (adminProcedure). No toca ítems del inventario, personajes, ciclos ni
// montos: tiene su propia data persistente (CPs, vendedores, ítems a repartir)
// y su propio historial de trazabilidad.
// ============================================================================

const newId = () => Math.floor(Math.random() * 1000000);
const actor = (ctx: any) =>
  String(ctx?.user?.characterName || ctx?.user?.name || ctx?.user?.email || "Super Admin");

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
function effectiveCpNames(item: any): string[] {
  if ((item.status === "CONFIRMED" || item.status === "SOLD") && Array.isArray(item.cpNamesSnapshot)) {
    return item.cpNamesSnapshot.map((s: any) => String(s));
  }
  return getCpParticipants().map((c: any) => String(c.name));
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
function viewOf(item: any): {
  cpNames: string[];
  alloc: Record<string, number>;
  available: number;
  deliveredTotal: number;
  soldUnits: number;
} {
  const sales: any[] = Array.isArray(item?.sales) ? item.sales : [];
  const soldUnits = sales.reduce((s, x) => s + (Number(x?.units) || 0), 0);
  const cpNames = effectiveCpNames(item);
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
    list: adminProcedure.query(async () => getCpParticipants()),
    create: adminProcedure.input(nameInput).mutation(async ({ input, ctx }) => {
      assertUniqueName(getCpParticipants(), input.name);
      if (!dbInstance.cpParticipants) dbInstance.cpParticipants = [];
      const cp = { id: newId(), name: input.name.trim(), createdAt: new Date().toISOString() };
      dbInstance.cpParticipants.push(cp);
      pushCpHistory("CP_CREADA", `Registró la CP "${cp.name}"`, actor(ctx));
      saveDbToDisk();
      return cp;
    }),
    rename: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().trim().min(1).max(60) }))
      .mutation(async ({ input, ctx }) => {
        assertUniqueName(getCpParticipants(), input.name, input.id);
        const prev = getCpParticipants().find((c: any) => Number(c.id) === Number(input.id));
        dbInstance.cpParticipants = getCpParticipants().map((c: any) =>
          Number(c.id) === Number(input.id) ? { ...c, name: input.name.trim() } : c,
        );
        pushCpHistory("CP_RENOMBRADA", `Renombró CP "${prev?.name ?? input.id}" → "${input.name.trim()}"`, actor(ctx));
        saveDbToDisk();
        return { success: true };
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const prev = getCpParticipants().find((c: any) => Number(c.id) === Number(input.id));
      dbInstance.cpParticipants = getCpParticipants().filter((c: any) => Number(c.id) !== Number(input.id));
      // Si alguna CP borrada tenía asignado sobrante en un ítem borrador, se
      // quita ese extra (vuelve a "a vender") para no apuntar a una CP muerta.
      dbInstance.cpItems = getCpItems().map((it: any) => {
        if (it.status === "CONFIRMED" || !it.remainderAlloc || !prev?.name) return it;
        if (it.remainderAlloc[prev.name] == null) return it;
        const next = { ...it.remainderAlloc };
        delete next[prev.name];
        return { ...it, remainderAlloc: next };
      });
      pushCpHistory("CP_ELIMINADA", `Eliminó la CP "${prev?.name ?? input.id}"`, actor(ctx));
      saveDbToDisk();
      return { success: true };
    }),
  }),

  // -------- Vendedores (lista propia del módulo) --------
  vendors: router({
    list: adminProcedure.query(async () => getCpVendors()),
    create: adminProcedure.input(nameInput).mutation(async ({ input, ctx }) => {
      assertUniqueName(getCpVendors(), input.name);
      if (!dbInstance.cpVendors) dbInstance.cpVendors = [];
      const v = { id: newId(), name: input.name.trim(), createdAt: new Date().toISOString() };
      dbInstance.cpVendors.push(v);
      pushCpHistory("VENDEDOR_CREADO", `Registró el vendedor "${v.name}"`, actor(ctx));
      saveDbToDisk();
      return v;
    }),
    rename: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().trim().min(1).max(60) }))
      .mutation(async ({ input, ctx }) => {
        assertUniqueName(getCpVendors(), input.name, input.id);
        const prev = getCpVendors().find((v: any) => Number(v.id) === Number(input.id));
        dbInstance.cpVendors = getCpVendors().map((v: any) =>
          Number(v.id) === Number(input.id) ? { ...v, name: input.name.trim() } : v,
        );
        pushCpHistory("VENDEDOR_RENOMBRADO", `Renombró vendedor "${prev?.name ?? input.id}" → "${input.name.trim()}"`, actor(ctx));
        saveDbToDisk();
        return { success: true };
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const prev = getCpVendors().find((v: any) => Number(v.id) === Number(input.id));
      dbInstance.cpVendors = getCpVendors().filter((v: any) => Number(v.id) !== Number(input.id));
      // Ítems que apuntaban a ese vendedor quedan sin vendedor asignado.
      dbInstance.cpItems = getCpItems().map((it: any) =>
        Number(it.vendorId) === Number(input.id) ? { ...it, vendorId: null } : it,
      );
      pushCpHistory("VENDEDOR_ELIMINADO", `Eliminó el vendedor "${prev?.name ?? input.id}"`, actor(ctx));
      saveDbToDisk();
      return { success: true };
    }),
  }),

  // -------- Ítems a repartir --------
  items: router({
    list: adminProcedure.query(async () => getCpItems()),
    create: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(120),
          category: z.string().trim().max(80).optional().default(""),
          imageUrl: z.string().trim().max(1000).optional().default(""),
          quantity: z.number().int().min(1).max(100000),
          discountPercent: z.number().min(0).max(100).optional().default(20),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!dbInstance.cpItems) dbInstance.cpItems = [];
        const participants = getCpParticipants().map((c: any) => String(c.name));
        const name = input.name.trim();

        // #6c — Agrupar: solo se agrupa con BORRADORES (aún en tu poder, sin
        // entregar) del mismo nombre y mismas CPs. Los confirmados ya se
        // entregaron/repartieron, así que NO se re-suman ni re-reparten (eso
        // descuadraba las métricas al registrar más unidades al día siguiente).
        const match = getCpItems().find(
          (it: any) =>
            it.status === "DRAFT" &&
            normName(it.name) === normName(name) &&
            cpSetEqual(effectiveCpNames(it), participants),
        );
        if (match) {
          const newQty = Number(match.quantity) + input.quantity;
          dbInstance.cpItems = getCpItems().map((it: any) =>
            Number(it.id) === Number(match.id) ? { ...it, quantity: newQty } : it,
          );
          const merged = getCpItems().find((it: any) => Number(it.id) === Number(match.id));
          const { toSell } = computeAllocation(newQty, effectiveCpNames(merged), remainderAllocOf(merged));
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
    update: adminProcedure
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
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...patch } = input;
        let found = false;
        dbInstance.cpItems = getCpItems().map((it: any) => {
          if (Number(it.id) !== Number(id)) return it;
          found = true;
          // En lotes ENTREGADOS el reparto está congelado: no se puede cambiar
          // nombre, cantidad ni el reparto del sobrante. Sí se permite ajustar
          // precio/descuento/vendedor de las unidades aún a vender.
          if (it.status !== "DRAFT") {
            if (patch.quantity != null || patch.remainderAlloc != null || patch.name != null || patch.category != null) {
              throw new Error("El lote ya fue entregado; solo puedes cambiar precio, descuento o vendedor");
            }
          }
          return { ...it, ...patch };
        });
        if (!found) throw new Error("Ítem no encontrado");
        saveDbToDisk();
        return { success: true };
      }),
    confirm: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const participants = getCpParticipants().map((c: any) => String(c.name));
      if (participants.length === 0) {
        throw new Error("Registra al menos una CP participante antes de confirmar");
      }
      const item = getCpItems().find((it: any) => Number(it.id) === Number(input.id));
      if (!item) throw new Error("Ítem no encontrado");
      if (item.status !== "DRAFT") throw new Error("El ítem ya fue entregado");
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
    sell: adminProcedure
      .input(z.object({ id: z.number(), units: z.number().int().min(1), applyDiscount: z.boolean().optional().default(false) }))
      .mutation(async ({ input, ctx }) => {
        const item = getCpItems().find((it: any) => Number(it.id) === Number(input.id));
        if (!item) throw new Error("Ítem no encontrado");
        const v = viewOf(item);
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
        );
        saveDbToDisk();
        return { success: true };
      }),
    // Revertir una venta puntual (por si te equivocaste): devuelve sus unidades
    // al total en mano y a sellRemaining si el lote estaba entregado.
    revertSale: adminProcedure
      .input(z.object({ id: z.number(), saleId: z.number() }))
      .mutation(async ({ input, ctx }) => {
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
        pushCpHistory("VENTA_REVERTIDA", `Revirtió una venta de ${sale.units} u. de "${item.name}"`, actor(ctx));
        saveDbToDisk();
        return { success: true };
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const item = getCpItems().find((it: any) => Number(it.id) === Number(input.id));
      dbInstance.cpItems = getCpItems().filter((it: any) => Number(it.id) !== Number(input.id));
      if (item?.status === "CONFIRMED") {
        pushCpHistory("ITEM_ELIMINADO", `Eliminó el ítem confirmado "${item?.name ?? input.id}"`, actor(ctx));
      }
      saveDbToDisk();
      return { success: true };
    }),
  }),

  // -------- Historial (solo lectura, Super Admin) --------
  history: router({
    list: adminProcedure.query(async () => getCpHistory()),
  }),

  // -------- Reiniciar todo el módulo (Super Admin) --------
  // Deja Reparticiones CP en cero: borra ítems, CPs, vendedores e historial.
  resetAll: adminProcedure.mutation(async () => {
    dbInstance.cpItems = [];
    dbInstance.cpParticipants = [];
    dbInstance.cpVendors = [];
    dbInstance.cpHistory = [];
    saveDbToDisk();
    return { success: true };
  }),

  // -------- Export Excel detallado --------
  exportExcel: adminProcedure
    .input(z.object({ onlyConfirmed: z.boolean().optional().default(false) }).optional())
    .mutation(async ({ input }) => {
      const onlyConfirmed = input?.onlyConfirmed ?? false;
      const allItems = getCpItems().filter((it: any) => (onlyConfirmed ? it.status === "CONFIRMED" : true));
      const vendors = getCpVendors();
      const vendorName = (id: any) => vendors.find((v: any) => Number(v.id) === Number(id))?.name || "";

      // Columnas dinámicas por CP: unión de las CPs del reparto (snapshot para
      // entregados, lista actual para borradores) MÁS las CPs registradas en
      // cada venta (por si una CP se renombró/borró después de vender, para no
      // perder su adena en el Excel).
      const cpSet = new Set<string>();
      for (const it of allItems) {
        for (const n of effectiveCpNames(it)) cpSet.add(n);
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
        { key: "extra3", width: 16 },
        { key: "extra4", width: 16 },
      ];
      ws.columns = [...baseCols, ...cpCols.map((n) => ({ key: `cp_${n}`, width: 14 }))];

      // ---- Sección 1: Reparto por CP (todos los ítems, divididos) ----
      const t1 = ws.addRow(["Reparto por CP"]);
      t1.font = { bold: true, size: 12 };
      const header1 = ws.addRow(["Imagen", "Fecha registro", "Ítem", "Categoría", "Repartido", ...cpCols, "Estado"]);
      header1.font = { bold: true };
      header1.alignment = { vertical: "middle", horizontal: "center" };
      let rowIdx = header1.number + 1;
      for (const it of sorted) {
        const { alloc } = viewOf(it);
        const repartidoTotal = cpCols.reduce((s, n) => s + (Number(alloc[n]) || 0), 0);
        const rowArr: any[] = ["", fmtDate(it.createdAt), it.name, it.category || "", repartidoTotal];
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
        const v = viewOf(it);
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
});
