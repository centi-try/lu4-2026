import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      toast.success('¡Sesión iniciada!');
      setLocation('/');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      toast.error(msg);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(circle at 10% 10%, rgba(123,241,214,0.06) 0%, transparent 30%), radial-gradient(circle at 90% 20%, rgba(232,121,249,0.06) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(232,121,249,0.2))', border: '1px solid rgba(123,241,214,0.3)' }}>
              <span className="text-2xl">📦</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-2">RaptorSquad</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Control Dashboard · Sistema de Gestión
          </p>
        </div>

        <div className="rounded-2xl border p-8"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>
          <h2 className="text-xl font-bold mb-6" style={{ color: 'rgba(255,255,255,0.95)' }}>Iniciar Sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Correo Electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
                style={{
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.9)',
                  background: 'rgba(255,255,255,0.04)',
                }}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
                style={{
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.9)',
                  background: 'rgba(255,255,255,0.04)',
                }}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 text-sm font-semibold transition-all mt-2"
              style={{
                background: loading ? 'rgba(123,241,214,0.1)' : 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(123,241,214,0.15))',
                color: '#7bf1d6',
                border: '1px solid rgba(123,241,214,0.3)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="text-center mt-5 pt-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
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
        </div>
      </div>
    </div>
  );
}
