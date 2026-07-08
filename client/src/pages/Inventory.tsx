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
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
            <p className="text-sm font-bold mb-1" style={{ color: '#7bf1d6' }}>Venta de Ítems</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Publica tu ítem en <span className="font-semibold" style={{ color: '#7bf1d6' }}>#venta-de-items</span> (Discord o TS3) utilizando el formato disponible en ese canal. Un agente revisará la publicación y registrará el ítem en la página.
            </p>
          </div>
          <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
            <p className="text-sm font-bold mb-1" style={{ color: '#a78bfa' }}>Compra de Ítems</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Haz clic en <span className="font-semibold" style={{ color: '#a78bfa' }}>"R"</span> (Reservar) en la tabla. Un agente se pondrá en contacto contigo para gestionar la compra como intermediario.
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-lg px-4 py-3" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
          <p className="text-sm font-bold mb-1" style={{ color: '#7bf1d6' }}>Responsable de los ítems</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Deberá informar oportunamente a los agentes encargados del sistema de ventas cuando un ítem haya sido vendido, con el fin de actualizar la información y mantener la trazabilidad del proceso.
          </p>
        </div>
      </div>
      <div className="space-y-5">
        {(currentUser && (currentUser.role === 'MAPPER' || currentUser.role === 'SUPER_ADMIN')) && <CreateItemPanel />}
        <ItemTable />
      </div>
    </AppShell>
  );
}
