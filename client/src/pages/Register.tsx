import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim() || !characterName.trim()) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, characterName);
      toast.success('¡Registro exitoso! Iniciando sesión...');
      setLocation('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error de conexión');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gradient mb-2">Inventario</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Control Dashboard
          </p>
        </div>

        {/* Form Card */}
        <div className="card-glass p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-white mb-6">Crear Cuenta</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Correo Electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="input-dark"
                disabled={loading}
              />
            </div>

            {/* Character Name */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Nombre del Personaje
              </label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="Tu personaje..."
                className="input-dark"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-dark"
                disabled={loading}
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Confirmar Contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="input-dark"
                disabled={loading}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-6"
            >
              {loading ? 'Registrando...' : 'Crear Cuenta'}
            </button>
          </form>

          {/* Login Link */}
          <div className="text-center mt-6 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
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
