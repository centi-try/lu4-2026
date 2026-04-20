import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../_core/trpc';
import {
  // bosses
  getRaidBosses, createRaidBoss, updateRaidBoss, deleteRaidBoss, getRaidBossById,
  countRaidBossUsage,
  // clans
  getClans, createClan, updateClan, deleteClan, getClanById, countClanUsage,
  // category icons (super admin)
  getRaidCategoryIcons, setRaidCategoryIcon, deleteRaidCategoryIcon, RAID_DROP_CATEGORIES,
  // access
  getUserRaidAccess, listUserRaidAccess, setUserRaidAccess, setBulkUserRaidAccess,
  canUserAccessRaidModule,
  // cycles
  getRaidCycles, getCurrentRaidCycle, createRaidCycle, closeRaidCycle,
  // sales cycles (capa semanal sobre raid cycles diarios)
  getRaidSalesCycles, getCurrentRaidSalesCycle,
  getCurrentRaidSalesCyclePeriodStart,
  closeRaidSalesCycle, computeRaidSalesCycleLiveSnapshot,
  // events
  getRaidEvents, getRaidEventById, createRaidEvent, updateRaidEvent, deleteRaidEvent,
  getRaidEventClans,
  // drops
  getRaidDropItems, getRaidDropItemById, updateRaidDropItem, deleteRaidDropItem,
  sellRaidDropItem,
  // drop reservations (señales de intención de compra sobre drops disponibles)
  getRaidDropReservations, createRaidDropReservation, deleteRaidDropReservation,
  // dashboard + stats
  getRaidDashboardMetrics, getClanStats,
  // audit
  createRaidAuditLog, getRaidAuditLogs,
  // users (para listar)
  getAllUsers,
} from '../db';

// ============================================================================
// MIDDLEWARE DE PERMISOS DEL MÓDULO RAID
// ============================================================================

// Super admin del sistema viejo — único dueño absoluto del módulo raid.
const raidSuperAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = String(ctx.user?.role || '').toLowerCase();
  if (role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Solo el Super Admin puede administrar catálogos y accesos del módulo Raid.',
    });
  }
  return next({ ctx });
});

// raid_admin (o super_admin) — puede hacer acciones administrativas dentro del módulo raid.
const raidAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const access = await canUserAccessRaidModule(ctx.user);
  if (!access.canAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Se requiere rol raid_admin o Super Admin para esta acción.',
    });
  }
  return next({ ctx });
});

// raid_admin o raid_mapper — pueden registrar eventos/drops/vender.
const raidMapperProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const access = await canUserAccessRaidModule(ctx.user);
  if (!access.canInteract) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Se requiere rol raid_mapper, raid_admin o Super Admin para esta acción.',
    });
  }
  return next({ ctx });
});

// Cualquiera con acceso al módulo raid (incluyendo raid_user / viewer_only) — lectura.
const raidViewerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const access = await canUserAccessRaidModule(ctx.user);
  if (!access.canAccess) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No tienes acceso al módulo Raid.',
    });
  }
  return next({ ctx });
});

// ============================================================================
// SCHEMAS ZOD
// ============================================================================

const CreateRaidBossSchema = z.object({
  name: z.string().min(1).max(100),
  officialImageUrl: z.string().nullable().optional(),
  level: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdateRaidBossSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(100).optional(),
  officialImageUrl: z.string().nullable().optional(),
  level: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const CreateClanSchema = z.object({
  name: z.string().min(1).max(100),
  tag: z.string().max(20).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

const UpdateClanSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(100).optional(),
  tag: z.string().max(20).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

const AccessLevelEnum = z.enum(['raid_admin', 'raid_mapper', 'raid_user', 'viewer_only']);

const SetRaidAccessSchema = z.object({
  userId: z.number().int(),
  accessLevel: AccessLevelEnum.nullable(),
});

const BulkSetRaidAccessSchema = z.object({
  userIds: z.array(z.number().int()).min(1),
  accessLevel: AccessLevelEnum.nullable(),
});

const DropItemInputSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
  imageUrl: z.string().nullable().optional(),
});

const CreateRaidEventSchema = z.object({
  raidBossId: z.number().int(),
  evidenceImageUrl: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  clanIds: z.array(z.number().int()).min(1),
  dropItems: z.array(DropItemInputSchema).min(1),
});

// ============================================================================
// ROUTER
// ============================================================================

export const raidRouter = router({
  // ---------------- Meta: mi acceso actual ----------------------------------
  myAccess: protectedProcedure.query(async ({ ctx }) => {
    const access = await canUserAccessRaidModule(ctx.user);
    return access;
  }),

  // ---------------- Bosses (catálogo) ---------------------------------------
  bosses: router({
    list: raidViewerProcedure.query(async () => {
      const bosses = await getRaidBosses();
      // Incluimos usageCount (cantidad de eventos que referencian el boss)
      // para que la UI pueda bloquear el borrado cuando el boss está en uso.
      return Promise.all(
        bosses.map(async (b: any) => ({
          ...b,
          usageCount: await countRaidBossUsage(Number(b.id)),
        }))
      );
    }),
    listForCatalog: raidSuperAdminProcedure.query(async () => {
      return await getRaidBosses();
    }),
    create: raidSuperAdminProcedure
      .input(CreateRaidBossSchema)
      .mutation(async ({ ctx, input }) => {
        const boss = await createRaidBoss(input);
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_BOSS_CREATED',
          details: { bossId: boss.id, name: boss.name },
        });
        return { success: true, boss };
      }),
    update: raidSuperAdminProcedure
      .input(UpdateRaidBossSchema)
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const boss = await updateRaidBoss(id, data);
        if (!boss) throw new TRPCError({ code: 'NOT_FOUND', message: 'Raid boss no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_BOSS_UPDATED',
          details: { bossId: id, changes: data },
        });
        return { success: true, boss };
      }),
    delete: raidSuperAdminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        // Bloquear el borrado si el boss está siendo usado en algún evento
        // registrado. La UI también deshabilita el botón, pero además lo
        // validamos acá por si alguien intenta forzar la mutation.
        const usage = await countRaidBossUsage(input.id);
        if (usage > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `No se puede eliminar: el Raid Boss está asociado a ${usage} evento${usage === 1 ? '' : 's'}. Edítalo en vez de borrarlo.`,
          });
        }
        const boss = await deleteRaidBoss(input.id);
        if (!boss) throw new TRPCError({ code: 'NOT_FOUND', message: 'Raid boss no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_BOSS_DELETED',
          details: { bossId: input.id, name: boss.name },
        });
        return { success: true };
      }),
  }),

  // ---------------- Clans ---------------------------------------------------
  clans: router({
    list: raidViewerProcedure.query(async () => {
      const clans = await getClans();
      // Incluimos usageCount (cantidad de eventos donde el clan fue asociado)
      // para que la UI pueda bloquear el borrado cuando ya está en uso.
      return Promise.all(
        clans.map(async (c: any) => ({
          ...c,
          usageCount: await countClanUsage(Number(c.id)),
        }))
      );
    }),
    stats: raidViewerProcedure.query(async () => {
      return await getClanStats();
    }),
    create: raidAdminProcedure
      .input(CreateClanSchema)
      .mutation(async ({ ctx, input }) => {
        const clan = await createClan(input);
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'CLAN_CREATED',
          details: { clanId: clan.id, name: clan.name },
        });
        return { success: true, clan };
      }),
    update: raidAdminProcedure
      .input(UpdateClanSchema)
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const clan = await updateClan(id, data);
        if (!clan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clan no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'CLAN_UPDATED',
          details: { clanId: id, changes: data },
        });
        return { success: true, clan };
      }),
    delete: raidAdminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        // Bloquear el borrado si el clan está siendo usado en algún evento
        // registrado. La UI también deshabilita el botón, pero además lo
        // validamos acá por si alguien intenta forzar la mutation.
        const usage = await countClanUsage(input.id);
        if (usage > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `No se puede eliminar: el clan está asociado a ${usage} evento${usage === 1 ? '' : 's'}. Edítalo en vez de borrarlo.`,
          });
        }
        const clan = await deleteClan(input.id);
        if (!clan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clan no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'CLAN_DELETED',
          details: { clanId: input.id, name: clan.name },
        });
        return { success: true };
      }),
  }),

  // ---------------- Category Icons (super admin) ---------------------------
  // Iconos por categoría de drop — el super admin los setea una vez y se usan
  // como imagen automática en el formulario de eventos de raid.
  categoryIcons: router({
    list: raidViewerProcedure.query(async () => {
      return await getRaidCategoryIcons();
    }),
    set: raidSuperAdminProcedure
      .input(z.object({
        category: z.enum(RAID_DROP_CATEGORIES as unknown as [string, ...string[]]),
        imageUrl: z.string().min(1).max(10 * 1024 * 1024), // permite data URLs grandes
      }))
      .mutation(async ({ ctx, input }) => {
        const saved = await setRaidCategoryIcon(input.category, input.imageUrl);
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_CATEGORY_ICON_SET',
          details: { category: saved.category },
        });
        return { success: true, icon: saved };
      }),
    delete: raidSuperAdminProcedure
      .input(z.object({
        category: z.enum(RAID_DROP_CATEGORIES as unknown as [string, ...string[]]),
      }))
      .mutation(async ({ ctx, input }) => {
        const removed = await deleteRaidCategoryIcon(input.category);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Icono de categoría no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_CATEGORY_ICON_DELETED',
          details: { category: removed.category },
        });
        return { success: true };
      }),
  }),

  // ---------------- Access (super admin only) -------------------------------
  access: router({
    listAll: raidSuperAdminProcedure.query(async () => {
      const [users, access] = await Promise.all([getAllUsers(), listUserRaidAccess()]);
      const accessMap = new Map(access.map((a: any) => [Number(a.userId), a]));
      return users.map((u: any) => ({
        id: Number(u.id),
        email: u.email || '',
        name: u.name || u.characterName || '',
        // Nombre de personaje ingresado al crear la cuenta. Se expone como
        // campo aparte para mostrarlo en la tabla de "Gestión de accesos raid"
        // (además del nombre y el correo).
        characterName: u.characterName || '',
        role: u.role || 'user',
        isActive: u.isActive !== false,
        raidAccess: accessMap.get(Number(u.id)) || null,
      }));
    }),
    set: raidSuperAdminProcedure
      .input(SetRaidAccessSchema)
      .mutation(async ({ ctx, input }) => {
        const result = await setUserRaidAccess(input.userId, input.accessLevel, ctx.user.id);
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: input.accessLevel === null ? 'RAID_ACCESS_REVOKED' : 'RAID_ACCESS_GRANTED',
          details: { targetUserId: input.userId, accessLevel: input.accessLevel },
        });
        return { success: true, access: result };
      }),
    setBulk: raidSuperAdminProcedure
      .input(BulkSetRaidAccessSchema)
      .mutation(async ({ ctx, input }) => {
        const results = await setBulkUserRaidAccess(input.userIds, input.accessLevel, ctx.user.id);
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: input.accessLevel === null ? 'RAID_ACCESS_BULK_REVOKED' : 'RAID_ACCESS_BULK_GRANTED',
          details: {
            count: input.userIds.length,
            accessLevel: input.accessLevel,
            userIds: input.userIds,
          },
        });
        return { success: true, results };
      }),
  }),

  // ---------------- Buyers --------------------------------------------------
  // Lista de usuarios elegibles para asignar como "Comprador/Cuenta" en el
  // modal de venta de drops (tab "Tabla de drops" en /raids/inventory).
  // Solo incluye usuarios con acceso al módulo raid (raid_admin, raid_mapper,
  // raid_user) y activos. No incluye viewer_only ni usuarios sin acceso raid.
  // Accesible por raid_admin / raid_mapper (los que pueden vender).
  buyers: router({
    list: raidMapperProcedure.query(async () => {
      const [users, access] = await Promise.all([getAllUsers(), listUserRaidAccess()]);
      const accessMap = new Map<number, any>(
        access.map((a: any) => [Number(a.userId), a])
      );
      const allowed = new Set(['raid_admin', 'raid_mapper', 'raid_user']);
      return users
        .filter((u: any) => u.isActive !== false)
        .map((u: any) => {
          const a = accessMap.get(Number(u.id));
          const level = a?.accessLevel ? String(a.accessLevel) : null;
          return {
            id: Number(u.id),
            name: u.characterName || u.name || u.email || `Usuario ${u.id}`,
            email: u.email || '',
            role: u.role || 'user',
            accessLevel: level,
          };
        })
        .filter((u: any) => u.accessLevel && allowed.has(u.accessLevel))
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
    }),
  }),

  // ---------------- Cycles --------------------------------------------------
  cycles: router({
    list: raidViewerProcedure.query(async () => {
      return await getRaidCycles();
    }),
    current: raidViewerProcedure.query(async () => {
      return await getCurrentRaidCycle();
    }),
    open: raidAdminProcedure
      .input(z.object({
        label: z.string().max(100).nullable().optional(),
        type: z.enum(['DIARIO', 'SEMANAL']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const cycle = await createRaidCycle({
          label: input.label || null,
          type: input.type || 'DIARIO',
          createdByUserId: ctx.user.id,
        });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_CYCLE_OPENED',
          details: { cycleId: cycle.id, label: cycle.label },
        });
        return { success: true, cycle };
      }),
    close: raidAdminProcedure
      .input(z.object({ cycleId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const cycle = await closeRaidCycle(input.cycleId, ctx.user);
        if (!cycle) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ciclo no encontrado.' });
        return { success: true, cycle };
      }),
  }),

  // ---------------- Sales Cycles (semanales, encima de los raid cycles) -----
  //
  // Capa de agregación — un solo OPEN a la vez, mismo patrón que raid cycles.
  // Calcula el estado en vivo leyendo raidAuditLogs entre startedAt y NOW.
  // Al cerrar, el snapshot se materializa en `cycle.summary` y queda
  // inmutable. NO modifica drops, eventos, clanes ni raid cycles.
  salesCycles: router({
    list: raidViewerProcedure.query(async () => {
      return await getRaidSalesCycles();
    }),
    // El "current" es implícito — no hay registro OPEN persistido. Devolvemos
    // un pseudo-cycle calculado al vuelo (startedAt = último closedAt).
    current: raidViewerProcedure.query(async () => {
      return await getCurrentRaidSalesCycle();
    }),
    livePreview: raidViewerProcedure.query(async () => {
      const startedAt = await getCurrentRaidSalesCyclePeriodStart();
      const pseudo = await getCurrentRaidSalesCycle();
      const snapshot = await computeRaidSalesCycleLiveSnapshot(startedAt, null);
      return {
        cycle: {
          id: 0,
          label: pseudo.label,
          status: 'OPEN' as const,
          startedAt,
        },
        snapshot,
      };
    }),
    close: raidAdminProcedure.mutation(async ({ ctx }) => {
      try {
        const cycle = await closeRaidSalesCycle(ctx.user);
        return { success: true, cycle };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e?.message || 'No se pudo cerrar el ciclo de ventas.',
        });
      }
    }),
  }),

  // ---------------- Events (registro de raids) ------------------------------
  events: router({
    list: raidViewerProcedure
      .input(z.object({
        cycleId: z.number().int().optional(),
        bossId: z.number().int().optional(),
      }).optional())
      .query(async ({ input }) => {
        const events = await getRaidEvents(input);
        // Enriquecer con nombres de boss, clanes asociados y conteo de drops
        const bosses = await getRaidBosses();
        const clans = await getClans();
        const allDrops = await getRaidDropItems();
        const result = await Promise.all(events.map(async (e: any) => {
          const boss = bosses.find((b: any) => Number(b.id) === Number(e.raidBossId));
          const associatedClans = await getRaidEventClans(e.id);
          const dropsForEvent = allDrops.filter((d: any) => Number(d.eventId) === Number(e.id));
          return {
            ...e,
            bossName: boss?.name || `Boss #${e.raidBossId}`,
            bossImageUrl: boss?.officialImageUrl || null,
            clans: associatedClans.map((c: any) => ({ id: Number(c.id), name: c.name })),
            dropsCount: dropsForEvent.length,
            dropItems: dropsForEvent,
          };
        }));
        return result;
      }),
    create: raidMapperProcedure
      .input(CreateRaidEventSchema)
      .mutation(async ({ ctx, input }) => {
        // Verificar que haya un ciclo abierto
        const currentCycle = await getCurrentRaidCycle();
        if (!currentCycle) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No hay ciclo de raid abierto. Abre un ciclo antes de registrar eventos.',
          });
        }
        // Validar boss
        const boss = await getRaidBossById(input.raidBossId);
        if (!boss) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Raid boss no encontrado.' });
        }
        // Validar clanes
        for (const clanId of input.clanIds) {
          const c = await getClanById(clanId);
          if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: `Clan ${clanId} no encontrado.` });
        }
        const { event, dropItems } = await createRaidEvent({
          raidBossId: input.raidBossId,
          cycleId: Number(currentCycle.id),
          evidenceImageUrl: input.evidenceImageUrl || null,
          reportedByUserId: ctx.user.id,
          notes: input.notes || null,
          clanIds: input.clanIds,
          dropItems: input.dropItems,
        });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_EVENT_CREATED',
          details: {
            eventId: event.id,
            bossId: input.raidBossId,
            bossName: boss.name,
            clanIds: input.clanIds,
            dropsCount: dropItems.length,
          },
        });
        return { success: true, event, drops: dropItems };
      }),
    update: raidMapperProcedure
      .input(z.object({
        id: z.number().int(),
        evidenceImageUrl: z.string().nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        clanIds: z.array(z.number().int()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const event = await updateRaidEvent(id, data);
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_EVENT_UPDATED',
          details: { eventId: id, changes: data },
        });
        return { success: true, event };
      }),
    delete: raidAdminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        // Proteger el histórico de ventas: si algún drop del evento ya tiene
        // ventas registradas, no se puede borrar el evento (si lo borramos,
        // `raidClanStats` quedaría con ingresos huérfanos de su evento de
        // origen y se pierde la trazabilidad del reparto).
        const eventDrops = await getRaidDropItems({ eventId: input.id });
        const soldDrops = eventDrops.filter(
          (d: any) => Number(d.quantitySold || 0) > 0,
        );
        if (soldDrops.length > 0) {
          const names = soldDrops.map((d: any) => d.name).filter(Boolean).slice(0, 3);
          const tail = soldDrops.length > 3 ? ` y ${soldDrops.length - 3} más` : '';
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              `No se puede eliminar: el evento tiene ${soldDrops.length} drop(s) ` +
              `con ventas registradas${names.length ? ` (${names.join(', ')}${tail})` : ''}. ` +
              `Las métricas de reparto por clan dependen de ese histórico.`,
          });
        }
        const event = await deleteRaidEvent(input.id);
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_EVENT_DELETED',
          details: { eventId: input.id },
        });
        return { success: true };
      }),
  }),

  // ---------------- Drop items (inventario raid) ----------------------------
  drops: router({
    list: raidViewerProcedure
      .input(z.object({
        cycleId: z.number().int().optional(),
        eventId: z.number().int().optional(),
        clanId: z.number().int().optional(),
      }).optional())
      .query(async ({ input }) => {
        const drops = await getRaidDropItems(input);
        const bosses = await getRaidBosses();
        const clans = await getClans();
        return drops.map((d: any) => {
          const boss = bosses.find((b: any) => Number(b.id) === Number(d.raidBossId));
          const associatedClans = (Array.isArray(d.associatedClanIds) ? d.associatedClanIds : [])
            .map((cid: number) => {
              const c = clans.find((x: any) => Number(x.id) === Number(cid));
              return c ? { id: Number(c.id), name: c.name } : null;
            })
            .filter(Boolean);
          return {
            ...d,
            bossName: boss?.name || null,
            bossImageUrl: boss?.officialImageUrl || null,
            clans: associatedClans,
          };
        });
      }),
    update: raidMapperProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(120).optional(),
        category: z.string().min(1).max(80).optional(),
        price: z.number().min(0).optional(),
        quantity: z.number().int().min(0).optional(),
        imageUrl: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const drop = await updateRaidDropItem(id, data as any);
        if (!drop) throw new TRPCError({ code: 'NOT_FOUND', message: 'Drop no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_DROP_UPDATED',
          details: { dropId: id, changes: data },
        });
        return { success: true, drop };
      }),
    delete: raidAdminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const drop = await deleteRaidDropItem(input.id);
        if (!drop) throw new TRPCError({ code: 'NOT_FOUND', message: 'Drop no encontrado.' });
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_DROP_DELETED',
          details: { dropId: input.id },
        });
        return { success: true };
      }),
    sell: raidMapperProcedure
      .input(z.object({
        id: z.number().int(),
        quantity: z.number().int().min(1),
        buyerId: z.number().int(),
        buyerName: z.string().min(1).max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validar que el comprador tenga acceso raid (raid_admin / raid_mapper
        // / raid_user). No se permite vender a viewer_only ni a usuarios sin
        // acceso al módulo. Esto preserva la trazabilidad del asignado a
        // cuenta y evita registros a cuentas ajenas al módulo raid.
        const buyerAccess = await getUserRaidAccess(input.buyerId);
        const allowedLevels = new Set(['raid_admin', 'raid_mapper', 'raid_user']);
        if (!buyerAccess || !allowedLevels.has(String(buyerAccess.accessLevel))) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El comprador seleccionado no tiene acceso raid elegible.',
          });
        }
        const result = await sellRaidDropItem(input.id, input.quantity, ctx.user, {
          buyerId: input.buyerId,
          buyerName: input.buyerName,
        });
        return { success: true, ...result };
      }),
  }),

  // ---------------- Reservas de compra sobre drops --------------------------
  // Cualquier usuario con acceso raid (incluyendo raid_user) puede reservar
  // unidades de un drop para señalar intención de compra. La suma total de
  // reservas por drop no puede superar el stock disponible — esto garantiza
  // que múltiples usuarios puedan competir por las mismas unidades sin que
  // uno solo acapare todo.
  reservations: router({
    list: raidViewerProcedure
      .input(z.object({
        dropItemId: z.number().int().optional(),
        userId: z.number().int().optional(),
      }).optional())
      .query(async ({ input }) => {
        const reservations = await getRaidDropReservations(input);
        return reservations;
      }),
    create: raidViewerProcedure
      .input(z.object({
        dropItemId: z.number().int(),
        quantity: z.number().int().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar que el usuario tenga acceso raid real (no viewer_only que
        // solo puede mirar). Para reservar se necesita al menos raid_user.
        const access = await getUserRaidAccess(ctx.user.id);
        const allowedLevels = new Set(['raid_admin', 'raid_mapper', 'raid_user']);
        if (!access || !allowedLevels.has(String(access.accessLevel))) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Necesitás rol raid_user o superior para reservar.',
          });
        }
        // characterName del perfil del usuario (fallback al name si no tiene).
        const characterName = String(
          (ctx.user as any).characterName ||
          ctx.user.name ||
          ctx.user.email ||
          ''
        ).trim();
        if (!characterName) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Tu perfil no tiene un personaje configurado. Configuralo antes de reservar.',
          });
        }
        try {
          const reservation = await createRaidDropReservation({
            dropItemId: input.dropItemId,
            userId: ctx.user.id,
            userName: String(ctx.user.name || ctx.user.email || 'Usuario').trim(),
            characterName,
            quantity: input.quantity,
          });
          await createRaidAuditLog({
            userId: ctx.user.id,
            action: 'RAID_DROP_RESERVED',
            details: {
              dropItemId: input.dropItemId,
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
    delete: raidViewerProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        // Obtener la reserva primero para verificar el dueño.
        const all = await getRaidDropReservations();
        const target = all.find(r => Number(r.id) === Number(input.id));
        if (!target) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Reserva no encontrada.',
          });
        }
        const access = await canUserAccessRaidModule(ctx.user);
        const isOwner = Number(target.userId) === Number(ctx.user.id);
        // Solo el dueño de la reserva o un admin raid puede borrarla.
        if (!isOwner && !access.canAdmin) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'No tenés permiso para borrar esta reserva.',
          });
        }
        const removed = await deleteRaidDropReservation(input.id);
        await createRaidAuditLog({
          userId: ctx.user.id,
          action: 'RAID_DROP_RESERVATION_DELETED',
          details: {
            reservationId: input.id,
            dropItemId: target.dropItemId,
            deletedBy: isOwner ? 'owner' : 'admin',
          },
        });
        return { success: true, reservation: removed };
      }),
  }),

  // ---------------- Dashboard + audit logs ----------------------------------
  dashboard: raidViewerProcedure.query(async () => {
    return await getRaidDashboardMetrics();
  }),

  // Actividad reciente del módulo raid — visible a todos los usuarios con
  // acceso raid (replica el comportamiento de ActivityFeed del dashboard viejo,
  // pero consumiendo solo la colección raidAuditLogs).
  auditLogs: raidViewerProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional())
    .query(async ({ input }) => {
      const logs = await getRaidAuditLogs(input?.limit || 100);
      const users = await getAllUsers();
      const usersById = new Map<number, any>();
      for (const u of users) usersById.set(Number(u.id), u);
      return logs.map((log: any) => {
        const u = usersById.get(Number(log.userId));
        return {
          ...log,
          actorName: u?.name || u?.email || 'Sistema',
          actorRole: String(u?.role || '').toUpperCase() || null,
        };
      });
    }),

  // ---------------- Historial de Compras (raid) -----------------------------
  // Deriva de los audit logs con action === 'RAID_DROP_SOLD'. No escribe en DB
  // y es independiente del histórico de compras del menú antiguo (AppContext.
  // purchases). Cada venta registrada con comprador aparece como una "compra"
  // reutilizable por el frontend (pantalla /raids/purchases).
  purchases: router({
    list: raidViewerProcedure.query(async () => {
      // Leemos una ventana amplia de logs — 5000 cubre histórico largo sin
      // paginación. Si en el futuro se hace grande se puede paginar.
      const logs = await getRaidAuditLogs(5000);
      const users = await getAllUsers();
      const usersById = new Map<number, any>();
      for (const u of users) usersById.set(Number(u.id), u);

      return logs
        .filter((log: any) => String(log.action) === 'RAID_DROP_SOLD')
        .map((log: any) => {
          const d = (log.details || {}) as any;
          const quantity = Number(d.quantitySold || 0);
          const total = Number(d.revenue || 0);
          const price = quantity > 0 ? Math.round(total / quantity) : 0;
          const buyerIdRaw = d.buyerId;
          const buyerName =
            d.buyerName ||
            (buyerIdRaw != null ? (usersById.get(Number(buyerIdRaw))?.name || 'Sin comprador') : 'Sin comprador');
          const seller = usersById.get(Number(log.userId));
          return {
            // id del log — único y estable por compra
            id: Number(log.id),
            dropItemId: d.dropItemId != null ? Number(d.dropItemId) : null,
            itemName: String(d.itemName || '—'),
            buyerId: buyerIdRaw != null ? Number(buyerIdRaw) : null,
            buyerName,
            quantity,
            price,
            total,
            clansShared: Array.isArray(d.clansShared) ? d.clansShared.map(Number) : [],
            soldByUserId: Number(log.userId),
            soldByUserName: seller?.name || seller?.email || 'Sistema',
            createdAt: log.createdAt,
          };
        });
    }),
  }),
});
