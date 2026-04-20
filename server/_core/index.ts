import "dotenv/config";
import express from "express";
import http from "http";
import net from "net";
import crypto from "crypto";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  DEFAULT_SUPER_ADMIN_NAME,
  getDb,
  getUserByEmail,
  hashStoredPassword,
  upsertUser,
  startDailyBackupScheduler,
  STORAGE_PATHS,
  verifyStoredPassword,
  getLoginLockStatus,
  registerFailedLogin,
  resetLoginAttempts,
  updateUserPassword,
  LOGIN_MAX_FAILED_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
  createAuditLog,
} from "../db";

// Esquemas dummy para compatibilidad
const users = { name: 'users' };
const eq = (a: any, b: any) => ({ [a]: b });

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
}

const app = express();
const server = http.createServer(app);

export async function hashPassword(password: string): Promise<string> {
  return hashStoredPassword(password);
}

async function startServer() {
  // Rutas de autenticación personalizadas
  app.post('/api/auth/register', express.json(), async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const characterName = String(req.body?.characterName || '').trim();
      const password = String(req.body?.password || '');

      if (!email || !characterName || password.length < 6) {
        return res.status(400).json({ message: 'Datos de registro inválidos' });
      }

      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: 'El correo ya está registrado' });
      }

      const passwordHash = await hashPassword(password);

      const user = await upsertUser({
        email,
        characterName,
        name: characterName,
        passwordHash,
        loginMethod: 'local',
        role: 'user',
        isActive: true,
        openId: `local-${email}`
      });
      
      // Establecer cookie de sesión
      const { sdk } = await import("./sdk");
      const { getSessionCookieOptions } = await import("./cookies");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("@shared/const");
      
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.characterName || user.name || '',
      });
      
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      
      res.json({ 
        success: true, 
        message: 'Usuario registrado exitosamente',
        user
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ message: 'Error al registrarse' });
    }
  });
  
  // Endpoint de seeding desactivado para producción
  app.post('/api/seed-demo', express.json(), async (req, res) => {
    res.status(403).json({ message: 'Seeding is disabled in production' });
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const user = await sdk.authenticateRequest(req as any);
      return res.json({
        success: true,
        credentials: {
          email: DEFAULT_SUPER_ADMIN_EMAIL,
          passwordHint: 'Credencial local por defecto configurada',
          name: DEFAULT_SUPER_ADMIN_NAME,
        },
        user: {
          id: user.id,
          email: user.email,
          name: user.characterName || user.name,
          characterName: user.characterName,
          role: user.role,
          isActive: user.isActive !== false,
        },
      });
    } catch (error) {
      return res.status(401).json({ message: 'Sesión no válida' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const { getSessionCookieOptions } = await import("./cookies");
      const { COOKIE_NAME } = await import("@shared/const");
      res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(req),
        maxAge: -1,
      });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: 'No se pudo cerrar la sesión' });
    }
  });
  
  // ============================================================
  // Rate limit por IP (anti brute-force global)
  // ============================================================
  // Cola in-memory por IP: ventana deslizante de 15 min, máximo 20
  // intentos (exitosos o fallidos). Si se pasa devolvemos 429 sin tocar
  // la DB. Se limpia lazy cada vez que llega un request.
  const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
  const LOGIN_RATE_MAX = 20;
  const loginAttemptsByIp = new Map<string, number[]>();

  function getClientIp(req: express.Request): string {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req.ip || req.socket.remoteAddress || 'unknown';
  }

  function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const now = Date.now();
    const list = (loginAttemptsByIp.get(ip) || []).filter((t) => now - t < LOGIN_RATE_WINDOW_MS);
    loginAttemptsByIp.set(ip, list);
    if (list.length >= LOGIN_RATE_MAX) {
      const oldest = list[0];
      const retryAfterSec = Math.max(1, Math.ceil((LOGIN_RATE_WINDOW_MS - (now - oldest)) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    return { allowed: true, remaining: LOGIN_RATE_MAX - list.length, retryAfterSec: 0 };
  }

  function trackIpAttempt(ip: string) {
    const list = loginAttemptsByIp.get(ip) || [];
    list.push(Date.now());
    loginAttemptsByIp.set(ip, list);
  }

  // Mensaje genérico para no filtrar si el email existe o no.
  const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos';

  app.post('/api/auth/login', express.json(), async (req, res) => {
    const ip = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    try {
      // 1) Rate limit por IP (antes de cualquier cosa — no toca la DB)
      const rate = checkIpRateLimit(ip);
      if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSec));
        return res.status(429).json({
          message: `Demasiados intentos desde esta IP. Probá de nuevo en ${Math.ceil(rate.retryAfterSec / 60)} min.`,
        });
      }
      trackIpAttempt(ip);

      if (!emailRaw || !password) {
        return res.status(400).json({ message: 'Email y contraseña requeridos' });
      }

      const db = await getDb();
      const usersTable = { name: 'users' };
      const result = await db.select().from(usersTable).where({ email: emailRaw }).limit(1);

      // 2) Usuario inexistente → mensaje genérico (no filtra si el email existe)
      if (result.length === 0) {
        try {
          await createAuditLog({
            userId: null,
            actorName: emailRaw,
            actorRole: 'anonymous',
            action: 'LOGIN_FAILED',
            details: `Intento con email inexistente · IP=${ip} · UA="${userAgent}"`,
          });
        } catch { /* ignore */ }
        return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
      }

      const user = result[0];

      // 3) Cuenta desactivada
      if (user.isActive === false) {
        try {
          await createAuditLog({
            userId: user.id,
            actorName: user.characterName || user.name || user.email,
            actorRole: user.role || 'user',
            action: 'LOGIN_FAILED',
            details: `Intento sobre cuenta desactivada · IP=${ip}`,
          });
        } catch { /* ignore */ }
        return res.status(403).json({ message: 'Tu cuenta ha sido desactivada. Contacta al administrador.' });
      }

      // 4) ¿Cuenta bloqueada por intentos fallidos?
      const lock = getLoginLockStatus(user);
      if (lock.locked) {
        const minutes = Math.max(1, Math.ceil(lock.remainingMs / 60000));
        try {
          await createAuditLog({
            userId: user.id,
            actorName: user.characterName || user.name || user.email,
            actorRole: user.role || 'user',
            action: 'LOGIN_BLOCKED',
            details: `Cuenta bloqueada — faltan ~${minutes}min · IP=${ip}`,
          });
        } catch { /* ignore */ }
        return res.status(423).json({
          message: `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Probá de nuevo en ~${minutes} min.`,
        });
      }

      // 5) Verificar password (bcrypt + migración legacy SHA-256)
      const verify = verifyStoredPassword(password, user.passwordHash);
      if (!verify.ok) {
        const updated = await registerFailedLogin(user.id);
        const attempts = Number(updated?.failedLoginAttempts || 0);
        const remaining = Math.max(0, LOGIN_MAX_FAILED_ATTEMPTS - attempts);
        try {
          await createAuditLog({
            userId: user.id,
            actorName: user.characterName || user.name || user.email,
            actorRole: user.role || 'user',
            action: 'LOGIN_FAILED',
            details: `Password incorrecta · intento ${attempts}/${LOGIN_MAX_FAILED_ATTEMPTS} · IP=${ip}`,
          });
        } catch { /* ignore */ }
        if (attempts >= LOGIN_MAX_FAILED_ATTEMPTS) {
          return res.status(423).json({
            message: `Cuenta bloqueada ${LOGIN_LOCKOUT_MINUTES} min por demasiados intentos fallidos.`,
          });
        }
        // No revelar en el mensaje cuántos intentos restan si es bajo — solo advertir en últimos 2.
        const suffix = remaining <= 2 && remaining > 0 ? ` (te quedan ${remaining} intentos)` : '';
        return res.status(401).json({ message: `${GENERIC_LOGIN_ERROR}${suffix}` });
      }

      // 6) Password OK → migrar hash si es legacy
      if (verify.needsRehash) {
        try {
          const newHash = await hashPassword(password);
          await updateUserPassword(user.id, newHash);
          console.log(`[auth] Migrado hash legacy → bcrypt para user ${user.id}`);
        } catch (err) {
          console.error('[auth] Error migrando hash legacy:', err);
          /* no bloquea login */
        }
      }

      // 7) Reset intentos + setear sesión
      await resetLoginAttempts(user.id);

      const { sdk } = await import("./sdk");
      const { getSessionCookieOptions } = await import("./cookies");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("@shared/const");

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.characterName || user.name || '',
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      await upsertUser({
        id: user.id,
        email: user.email,
        openId: user.openId,
        lastSignedIn: new Date().toISOString(),
      });

      try {
        await createAuditLog({
          userId: user.id,
          actorName: user.characterName || user.name || user.email,
          actorRole: user.role || 'user',
          action: 'LOGIN_SUCCESS',
          details: `Login exitoso · IP=${ip} · UA="${userAgent}"`,
        });
      } catch { /* ignore */ }

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.characterName || user.name,
          characterName: user.characterName,
          role: user.role,
          isActive: user.isActive !== undefined ? user.isActive : true,
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Error al iniciar sesión' });
    }
  });
  
  const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // Permitir payloads grandes (evidencias de raid como base64 data URL, hasta ~4MB post-encode)
      maxBodySize: 8 * 1024 * 1024,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`[db] Archivo principal: ${STORAGE_PATHS.dbFile}`);
    console.log(`[db] Backups: ${STORAGE_PATHS.backupsDir} (retención ${STORAGE_PATHS.retentionDays} días)`);
    // Arranca el scheduler de backups diarios una vez que el server está vivo.
    startDailyBackupScheduler();
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
