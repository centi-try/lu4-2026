# Hallazgos de navegador

## Autenticación inicial

- La pantalla de login ya no muestra botones de acceso rápido ni cuentas demo.
- El formulario conserva únicamente correo, contraseña y enlace de registro.
- Aparece un bloque informativo de **acceso administrado**.
- El ingreso con el usuario por defecto **superadmin@inventory.com** fue exitoso.
- Tras iniciar sesión, el panel lateral muestra la sección **Administración** y el acceso a **Gestión de Usuarios**, señal de que el rol `super_admin` quedó operativo en la interfaz.

## Gestión de usuarios en vivo

Se abrió la sección **Gestión de Usuarios** con la sesión del Super Admin y la interfaz mostró correctamente el panel administrativo. En esa vista aparecieron el buscador, los filtros por rol, el conteo de usuarios y las acciones de seguridad por fila.

Durante la prueba visual se desactivó una de las cuentas de prueba desde la propia interfaz. El tablero actualizó de inmediato los indicadores de **Cuentas Activas** y **Desactivadas**, y la fila afectada pasó a mostrar el estado **Desactivado** junto con el botón de **Activar cuenta**, lo que confirma que la acción se ejecutó en vivo sobre el servidor activo.

La prueba de cierre de sesión del **Super Admin** también fue satisfactoria. Desde el menú de usuario se ejecutó el cierre de sesión y la aplicación regresó inmediatamente al formulario de acceso, lo que confirma que el endpoint de logout y la limpieza de sesión en cliente quedaron operativos.

La validación con un **usuario común** confirmó la restricción principal solicitada. Tras iniciar sesión con una cuenta estándar activa, la interfaz mostró únicamente el perfil del usuario autenticado y dejó de exponer la administración de usuarios. Tampoco apareció el menú de **cambio de cuentas** que sí estaba disponible para el Super Admin, por lo que la navegación visible quedó restringida a funciones operativas normales.

Además, se intentó entrar manualmente a **/admin/users** con un usuario común autenticado y la pantalla respondió con **Acceso Denegado**. Al abrir el menú del perfil de ese usuario solo apareció la opción **Cerrar Sesión**, sin ninguna alternativa para **cambiar de cuenta**, lo que confirma que esa capacidad quedó reservada al Super Admin.

Se restableció la sesión del **Super Admin** y se confirmó nuevamente que el panel de gestión de usuarios queda disponible solo para este perfil. En la vista administrativa se observó el estado persistente de una cuenta previamente desactivada, con los contadores actualizados en **3 activas** y **1 desactivada**, lo que también valida la persistencia de los cambios entre sesiones.

La prueba de **reactivar usuario** se completó correctamente desde el panel del Super Admin. Tras pulsar la acción de la fila desactivada, la cuenta volvió a estado activo y los indicadores del tablero regresaron a **4 activas** y **0 desactivadas**, confirmando que la activación funciona en tiempo real y queda reflejada inmediatamente en la vista administrativa.

También se validó el **cambio de rol** desde la interfaz del Super Admin. Al abrir el selector de rol de una cuenta de prueba y elegir **Mapper**, la etiqueta de la fila se actualizó inmediatamente a ese nuevo perfil, confirmando que la administración de roles funciona en vivo y con persistencia visible en el panel.
