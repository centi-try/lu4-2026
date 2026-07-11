import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Loader2, Package, ShieldCheck, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { trpc } from '../lib/trpc';
import L2Splash from '../components/L2Splash';

const DEFAULT_CAROUSEL_IMAGES = ['/raptor-1.png', '/raptor-2.png', '/raptor-3.png'];
const CAROUSEL_INTERVAL = 10000;

// Regex de validación mínima de formato de email. El backend ya re-valida.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper: extract YouTube video ID from various URL formats
function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, verify2fa } = useAuth();
  const [activeTab, setActiveTab] = useState<'presentation' | 'login'>('presentation');
  const [tabTransition, setTabTransition] = useState(false);

  const switchTab = (tab: 'presentation' | 'login') => {
    if (tab === activeTab) return;
    setTabTransition(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabTransition(false);
    }, 800);
  };

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

  // Splash screen — show while data loads (min 1.5s for smooth UX)
  const [splashMinDone, setSplashMinDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSplashMinDone(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Carousel: fetch dynamic images, fall back to defaults (always refetch on mount for fresh data)
  const carouselQ = trpc.carousel.list.useQuery(undefined, { refetchOnMount: 'always', staleTime: 0 });
  const carouselImages = useMemo(() => {
    const data = carouselQ.data;
    if (data && data.images && data.images.length > 0) {
      return data.images.map((img: any) => img.data as string);
    }
    return DEFAULT_CAROUSEL_IMAGES;
  }, [carouselQ.data]);

  const carouselInterval = useMemo(() => {
    const secs = carouselQ.data?.intervalSeconds;
    return (secs && secs > 0 ? secs : 10) * 1000;
  }, [carouselQ.data]);

  const [currentImg, setCurrentImg] = useState(0);
  useEffect(() => {
    const total = carouselImages.length;
    if (total <= 1) return;
    const timer = setInterval(() => {
      setCurrentImg((prev) => (prev + 1) % total);
    }, carouselInterval);
    return () => clearInterval(timer);
  }, [carouselImages.length, carouselInterval]);

  // Presentation content (public endpoint — no auth needed)
  const [presPage, setPresPage] = useState(1);
  const [presTransition, setPresTransition] = useState(false);
  const [modalItem, setModalItem] = useState<{ type: string; content: string; title?: string } | null>(null);
  const presQ = trpc.presentation.list.useQuery({ page: presPage, limit: 8 }, { refetchOnMount: 'always', staleTime: 0 });
  // Fetch ALL text items separately (not paginated — they stay fixed at top)
  const presAllQ = trpc.presentation.list.useQuery({ page: 1, limit: 200 }, { refetchOnMount: 'always', staleTime: 0 });

  // Preload carousel images during splash
  useEffect(() => {
    carouselImages.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }, [carouselImages]);

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

  // Show splash while: minimum time hasn't passed, data still loading, tab switching, or login in progress
  const dataLoading = carouselQ.isLoading || presQ.isLoading;
  const showSplash = !splashMinDone || dataLoading;
  if (showSplash || tabTransition || loading) {
    return <L2Splash />;
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#060910' }}>
      {/* Left side: Raptor carousel (hidden on mobile and when presentation tab active) */}
      {activeTab === 'login' && (
        <div
          className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden flex-col"
          style={{ background: '#040608' }}
        >
          <div className="relative flex-1 w-full flex items-center justify-center">
            {carouselImages.map((src, i) => (
              <img
                key={`carousel-${i}`}
                src={src}
                alt={`RaptorSquad ${i + 1}`}
                className="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000"
                style={{ opacity: i === currentImg ? 1 : 0 }}
              />
            ))}
          </div>
          <div className="w-full text-center pb-6">
            <p className="text-2xl font-black tracking-[0.3em]" style={{ letterSpacing: '0.3em', color: '#7bf1d6' }}>
              LINEAGE II
            </p>
          </div>
        </div>
      )}

      {/* Right side: Tabs (Presentación / Login) — full width when presentation active */}
      <div
        className={`${activeTab === 'presentation' ? 'w-full' : 'w-full lg:w-1/2'} flex items-center justify-center p-6 relative overflow-y-auto`}
        style={{
          background: 'radial-gradient(circle at 50% 20%, rgba(123,241,214,0.04) 0%, transparent 50%), #060910',
          maxHeight: '100vh',
        }}
      >
        {/* Mobile background (visible only on small screens when login) */}
        {activeTab === 'login' && (
          <div
            className="absolute inset-0 lg:hidden"
            style={{
              backgroundImage: `url(${carouselImages[currentImg] || carouselImages[0]})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.15,
            }}
          />
        )}

        <div className={`w-full ${activeTab === 'presentation' ? 'max-w-4xl' : 'max-w-md'} relative z-10`}>
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

          {/* Tab switcher */}
          <div className="flex items-center gap-1 mb-4 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => switchTab('presentation')}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: activeTab === 'presentation' ? 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(167,139,250,0.1))' : 'transparent',
                color: activeTab === 'presentation' ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                border: activeTab === 'presentation' ? '1px solid rgba(167,139,250,0.3)' : '1px solid transparent',
              }}
            >
              <Play className="h-3.5 w-3.5" /> Presentación
            </button>
            <button
              onClick={() => switchTab('login')}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: activeTab === 'login' ? 'linear-gradient(135deg, rgba(123,241,214,0.2), rgba(123,241,214,0.1))' : 'transparent',
                color: activeTab === 'login' ? '#7bf1d6' : 'rgba(255,255,255,0.5)',
                border: activeTab === 'login' ? '1px solid rgba(123,241,214,0.3)' : '1px solid transparent',
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Iniciar Sesión
            </button>
          </div>

          {/* Presentation Tab */}
          {activeTab === 'presentation' && (
            <div className="rounded-2xl border p-6 overflow-y-auto" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', maxHeight: 'calc(100vh - 220px)' }}>
              {/* Text items — FIXED at top, not paginated, always visible */}
              {presAllQ.data && (() => {
                const textItems = presAllQ.data.items.filter((it: any) => it.type === 'text');
                if (textItems.length === 0) return null;
                return (
                  <div className="mb-6 space-y-3">
                    {textItems.map((item: any) => (
                      <div key={item.id} className="rounded-xl p-5 text-center" style={{ background: 'linear-gradient(135deg, rgba(123,241,214,0.06), rgba(167,139,250,0.06))', border: '1px solid rgba(123,241,214,0.2)' }}>
                        {item.title && (
                          <h3 className="text-lg font-black tracking-wide mb-2" style={{ color: '#7bf1d6' }}>{item.title}</h3>
                        )}
                        <div className="text-sm leading-relaxed font-medium" style={{ color: 'rgba(255,255,255,0.8)' }} dangerouslySetInnerHTML={{ __html: item.content }} />
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Spinner — shows below text during pagination */}
              {(presQ.isLoading || presTransition) && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin mb-3" style={{ borderColor: 'rgba(123,241,214,0.4)', borderTopColor: 'transparent' }} />
                  <p className="text-xs font-medium" style={{ color: 'rgba(123,241,214,0.6)' }}>Cargando contenido...</p>
                </div>
              )}
              {!presTransition && !presQ.isFetching && presQ.data && presQ.data.items.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-lg font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>Bienvenido a RaptorSquad</p>
                  <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Haz clic en "Iniciar Sesión" para acceder al sistema.</p>
                </div>
              )}

              {/* Videos and images — paginated */}
              {!presTransition && !presQ.isFetching && presQ.data && presQ.data.items.filter((it: any) => it.type !== 'text').length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {presQ.data.items.filter((it: any) => it.type !== 'text').map((item: any) => (
                    <div
                      key={item.id}
                      className="rounded-xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]"
                      style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}
                      onClick={() => setModalItem({ type: item.type, content: item.content, title: item.title })}
                    >
                      {item.type === 'image' && (
                        <img src={item.content} alt={item.title || ''} className="w-full rounded-t-xl object-cover" style={{ maxHeight: '320px' }} />
                      )}
                      {item.type === 'video' && (() => {
                        const vid = extractYoutubeId(item.content);
                        if (!vid) return <p className="text-xs p-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Video no válido</p>;
                        return (
                          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                            <img
                              src={`https://img.youtube.com/vi/${vid}/hqdefault.jpg`}
                              alt={item.title || 'Video'}
                              className="absolute inset-0 w-full h-full object-cover rounded-t-xl"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.85)' }}>
                                <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7 ml-1"><polygon points="5,3 19,12 5,21" /></svg>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      {item.title && (
                        <div className="p-3">
                          <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{item.title}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Paginator */}
              {!presTransition && presQ.data && presQ.data.totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-5">
                  <button
                    onClick={() => { setPresTransition(true); setPresPage(p => Math.max(1, p - 1)); setTimeout(() => setPresTransition(false), 3500); }}
                    disabled={presPage <= 1}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{ color: presPage <= 1 ? 'rgba(255,255,255,0.2)' : '#a78bfa', background: 'rgba(255,255,255,0.05)' }}
                  >
                    <ChevronLeft className="h-4 w-4 inline" /> Anterior
                  </button>
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Página {presPage} de {presQ.data.totalPages}
                  </span>
                  <button
                    onClick={() => { setPresTransition(true); setPresPage(p => Math.min(presQ.data!.totalPages, p + 1)); setTimeout(() => setPresTransition(false), 3500); }}
                    disabled={presPage >= presQ.data.totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{ color: presPage >= presQ.data.totalPages ? 'rgba(255,255,255,0.2)' : '#a78bfa', background: 'rgba(255,255,255,0.05)' }}
                  >
                    Siguiente <ChevronRight className="h-4 w-4 inline" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Login Tab */}
          {activeTab === 'login' && (<>


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
      </>)}
      </div>
      </div>

      {/* Modal for video/image zoom */}
      {modalItem && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)' }}
        >
          <div
            className="relative w-full max-w-4xl"
            style={{ animation: 'modalIn 0.15s ease-out' }}
          >
            <button
              onClick={() => setModalItem(null)}
              className="absolute -top-4 -right-4 z-10 w-11 h-11 rounded-full flex items-center justify-center text-xl font-black transition-all hover:scale-110 shadow-lg"
              style={{ background: '#ef4444', color: '#fff', border: '2px solid rgba(255,255,255,0.3)' }}
            >✕</button>
            {modalItem.type === 'video' && (() => {
              const vid = extractYoutubeId(modalItem.content);
              if (!vid) return null;
              return (
                <div className="relative w-full rounded-2xl overflow-hidden" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${vid}?autoplay=1`}
                    title={modalItem.title || 'Video'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
              );
            })()}
            {modalItem.type === 'image' && (
              <img
                src={modalItem.content}
                alt={modalItem.title || ''}
                className="w-full max-h-[85vh] object-contain rounded-2xl"
              />
            )}
            {modalItem.title && (
              <p className="text-center mt-3 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>{modalItem.title}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
