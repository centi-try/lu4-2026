import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, KeyRound, CheckCircle2, ArrowLeft } from 'lucide-react';

// Pantalla de reset de password. El token se toma de la URL
// /reset-password/:token. Backend lo valida + consume + actualiza hash.
export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ token: string }>('/reset-password/:token');
  const token = params?.token || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ p: boolean; c: boolean }>({ p: false, c: false });
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const passwordError = useMemo(() => {
    if (!password) return 'La contraseña es requerida';
    if (password.length < 6) return 'Mínimo 6 caracteres';
    return null;
  }, [password]);
  const confirmError = useMemo(() => {
    if (!confirm) return 'Confirmá tu contraseña';
    if (confirm !== password) return 'Las contraseñas no coinciden';
    return null;
  }, [confirm, password]);

  const formValid = !passwordError && !confirmError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ p: true, c: true });
    setSubmitError(null);
    if (!formValid || !token) {
      if (!token) setSubmitError('Enlace inválido');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.message || 'No se pudo restablecer la contraseña';
        setSubmitError(msg);
        toast.error(msg);
        return;
      }
      setSuccess(true);
      toast.success('Contraseña actualizada');
      // Redirigimos al login después de un toque para que el user lea.
      setTimeout(() => setLocation('/login'), 1500);
    } catch {
      setSubmitError('Error de conexión. Reintentá.');
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
              <KeyRound size={22} style={{ color: '#7bf1d6' }} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-2">Nueva contraseña</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Elegí una contraseña nueva para tu cuenta.
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
          {success ? (
            <div className="flex flex-col items-center text-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full mb-4"
                style={{ background: 'rgba(123,241,214,0.15)', border: '1px solid rgba(123,241,214,0.3)' }}
              >
                <CheckCircle2 size={26} style={{ color: '#7bf1d6' }} />
              </div>
              <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.85)' }}>
                Contraseña actualizada.
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Redirigiendo al login...
              </p>
            </div>
          ) : (
            <>
              {submitError && (
                <div
                  className="mb-4 rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor: 'rgba(239, 68, 68, 0.4)',
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: 'rgba(254, 202, 202, 0.95)',
                  }}
                  role="alert"
                >
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="rp-password"
                    className="block text-sm font-medium mb-2"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      ref={firstRef}
                      id="rp-password"
                      name="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, p: true }))}
                      placeholder="••••••••"
                      className="w-full rounded-xl border bg-transparent px-4 py-2.5 pr-12 text-sm outline-none transition-all placeholder:text-white/30"
                      style={touched.p && passwordError ? inputErrorStyle : inputStyle}
                      disabled={loading}
                      aria-invalid={touched.p && !!passwordError}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={loading}
                      tabIndex={-1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition hover:bg-white/5"
                      style={{ color: 'rgba(255,255,255,0.5)' }}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {touched.p && passwordError && (
                    <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                      {passwordError}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="rp-confirm"
                    className="block text-sm font-medium mb-2"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    Repetir contraseña
                  </label>
                  <input
                    id="rp-confirm"
                    name="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, c: true }))}
                    placeholder="••••••••"
                    className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
                    style={touched.c && confirmError ? inputErrorStyle : inputStyle}
                    disabled={loading}
                    aria-invalid={touched.c && !!confirmError}
                  />
                  {touched.c && confirmError && (
                    <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                      {confirmError}
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
                  {loading ? 'Guardando...' : 'Guardar contraseña'}
                </button>

                <button
                  type="button"
                  onClick={() => setLocation('/login')}
                  className="w-full text-xs font-medium transition hover:opacity-80 inline-flex items-center justify-center gap-1 pt-2"
                  style={{ color: 'rgba(255,255,255,0.55)' }}
                >
                  <ArrowLeft size={12} /> Cancelar y volver al login
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
