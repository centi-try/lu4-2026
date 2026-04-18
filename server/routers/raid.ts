import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../_core/trpc';
import {
  // bosses
  getRaidBosses, createRaidBoss, updateRaidBoss, deleteRaidBoss, getRaidBossById,
  // clans
  getClans, createClan, updateClan, deleteClan, getClanById,
  // category icons (super admin)
  getRaidCategoryIcons, setRaidCategoryIcon, deleteRaidCategoryIcon, RAID_DROP_CATEGORIES,
  // access
  getUserRaidAccess, listUserRaidAccess, setUserRaidAccess, setBulkUserRaidAccess,
  canUserAccessRaidModule,
  // cycles
  getRaidCycles, getCurrentRaidCycle, createRaidCycle, closeRaidCycle,
  // events
  getRaidEvents, getRaidEventById, createRaidEvent, updateRaidEvent, deleteRaidEvent,
  getRaidEventClans,
  // drops
  getRaidDropItems, getRaidDropItemById, updateRaidDropItem, deleteRaidDropItem,
  sellRaidDropItem,
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
      return await getRaidBosses();
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
      return await getClans();
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
        name: u.characterName || u.name || '',
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
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await sellRaidDropItem(input.id, input.quantity, ctx.user);
        return { success: true, ...result };
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
});
