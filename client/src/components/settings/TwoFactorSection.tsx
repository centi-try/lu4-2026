// ============================================================================
// TwoFactorSection - Settings → Seguridad → 2FA (PR6)
// ============================================================================
// Solo visible para super_admin. Expone tres flows:
//   1. Activar: POST /2fa/setup → QR + secret → user ingresa código + password
//      → POST /2fa/enable → muestra 8 backup codes (única vez).
//   2. Desactivar: input password + código TOTP/backup → POST /2fa/disable.
//   3. Estado: GET /2fa/status al montar → muestra badge activado/desactivado
//      + cuántos backup codes quedan.
// ============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, ShieldOff, Loader2, Copy, Check, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';

interface StatusResponse {
  success?: boolean;
  enabled: boolean;
  backupCodesRemaining: number;
}

interface SetupResponse {
  success?: boolean;
  secretBase32: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

type ActivateStage = 'idle' | 'qr' | 'done';

export function TwoFactorSection() {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  // Modal de activación
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateStage, setActivateStage] = useState<ActivateStage>('idle');
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [activateCode, setActivateCode] = useState('');
  const [activatePassword, setActivatePassword] = useState('');
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateLoading, setActivateLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Modal de desactivación
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableLoading, setDisableLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/auth/2fa/status', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo consultar el estado de 2FA');
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
    } catch (err) {
      console.error('[2fa] status error:', err);
      setStatus({ enabled: false, backupCodesRemaining: 0 });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // --- Activación ---
  const startActivation = async () => {
    setActivateOpen(true);
    setActivateStage('qr');
    setActivateCode('');
    setActivatePassword('');
    setActivateError(null);
    setBackupCodes(null);
    setSetup(null);
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Error al iniciar setup');
      setSetup(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar setup';
      toast.error(msg);
      setActivateError(msg);
    }
  };

  const confirmActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivateError(null);
    const cleanCode = activateCode.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setActivateError('Ingresá el código de 6 dígitos.');
      return;
    }
    if (!activatePassword) {
      setActivateError('Ingresá tu contraseña.');
      return;
    }
    setActivateLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: cleanCode, password: activatePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'No se pudo activar');
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      setActivateStage('done');
      toast.success('2FA activado. Guardá tus códigos de respaldo.');
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo activar';
      setActivateError(msg);
      toast.error(msg);
    } finally {
      setActivateLoading(false);
    }
  };

  const closeActivate = () => {
    setActivateOpen(false);
    setActivateStage('idle');
    setSetup(null);
    setActivateCode('');
    setActivatePassword('');
    setBackupCodes(null);
    setActivateError(null);
  };

  // --- Desactivación ---
  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisableError(null);
    if (!disablePassword) {
      setDisableError('Ingresá tu contraseña.');
      return;
    }
    if (!disableCode.trim()) {
      setDisableError('Ingresá un código TOTP o de respaldo.');
      return;
    }
    setDisableLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: disablePassword, code: disableCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'No se pudo desactivar');
      toast.success('2FA desactivado.');
      setDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo desactivar';
      setDisableError(msg);
      toast.error(msg);
    } finally {
      setDisableLoading(false);
    }
  };

  const copySecret = () => {
    if (!setup?.secretBase32) return;
    try {
      navigator.clipboard.writeText(setup.secretBase32);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 1500);
    } catch {
      toast.error('No se pudo copiar al portapapeles.');
    }
  };

  const downloadBackupCodes = () => {
    if (!backupCodes || backupCodes.length === 0) return;
    const blob = new Blob(
      [
        `RaptorSquad - Códigos de respaldo 2FA\n`,
        `Generados: ${new Date().toLocaleString()}\n`,
        `Guardá estos códigos en un lugar seguro. Cada código se puede usar UNA SOLA VEZ.\n\n`,
        backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n'),
        '\n',
      ],
      { type: 'text/plain;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'raptorsquad-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const inputStyle = {
    borderColor: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.9)',
    background: 'rgba(255,255,255,0.03)',
  } as const;

  return (
    <div
      className="card-glass rounded-2xl p-5"
      style={{ border: '1px solid rgba(123,241,214,0.15)' }}
      data-testid="2fa-section"
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'rgba(123,241,214,0.12)', border: '1px solid rgba(123,241,214,0.2)' }}
        >
          <ShieldCheck className="h-5 w-5" style={{ color: '#7bf1d6' }} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Autenticación en dos pasos (2FA)
          </h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Protegé tu cuenta con un código temporal generado por tu app.
          </p>
        </div>
      </div>

      {loadingStatus ? (
        <div className="flex items-center gap-2 text-xs py-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando estado…
        </div>
      ) : status?.enabled ? (
        <div className="space-y-3">
          <div
            className="rounded-xl border px-3 py-2 text-xs flex items-center gap-2"
            style={{
              borderColor: 'rgba(52, 211, 153, 0.4)',
              background: 'rgba(52, 211, 153, 0.08)',
              color: 'rgba(167, 243, 208, 0.95)',
            }}
          >
            <ShieldCheck className="h-4 w-4" /> 2FA activada. Te pediremos un código al iniciar sesión.
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Códigos de respaldo restantes: <span style={{ color: '#7bf1d6' }}>{status.backupCodesRemaining}</span>
            {status.backupCodesRemaining <= 2 && status.backupCodesRemaining > 0 && (
              <span className="ml-1" style={{ color: '#fbbf24' }}>
                · Quedan pocos, considerá regenerar (desactivá y volvé a activar).
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setDisableOpen(true);
              setDisablePassword('');
              setDisableCode('');
              setDisableError(null);
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
            style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}
            data-testid="2fa-disable-btn"
          >
            <ShieldOff className="h-4 w-4" /> Desactivar 2FA
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Requiere una app autenticadora como Google Authenticator, Authy o 1Password en tu celular.
          </p>
          <button
            type="button"
            onClick={startActivation}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all"
            style={{ background: '#7bf1d6', color: '#000' }}
            data-testid="2fa-enable-btn"
          >
            <ShieldCheck className="h-4 w-4" /> Activar 2FA
          </button>
        </div>
      )}

      {/* Modal de activación — renderizado vía portal para escapar del stacking context creado por backdrop-filter en card-glass padre */}
      {activateOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeActivate(); }}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6 max-h-[90vh] overflow-y-auto"
            style={{
              background: 'linear-gradient(180deg, #0a0e17 0%, #0c111c 100%)',
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.95)' }}>
              <ShieldCheck className="h-5 w-5" style={{ color: '#7bf1d6' }} />
              {activateStage === 'done' ? 'Guardá tus códigos de respaldo' : 'Activar autenticación en dos pasos'}
            </h3>

            {activateStage === 'qr' && (
              <div className="space-y-4">
                {!setup ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#7bf1d6' }} />
                  </div>
                ) : (
                  <>
                    <ol className="list-decimal list-inside text-xs space-y-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      <li>Abrí tu app autenticadora y escaneá el QR (o ingresá el secret manual).</li>
                      <li>La app va a mostrar un código de 6 dígitos que cambia cada 30 segundos.</li>
                      <li>Ingresá ese código + tu contraseña actual para confirmar.</li>
                    </ol>

                    <div className="flex justify-center">
                      <img
                        src={setup.qrDataUrl}
                        alt="QR 2FA"
                        width={200}
                        height={200}
                        className="rounded-lg"
                        style={{ background: '#fff' }}
                        data-testid="2fa-qr"
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        ¿No podés escanear? Ingresá manualmente este secret:
                      </label>
                      <div className="flex items-center gap-2">
                        <code
                          className="flex-1 rounded-md px-2 py-1.5 text-xs font-mono truncate"
                          style={{ background: 'rgba(255,255,255,0.04)', color: '#7bf1d6' }}
                        >
                          {setup.secretBase32}
                        </code>
                        <button
                          type="button"
                          onClick={copySecret}
                          className="rounded-md p-1.5 transition hover:bg-white/5"
                          style={{ color: copiedSecret ? '#34d399' : 'rgba(255,255,255,0.5)' }}
                          title="Copiar secret"
                        >
                          {copiedSecret ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>

                    <form onSubmit={confirmActivation} className="space-y-3 pt-2">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          Código de la app (6 dígitos)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={activateCode}
                          onChange={(e) => setActivateCode(e.target.value)}
                          placeholder="000000"
                          className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-center text-lg tracking-[0.3em] outline-none font-mono"
                          style={inputStyle}
                          data-testid="2fa-setup-code"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          Tu contraseña actual
                        </label>
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={activatePassword}
                          onChange={(e) => setActivatePassword(e.target.value)}
                          className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none"
                          style={inputStyle}
                          data-testid="2fa-setup-password"
                        />
                      </div>
                      {activateError && (
                        <p className="text-xs" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>{activateError}</p>
                      )}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={closeActivate}
                          disabled={activateLoading}
                          className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={activateLoading}
                          className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition flex items-center justify-center gap-2"
                          style={{ background: '#7bf1d6', color: '#000' }}
                          data-testid="2fa-setup-confirm"
                        >
                          {activateLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                          {activateLoading ? 'Activando...' : 'Confirmar y activar'}
                        </button>
                      </div>
                    </form>
                  </>
                )}
                {activateError && !setup && (
                  <p className="text-xs" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>{activateError}</p>
                )}
              </div>
            )}

            {activateStage === 'done' && backupCodes && (
              <div className="space-y-4">
                <div
                  className="rounded-xl border px-3 py-2 text-xs flex items-start gap-2"
                  style={{
                    borderColor: 'rgba(251, 191, 36, 0.4)',
                    background: 'rgba(251, 191, 36, 0.08)',
                    color: 'rgba(253, 224, 71, 0.95)',
                  }}
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Guardá estos códigos ahora.</strong> Son la única forma de entrar si perdés tu dispositivo.
                    Cada uno se puede usar una sola vez. No los podrás volver a ver.
                  </div>
                </div>

                <div
                  className="grid grid-cols-2 gap-2 rounded-xl border p-3"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
                  data-testid="2fa-backup-codes"
                >
                  {backupCodes.map((c, i) => (
                    <code
                      key={i}
                      className="text-xs font-mono text-center py-1 rounded"
                      style={{ color: '#7bf1d6', background: 'rgba(123,241,214,0.06)' }}
                    >
                      {c}
                    </code>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={downloadBackupCodes}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <Download className="h-4 w-4" /> Descargar .txt
                  </button>
                  <button
                    type="button"
                    onClick={closeActivate}
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition"
                    style={{ background: '#7bf1d6', color: '#000' }}
                    data-testid="2fa-done-close"
                  >
                    Listo, ya los guardé
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modal de desactivación — renderizado vía portal para escapar del stacking context creado por backdrop-filter en card-glass padre */}
      {disableOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDisableOpen(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6"
            style={{
              background: 'linear-gradient(180deg, #0a0e17 0%, #0c111c 100%)',
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.95)' }}>
              <ShieldOff className="h-5 w-5" style={{ color: '#fca5a5' }} />
              Desactivar 2FA
            </h3>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Para confirmar, ingresá tu contraseña y un código válido (de la app o uno de respaldo).
            </p>
            <form onSubmit={confirmDisable} className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Contraseña</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none"
                  style={inputStyle}
                  data-testid="2fa-disable-password"
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Código (TOTP o respaldo)</label>
                <input
                  type="text"
                  autoComplete="one-time-code"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="000000 o XXXXX-XXXXX"
                  className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-center font-mono outline-none"
                  style={inputStyle}
                  data-testid="2fa-disable-code"
                />
              </div>
              {disableError && (
                <p className="text-xs" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>{disableError}</p>
              )}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDisableOpen(false)}
                  disabled={disableLoading}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={disableLoading}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition flex items-center justify-center gap-2"
                  style={{ background: 'rgba(239, 68, 68, 0.9)', color: '#fff' }}
                  data-testid="2fa-disable-confirm"
                >
                  {disableLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {disableLoading ? 'Desactivando...' : 'Desactivar 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
