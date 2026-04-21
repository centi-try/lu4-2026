// ============================================================================
// Two-Factor Authentication (TOTP) - PR6
// ============================================================================
// Wrapea otplib v13 (API funcional) + qrcode para emitir/verificar códigos
// TOTP estilo Google Authenticator/Authy/1Password. Mantiene la API chica
// para que el resto del backend no tenga que conocer detalles de la librería.
//
// Decisiones:
//  - Algoritmo TOTP estándar (SHA1, 30s, 6 dígitos) → soportado por todas las
//    apps autenticadoras populares.
//  - window=1 al verificar → tolera ±30s de skew de reloj (1 paso antes y 1
//    paso después del actual). No subimos más para no degradar seguridad.
//  - Issuer fijo "RaptorSquad" para que la app del user vea el nombre lindo.
//  - Backup codes: 8 códigos de 10 chars alfanuméricos, hash sha256 al guardar.
//    Cada uno es de un solo uso.
//  - Challenge token: HMAC-SHA256 sobre JSON payload con exp. Sin dep extra.
// ============================================================================
import crypto from 'crypto';
import { generateSecret as otpGenerateSecret, generateURI, verifySync } from 'otplib';
import qrcode from 'qrcode';

const ISSUER = 'RaptorSquad';
const TOTP_STEP = 30;
const TOTP_DIGITS = 6;
const TOTP_TOLERANCE_SEC = 30; // ±30s de skew permitido
const CHALLENGE_TTL_SEC = 5 * 60;
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LEN = 10;

export function generateSecret(): string {
  return otpGenerateSecret();
}

export function getOtpAuthUrl(accountLabel: string, secret: string): string {
  return generateURI({
    strategy: 'totp',
    issuer: ISSUER,
    label: accountLabel,
    secret,
    algorithm: 'sha1',
    digits: TOTP_DIGITS,
    period: TOTP_STEP,
  });
}

export async function getQrDataUrl(otpauthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#0b0f16', light: '#ffffff' },
  });
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  const cleaned = String(token).replace(/\D/g, '');
  if (cleaned.length !== TOTP_DIGITS) return false;
  try {
    const result = verifySync({
      strategy: 'totp',
      secret,
      token: cleaned,
      algorithm: 'sha1',
      digits: TOTP_DIGITS,
      period: TOTP_STEP,
      epochTolerance: TOTP_TOLERANCE_SEC,
    });
    return Boolean(result && (result as any).valid);
  } catch {
    return false;
  }
}

// ----- Backup codes -----

export function generateBackupCodes(): string[] {
  // Charset sin caracteres ambiguos (sin 0/O/1/I/l).
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let s = '';
    const bytes = crypto.randomBytes(BACKUP_CODE_LEN);
    for (let j = 0; j < BACKUP_CODE_LEN; j++) {
      s += charset[bytes[j] % charset.length];
    }
    codes.push(`${s.slice(0, 5)}-${s.slice(5)}`);
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}

export function normalizeBackupCode(code: string): string {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// ----- Challenge token (paso 1 → paso 2) -----
// HMAC-SHA256 sobre base64url(payload). Self-contained, sin deps extra.

interface ChallengePayload {
  uid: number;
  rm: boolean;
  pur: '2fa-login';
  exp: number; // epoch seconds
}

function getChallengeSecret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-me';
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  return Buffer.from(padded + '='.repeat(pad ? 4 - pad : 0), 'base64');
}

export function generateChallengeToken(userId: number, rememberMe: boolean): string {
  const payload: ChallengePayload = {
    uid: userId,
    rm: !!rememberMe,
    pur: '2fa-login',
    exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', getChallengeSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyChallengeToken(token: string): { userId: number; rememberMe: boolean } | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = b64url(crypto.createHmac('sha256', getChallengeSecret()).update(body).digest());
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as ChallengePayload;
    if (payload.pur !== '2fa-login') return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    return { userId: Number(payload.uid), rememberMe: !!payload.rm };
  } catch {
    return null;
  }
}
