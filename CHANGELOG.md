# Historial de cambios

Cambios de cada versión, de la más reciente a la más antigua. Este archivo se
muestra en la aplicación en **Sistema → Acerca de**: cada versión es un título
`## vX.Y.Z — AAAA-MM-DD` seguido de una lista de cambios con `- `.

## v1.0.12 — 2026-10-02
- **Dashboards mensualizados**: Dashboard y Deudas tienen un selector de período (todo el historial o un mes, con flechas para pasar de mes). El período elegido se mantiene al pasar de un tablero al otro.
- Nuevo gráfico **Evolución mensual** de los últimos 12 meses (facturado y cobrado), con vista de tabla; tocando un mes se ve su detalle.
- Nuevas tarjetas de **Facturado** y **Cobrado** en el Dashboard.
- Corrección: la "Deuda total" del Dashboard sumaba solo los primeros 8 clientes con saldo.
- Corrección: a los usuarios sin permiso en alguna sección el Dashboard les aparecía vacío; ahora ven las tarjetas que les corresponden.

## v1.0.11 — 2026-10-02
- Nueva pantalla **Sistema → Acerca de** (solo administradores) con la versión instalada y este historial de cambios.

## v1.0.10 — 2026-10-02
- Nueva sección **Inventario → Ingreso de stock**: la lista habitual de productos aparece cargada y solo hay que completar las cantidades. Se pueden sumar productos para un ingreso puntual y guardar una referencia (remito, proveedor).
- El ingreso se registra todo junto o nada, con un movimiento de stock por producto y su registro en la auditoría.
- La restauración de backups ahora deja la base idéntica al backup, no modifica nada si falla y nunca deja la aplicación detenida.

## v1.0.9 — 2026-10-02
- Nuevo **registro de auditoría** (Sistema → Auditoría, solo administradores): altas, cambios, bajas, ingresos de stock, cambios de configuración e inicios de sesión (incluidos los fallidos), con usuario, fecha, IP y datos enviados.
- Filtros por usuario, sección, resultado, fechas y texto; exportación a CSV.
- Retención configurable en Configuración (365 días por defecto).

## v1.0.8 — 2026-10-02
- **Monitor de usuarios conectados** en Sistema → Usuarios (solo administradores): quién está en línea, última actividad y último ingreso, con actualización automática.

## v1.0.7 — 2026-10-02
- **Favicon configurable** en Configuración (SVG, PNG o ICO). Sin configurar se muestra un ícono propio de la aplicación.

## v1.0.6 — 2026-10-02
- Corrección: no se podían guardar ni crear productos que no fueran cajas (error "Introduzca un número entero válido").

## v1.0.5 — 2026-10-02
- Cuenta corriente: queda claro que el buscador filtra la lista de clientes y que el cliente se elige en el selector, que indica cuántas coincidencias hay.

## v1.0.4 — 2026-10-02
- En el celular, botón para ver las listas como **tarjetas** en lugar de tablas (por defecto, tabla). La preferencia queda guardada en el dispositivo.
- Las tarjetas de resumen ya no se cortan en pantallas chicas.

## v1.0.3 — 2026-10-02
- **Versión móvil**: la barra lateral se oculta y se abre con el botón de menú.
- Los usuarios con permiso de solo lectura ya no ven botones de edición que después fallan.
- Corrección: los usuarios que no son administradores no podían crear hojas de ruta ("Nueva hoja" no respondía).

## v1.0.2 — 2026-10-01
- La pantalla de ingreso ya no muestra el usuario y la contraseña por defecto.

## v1.0.1 — 2026-10-01
- Corrección: los mapas aparecían bloqueados ("Access blocked") por la política de uso de OpenStreetMap.

## v1.0.0 — 2026-10-01
- Primera versión para producción.
- Precios de los pedidos calculados por el sistema según la lista de precios del cliente; solo productos habilitados para cada cliente.
- Políticas configurables: pedidos sin stock, pagos mayores al saldo, pagos de pedidos anulados y quién aprueba pagos.
- Pagos con estados controlados (pendiente, aprobado, rechazado, reembolsado).
- Numeración de pedidos (NV) y hojas de ruta (HR) sin duplicados.
- Aviso al cargar un pedido si el cliente ya tiene pedidos ese día.
- Listados más rápidos con muchos clientes y pedidos.
- Instalación en red local o en internet con HTTPS, límite de intentos de ingreso y backups automáticos.
