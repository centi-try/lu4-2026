import "dotenv/config";
import express from "express";
import http from "http";
import net from "net";
import crypto from "crypto";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { DEFAULT_SUPER_ADMIN_EMAIL, DEFAULT_SUPER_ADMIN_NAME, getDb, getUserByEmail, hashStoredPassword, upsertUser } from "../db";

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
  
  app.post('/api/auth/login', express.json(), async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!email || !password) {
        return res.status(400).json({ message: 'Email y contraseña requeridos' });
      }

      const db = await getDb();
      const usersTable = { name: 'users' };
      const result = await db.select().from(usersTable).where({ email }).limit(1);
      
      if (result.length === 0) {
        return res.status(401).json({ message: 'Usuario no encontrado' });
      }

      const user = result[0];

      // Middleware de seguridad: bloquear usuarios desactivados en el login
      if (user.isActive === false) {
        return res.status(403).json({ message: 'Tu cuenta ha sido desactivada. Contacta al administrador.' });
      }
      
      const passwordHash = await hashPassword(password);

      if (!user.passwordHash || user.passwordHash !== passwordHash) {
        return res.status(401).json({ message: 'Contraseña incorrecta' });
      }
      
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
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
