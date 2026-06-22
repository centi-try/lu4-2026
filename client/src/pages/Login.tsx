import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Regex de validación mínima de formato de email. El backend ya re-valida.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, verify2fa } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Estado del paso 2FA (si el server devolvió requires2fa=true).
  const [twoFa, setTwoFa] = useState<{
    challengeToken: string;
    backupCodesRemaining: number;
  } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  // autoFocus al montar (evita click extra del user).
  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  // Cuando entramos al paso 2FA, enfocamos el input del código.
  useEffect(() => {
    if (twoFa) otpInputRef.current?.focus();
  }, [twoFa]);

  // Validación inline (sin submit). Se muestra solo si el field ya fue tocado
  // (evita mensajes rojos apenas carga la página).
  const emailError = useMemo(() => {
    if (!email) return 'El email es requerido';
    if (!EMAIL_REGEX.test(email.trim())) return 'Formato de email inválido';
    return null;
  }, [email]);
  const passwordError = useMemo(() => {
    if (!password) return 'La contraseña es requerida';
    return null;
  }, [password]);

  const formValid = !emailError && !passwordError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setTouched({ email: true, password: true });
    if (!formValid) return;

    setLoading(true);
    try {
      const result = await login(email.trim(), password, rememberMe);
      if (result.kind === '2fa') {
        // El server pide un segundo paso. Pasamos al screen de OTP.
        setTwoFa({
          challengeToken: result.challengeToken,
          backupCodesRemaining: result.backupCodesRemaining,
        });
        setOtpCode('');
        setOtpError(null);
        setUseBackupCode(false);
        return;
      }
      toast.success('¡Sesión iniciada!');
      setLocation('/');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      // Mostramos el error del backend tanto como banner inline como toast.
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFa) return;
    setOtpError(null);
    const cleaned = useBackupCode
      ? otpCode.trim()
      : otpCode.replace(/\D/g, '');
    if (!cleaned) {
      setOtpError('Ingresa el código.');
      return;
    }
    if (!useBackupCode && cleaned.length !== 6) {
      setOtpError('El código debe tener 6 dígitos.');
      return;
    }
    setLoading(true);
    try {
      await verify2fa(twoFa.challengeToken, cleaned);
      toast.success('¡Sesión iniciada!');
      setLocation('/');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      setOtpError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const cancelTwoFa = () => {
    setTwoFa(null);
    setOtpCode('');
    setOtpError(null);
    setUseBackupCode(false);
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
    <div className="min-h-screen flex" style={{ background: '#060910' }}>
      {/* Left side: Raptor image (hidden on mobile) */}
      <div
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center"
        style={{ background: '#040608' }}
      >
        <img
          src="/raptor-login-bg.png"
          alt="RaptorSquad"
          className="w-full h-full object-contain"
          style={{ maxHeight: '100vh' }}
        />
      </div>

      {/* Right side: Login form */}
      <div
        className="w-full lg:w-1/2 flex items-center justify-center p-6 relative"
        style={{
          background: 'radial-gradient(circle at 50% 20%, rgba(123,241,214,0.04) 0%, transparent 50%), #060910',
        }}
      >
        {/* Mobile background (visible only on small screens) */}
        <div
          className="absolute inset-0 lg:hidden"
          style={{
            backgroundImage: 'url(/raptor-login-bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15,
          }}
        />

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gradient mb-1">RaptorSquad</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Control Dashboard · Sistema de Gestión
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
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.95)' }}>
            {twoFa && <ShieldCheck size={20} style={{ color: '#7bf1d6' }} />}
            {twoFa ? 'Verificación en dos pasos' : 'Iniciar Sesión'}
          </h2>

          {twoFa ? (
            <form onSubmit={handleOtpSubmit} className="space-y-4" noValidate>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {useBackupCode
                  ? 'Ingresa uno de tus códigos de respaldo (formato XXXXX-XXXXX).'
                  : 'Abre tu app de autenticación (Google Authenticator, Authy, 1Password…) e ingresa el código de 6 dígitos que muestra para tu cuenta.'}
              </p>

              <div>
                <label
                  htmlFor="login-otp"
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  {useBackupCode ? 'Código de respaldo' : 'Código de 6 dígitos'}
                </label>
                <input
                  ref={otpInputRef}
                  id="login-otp"
                  name="otp"
                  type="text"
                  inputMode={useBackupCode ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={useBackupCode ? 16 : 6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder={useBackupCode ? 'XXXXX-XXXXX' : '000000'}
                  className="w-full rounded-xl border bg-transparent px-4 py-3 text-center text-lg tracking-[0.4em] outline-none transition-all placeholder:text-white/20 font-mono"
                  style={otpError ? inputErrorStyle : inputStyle}
                  disabled={loading}
                  aria-invalid={!!otpError}
                />
                {otpError && (
                  <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                    {otpError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2"
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
                {loading ? 'Verificando...' : 'Verificar código'}
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={cancelTwoFa}
                  disabled={loading}
                  className="flex items-center gap-1 text-sm font-medium transition hover:opacity-80"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  <ArrowLeft size={14} /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode((v) => !v);
                    setOtpCode('');
                    setOtpError(null);
                  }}
                  disabled={loading}
                  className="text-sm font-medium transition hover:opacity-80"
                  style={{ color: '#7bf1d6' }}
                >
                  {useBackupCode ? 'Usar código de la app' : '¿Perdiste tu dispositivo? Usar código de respaldo'}
                </button>
              </div>

              {twoFa.backupCodesRemaining <= 2 && twoFa.backupCodesRemaining > 0 && (
                <p className="text-xs" style={{ color: 'rgba(252, 211, 77, 0.9)' }}>
                  Te quedan {twoFa.backupCodesRemaining} {twoFa.backupCodesRemaining === 1 ? 'código de respaldo' : 'códigos de respaldo'}. Regenerá nuevos desde Ajustes después de iniciar sesión.
                </p>
              )}
            </form>
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
                htmlFor="login-email"
                className="block text-sm font-medium mb-2"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                Correo Electrónico
              </label>
              <input
                ref={emailInputRef}
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="tu@email.com"
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
                style={touched.email && emailError ? inputErrorStyle : inputStyle}
                disabled={loading}
                aria-invalid={touched.email && !!emailError}
                aria-describedby={touched.email && emailError ? 'login-email-err' : undefined}
              />
              {touched.email && emailError && (
                <p id="login-email-err" className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium mb-2"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder="••••••••"
                  className="w-full rounded-xl border bg-transparent px-4 py-2.5 pr-12 text-sm outline-none transition-all placeholder:text-white/30"
                  style={touched.password && passwordError ? inputErrorStyle : inputStyle}
                  disabled={loading}
                  aria-invalid={touched.password && !!passwordError}
                  aria-describedby={touched.password && passwordError ? 'login-password-err' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {touched.password && passwordError && (
                <p id="login-password-err" className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                  {passwordError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <label
                className="flex items-center gap-2 cursor-pointer select-none"
                style={{ color: 'rgba(255,255,255,0.65)' }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded cursor-pointer"
                  style={{ accentColor: '#7bf1d6' }}
                />
                <span className="text-sm">Recordarme (30 días)</span>
              </label>
              <button
                type="button"
                onClick={() => setLocation('/forgot-password')}
                disabled={loading}
                className="text-sm font-medium transition hover:opacity-80"
                style={{ color: '#7bf1d6' }}
              >
                ¿Olvidaste tu contraseña?
              </button>
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
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div
            className="text-center mt-5 pt-5 border-t"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              ¿No tienes cuenta?{' '}
              <button
                onClick={() => setLocation('/register')}
                className="font-semibold transition hover:opacity-80"
                style={{ color: '#7bf1d6' }}
              >
                Registrarse aquí
              </button>
            </p>
          </div>
          </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
