// Utilidades de formateo de números con separador de miles (#11).
// Criterio: en los inputs mostramos el número con puntos de miles mientras se
// escribe (1.000.000), pero guardamos el valor LIMPIO (1000000) para que los
// cálculos sigan siendo correctos. En toda la app se muestra formateado.
//
// Usamos el punto como separador de miles (formato es-CL / L2), sin decimales
// (la adena del juego es entera).

// Formatea un número (o string numérico) con separadores de miles.
// Devuelve '' si el valor es null/undefined/'' para no forzar un 0.
export function formatThousands(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\D/g, ''));
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('es-CL');
}

// Quita todo lo que no sea dígito y devuelve el número limpio (o null si vacío).
export function parseThousands(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits === '') return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// Handler para inputs de texto: recibe el valor tipeado y devuelve la versión
// formateada con puntos, lista para setear en el estado del input.
export function reformatWhileTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return '';
  return Number(digits).toLocaleString('es-CL');
}
