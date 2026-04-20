import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 6;
const MIN_CHARACTER_LEN = 2;

export default function Register() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState<{
    email: boolean;
    character: boolean;
    password: boolean;
    confirm: boolean;
  }>({ email: false, character: false, password: false, confirm: false });

  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  const emailError = useMemo(() => {
    if (!email) return 'El email es requerido';
    if (!EMAIL_REGEX.test(email.trim())) return 'Formato de email inválido';
    return null;
  }, [email]);

  const characterError = useMemo(() => {
    if (!characterName.trim()) return 'Nombre de personaje requerido';
    if (characterName.trim().length < MIN_CHARACTER_LEN)
      return `Mínimo ${MIN_CHARACTER_LEN} caracteres`;
    return null;
  }, [characterName]);

  const passwordError = useMemo(() => {
    if (!password) return 'La contraseña es requerida';
    if (password.length < MIN_PASSWORD_LEN) return `Mínimo ${MIN_PASSWORD_LEN} caracteres`;
    return null;
  }, [password]);

  const confirmError = useMemo(() => {
    if (!confirmPassword) return 'Confirmá la contraseña';
    if (password && password !== confirmPassword) return 'Las contraseñas no coinciden';
    return null;
  }, [confirmPassword, password]);

  const formValid = !emailError && !characterError && !passwordError && !confirmError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setTouched({ email: true, character: true, password: true, confirm: true });
    if (!formValid) return;

    setLoading(true);
    try {
      await register(email.trim(), password, characterName.trim());
      toast.success('¡Registro exitoso! Iniciando sesión...');
      setLocation('/');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'input-dark';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gradient mb-2">Inventario</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Control Dashboard
          </p>
        </div>

        <div className="card-glass p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-white mb-6">Crear Cuenta</h2>

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
              <label htmlFor="register-email" className="block text-sm font-medium text-white mb-2">
                Correo Electrónico
              </label>
              <input
                ref={emailInputRef}
                id="register-email"
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
                className={inputClass}
                disabled={loading}
                aria-invalid={touched.email && !!emailError}
              />
              {touched.email && emailError && (
                <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="register-character" className="block text-sm font-medium text-white mb-2">
                Nombre del Personaje
              </label>
              <input
                id="register-character"
                name="username"
                type="text"
                autoComplete="nickname"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, character: true }))}
                placeholder="Tu personaje..."
                className={inputClass}
                disabled={loading}
                aria-invalid={touched.character && !!characterError}
              />
              {touched.character && characterError && (
                <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                  {characterError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-white mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder="••••••••"
                  className={`${inputClass} pr-12`}
                  disabled={loading}
                  aria-invalid={touched.password && !!passwordError}
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
              {touched.password && passwordError && (
                <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                  {passwordError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="register-confirm" className="block text-sm font-medium text-white mb-2">
                Confirmar Contraseña
              </label>
              <div className="relative">
                <input
                  id="register-confirm"
                  name="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                  placeholder="••••••••"
                  className={`${inputClass} pr-12`}
                  disabled={loading}
                  aria-invalid={touched.confirm && !!confirmError}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  disabled={loading}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {touched.confirm && confirmError && (
                <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                  {confirmError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Registrando...' : 'Crear Cuenta'}
            </button>
          </form>

          <div
            className="text-center mt-6 pt-6 border-t"
            style={{ borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              ¿Ya tienes cuenta?{' '}
              <button
                onClick={() => setLocation('/login')}
                className="text-gradient font-semibold hover:opacity-80 transition"
              >
                Inicia sesión aquí
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
