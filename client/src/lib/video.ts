// Helpers para videos de presentación. Soporta YouTube y TikTok.

export type VideoProvider = 'youtube' | 'tiktok';

export interface VideoInfo {
  provider: VideoProvider;
  id: string;
}

// Extrae el ID de un video de YouTube desde varios formatos de URL.
export function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// Extrae el ID numérico de un video de TikTok. Solo soporta URLs completas
// (con /video/<id> o /embed/...); los links cortos (vm.tiktok.com) no exponen
// el ID sin resolver la redirección, así que no se aceptan.
export function extractTiktokId(url: string): string | null {
  const m = url.match(/tiktok\.com\/(?:@[^/]+\/video\/|v\/|embed\/v2\/|embed\/|player\/v1\/)(\d+)/);
  return m ? m[1] : null;
}

// Detecta el proveedor y el ID de un video. Devuelve null si no es reconocible.
export function getVideoInfo(url: string): VideoInfo | null {
  const trimmed = (url || '').trim();
  const tiktokId = extractTiktokId(trimmed);
  if (tiktokId) return { provider: 'tiktok', id: tiktokId };
  const ytId = extractYoutubeId(trimmed);
  if (ytId) return { provider: 'youtube', id: ytId };
  return null;
}

// URL del reproductor embebido según el proveedor.
export function embedUrl(info: VideoInfo, autoplay = false): string {
  if (info.provider === 'tiktok') {
    return `https://www.tiktok.com/embed/v2/${info.id}`;
  }
  return `https://www.youtube.com/embed/${info.id}${autoplay ? '?autoplay=1' : ''}`;
}

// Thumbnail para YouTube (TikTok no expone thumbnail estático por ID).
export function youtubeThumb(id: string, quality: 'mq' | 'hq' = 'mq'): string {
  return `https://img.youtube.com/vi/${id}/${quality}default.jpg`;
}
