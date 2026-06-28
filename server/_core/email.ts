// ============================================================================
// Servicio de email (Resend)
// ============================================================================
// Wrappea el SDK de Resend detrás de una API chica y estable. Si no hay
// RESEND_API_KEY configurada (dev, tests), entra en modo "mock": en vez de
// enviar el email loguea el asunto + cuerpo + link a consola. De esta forma
// el flujo de password reset / verificación de email sigue siendo completamente
// testeable en local sin depender de infra externa.
//
// Dominio de envío:
//   - EMAIL_FROM override por env (ej. `noreply@tudominio.com`).
//   - Fallback a `onboarding@resend.dev` (sandbox público de Resend que no
//     requiere verificar dominio). Útil para desarrollo; en producción hay que
//     verificar el dominio propio en Resend para no disparar spam filters.
// ============================================================================
import { Resend } from 'resend';

const FROM_EMAIL = process.env.EMAIL_FROM || 'RaptorSquad <onboarding@resend.dev>';
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    resendClient = new Resend(apiKey);
    return resendClient;
  } catch (err) {
    console.error('[email] No se pudo inicializar Resend client:', err);
    return null;
  }
}

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getAppBaseUrl(): string {
  return APP_BASE_URL;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail(params: SendEmailParams): Promise<{ ok: boolean; error?: string }> {
  const client = getResendClient();
  if (!client) {
    // Modo mock: loguea en consola. El link de acción es lo único realmente
    // necesario en dev, lo hacemos fácil de copiar.
    console.log('─'.repeat(72));
    console.log(`[email MOCK] To: ${params.to}`);
    console.log(`[email MOCK] Subject: ${params.subject}`);
    console.log('[email MOCK] Body (text):');
    console.log(params.text);
    console.log('─'.repeat(72));
    return { ok: true };
  }
  try {
    const result = await client.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    if (result.error) {
      console.error('[email] Resend error:', result.error);
      return { ok: false, error: String(result.error.message || result.error) };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('[email] Excepción enviando email:', err);
    return { ok: false, error: String(err?.message || err) };
  }
}

// ============================================================================
// Templates
// ============================================================================
// Mantener simples — HTML inline-safe para mail clients (sin <style> externo).

function wrapLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#0b0f16;font-family:Segoe UI,Roboto,sans-serif;color:#e5e7eb">
    <div style="max-width:520px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 16px;font-size:22px;color:#7bf1d6">${title}</h1>
      ${bodyHtml}
      <p style="margin-top:32px;padding-top:16px;border-top:1px solid #1f2937;font-size:12px;color:#6b7280">
        RaptorSquad · Control Dashboard
      </p>
    </div>
  </body>
</html>`;
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const link = `${APP_BASE_URL}/reset-password/${encodeURIComponent(token)}`;
  const subject = 'Restablecé tu contraseña — RaptorSquad';
  const text = `Hola,

Recibimos una solicitud para restablecer la contraseña de tu cuenta.
Si fuiste vos, entrá al siguiente link para elegir una nueva contraseña (expira en 1 hora):

${link}

Si no fuiste vos, podés ignorar este mensaje — tu contraseña no cambió.

— RaptorSquad`;
  const html = wrapLayout(
    'Restablecer contraseña',
    `<p style="color:#d1d5db;line-height:1.55">Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
     <p style="color:#d1d5db;line-height:1.55">Si fuiste vos, hacé click en el siguiente botón para elegir una nueva contraseña. <strong style="color:#f3f4f6">El link expira en 1 hora.</strong></p>
     <p style="margin:24px 0">
       <a href="${link}" style="display:inline-block;padding:12px 24px;background:#7bf1d6;color:#0b0f16;border-radius:12px;text-decoration:none;font-weight:600">Restablecer contraseña</a>
     </p>
     <p style="color:#9ca3af;font-size:13px;line-height:1.55">O copiá este link en tu navegador:<br><span style="color:#7bf1d6;word-break:break-all">${link}</span></p>
     <p style="color:#6b7280;font-size:13px;line-height:1.55;margin-top:24px">Si no pediste este cambio, ignorá este mensaje — tu contraseña no cambió.</p>`,
  );
  return sendEmail({ to, subject, html, text });
}

export async function sendEmailVerificationEmail(
  to: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const link = `${APP_BASE_URL}/verify-email/${encodeURIComponent(token)}`;
  const subject = 'Confirmá tu email — RaptorSquad';
  const text = `Hola,

Para terminar de activar tu cuenta confirmá tu email haciendo click en el siguiente link (expira en 24 horas):

${link}

Si no creaste esta cuenta, podés ignorar este mensaje.

— RaptorSquad`;
  const html = wrapLayout(
    'Confirmá tu email',
    `<p style="color:#d1d5db;line-height:1.55">¡Bienvenido a RaptorSquad! Para terminar de activar tu cuenta, confirmá tu email haciendo click en el siguiente botón. <strong style="color:#f3f4f6">El link expira en 24 horas.</strong></p>
     <p style="margin:24px 0">
       <a href="${link}" style="display:inline-block;padding:12px 24px;background:#7bf1d6;color:#0b0f16;border-radius:12px;text-decoration:none;font-weight:600">Confirmar email</a>
     </p>
     <p style="color:#9ca3af;font-size:13px;line-height:1.55">O copiá este link en tu navegador:<br><span style="color:#7bf1d6;word-break:break-all">${link}</span></p>
     <p style="color:#6b7280;font-size:13px;line-height:1.55;margin-top:24px">Si no creaste esta cuenta, ignorá este mensaje.</p>`,
  );
  return sendEmail({ to, subject, html, text });
}
