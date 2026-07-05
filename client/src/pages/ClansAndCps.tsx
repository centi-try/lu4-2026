import { AppShell } from '../components/layout/AppShell';
import RaidClansAndCps from './raid/RaidClansAndCps';
import { useAuth } from '../contexts/AuthContext';
import { Shield } from 'lucide-react';

export default function ClansAndCps() {
  const { user } = useAuth();
  const roleLc = String(user?.role || '').toLowerCase();
  const isSA = roleLc === 'super_admin';

  return (
    <AppShell>
      {isSA ? (
        <RaidClansAndCps />
      ) : (
        // #6b: solo el Super Admin puede visualizar la gente que compone los
        // clanes / Command Parties. El resto de roles ve un mensaje claro en
        // lugar de una vista vacía/rota.
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
            style={{ background: 'rgba(123,241,214,0.08)', border: '1px solid rgba(123,241,214,0.2)' }}>
            <Shield className="h-6 w-6" style={{ color: '#7bf1d6' }} />
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Acceso restringido
          </h2>
          <p className="text-sm max-w-md" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Solo el Administrador del Sistema puede visualizar la composición de los clanes y Command Parties.
          </p>
        </div>
      )}
    </AppShell>
  );
}
