import "dotenv/config";
import express from "express";
import http from "http";
import net from "net";
import crypto from "crypto";
import path from "path";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  DEFAULT_SUPER_ADMIN_NAME,
  getDb,
  getUserByEmail,
  getUserById,
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
  issuePasswordResetToken,
  consumePasswordResetToken,
  issueEmailVerificationToken,
  consumeEmailVerificationToken,
  markUserEmailVerified,
  pruneExpiredAuthTokens,
  PASSWORD_RESET_TTL_MINUTES,
  EMAIL_VERIFICATION_TTL_HOURS,
  setUserTwoFactorPending,
  enableUserTwoFactor,
  disableUserTwoFactor,
  consumeBackupCodeHash,
  getClans,
  getCommandParties,
  getAvailableClasses,
} from "../db";
import { sendPasswordResetEmail, sendEmailVerificationEmail, isEmailEnabled } from "./email";
import {
  generateSecret as generate2faSecret,
  getOtpAuthUrl,
  getQrDataUrl,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
  generateChallengeToken,
  verifyChallengeToken,
} from "./twofactor";

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
      const raidClanId = req.body?.raidClanId ? Number(req.body.raidClanId) : null;
      const raidCpId = req.body?.raidCpId ? Number(req.body.raidCpId) : null;
      const classMain = req.body?.classMain ? String(req.body.classMain).trim() : null;

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
        legacyAccess: false,
        emailVerified: false,
        openId: `local-${email}`,
        raidClanId: raidClanId || null,
        raidCpId: raidCpId || null,
        cpStatus: raidCpId ? 'pending' : null,
        classMain: classMain || null,
      });

      // Emitir token de verificación de email y disparar el send (no bloquea
      // el registro si el envío falla — se puede reintentar desde la UI).
      try {
        const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || null;
        const userAgent = String(req.headers['user-agent'] || '').slice(0, 200) || null;
        const { issued } = await issueEmailVerificationToken({
          userId: user.id,
          email: user.email,
          ip,
          userAgent,
        });
        if (issued) {
          const result = await sendEmailVerificationEmail(user.email, issued.rawToken);
          if (!result.ok) {
            console.warn('[auth/register] No se pudo enviar el email de verificación:', result.error);
          }
        }
      } catch (err) {
        console.error('[auth/register] Error emitiendo token de verificación:', err);
      }

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
        message: 'Usuario registrado exitosamente. Te enviamos un email para confirmar tu cuenta.',
        user,
        emailVerificationSent: isEmailEnabled(),
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

  // Public endpoint for registration form: list clans + CPs (no auth required)
  app.get('/api/public/clans-and-cps', async (_req, res) => {
    try {
      const clans = await getClans();
      const cps = await getCommandParties();
      const classes = await getAvailableClasses();
      res.json({
        clans: clans.map((c: any) => ({ id: Number(c.id), name: c.name })),
        commandParties: cps.map((cp: any) => ({
          id: Number(cp.id),
          name: cp.name,
          clanId: Number(cp.clanId),
        })),
        availableClasses: classes.map((c: any) => ({ id: Number(c.id), name: c.name })),
      });
    } catch (error) {
      console.error('Error fetching clans and CPs:', error);
      res.status(500).json({ clans: [], commandParties: [] });
    }
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
          legacyAccess: user.role === 'super_admin' ? true : (user.legacyAccess === true),
          emailVerified: user.emailVerified !== false,
          twoFactorEnabled: Boolean(user.twoFactorEnabled),
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
    // "Recordarme": si viene en true, la cookie vive ~30 días. Si viene
    // false o undefined, no seteamos maxAge → cookie de sesión (muere al
    // cerrar el navegador). El user tiene control explícito.
    const rememberMe = req.body?.rememberMe === true || req.body?.rememberMe === 'true';

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

      // 6.5) 2FA — si el user tiene 2FA activado, NO emitimos sesión todavía.
      // Devolvemos un challengeToken firmado con el userId + rememberMe que el
      // cliente debe presentar junto al código TOTP (o backup code) en el
      // siguiente paso (POST /api/auth/login/2fa). Reseteamos los intentos
      // fallidos solo después de completar el segundo paso.
      if (user.twoFactorEnabled === true && user.twoFactorSecret) {
        const challengeToken = generateChallengeToken(user.id, rememberMe);
        try {
          await createAuditLog({
            userId: user.id,
            actorName: user.characterName || user.name || user.email,
            actorRole: user.role || 'user',
            action: 'LOGIN_2FA_CHALLENGE',
            details: `Password OK · esperando código 2FA · IP=${ip}`,
          });
        } catch { /* ignore */ }
        return res.json({
          success: true,
          requires2fa: true,
          challengeToken,
          // Hint mínimo: cuántos backup codes le quedan al user (no expone
          // los códigos en sí — solo el contador es útil para mostrarle un
          // warning si está bajo).
          backupCodesRemaining: Array.isArray(user.twoFactorBackupCodeHashes)
            ? user.twoFactorBackupCodeHashes.length
            : 0,
        });
      }

      // 7) Reset intentos + setear sesión
      await resetLoginAttempts(user.id);

      const { sdk } = await import("./sdk");
      const { getSessionCookieOptions } = await import("./cookies");
      const { COOKIE_NAME, REMEMBER_ME_MS } = await import("@shared/const");

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.characterName || user.name || '',
      });

      const cookieOptions = getSessionCookieOptions(req);
      // Si rememberMe=true → cookie persistente de 30 días.
      // Si rememberMe=false (o undefined) → omitimos maxAge → cookie de sesión
      // (muere cuando el navegador cierra todas las pestañas). El user decide.
      if (rememberMe) {
        res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: REMEMBER_ME_MS,
        });
      } else {
        res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
      }

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
          legacyAccess: user.role === 'super_admin' ? true : (user.legacyAccess === true),
          emailVerified: user.emailVerified !== false,
          twoFactorEnabled: Boolean(user.twoFactorEnabled),
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Error al iniciar sesión' });
    }
  });

  // ============================================================
  // PR6 — 2FA TOTP (paso 2 del login + setup/enable/disable)
  // ============================================================
  //
  // Paso 2 del login: el cliente recibió `requires2fa + challengeToken` del
  // primer POST /api/auth/login, y acá valida el código TOTP (o un backup
  // code) para obtener la cookie de sesión. El challengeToken es HMAC firmado
  // con userId + rememberMe y TTL de 5 minutos — sin él no se puede completar
  // el login (aunque uno tenga el código).
  //
  // Brute-force:
  //   - Reusamos el rate limit por IP (mismas ventanas que /login).
  //   - Un código TOTP tiene 6 dígitos → 1M combinaciones. Con 20 intentos/15min
  //     un atacante necesitaría décadas para cubrir el espacio. Suficiente.
  //
  // Backup codes:
  //   - Se consumen en el momento de usarlos (hash borrado del array).
  //   - Si el user se queda sin códigos, puede regenerar desde /settings
  //     (requiere password + TOTP para regenerar → out of scope de este PR).
  app.post('/api/auth/login/2fa', express.json(), async (req, res) => {
    const ip = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);

    if (rateLimitedOrRespond(req, res)) return;

    try {
      const challengeToken = String(req.body?.challengeToken || '');
      const codeRaw = String(req.body?.code || '').trim();

      const payload = verifyChallengeToken(challengeToken);
      if (!payload) {
        return res.status(401).json({
          message: 'Tu sesión de verificación expiró. Volvé a iniciar sesión.',
        });
      }

      const user = await getUserById(payload.userId);
      if (!user || user.isActive === false || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return res.status(401).json({ message: 'Verificación 2FA inválida.' });
      }

      if (!codeRaw) {
        return res.status(400).json({ message: 'Ingresá el código de 6 dígitos.' });
      }

      // Intentar primero como TOTP (6 dígitos). Si no parsea, intentar como
      // backup code. Así el user puede pegar cualquiera de los dos.
      let usedMethod: 'totp' | 'backup' | null = null;
      if (/^\d{6}$/.test(codeRaw)) {
        if (verifyTotp(user.twoFactorSecret, codeRaw)) {
          usedMethod = 'totp';
        }
      }
      if (!usedMethod) {
        const normalized = normalizeBackupCode(codeRaw);
        if (normalized.length >= 10) {
          const candidateHash = hashBackupCode(normalized);
          const ok = await consumeBackupCodeHash(user.id, candidateHash);
          if (ok) usedMethod = 'backup';
        }
      }

      if (!usedMethod) {
        try {
          await createAuditLog({
            userId: user.id,
            actorName: user.characterName || user.name || user.email,
            actorRole: user.role || 'user',
            action: 'LOGIN_2FA_FAILED',
            details: `Código 2FA inválido · IP=${ip}`,
          });
        } catch { /* ignore */ }
        return res.status(401).json({ message: 'Código incorrecto. Probá de nuevo.' });
      }

      // Código OK → reset intentos fallidos + emitir sesión.
      await resetLoginAttempts(user.id);

      const { sdk } = await import("./sdk");
      const { getSessionCookieOptions } = await import("./cookies");
      const { COOKIE_NAME, REMEMBER_ME_MS } = await import("@shared/const");

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.characterName || user.name || '',
      });
      const cookieOptions = getSessionCookieOptions(req);
      if (payload.rememberMe) {
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: REMEMBER_ME_MS });
      } else {
        res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
      }

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
          details: `Login exitoso con 2FA (${usedMethod}) · IP=${ip} · UA="${userAgent}"`,
        });
      } catch { /* ignore */ }

      return res.json({
        success: true,
        usedMethod,
        user: {
          id: user.id,
          email: user.email,
          name: user.characterName || user.name,
          characterName: user.characterName,
          role: user.role,
          isActive: user.isActive !== false,
          legacyAccess: user.role === 'super_admin' ? true : (user.legacyAccess === true),
          emailVerified: user.emailVerified !== false,
          twoFactorEnabled: true,
        },
      });
    } catch (err) {
      console.error('[2fa/login] error:', err);
      return res.status(500).json({ message: 'Error al verificar el código.' });
    }
  });

  // --- Setup: genera un secret nuevo + QR. NO activa todavía. ---------------
  app.post('/api/auth/2fa/setup', express.json(), async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const user = await sdk.authenticateRequest(req as any);
      if (!user) return res.status(401).json({ message: 'Sesión requerida.' });
      if (user.twoFactorEnabled) {
        return res.status(409).json({
          message: '2FA ya está activado en tu cuenta. Desactivalo antes de reconfigurar.',
        });
      }
      const secret = generate2faSecret();
      const otpauthUrl = getOtpAuthUrl(user.email, secret);
      const qrDataUrl = await getQrDataUrl(otpauthUrl);
      await setUserTwoFactorPending(user.id, secret);
      return res.json({
        success: true,
        secretBase32: secret,
        otpauthUrl,
        qrDataUrl,
      });
    } catch (err) {
      console.error('[2fa/setup] error:', err);
      return res.status(500).json({ message: 'No se pudo iniciar el setup de 2FA.' });
    }
  });

  // --- Enable: confirma con un código válido y activa 2FA -------------------
  // Requiere re-confirmar password para que si un atacante roba una sesión
  // activa no pueda bindear su propio authenticator al vuelo.
  app.post('/api/auth/2fa/enable', express.json(), async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const authUser = await sdk.authenticateRequest(req as any);
      if (!authUser) return res.status(401).json({ message: 'Sesión requerida.' });

      const code = String(req.body?.code || '').replace(/\D/g, '');
      const password = String(req.body?.password || '');
      if (!code || code.length !== 6) {
        return res.status(400).json({ message: 'Ingresá el código de 6 dígitos generado por tu app.' });
      }
      if (!password) {
        return res.status(400).json({ message: 'Necesitamos tu contraseña actual para confirmar.' });
      }

      const user = await getUserById(authUser.id);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
      if (user.twoFactorEnabled) {
        return res.status(409).json({ message: '2FA ya está activado.' });
      }
      if (!user.twoFactorPendingSecret) {
        return res.status(400).json({ message: 'No hay un setup pendiente. Iniciá el flow desde el principio.' });
      }

      const verify = verifyStoredPassword(password, user.passwordHash);
      if (!verify.ok) {
        return res.status(401).json({ message: 'Contraseña incorrecta.' });
      }

      if (!verifyTotp(user.twoFactorPendingSecret, code)) {
        return res.status(401).json({ message: 'Código inválido. Asegurate que la hora del dispositivo esté sincronizada.' });
      }

      const backupCodes = generateBackupCodes();
      const backupHashes = backupCodes.map(hashBackupCode);
      await enableUserTwoFactor(user.id, user.twoFactorPendingSecret, backupHashes);

      try {
        await createAuditLog({
          userId: user.id,
          actorName: user.characterName || user.name || user.email,
          actorRole: user.role || 'user',
          action: '2FA_ENABLED',
          details: `2FA TOTP activado`,
        });
      } catch { /* ignore */ }

      return res.json({
        success: true,
        message: '2FA activado correctamente.',
        backupCodes, // <-- única vez que se muestran en claro
      });
    } catch (err) {
      console.error('[2fa/enable] error:', err);
      return res.status(500).json({ message: 'No se pudo activar 2FA.' });
    }
  });

  // --- Disable: apaga 2FA. Requiere password + código TOTP activo. ----------
  app.post('/api/auth/2fa/disable', express.json(), async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const authUser = await sdk.authenticateRequest(req as any);
      if (!authUser) return res.status(401).json({ message: 'Sesión requerida.' });

      const password = String(req.body?.password || '');
      const code = String(req.body?.code || '').trim();
      if (!password || !code) {
        return res.status(400).json({ message: 'Contraseña y código son requeridos.' });
      }

      const user = await getUserById(authUser.id);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return res.status(409).json({ message: '2FA no está activo en esta cuenta.' });
      }

      const verify = verifyStoredPassword(password, user.passwordHash);
      if (!verify.ok) {
        return res.status(401).json({ message: 'Contraseña incorrecta.' });
      }

      // Aceptamos TOTP o backup code para desactivar (si el user perdió el
      // dispositivo necesita poder apagarlo con un backup code).
      let ok = false;
      if (/^\d{6}$/.test(code) && verifyTotp(user.twoFactorSecret, code)) {
        ok = true;
      } else {
        const normalized = normalizeBackupCode(code);
        if (normalized.length >= 10) {
          const candidateHash = hashBackupCode(normalized);
          if (await consumeBackupCodeHash(user.id, candidateHash)) ok = true;
        }
      }
      if (!ok) {
        return res.status(401).json({ message: 'Código inválido.' });
      }

      await disableUserTwoFactor(user.id);
      try {
        await createAuditLog({
          userId: user.id,
          actorName: user.characterName || user.name || user.email,
          actorRole: user.role || 'user',
          action: '2FA_DISABLED',
          details: `2FA TOTP desactivado`,
        });
      } catch { /* ignore */ }

      return res.json({ success: true, message: '2FA desactivado.' });
    } catch (err) {
      console.error('[2fa/disable] error:', err);
      return res.status(500).json({ message: 'No se pudo desactivar 2FA.' });
    }
  });

  // --- Status: expone si está activo + cuántos backup codes quedan ----------
  app.get('/api/auth/2fa/status', async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const authUser = await sdk.authenticateRequest(req as any);
      if (!authUser) return res.status(401).json({ message: 'Sesión requerida.' });
      const user = await getUserById(authUser.id);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
      return res.json({
        success: true,
        enabled: Boolean(user.twoFactorEnabled),
        backupCodesRemaining: Array.isArray(user.twoFactorBackupCodeHashes)
          ? user.twoFactorBackupCodeHashes.length
          : 0,
      });
    } catch (err) {
      return res.status(500).json({ message: 'Error al consultar estado.' });
    }
  });

  // ============================================================
  // PR5 — Forgot password + reset password + email verification
  // ============================================================
  //
  // Rate limit para todo este conjunto: reusamos la cola per-IP del login
  // (loginAttemptsByIp) porque queremos una protección común ante spam.
  // Un atacante no podría usar /forgot-password para enumerar mails si lo
  // throttleamos igual que el login.
  //
  // Notas de seguridad:
  //   - /forgot-password SIEMPRE responde 200 "si existe, enviamos email".
  //     Nunca revela si un email está registrado (protección contra
  //     enumeración).
  //   - Tokens son sha256(randomBytes(32)) almacenados hasheados. Link con
  //     el token plano solo se envía por email.
  //   - Al consumir un token de reset exitosamente, reseteamos los intentos
  //     fallidos de login (el user ya probó su identidad vía email).
  //   - Los endpoints son todos rate-limited por IP (misma ventana que
  //     login → max 20 intentos / 15 min).

  function rateLimitedOrRespond(req: express.Request, res: express.Response): boolean {
    const ip = getClientIp(req);
    const rate = checkIpRateLimit(ip);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({
        message: `Demasiados intentos desde esta IP. Probá de nuevo en ${Math.ceil(rate.retryAfterSec / 60)} min.`,
      });
      return true;
    }
    trackIpAttempt(ip);
    return false;
  }

  // Purgar tokens vencidos periódicamente (una vez por día además de al startup)
  pruneExpiredAuthTokens();
  setInterval(() => {
    try { pruneExpiredAuthTokens(); } catch (err) { console.error('[auth] pruneExpiredAuthTokens error:', err); }
  }, 24 * 60 * 60 * 1000).unref?.();

  // ---- Forgot password: solicita el email de reset --------------------------
  app.post('/api/auth/forgot-password', express.json(), async (req, res) => {
    if (rateLimitedOrRespond(req, res)) return;
    const ip = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();

    try {
      // Respuesta genérica — NO distinguimos si el email existe o no (evita
      // enumeración). Igual validamos el formato básico para no disparar el
      // mail loop si vino basura.
      if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
        return res.status(400).json({ message: 'Email inválido' });
      }

      const user = await getUserByEmail(emailRaw);
      if (user && user.isActive !== false) {
        const { issued, throttled } = await issuePasswordResetToken({
          userId: user.id,
          email: user.email,
          ip,
          userAgent,
        });
        if (issued) {
          const result = await sendPasswordResetEmail(user.email, issued.rawToken);
          try {
            await createAuditLog({
              userId: user.id,
              actorName: user.characterName || user.name || user.email,
              actorRole: user.role || 'user',
              action: result.ok ? 'PASSWORD_RESET_REQUESTED' : 'PASSWORD_RESET_EMAIL_FAILED',
              details: `IP=${ip} · UA="${userAgent}"${result.ok ? '' : ` · err=${result.error}`}`,
            });
          } catch { /* ignore */ }
        } else if (throttled) {
          try {
            await createAuditLog({
              userId: user.id,
              actorName: user.characterName || user.name || user.email,
              actorRole: user.role || 'user',
              action: 'PASSWORD_RESET_THROTTLED',
              details: `Reintento rápido de reset · IP=${ip}`,
            });
          } catch { /* ignore */ }
        }
      } else {
        // Log del intento contra email inexistente (útil para detectar probing)
        try {
          await createAuditLog({
            userId: null,
            actorName: emailRaw,
            actorRole: 'anonymous',
            action: 'PASSWORD_RESET_REQUESTED',
            details: `Email inexistente o inactivo · IP=${ip} · UA="${userAgent}"`,
          });
        } catch { /* ignore */ }
      }

      // Respuesta SIEMPRE idéntica.
      return res.json({
        success: true,
        message: 'Si el email está registrado, te enviamos un enlace para restablecer la contraseña. Revisá tu bandeja de entrada.',
      });
    } catch (error) {
      console.error('[auth/forgot-password] error:', error);
      return res.json({
        success: true,
        message: 'Si el email está registrado, te enviamos un enlace para restablecer la contraseña.',
      });
    }
  });

  // ---- Reset password: consume el token y setea nueva contraseña -----------
  app.post('/api/auth/reset-password', express.json(), async (req, res) => {
    if (rateLimitedOrRespond(req, res)) return;
    const ip = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);

    try {
      const token = String(req.body?.token || '').trim();
      const newPassword = String(req.body?.password || '');
      if (!token) {
        return res.status(400).json({ message: 'Token inválido' });
      }
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
      }

      const consumed = await consumePasswordResetToken(token);
      if (!consumed.ok || !consumed.userId) {
        const msg = consumed.reason === 'expired'
          ? 'El enlace expiró. Solicitá uno nuevo.'
          : consumed.reason === 'used'
            ? 'Este enlace ya fue usado. Solicitá uno nuevo si querés volver a resetear.'
            : 'Enlace inválido. Solicitá uno nuevo.';
        return res.status(400).json({ message: msg });
      }

      const user = await getUserById(consumed.userId);
      if (!user || user.isActive === false) {
        return res.status(400).json({ message: 'No se puede resetear esta cuenta.' });
      }

      const newHash = await hashPassword(newPassword);
      await updateUserPassword(user.id, newHash);
      // Tras reset exitoso: liberamos cualquier lockout/intentos previos
      // (el user probó identidad vía email → merece entrar).
      await resetLoginAttempts(user.id);

      try {
        await createAuditLog({
          userId: user.id,
          actorName: user.characterName || user.name || user.email,
          actorRole: user.role || 'user',
          action: 'PASSWORD_RESET_COMPLETED',
          details: `Contraseña cambiada vía reset · IP=${ip} · UA="${userAgent}"`,
        });
      } catch { /* ignore */ }

      return res.json({ success: true, message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
    } catch (error) {
      console.error('[auth/reset-password] error:', error);
      return res.status(500).json({ message: 'Error al restablecer la contraseña' });
    }
  });

  // ---- Verify email: consume token y marca emailVerified=true --------------
  app.post('/api/auth/verify-email', express.json(), async (req, res) => {
    if (rateLimitedOrRespond(req, res)) return;
    const ip = getClientIp(req);

    try {
      const token = String(req.body?.token || '').trim();
      if (!token) {
        return res.status(400).json({ message: 'Token inválido' });
      }

      const consumed = await consumeEmailVerificationToken(token);
      if (!consumed.ok || !consumed.userId) {
        const msg = consumed.reason === 'expired'
          ? 'El enlace de verificación expiró. Solicitá uno nuevo desde tu perfil.'
          : consumed.reason === 'used'
            ? 'Este enlace ya fue usado.'
            : 'Enlace de verificación inválido.';
        return res.status(400).json({ message: msg });
      }

      const user = await markUserEmailVerified(consumed.userId);
      if (!user) {
        return res.status(400).json({ message: 'Usuario no encontrado' });
      }

      try {
        await createAuditLog({
          userId: user.id,
          actorName: user.characterName || user.name || user.email,
          actorRole: user.role || 'user',
          action: 'EMAIL_VERIFIED',
          details: `Email verificado · IP=${ip}`,
        });
      } catch { /* ignore */ }

      return res.json({
        success: true,
        message: 'Email verificado correctamente.',
        user: {
          id: user.id,
          email: user.email,
          emailVerified: true,
        },
      });
    } catch (error) {
      console.error('[auth/verify-email] error:', error);
      return res.status(500).json({ message: 'Error al verificar el email' });
    }
  });

  // ---- Resend verification: regenera token y lo envía al usuario logueado --
  app.post('/api/auth/resend-verification', async (req, res) => {
    if (rateLimitedOrRespond(req, res)) return;
    const ip = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);

    try {
      const { sdk } = await import("./sdk");
      let sessionUser: any;
      try {
        sessionUser = await sdk.authenticateRequest(req as any);
      } catch {
        return res.status(401).json({ message: 'Sesión no válida' });
      }
      const user = await getUserById(sessionUser.id);
      if (!user) return res.status(401).json({ message: 'Sesión no válida' });
      if (user.emailVerified === true) {
        return res.json({ success: true, message: 'Tu email ya estaba verificado.' });
      }

      const { issued, throttled } = await issueEmailVerificationToken({
        userId: user.id,
        email: user.email,
        ip,
        userAgent,
      });
      if (throttled) {
        return res.status(429).json({
          message: 'Recién enviamos un email. Esperá un momento antes de reintentar.',
        });
      }
      if (!issued) {
        return res.status(500).json({ message: 'No se pudo generar el enlace de verificación.' });
      }
      const result = await sendEmailVerificationEmail(user.email, issued.rawToken);
      if (!result.ok) {
        try {
          await createAuditLog({
            userId: user.id,
            actorName: user.characterName || user.name || user.email,
            actorRole: user.role || 'user',
            action: 'EMAIL_VERIFICATION_SEND_FAILED',
            details: `err=${result.error} · IP=${ip}`,
          });
        } catch { /* ignore */ }
        return res.status(500).json({ message: 'No se pudo enviar el email. Probá en unos minutos.' });
      }
      try {
        await createAuditLog({
          userId: user.id,
          actorName: user.characterName || user.name || user.email,
          actorRole: user.role || 'user',
          action: 'EMAIL_VERIFICATION_RESENT',
          details: `IP=${ip}`,
        });
      } catch { /* ignore */ }
      return res.json({ success: true, message: 'Email de verificación reenviado.' });
    } catch (error) {
      console.error('[auth/resend-verification] error:', error);
      return res.status(500).json({ message: 'Error al reenviar email' });
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

  // Servir imágenes de evidencia del clan fund
  const evidencePath = path.resolve(process.cwd(), "uploads", "clan-evidence");
  app.use("/api/clan-evidence", express.static(evidencePath));

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
