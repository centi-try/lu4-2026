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

// CPs efectivas de un ítem: los ítems confirmados usan el snapshot congelado al
// confirmar; los borradores usan la lista actual de CPs participantes.
function effectiveCpNames(item: any): string[] {
  if (item.status === "CONFIRMED" && Array.isArray(item.cpNamesSnapshot)) {
    return item.cpNamesSnapshot.map((s: any) => String(s));
  }
  return getCpParticipants().map((c: any) => String(c.name));
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
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!dbInstance.cpItems) dbInstance.cpItems = [];
        const item = {
          id: newId(),
          name: input.name.trim(),
          category: input.category?.trim() || "",
          imageUrl: input.imageUrl?.trim() || "",
          quantity: input.quantity,
          remainderAlloc: {} as RemainderAlloc,
          price: null as number | null,
          vendorId: null as number | null,
          status: "DRAFT" as "DRAFT" | "CONFIRMED",
          cpNamesSnapshot: null as string[] | null,
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
          vendorId: z.number().nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...patch } = input;
        let found = false;
        dbInstance.cpItems = getCpItems().map((it: any) => {
          if (Number(it.id) !== Number(id)) return it;
          found = true;
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
      dbInstance.cpItems = getCpItems().map((it: any) =>
        Number(it.id) === Number(input.id)
          ? { ...it, status: "CONFIRMED", cpNamesSnapshot: participants, confirmedAt: new Date().toISOString() }
          : it,
      );
      const { alloc, toSell } = computeAllocation(
        item.quantity,
        participants,
        remainderAllocOf(item),
      );
      const repartoTxt = participants.map((n) => `${n}: ${alloc[n] ?? 0}`).join(" · ");
      pushCpHistory(
        "ITEM_CONFIRMADO",
        `Confirmó "${item.name}" (${item.quantity} u.) → ${repartoTxt}${toSell > 0 ? ` · A vender: ${toSell}` : ""}`,
        actor(ctx),
      );
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

  // -------- Export Excel detallado --------
  exportExcel: adminProcedure
    .input(z.object({ onlyConfirmed: z.boolean().optional().default(false) }).optional())
    .mutation(async ({ input }) => {
      const onlyConfirmed = input?.onlyConfirmed ?? false;
      const allItems = getCpItems().filter((it: any) => (onlyConfirmed ? it.status === "CONFIRMED" : true));
      const vendors = getCpVendors();
      const vendorName = (id: any) => vendors.find((v: any) => Number(v.id) === Number(id))?.name || "";

      // Columnas dinámicas por CP: unión de todas las CPs usadas en los ítems
      // exportados (snapshot para confirmados, lista actual para borradores).
      const cpSet = new Set<string>();
      for (const it of allItems) for (const n of effectiveCpNames(it)) cpSet.add(n);
      const cpCols = Array.from(cpSet);

      const wb = new ExcelJS.Workbook();
      wb.creator = "RaptorSquad";
      wb.created = new Date();
      const ws = wb.addWorksheet("Reparticiones CP");

      const columns: Partial<ExcelJS.Column>[] = [
        { header: "Imagen", key: "img", width: 12 },
        { header: "Ítem", key: "name", width: 28 },
        { header: "Categoría", key: "category", width: 18 },
        { header: "Cantidad total", key: "quantity", width: 14 },
        ...cpCols.map((n) => ({ header: n, key: `cp_${n}`, width: 12 })),
        { header: "A vender", key: "toSell", width: 12 },
        { header: "Precio", key: "price", width: 14 },
        { header: "Vendedor", key: "vendor", width: 20 },
        { header: "Estado", key: "status", width: 14 },
      ];
      ws.columns = columns;
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

      let rowIdx = 2;
      for (const it of allItems) {
        const cpNames = effectiveCpNames(it);
        const { alloc, toSell } = computeAllocation(it.quantity, cpNames, remainderAllocOf(it));
        const rowData: Record<string, any> = {
          img: "",
          name: it.name,
          category: it.category || "",
          quantity: it.quantity,
          toSell: toSell,
          price: toSell > 0 && it.price != null ? Number(it.price) : "",
          vendor: toSell > 0 ? vendorName(it.vendorId) : "",
          status: it.status === "CONFIRMED" ? "Confirmado" : "Borrador",
        };
        for (const n of cpCols) rowData[`cp_${n}`] = alloc[n] != null ? alloc[n] : "";
        const row = ws.addRow(rowData);
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

      const buffer = await wb.xlsx.writeBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const stamp = new Date().toISOString().slice(0, 10);
      return { filename: `reparticiones_cp_${stamp}.xlsx`, base64 };
    }),
});
