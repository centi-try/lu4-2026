import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pantalla de solicitud de reset de password. Siempre muestra una
// respuesta genérica tras el submit (ok o no) para no filtrar si el
// email está registrado. El trabajo real lo hace el backend.
export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const emailError = useMemo(() => {
    if (!email) return 'El email es requerido';
    if (!EMAIL_REGEX.test(email.trim())) return 'Formato de email inválido';
    return null;
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (emailError) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // El backend valida formato; si llegó acá es un 400 explícito.
        setSubmittedMsg(data?.message || 'No se pudo procesar la solicitud');
      } else {
        // Respuesta genérica idéntica exista o no el email.
        setSubmittedMsg(data?.message || 'Si el email está registrado, te enviamos un enlace para restablecer la contraseña. Revisá tu bandeja de entrada.');
      }
    } catch {
      setSubmittedMsg('Error de conexión. Reintentá en unos segundos.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    borderColor: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.9)',
    background: 'rgba(255,255,255,0.04)',
  } as const;
  const inputErrorStyle = {
    borderColor: 'rgba(239, 68, 68, 0.6)',
    color: 'rgba(255,255,255,0.9)',
    background: 'rgba(239, 68, 68, 0.06)',
  } as const;

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
              <Mail size={24} style={{ color: '#7bf1d6' }} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-2">Restablecer contraseña</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Ingresá tu email y te enviamos un enlace para crear una nueva.
          </p>
        </div>

        <div
          className="rounded-2xl border p-8"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderColor: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {submittedMsg ? (
            <div className="flex flex-col items-center text-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full mb-4"
                style={{ background: 'rgba(123,241,214,0.15)', border: '1px solid rgba(123,241,214,0.3)' }}
              >
                <CheckCircle2 size={26} style={{ color: '#7bf1d6' }} />
              </div>
              <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {submittedMsg}
              </p>
              <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Revisá también la carpeta de spam. El enlace expira en 1 hora.
              </p>
              <button
                onClick={() => setLocation('/login')}
                className="text-sm font-semibold inline-flex items-center gap-2 transition hover:opacity-80"
                style={{ color: '#7bf1d6' }}
              >
                <ArrowLeft size={14} /> Volver al login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="fp-email"
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  Correo Electrónico
                </label>
                <input
                  ref={inputRef}
                  id="fp-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="tu@email.com"
                  className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
                  style={touched && emailError ? inputErrorStyle : inputStyle}
                  disabled={loading}
                  aria-invalid={touched && !!emailError}
                />
                {touched && emailError && (
                  <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                    {emailError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-all mt-2 flex items-center justify-center gap-2"
                style={{
                  background: loading
                    ? 'rgba(123,241,214,0.1)'
                    : 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(123,241,214,0.15))',
                  color: '#7bf1d6',
                  border: '1px solid rgba(123,241,214,0.3)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </button>

              <button
                type="button"
                onClick={() => setLocation('/login')}
                className="w-full text-xs font-medium transition hover:opacity-80 inline-flex items-center justify-center gap-1 pt-2"
                style={{ color: 'rgba(255,255,255,0.55)' }}
              >
                <ArrowLeft size={12} /> Volver al login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
