import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const CAROUSEL_IMAGES = ['/raptor-1.png', '/raptor-2.png', '/raptor-3.png'];
const CAROUSEL_INTERVAL = 10000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 6;
const MIN_CHARACTER_LEN = 2;

interface PublicClan { id: number; name: string; }
interface PublicCp { id: number; name: string; clanId: number; }
interface PublicClass { id: number; name: string; }

export default function Register() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState<{
    email: boolean;
    character: boolean;
    password: boolean;
    confirm: boolean;
    clan: boolean;
    cp: boolean;
    invitationCode: boolean;
  }>({ email: false, character: false, password: false, confirm: false, clan: false, cp: false, invitationCode: false });

  // Carousel state
  const [currentImg, setCurrentImg] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImg((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Clan & CP & Class selection
  const [clans, setClans] = useState<PublicClan[]>([]);
  const [commandParties, setCommandParties] = useState<PublicCp[]>([]);
  const [availableClasses, setAvailableClasses] = useState<PublicClass[]>([]);
  const [selectedClanId, setSelectedClanId] = useState<string>('');
  const [selectedCpId, setSelectedCpId] = useState<string>('');
  const [selectedClassMain, setSelectedClassMain] = useState<string>('');

  // Whether invitation code is required
  const [invitationCodeRequired, setInvitationCodeRequired] = useState(false);

  useEffect(() => {
    fetch('/api/public/clans-and-cps')
      .then(r => r.json())
      .then(data => {
        setClans(data.clans || []);
        setCommandParties(data.commandParties || []);
        setAvailableClasses(data.availableClasses || []);
      })
      .catch(() => {});

    fetch('/api/public/registration-info')
      .then(r => r.json())
      .then(data => {
        setInvitationCodeRequired(!!data.invitationCodeRequired);
      })
      .catch(() => {});
  }, []);

  const filteredCps = useMemo(() => {
    if (!selectedClanId) return [];
    return commandParties.filter(cp => cp.clanId === Number(selectedClanId));
  }, [commandParties, selectedClanId]);

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

  const clanError = useMemo(() => {
    if (clans.length === 0) return null;
    if (!selectedClanId) return 'Selecciona un clan';
    return null;
  }, [selectedClanId, clans]);

  const cpError = useMemo(() => {
    if (clans.length === 0) return null;
    if (!selectedClanId) return null;
    if (filteredCps.length === 0) return null;
    if (!selectedCpId) return 'Selecciona un CP';
    return null;
  }, [selectedCpId, selectedClanId, filteredCps, clans]);

  const invitationCodeError = useMemo(() => {
    if (!invitationCodeRequired) return null;
    if (!invitationCode.trim()) return 'El código de invitación es requerido';
    if (!/^\d{4}$/.test(invitationCode.trim())) return 'El código debe ser de 4 dígitos';
    return null;
  }, [invitationCode, invitationCodeRequired]);

  const formValid = !emailError && !characterError && !passwordError && !confirmError && !clanError && !cpError && !invitationCodeError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setTouched({ email: true, character: true, password: true, confirm: true, clan: true, cp: true, invitationCode: true });
    if (!formValid) return;

    setLoading(true);
    try {
      await register(
        email.trim(),
        password,
        characterName.trim(),
        selectedClanId ? Number(selectedClanId) : null,
        selectedCpId ? Number(selectedCpId) : null,
        selectedClassMain || null,
        invitationCode.trim() || null,
      );
      toast.success('¡Registro exitoso! Iniciando sesión...');
      setTimeout(() => setLocation('/'), 150);
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
    <div className="min-h-screen flex" style={{ background: '#060910' }}>
      {/* Left side: Raptor carousel (hidden on mobile) */}
      <div
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
        style={{ background: '#040608' }}
      >
        {CAROUSEL_IMAGES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={`RaptorSquad ${i + 1}`}
            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000"
            style={{ opacity: i === currentImg ? 1 : 0 }}
          />
        ))}
      </div>

      {/* Right side: Register form */}
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
            backgroundImage: `url(${CAROUSEL_IMAGES[currentImg]})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15,
          }}
        />

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl shadow-neon-cyan" style={{ background: 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(232,121,249,0.2))' }}>
                <span className="text-xl font-black" style={{ color: '#7bf1d6' }}>L2</span>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gradient mb-1">RaptorSquad</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Control Dashboard · Sistema de Gestión
            </p>
          </div>

        <div className="card-glass p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-white mb-6">Crear Cuenta</h2>

          {/* Invitation code warning */}
          {invitationCodeRequired && (
            <div
              className="mb-5 rounded-lg border px-3 py-2.5 text-xs flex items-start gap-2"
              style={{
                borderColor: 'rgba(251,191,36,0.3)',
                background: 'rgba(251,191,36,0.06)',
                color: 'rgba(253,224,71,0.9)',
              }}
            >
              <ShieldAlert size={16} className="shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
              <span>
                Para registrarte necesitas un <strong>código de invitación de 4 dígitos</strong>. 
                Solicítalo al administrador del sistema. Sin este código no podrás crear tu cuenta.
              </span>
            </div>
          )}

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

            {/* Clan dropdown — Radix UI */}
            {clans.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Clan
                </label>
                <Select
                  value={selectedClanId}
                  onValueChange={(val) => {
                    setSelectedClanId(val);
                    setSelectedCpId('');
                  }}
                  disabled={loading}
                >
                  <SelectTrigger
                    className="w-full h-11 rounded-xl border text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      color: selectedClanId ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, clan: true }))}
                  >
                    <SelectValue placeholder="Seleccionar clan..." />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      background: 'rgba(10,14,22,0.98)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    {clans.map(c => (
                      <SelectItem
                        key={c.id}
                        value={String(c.id)}
                        className="text-sm cursor-pointer"
                      >
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {touched.clan && clanError && (
                  <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                    {clanError}
                  </p>
                )}
              </div>
            )}

            {/* CP dropdown — Radix UI */}
            {selectedClanId && filteredCps.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Command Party (CP)
                </label>
                <Select
                  value={selectedCpId}
                  onValueChange={setSelectedCpId}
                  disabled={loading}
                >
                  <SelectTrigger
                    className="w-full h-11 rounded-xl border text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      color: selectedCpId ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, cp: true }))}
                  >
                    <SelectValue placeholder="Seleccionar CP..." />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      background: 'rgba(10,14,22,0.98)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    {filteredCps.map(cp => (
                      <SelectItem
                        key={cp.id}
                        value={String(cp.id)}
                        className="text-sm cursor-pointer"
                      >
                        {cp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {touched.cp && cpError && (
                  <p className="text-xs mt-1.5" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                    {cpError}
                  </p>
                )}
              </div>
            )}

            {/* Class Main dropdown — Radix UI */}
            {availableClasses.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Clase Principal
                </label>
                <Select
                  value={selectedClassMain}
                  onValueChange={setSelectedClassMain}
                  disabled={loading}
                >
                  <SelectTrigger
                    className="w-full h-11 rounded-xl border text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      color: selectedClassMain ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    <SelectValue placeholder="Seleccionar clase..." />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      background: 'rgba(10,14,22,0.98)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    {availableClasses.map(c => (
                      <SelectItem
                        key={c.id}
                        value={c.name}
                        className="text-sm cursor-pointer"
                      >
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

            {/* Invitation Code */}
            {invitationCodeRequired && (
              <div>
                <label htmlFor="register-invitation" className="block text-sm font-medium text-white mb-2">
                  Código de Invitación
                </label>
                <input
                  id="register-invitation"
                  name="invitation-code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  autoComplete="off"
                  value={invitationCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setInvitationCode(val);
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, invitationCode: true }))}
                  placeholder="0000"
                  className={inputClass}
                  disabled={loading}
                  aria-invalid={touched.invitationCode && !!invitationCodeError}
                  style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: '1.1rem', fontWeight: 600 }}
                />
                <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Código de 4 dígitos proporcionado por el administrador
                </p>
                {touched.invitationCode && invitationCodeError && (
                  <p className="text-xs mt-1" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                    {invitationCodeError}
                  </p>
                )}
              </div>
            )}

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
    </div>
  );
}
