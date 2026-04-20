export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
// Duración de la sesión cuando el user marca "Recordarme". 30 días cubre el
// caso habitual sin comprometer demasiado la seguridad (sessions largas son
// un trade-off: comodidad vs ventana de robo de cookie).
export const REMEMBER_ME_MS = 1000 * 60 * 60 * 24 * 30;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
