import React from 'react';
import { AppShell } from '../components/layout/AppShell';
import { CreateItemPanel } from '../components/inventory/CreateItemPanel';
import { ItemTable } from '../components/inventory/ItemTable';
import { useApp } from '../contexts/AppContext';

export default function Inventory() {
  const { currentUser } = useApp();
  
  // Si el usuario es USER, redirigir a Dashboard
  if (currentUser && currentUser.role === 'USER') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-96 text-center">
          <div className="mb-4 text-5xl">🔒</div>
          <h2 className="text-2xl font-bold text-gradient mb-2">Acceso Restringido</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Los usuarios no tienen permiso para acceder a la sección de Inventario.
          </p>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Inventario</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Gestión completa de ítems del sistema. Crea, edita y confirma ítems con imagen obligatoria.
          Las reglas de negocio se aplican según el rol del usuario activo: Mapper o Super Admin.
        </p>
      </div>
      <div className="space-y-5">
        {(currentUser && (currentUser.role === 'MAPPER' || currentUser.role === 'SUPER_ADMIN')) && <CreateItemPanel />}
        <ItemTable />
      </div>
    </AppShell>
  );
}
