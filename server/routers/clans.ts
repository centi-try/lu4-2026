import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../_core/trpc';
import {
  getClans,
  getClanById,
  createClan,
  updateClan,
  deleteClan,
  getCommandParties,
  getCommandPartyById,
  createCommandParty,
  updateCommandParty,
  deleteCommandParty,
  getAllUsers,
  getUsersByCp,
  getUsersByClan,
  getUsersWithoutCp,
  setUserCpStatus,
  reassignUserCp,
  getAvailableClasses,
  addAvailableClass,
  updateAvailableClass,
  deleteAvailableClass,
  getSecondaryCharactersByUsers,
  addSecondaryCharacter,
  updateSecondaryCharacter,
  deleteSecondaryCharacter,
  createAuditLog,
} from '../db';

export const clansRouter = router({
  clans: router({
    list: protectedProcedure.query(async () => {
      return await getClans();
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        tag: z.string().max(20).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const clan = await createClan(input);
        await createAuditLog({
          action: 'CLAN_CREATED',
          detail: `Clan "${clan.name}" creado`,
        });
        return { success: true, clan };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(100).optional(),
        tag: z.string().max(20).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const clan = await updateClan(id, data);
        if (!clan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clan no encontrado.' });
        await createAuditLog({
          action: 'CLAN_UPDATED',
          detail: `Clan "${clan.name}" actualizado`,
        });
        return { success: true, clan };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const clan = await deleteClan(input.id);
        if (!clan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clan no encontrado.' });
        await createAuditLog({
          action: 'CLAN_DELETED',
          detail: `Clan "${clan.name}" eliminado`,
        });
        return { success: true };
      }),
  }),

  commandParties: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      const userId = Number(ctx.user?.id);
      const allCps = await getCommandParties();
      const allClans = await getClans();
      const allUsers = await getAllUsers();

      if (role === 'super_admin') {
        return allCps.map((cp: any) => {
          const clan = allClans.find((c: any) => Number(c.id) === Number(cp.clanId));
          const leader = cp.leaderId ? allUsers.find((u: any) => Number(u.id) === Number(cp.leaderId)) : null;
          const members = allUsers.filter((u: any) => Number(u.clanCpId) === Number(cp.id));
          return {
            ...cp,
            clanName: clan?.name || '—',
            leaderName: leader?.name || leader?.characterName || null,
            memberCount: members.length,
            confirmedCount: members.filter((m: any) => m.cpStatus === 'confirmed').length,
            pendingCount: members.filter((m: any) => m.cpStatus === 'pending').length,
          };
        });
      }

      const me = allUsers.find((u: any) => Number(u.id) === userId);
      if (!me?.clanId || me.cpStatus !== 'confirmed') return [];
      const myClanCps = allCps.filter((cp: any) => Number(cp.clanId) === Number(me.clanId));
      return myClanCps.map((cp: any) => {
        const clan = allClans.find((c: any) => Number(c.id) === Number(cp.clanId));
        const leader = cp.leaderId ? allUsers.find((u: any) => Number(u.id) === Number(cp.leaderId)) : null;
        const members = allUsers.filter((u: any) => Number(u.clanCpId) === Number(cp.id) && u.cpStatus === 'confirmed');
        return {
          ...cp,
          clanName: clan?.name || '—',
          leaderName: leader?.name || leader?.characterName || null,
          memberCount: members.length,
          confirmedCount: members.length,
          pendingCount: 0,
        };
      });
    }),

    members: protectedProcedure
      .input(z.object({ cpId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const userId = Number(ctx.user?.id);
        const cp = await getCommandPartyById(input.cpId);
        if (!cp) throw new TRPCError({ code: 'NOT_FOUND', message: 'CP no encontrada' });

        const mapMember = (u: any, secondaries: any[]) => ({
          id: Number(u.id),
          name: u.name || u.characterName || u.email,
          characterName: u.characterName,
          email: u.email,
          classMain: u.classMain || null,
          cpStatus: u.cpStatus || 'pending',
          isLeader: Number(cp.leaderId) === Number(u.id),
          secondaryCharacters: secondaries.filter((sc: any) => Number(sc.userId) === Number(u.id)),
        });

        const sortMembers = (arr: any[]) => arr.sort((a, b) => {
          if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
          if (a.cpStatus !== b.cpStatus) {
            if (a.cpStatus === 'confirmed') return -1;
            if (b.cpStatus === 'confirmed') return 1;
          }
          return 0;
        });

        if (role === 'super_admin') {
          const members = await getUsersByCp(input.cpId);
          const scs = await getSecondaryCharactersByUsers(members.map((u: any) => Number(u.id)));
          return sortMembers(members.map((u: any) => mapMember(u, scs)));
        }

        if (Number(cp.leaderId) === userId) {
          const members = await getUsersByCp(input.cpId);
          const scs = await getSecondaryCharactersByUsers(members.map((u: any) => Number(u.id)));
          return sortMembers(members.map((u: any) => mapMember(u, scs)));
        }

        const me = (await getAllUsers()).find((u: any) => Number(u.id) === userId);
        if (!me || me.cpStatus !== 'confirmed' || Number(me.clanId) !== Number(cp.clanId)) {
          return [];
        }
        const members = (await getUsersByCp(input.cpId)).filter((u: any) => u.cpStatus === 'confirmed');
        const scs = await getSecondaryCharactersByUsers(members.map((u: any) => Number(u.id)));
        return sortMembers(members.map((u: any) => ({
          ...mapMember(u, scs),
          cpStatus: 'confirmed' as const,
        })));
      }),

    clanMembers: adminProcedure
      .input(z.object({ clanId: z.number().int() }))
      .query(async ({ input }) => {
        const members = await getUsersByClan(input.clanId);
        return members.map((u: any) => ({
          id: Number(u.id),
          name: u.name || u.characterName || u.email,
          characterName: u.characterName,
        }));
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        clanId: z.number().int(),
      }))
      .mutation(async ({ input }) => {
        const clan = await getClanById(input.clanId);
        if (!clan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clan no encontrado' });
        const cp = await createCommandParty({ name: input.name, clanId: input.clanId });
        await createAuditLog({
          action: 'CP_CREATED',
          detail: `CP "${cp.name}" creada en clan "${clan.name}"`,
        });
        return cp;
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(100).optional(),
        clanId: z.number().int().optional(),
        leaderId: z.number().int().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const cp = await updateCommandParty(id, data);
        if (!cp) throw new TRPCError({ code: 'NOT_FOUND', message: 'CP no encontrada' });
        await createAuditLog({
          action: 'CP_UPDATED',
          detail: `CP "${cp.name}" actualizada`,
        });
        return cp;
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const cp = await deleteCommandParty(input.id);
        if (!cp) throw new TRPCError({ code: 'NOT_FOUND', message: 'CP no encontrada' });
        await createAuditLog({
          action: 'CP_DELETED',
          detail: `CP "${cp.name}" eliminada`,
        });
        return { success: true };
      }),

    setMemberStatus: protectedProcedure
      .input(z.object({
        userId: z.number().int(),
        status: z.enum(['confirmed', 'removed']),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const actorId = Number(ctx.user?.id);
        const allUsers = await getAllUsers();
        const target = allUsers.find((u: any) => Number(u.id) === input.userId);
        if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
        if (!target.clanCpId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuario no tiene CP asignada' });

        if (role !== 'super_admin') {
          const cp = await getCommandPartyById(Number(target.clanCpId));
          if (!cp || Number(cp.leaderId) !== actorId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el leader o super admin puede cambiar el estado de miembros' });
          }
        }

        return await setUserCpStatus(input.userId, input.status, actorId);
      }),

    reassignMember: adminProcedure
      .input(z.object({
        userId: z.number().int(),
        clanId: z.number().int().nullable(),
        cpId: z.number().int().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await reassignUserCp(input.userId, input.clanId, input.cpId, Number(ctx.user?.id));
      }),

    unassigned: adminProcedure.query(async () => {
      const users = await getUsersWithoutCp();
      return users.map((u: any) => ({
        id: Number(u.id),
        name: u.name || u.characterName || u.email,
        characterName: u.characterName,
        email: u.email,
        clanId: u.clanId,
        cpStatus: u.cpStatus,
      }));
    }),

    listClasses: protectedProcedure.query(async () => {
      return await getAvailableClasses();
    }),

    addClass: adminProcedure
      .input(z.object({ name: z.string().min(1).max(100) }))
      .mutation(async ({ input }) => {
        return await addAvailableClass(input.name);
      }),

    updateClass: adminProcedure
      .input(z.object({ id: z.number().int(), name: z.string().min(1).max(100) }))
      .mutation(async ({ input }) => {
        const updated = await updateAvailableClass(input.id, input.name);
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clase no encontrada' });
        return updated;
      }),

    deleteClass: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const removed = await deleteAvailableClass(input.id);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clase no encontrada' });
        return { success: true };
      }),

    addSecondaryChar: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        className: z.string().max(100).optional(),
        userId: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let targetUserId = Number(ctx.user?.id);
        if (input.userId && input.userId !== targetUserId) {
          const role = String(ctx.user?.role || '').toLowerCase();
          if (role !== 'super_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo admin puede agregar alts a otros miembros' });
          }
          targetUserId = input.userId;
        }
        return await addSecondaryCharacter(targetUserId, input);
      }),

    updateSecondaryChar: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(100).optional(),
        className: z.string().max(100).nullable().optional(),
        userId: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let targetUserId = Number(ctx.user?.id);
        if (input.userId && input.userId !== targetUserId) {
          const role = String(ctx.user?.role || '').toLowerCase();
          if (role !== 'super_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo admin puede editar alts de otros miembros' });
          }
          targetUserId = input.userId;
        }
        const updated = await updateSecondaryCharacter(input.id, targetUserId, {
          name: input.name,
          className: input.className,
        });
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Personaje secundario no encontrado' });
        return updated;
      }),

    deleteSecondaryChar: protectedProcedure
      .input(z.object({ id: z.number().int(), userId: z.number().int().optional() }))
      .mutation(async ({ ctx, input }) => {
        let targetUserId = Number(ctx.user?.id);
        if (input.userId && input.userId !== targetUserId) {
          const role = String(ctx.user?.role || '').toLowerCase();
          if (role !== 'super_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo admin puede eliminar alts de otros miembros' });
          }
          targetUserId = input.userId;
        }
        const removed = await deleteSecondaryCharacter(input.id, targetUserId);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Personaje secundario no encontrado' });
        return { success: true };
      }),
  }),
});
