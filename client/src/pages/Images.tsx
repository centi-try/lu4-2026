import React, { useState } from 'react';
import { ImageIcon, Lock, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useApp } from '../contexts/AppContext';
import { categoryMeta } from '../lib/category-meta';
import { toast } from 'sonner';

export default function Images() {
  const { items, currentUser, updateItem } = useApp();
  
  // Si el usuario es USER, mostrar acceso restringido
  if (currentUser && currentUser.role === 'USER') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-96 text-center">
          <div className="mb-4 text-5xl">🔒</div>
          <h2 className="text-2xl font-bold text-gradient mb-2">Acceso Restringido</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Los usuarios no tienen permiso para acceder a la sección de Imágenes.
          </p>
        </div>
      </AppShell>
    );
  }
  const [editId, setEditId] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');

  const canEditImage = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return false;
    if (currentUser && currentUser.role === 'SUPER_ADMIN') return true;
    if (currentUser && currentUser.role === 'MAPPER' && item.status === 'EN_REGISTRO') return true;
    return false;
  };

  const handleSave = (itemId: string, itemName: string) => {
    if (!newUrl.trim()) { toast.error('La URL de imagen no puede estar vacía'); return; }
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    updateItem(itemId, {
      image: { id: item.image?.id || 'img-default', publicUrl: newUrl, altText: item.image?.altText || itemName },
    });
    toast.success(`Imagen de "${itemName}" actualizada correctamente`);
    setEditId(null);
    setNewUrl('');
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Gestión de Imágenes</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Administración de la relación 1:1 entre ítems e imágenes. Cada ítem tiene una imagen obligatoria
          que queda permanentemente asociada. El Mapper solo puede modificarla en estado EN_REGISTRO;
          el Super Admin puede corregirla en cualquier momento.
        </p>
      </div>

      {/* Role info */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border p-4"
          style={{ borderColor: 'rgba(123,241,214,0.2)', background: 'rgba(123,241,214,0.05)' }}>
          <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#7bf1d6' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#7bf1d6' }}>Super Admin</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Puede corregir la imagen de cualquier ítem en cualquier estado, incluyendo ítems confirmados.
              Útil para corregir asignaciones incorrectas o actualizar imágenes obsoletas.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border p-4"
          style={{ borderColor: 'rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.05)' }}>
          <Lock className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>Mapper</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Solo puede modificar la imagen mientras el ítem esté en estado EN_REGISTRO.
              Una vez confirmado, la imagen queda permanentemente bloqueada para este rol.
            </p>
          </div>
        </div>
      </div>

      {/* Image grid */}
      <div className="card-glass rounded-2xl">
        <div className="border-b p-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Imágenes del Inventario
            <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-mono" style={{ background: 'rgba(123,241,214,0.12)', color: '#7bf1d6' }}>
              {items.length}
            </span>
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Rol activo: <span style={{ color: currentUser.role === 'SUPER_ADMIN' ? '#7bf1d6' : '#fbbf24' }}>
              {currentUser.name} ({currentUser.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Mapper'})
            </span>
          </p>
        </div>

        <div className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(item => {
            const canEdit = canEditImage(item.id);
            const isEditing = editId === item.id;
            const catMeta = categoryMeta[item.category] || { emoji: '📦', label: item.category };

            return (
              <div key={item.id} className="rounded-2xl border overflow-hidden"
                style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                {/* Image */}
                <div className="relative aspect-square overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)' }}>
                  {item.image?.publicUrl ? (
                    <img src={item.image.publicUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                      <ImageIcon className="h-12 w-12 text-white/10" />
                    </div>
                  )}
                  {/* Status overlay */}
                  <div className="absolute top-2 right-2">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: item.status === 'CONFIRMADO' ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                        color: item.status === 'CONFIRMADO' ? '#34d399' : '#fbbf24',
                        border: `1px solid ${item.status === 'CONFIRMADO' ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}`,
                        backdropFilter: 'blur(8px)',
                      }}>
                      {item.status === 'CONFIRMADO' ? '✓' : '○'}
                    </span>
                  </div>
                  {/* Lock overlay for mapper on confirmed */}
                  {!canEdit && (
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
                      <Lock className="h-6 w-6" style={{ color: 'rgba(255,255,255,0.5)' }} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{item.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {catMeta.emoji} {catMeta.label}
                  </p>

                  {/* Edit form */}
                  {isEditing ? (
                    <div className="mt-3 space-y-2">
                      <input
                        type="url"
                        value={newUrl}
                        onChange={e => setNewUrl(e.target.value)}
                        placeholder="Nueva URL de imagen..."
                        className="input-dark text-xs h-9"
                        autoFocus
                      />
                      {newUrl && (
                        <img src={newUrl} alt="Preview" className="h-16 w-full rounded-lg object-cover border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => handleSave(item.id, item.name)} className="btn-primary flex-1 justify-center text-xs py-1.5">
                          Guardar
                        </button>
                        <button onClick={() => { setEditId(null); setNewUrl(''); }} className="btn-ghost flex-1 justify-center text-xs py-1.5">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      {canEdit ? (
                        <button
                          onClick={() => { setEditId(item.id); setNewUrl(item.image?.publicUrl || ''); }}
                          className="btn-ghost w-full justify-center text-xs py-1.5">
                          <RefreshCw className="h-3 w-3" />
                          Cambiar imagen
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          <AlertCircle className="h-3 w-3" />
                          Imagen bloqueada
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
