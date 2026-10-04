/** Usuario que el Super Admin está viendo con "Cambiar cuenta activa" (null = su propia cuenta). */
let viewAsUserId: number | null = null;

export const VIEW_AS_HEADER = 'x-dkp-view-as';
export const getViewAsUserId = () => viewAsUserId;
export function setViewAsUserId(id: number | null) {
  viewAsUserId = id;
}
