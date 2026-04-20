import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Loader2, CheckCircle2, XCircle, MailCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Pantalla que consume el token de verificación de email.
// Auto-ejecuta el POST al montar (una sola vez — StrictMode en dev monta
// dos veces así que guardamos un ref para evitar double-consume).
export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ token: string }>('/verify-email/:token');
  const token = params?.token || '';
  const { refresh } = useAuth();

  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState<string>('');
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (!token) {
      setStatus('error');
      setMessage('Enlace inválido.');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus('error');
          setMessage(data?.message || 'No se pudo verificar el email.');
          return;
        }
        setStatus('ok');
        setMessage(data?.message || 'Email verificado correctamente.');
        // Si el usuario ya estaba logueado, refrescamos el estado para
        // reflejar emailVerified=true sin requerir re-login.
        try { await refresh(); } catch { /* ignore */ }
      } catch {
        setStatus('error');
        setMessage('Error de conexión. Reintentá en unos segundos.');
      }
    })();
  }, [token, refresh]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(circle at 10% 10%, rgba(123,241,214,0.06) 0%, transparent 30%), radial-gradient(circle at 90% 20%, rgba(232,121,249,0.06) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(232,121,249,0.2))',
                border: '1px solid rgba(123,241,214,0.3)',
              }}
            >
              <MailCheck size={22} style={{ color: '#7bf1d6' }} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-2">Verificar email</h1>
        </div>

        <div
          className="rounded-2xl border p-8 text-center"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderColor: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {status === 'pending' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: '#7bf1d6' }} />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Validando tu enlace…
              </p>
            </div>
          )}
          {status === 'ok' && (
            <div className="flex flex-col items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'rgba(123,241,214,0.15)', border: '1px solid rgba(123,241,214,0.3)' }}
              >
                <CheckCircle2 size={26} style={{ color: '#7bf1d6' }} />
              </div>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {message}
              </p>
              <button
                onClick={() => setLocation('/')}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition mt-2"
                style={{
                  background: 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(123,241,214,0.15))',
                  color: '#7bf1d6',
                  border: '1px solid rgba(123,241,214,0.3)',
                }}
              >
                Ir al Dashboard
              </button>
            </div>
          )}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <XCircle size={26} style={{ color: 'rgba(252, 165, 165, 0.95)' }} />
              </div>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {message}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setLocation('/')}
                  className="rounded-xl px-4 py-2 text-sm font-semibold transition"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.75)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  Ir al Dashboard
                </button>
                <button
                  onClick={() => setLocation('/login')}
                  className="rounded-xl px-4 py-2 text-sm font-semibold transition"
                  style={{
                    background: 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(123,241,214,0.15))',
                    color: '#7bf1d6',
                    border: '1px solid rgba(123,241,214,0.3)',
                  }}
                >
                  Ir al Login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
