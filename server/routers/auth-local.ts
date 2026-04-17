import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
const users: any = { name: 'users' };
const eq = (a: any, b: any) => ({ [a]: b });
import { TRPCError } from '@trpc/server';

// Simular bcrypt (en producción usar bcryptjs real)
async function hashPassword(password: string): Promise<string> {
  // Implementación simplificada - en producción usar bcryptjs
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function comparePassword(password: string, hash: string): Promise<boolean> {
  const newHash = await hashPassword(password);
  return newHash === hash;
}

export const authLocalRouter = router({
  register: publicProcedure
    .input(z.object({
      email: z.string().email('Email inválido'),
      password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
      characterName: z.string().min(2, 'El nombre del personaje debe tener al menos 2 caracteres'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Verificar si el email ya existe
      const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El email ya está registrado' });
      }

      // Hashear contraseña
      const passwordHash = await hashPassword(input.password);

      // Crear usuario
      try {
        await db.insert(users).values({
          email: input.email,
          passwordHash,
          characterName: input.characterName,
          name: input.characterName,
          loginMethod: 'local',
          role: 'user',
        });

        return { success: true, message: 'Usuario registrado exitosamente' };
      } catch (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al crear el usuario' });
      }
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email('Email inválido'),
      password: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Buscar usuario
      const result = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (result.length === 0) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email o contraseña incorrectos' });
      }

      const user = result[0];

      // Verificar contraseña
      if (!user.passwordHash || !(await comparePassword(input.password, user.passwordHash))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email o contraseña incorrectos' });
      }

      // Actualizar lastSignedIn
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.characterName || user.name,
          characterName: user.characterName,
          role: user.role,
        },
      };
    }),
});
