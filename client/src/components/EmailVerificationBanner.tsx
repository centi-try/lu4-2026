import React, { useState } from 'react';
import { Mail, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

// Banner que aparece sobre el contenido principal cuando el user logueado
// no tiene verificado su email. Tiene un botón "Reenviar email" que llama
// a /api/auth/resend-verification. Permite descartar la alerta por la
// sesión actual (el flag emailVerified sigue siendo false; es solo UI).
export default function EmailVerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  // Solo mostramos si hay user logueado Y emailVerified es explícitamente
  // false. Undefined significa "user viejo antes de PR5" → no molestamos.
  if (!user) return null;
  if (user.emailVerified !== false) return null;
  if (dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || 'No se pudo reenviar el email');
        return;
      }
      toast.success(data?.message || 'Email de verificación enviado. Revisá tu bandeja.');
    } catch {
      toast.error('Error de conexión');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-2.5 mb-4"
      style={{
        background: 'rgba(250, 204, 21, 0.08)',
        borderColor: 'rgba(250, 204, 21, 0.35)',
        color: 'rgba(254, 243, 199, 0.95)',
      }}
      role="alert"
    >
      <Mail size={18} style={{ color: 'rgba(250, 204, 21, 0.95)' }} className="shrink-0" />
      <div className="flex-1 text-sm">
        <strong className="font-semibold">Verifica tu email.</strong>{' '}
        <span className="opacity-90">
          Te enviamos un link a <span className="font-mono">{user.email}</span>. Confirmalo para
          asegurar el acceso a tu cuenta.
        </span>
      </div>
      <button
        onClick={resend}
        disabled={sending}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition inline-flex items-center gap-1.5"
        style={{
          background: 'rgba(250, 204, 21, 0.18)',
          border: '1px solid rgba(250, 204, 21, 0.35)',
          color: 'rgba(254, 243, 199, 0.98)',
          cursor: sending ? 'not-allowed' : 'pointer',
        }}
      >
        {sending && <Loader2 size={12} className="animate-spin" />}
        {sending ? 'Enviando…' : 'Reenviar email'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="rounded-lg p-1.5 transition hover:bg-white/10"
        style={{ color: 'rgba(254, 243, 199, 0.75)' }}
        aria-label="Cerrar aviso"
        title="Cerrar aviso"
      >
        <X size={14} />
      </button>
    </div>
  );
}
