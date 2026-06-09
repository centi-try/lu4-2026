import React, { useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  HardDrive,
  Shield,
  Trash2,
  AlertTriangle,
  Loader2,
  FolderOpen,
  RotateCcw,
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function reasonBadge(reason: string | undefined) {
  const r = (reason || 'manual').toLowerCase();
  if (r === 'daily') return { label: 'Automático diario', color: '#7bf1d6' };
  if (r.startsWith('pre-')) return { label: `Pre-${r.slice(4)}`, color: '#fbbf24' };
  if (r === 'pre-restore') return { label: 'Pre-restore', color: '#fbbf24' };
  return { label: 'Manual', color: '#a78bfa' };
}

export function Backups() {
  const statusQuery = trpc.backups.status.useQuery();
  const listQuery = trpc.backups.list.useQuery();
  const utils = trpc.useUtils();

  const [confirmRestoreFile, setConfirmRestoreFile] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const createMutation = trpc.backups.create.useMutation({
    onSuccess: (info) => {
      toast.success(`Backup creado: ${info.file}`);
      utils.backups.list.invalidate();
      utils.backups.status.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const pruneMutation = trpc.backups.prune.useMutation({
    onSuccess: ({ removed, remaining }) => {
      toast.success(
        removed > 0 ? `${removed} backups antiguos eliminados (quedan ${remaining})` : 'Nada para purgar',
      );
      utils.backups.list.invalidate();
      utils.backups.status.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const restoreMutation = trpc.backups.restore.useMutation({
    onSuccess: () => {
      toast.success('Base de datos restaurada. Recargando…');
      setConfirmRestoreFile(null);
      setConfirmText('');
      setTimeout(() => window.location.reload(), 1200);
    },
    onError: (err) => toast.error(err.message),
  });

  const importMutation = trpc.backups.importBackup.useMutation({
    onSuccess: () => {
      toast.success('Backup importado correctamente. Recargando…');
      setTimeout(() => window.location.reload(), 1200);
    },
    onError: (err) => toast.error(err.message),
  });

  const resetMutation = trpc.backups.factoryReset.useMutation({
    onSuccess: () => {
      toast.success('Base de datos reseteada. Recargando…');
      setShowResetModal(false);
      setResetConfirmText('');
      setTimeout(() => window.location.reload(), 1200);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDownload = async () => {
    try {
      const result = await utils.backups.download.fetch();
      const blob = new Blob([result.content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      a.download = `backup_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Backup descargado');
    } catch (err: any) {
      toast.error(err.message || 'Error al descargar');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!content) {
        toast.error('No se pudo leer el archivo');
        return;
      }
      try {
        JSON.parse(content);
      } catch {
        toast.error('El archivo no es un JSON válido');
        return;
      }
      importMutation.mutate({ content });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const backups = listQuery.data || [];
  const status = statusQuery.data;

  const dailyCount = useMemo(
    () => backups.filter((b) => b.reason === 'daily').length,
    [backups],
  );
  const manualCount = useMemo(
    () => backups.filter((b) => !b.reason || b.reason === 'manual').length,
    [backups],
  );
  const preOpCount = useMemo(
    () => backups.filter((b) => (b.reason || '').startsWith('pre-')).length,
    [backups],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'rgba(255,255,255,0.9)' }}>
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(123,241,214,0.12)', border: '1px solid rgba(123,241,214,0.3)' }}
              >
                <Database className="h-5 w-5" style={{ color: '#7bf1d6' }} />
              </div>
              Backups de la base de datos
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Snapshots del archivo <code>data_storage.json</code>. Snapshots automáticos diarios, antes de
              operaciones riesgosas (cierre de ciclo), y manuales on-demand.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                listQuery.refetch();
                statusQuery.refetch();
              }}
              className="rounded-xl px-3 py-2 text-sm transition-all flex items-center gap-2"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
            <button
              onClick={() => createMutation.mutate({ reason: 'manual' })}
              disabled={createMutation.isPending}
              className="rounded-xl px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #7bf1d6 0%, #5db8a3 100%)',
                color: '#060910',
                boxShadow: '0 4px 12px rgba(123,241,214,0.25)',
              }}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Crear backup ahora
            </button>
          </div>
        </div>

        {/* Action buttons: Download, Upload, Reset */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Download */}
          <button
            onClick={handleDownload}
            className="rounded-2xl border p-4 flex items-center gap-3 transition-all hover:bg-white/[0.02]"
            style={{ background: 'rgba(10,14,22,0.6)', borderColor: 'rgba(59,130,246,0.3)' }}
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
              <Download className="h-5 w-5" style={{ color: '#3b82f6' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: '#3b82f6' }}>Descargar backup</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Descarga el JSON completo al PC</p>
            </div>
          </button>

          {/* Upload/Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
            className="rounded-2xl border p-4 flex items-center gap-3 transition-all hover:bg-white/[0.02]"
            style={{ background: 'rgba(10,14,22,0.6)', borderColor: 'rgba(167,139,250,0.3)' }}
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)' }}>
              {importMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#a78bfa' }} />
              ) : (
                <Upload className="h-5 w-5" style={{ color: '#a78bfa' }} />
              )}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: '#a78bfa' }}>
                {importMutation.isPending ? 'Importando...' : 'Subir backup'}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Importa un archivo .json desde el PC</p>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Factory Reset */}
          <button
            onClick={() => { setShowResetModal(true); setResetConfirmText(''); }}
            className="rounded-2xl border p-4 flex items-center gap-3 transition-all hover:bg-white/[0.02]"
            style={{ background: 'rgba(10,14,22,0.6)', borderColor: 'rgba(239,68,68,0.3)' }}
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <RotateCcw className="h-5 w-5" style={{ color: '#ef4444' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>Resetear sitio</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Elimina todo y deja como nuevo</p>
            </div>
          </button>
        </div>

        {/* Estado */}
        {status && (
          <div
            className="rounded-2xl border p-5 space-y-3"
            style={{ background: 'rgba(10,14,22,0.6)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <HardDrive className="h-4 w-4" style={{ color: '#7bf1d6' }} />
              Configuración de almacenamiento
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <div>
                <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Archivo principal
                </div>
                <code className="text-xs">{status.dbFile}</code>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Carpeta de backups
                </div>
                <code className="text-xs">{status.backupsDir}</code>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Retención
                </div>
                {status.retentionDays} días (los más antiguos se purgan automáticamente)
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Último backup
                </div>
                {status.latest ? `${status.latest.file} · ${formatDate(status.latest.createdAt)}` : '—'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <span
                className="rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: 'rgba(123,241,214,0.1)', color: '#7bf1d6', border: '1px solid rgba(123,241,214,0.3)' }}
              >
                {backups.length} total
              </span>
              <span
                className="rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: 'rgba(123,241,214,0.1)', color: '#7bf1d6', border: '1px solid rgba(123,241,214,0.3)' }}
              >
                {dailyCount} automáticos
              </span>
              <span
                className="rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
              >
                {preOpCount} pre-operación
              </span>
              <span
                className="rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}
              >
                {manualCount} manuales
              </span>
              <button
                onClick={() => pruneMutation.mutate()}
                disabled={pruneMutation.isPending}
                className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium transition-all flex items-center gap-1"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  color: '#fca5a5',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                {pruneMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Purgar antiguos
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: 'rgba(10,14,22,0.6)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <FolderOpen className="h-4 w-4" style={{ color: '#7bf1d6' }} />
              Snapshots disponibles ({backups.length})
            </div>
          </div>

          {listQuery.isLoading ? (
            <div className="p-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-3" />
              Cargando…
            </div>
          ) : backups.length === 0 ? (
            <div className="p-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <Database className="h-8 w-8 mx-auto mb-3 opacity-40" />
              Todavía no hay backups. El primer snapshot automático se creará en las próximas 24h.
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {backups.map((b) => {
                const badge = reasonBadge(b.reason);
                return (
                  <div
                    key={b.file}
                    className="flex items-center gap-4 px-5 py-3 transition-all"
                    style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                  >
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${badge.color}22`, border: `1px solid ${badge.color}44` }}
                    >
                      <Database className="h-4 w-4" style={{ color: badge.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {b.file}
                      </div>
                      <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        <span>{formatDate(b.createdAt)}</span>
                        <span>·</span>
                        <span>{formatBytes(b.sizeBytes)}</span>
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: `${badge.color}15`, color: badge.color, border: `1px solid ${badge.color}33` }}
                        >
                          {badge.label}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setConfirmRestoreFile(b.file);
                        setConfirmText('');
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 flex-shrink-0"
                      style={{
                        background: 'rgba(251,191,36,0.1)',
                        color: '#fbbf24',
                        border: '1px solid rgba(251,191,36,0.3)',
                      }}
                    >
                      <Shield className="h-3 w-3" />
                      Restaurar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmación de restore */}
      {confirmRestoreFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => {
            setConfirmRestoreFile(null);
            setConfirmText('');
          }}
        >
          <div
            className="max-w-md w-full rounded-2xl border p-6 space-y-4"
            style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(239,68,68,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }}
              >
                <AlertTriangle className="h-5 w-5" style={{ color: '#ef4444' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Restaurar backup
              </h3>
            </div>

            <div className="text-sm space-y-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <p>
                Vas a reemplazar <strong>toda la base de datos actual</strong> con el contenido de:
              </p>
              <code className="block rounded-lg p-2 text-xs break-all" style={{ background: 'rgba(0,0,0,0.4)' }}>
                {confirmRestoreFile}
              </code>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Antes de restaurar se crea automáticamente un snapshot <code>pre-restore</code> del estado
                actual — si te equivocás, podés restaurar desde ese.
              </p>
              <p className="text-xs pt-2" style={{ color: '#fbbf24' }}>
                Escribí <strong>RESTAURAR</strong> para confirmar:
              </p>
            </div>

            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTAURAR"
              className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
              style={{
                borderColor: 'rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.9)',
                background: 'rgba(0,0,0,0.3)',
              }}
            />

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  setConfirmRestoreFile(null);
                  setConfirmText('');
                }}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                Cancelar
              </button>
              <button
                disabled={confirmText !== 'RESTAURAR' || restoreMutation.isPending}
                onClick={() => restoreMutation.mutate({ file: confirmRestoreFile })}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2"
                style={{
                  background:
                    confirmText === 'RESTAURAR'
                      ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                      : 'rgba(239,68,68,0.2)',
                  color: confirmText === 'RESTAURAR' ? '#fff' : 'rgba(255,255,255,0.4)',
                  opacity: restoreMutation.isPending ? 0.6 : 1,
                  cursor: confirmText === 'RESTAURAR' ? 'pointer' : 'not-allowed',
                }}
              >
                {restoreMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
                Confirmar restauración
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de Factory Reset */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setShowResetModal(false); setResetConfirmText(''); }}
        >
          <div
            className="max-w-md w-full rounded-2xl border p-6 space-y-4"
            style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(239,68,68,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }}
              >
                <AlertTriangle className="h-5 w-5" style={{ color: '#ef4444' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: '#ef4444' }}>
                Resetear sitio completo
              </h3>
            </div>

            <div className="text-sm space-y-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <p>
                Esta acción <strong>eliminará TODA la información</strong> del sitio y lo dejará como nuevo:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                <li>Usuarios, personajes, clanes, CPs</li>
                <li>Inventario, compras, ciclos de ventas</li>
                <li>Warehouse, recetas, catálogo, crafteo</li>
                <li>Raid (bosses, drops, eventos, historial)</li>
                <li>Config, reglas, iconos, auditoría</li>
              </ul>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Se creará automáticamente un backup <code>pre-reset</code> antes de eliminar.
                Solo quedará la cuenta Super Admin por defecto.
              </p>
              <p className="text-xs pt-2 font-semibold" style={{ color: '#ef4444' }}>
                Escribí <strong>RESETEAR</strong> para confirmar:
              </p>
            </div>

            <input
              autoFocus
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="RESETEAR"
              className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
              style={{
                borderColor: resetConfirmText === 'RESETEAR' ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.9)',
                background: 'rgba(0,0,0,0.3)',
              }}
            />

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setShowResetModal(false); setResetConfirmText(''); }}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                Cancelar
              </button>
              <button
                disabled={resetConfirmText !== 'RESETEAR' || resetMutation.isPending}
                onClick={() => resetMutation.mutate({ confirmText: resetConfirmText })}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2"
                style={{
                  background:
                    resetConfirmText === 'RESETEAR'
                      ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                      : 'rgba(239,68,68,0.2)',
                  color: resetConfirmText === 'RESETEAR' ? '#fff' : 'rgba(255,255,255,0.4)',
                  opacity: resetMutation.isPending ? 0.6 : 1,
                  cursor: resetConfirmText === 'RESETEAR' ? 'pointer' : 'not-allowed',
                }}
              >
                {resetMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Confirmar reset total
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default Backups;
