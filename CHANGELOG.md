# Changelog

Registro de cambios y correcciones. Formato: fecha, qué se hizo, por qué, archivos tocados.

## 2026-09-07

### fix(critical): turnos se consideraban vencidos 3 horas antes de tiempo (timezone)

- **Qué**: `toAppointmentTimestamp` (`server/index.js`) construía la hora del turno con `new Date(year, month-1, day, hour, minute)`, que se interpreta en el timezone del proceso — Vercel corre en UTC por defecto. Como Argentina es UTC-3, un turno anotado "18:00" (hora local) se evaluaba como 18:00 UTC = 15:00 hora argentina real. Resultado: el sistema consideraba "vencido" cualquier turno 3 horas antes de que en realidad pasara. Se cambió a `Date.UTC(...) + 3h` fijo (Argentina no usa horario de verano desde 2009), independiente del timezone del proceso.
- **Por qué**: descubierto al recuperar los turnos borrados de hoy (7/9) — varios de los borrados NO habían concluido todavía en la realidad cuando la purga (ya sacada) los eliminó. Verificado con una simulación: con hora real argentina 14:00, el código viejo marcaba como vencidos turnos de las 14:00 y las 16:00 (a este le faltaban 2 horas), mientras que el código nuevo los marca correctamente como no vencidos.
- **Impacto adicional (todavía activo hasta este fix)**: la misma función se usa para rechazar reservas en horarios pasados (`POST /api/:slug/reservas`). Un cliente reservando un turno para dentro de las próximas ~3 horas podía recibir "Ese horario ya pasó" de forma incorrecta, todos los días.
- **Archivos**: `server/index.js` (`toAppointmentTimestamp`).

### fix(critical): se dejó de borrar turnos automáticamente al pasar su horario

- **Qué**: `purgeExpiredAppointments` (antes en `server/index.js`) borraba de la base — `DELETE` real, más el archivo de comprobante en Supabase Storage — cualquier turno no cancelado (`pendiente` o `confirmada`) apenas pasaba su horario. Corría en 3 lugares: al crear una reserva pública, al abrir la Agenda del admin, y en el polling en vivo del dashboard (cada 2.5s). En la práctica, cualquier turno ya ocurrido desaparecía de la base en segundos, comprobante de pago incluido. Se eliminó la función entera y sus 3 llamados.
- **Por qué**: surgió al pedirme una sección de "turnos que pasaron/concluyeron" en la Agenda — no se podía construir porque esos datos ya no existían. El texto de la UI ("si no se transfiere ese monto, el turno se cancela automáticamente") sugiere que la intención original era cancelar reservas pendientes sin pagar para liberar el horario, pero el filtro no distinguía `pendiente` de `confirmada`, y usaba `DELETE` en vez de marcar `cancelada`. Además esa liberación de horario no hacía falta: crear una reserva ya rechaza horarios pasados (`toAppointmentTimestamp(...) < Date.now()`), así que un slot vencido nunca se puede volver a reservar exista o no el registro viejo.
- **Impacto real**: turnos ya ocurridos anteriores a este fix se perdieron (`DELETE`, no soft-delete). Recuperación parcial posible vía la tabla `movimientos` (no se tocó, tiene servicio/nombre/fecha/monto de los turnos que se cobraron) o vía un backup de Supabase restaurado a un proyecto nuevo — decisión del negocio, no ejecutable desde acá.
- **Archivos**: `server/index.js` (eliminadas `isAppointmentExpired`, `purgeExpiredAppointments` y sus 3 llamados).

### feat: turnos concluidos visibles en la lista y el calendario de Agenda

- **Qué**: agregado un estado derivado `"concluida"` — puramente de UI, no se guarda en la base — para cualquier turno no cancelado cuya fecha+hora ya pasó (`isAppointmentPast` / `displayEstado` en `admin.js`). Se ve como badge "Concluido" (gris, `badge-neutral`) en la lista, como nueva opción en el filtro de Estado, y atenuado (opacidad reducida) en los bloques del calendario semanal. El botón "Modificar horario" se deshabilita para turnos concluidos (no tiene sentido reagendar algo que ya pasó); "Cancelar" se mantiene disponible por si hace falta marcar un no-show.
- **Por qué**: pedido explícito — ver en la Agenda (lista y calendario) los turnos que ya pasaron/se hicieron, distinto de los próximos.
- **Verificado**: lógica de `isAppointmentPast`/`displayEstado` probada de forma aislada con 5 casos (pasado/futuro × confirmada/pendiente/cancelada/sin-hora) — todos correctos. No se pudo probar visualmente con datos reales porque el entorno local apunta a la Supabase de producción y el slug no resuelve ahí; revisar en el panel real después de deployar.
- **Archivos**: `public/admin.js` (`estadoBadge`, `isAppointmentPast`, `displayEstado`, `filteredReservas`, `renderReservas`, `renderMiniTurno`, `renderCalendario`), `public/admin.html` (opción de filtro "Concluido", CSS `.appt-row.is-concluida` y `.cal-block.is-concluida`).

## 2026-09-03

### fix: caché en memoria para datos de negocio (performance)

- **Qué**: `getBusinessBySlug` ahora cachea su resultado 20s en memoria (`server/index.js`). La caché se invalida automáticamente en cualquier escritura exitosa del panel admin (hook agregado en `requireAdmin`).
- **Por qué**: la función se llama en cada request público (config, productos-destacados, videos, galería, etc. vía `resolveBusiness`) y hace varios round-trips secuenciales a Supabase (negocio + profesionales/servicios/planes + vínculos). Una sola carga de landing repetía ese trabajo 4 veces. Diagnosticado a partir de la consulta del usuario sobre latencia en la página.
- **Archivos**: `server/index.js` (función `getBusinessBySlug`/`getBusinessBySlugUncached`, `requireAdmin`).

### fix: sacar Tailwind Play CDN, compilar en build time

- **Qué**: `index.html`, `tratamientos.html`, `market.html`, `cart.html` y `admin.html` cargaban Tailwind vía `<script src="https://cdn.tailwindcss.com">` — generaba el CSS en el navegador, en cada visita, en vez de servir un `.css` compilado. Se agregó `@tailwindcss/cli` como dev dependency, `src/tailwind-input.css` como entrada del build (`@import "tailwindcss"` + `@config "../tailwind.config.ts"`), y `npm run build:css` compila todo a `public/tailwind-build.css` (36 KB minificado). Las 5 páginas ahora cargan ese `.css` estático en vez del script del CDN. Se borró `public/tailwind-theme.js` (quedó sin uso).
- **Por qué**: Tailwind advierte explícitamente que el Play CDN no es apto para producción (JIT en el browser, script bloqueante contra un dominio externo). Era el mayor contribuyente a la latencia percibida de la landing.
- **Gotcha importante**: Tailwind v4 compila usando CSS Cascade Layers nativas (`@layer`) — cualquier regla dentro de un layer pierde automáticamente contra una regla sin layer, sin importar especificidad. `globals.css` define `h1/h2/h3` sueltos (sin layer), así que al principio esto rompía la cascada: las utilidades de Tailwind (que ahora viven en `@layer utilities`) dejaban de poder ganarle a esos selectores de elemento en algunos casos, y en otros el reset de Tailwind (`@layer base`) le ganaba a `globals.css` por orden de aparición. Se resolvió importando `globals.css` DENTRO del build como `@import "../public/globals.css" layer(base);`, para que comparta el mismo sistema de layers que Tailwind (base < components < utilities) — así las utilidades explícitas en el HTML siguen ganando, y los estilos de marca (Poppins Black 900, mayúsculas, etc.) aplican por defecto donde no hay override. Se sacó el `<link rel="stylesheet" href="/globals.css">` standalone de las 5 páginas porque duplicarlo fuera del build reintroducía el bug (quedaba sin layer otra vez).
- **Verificado**: comparación A/B visual (stash/pop) entre la versión vieja (CDN) y la nueva en las 5 páginas, desktop y mobile, sin diferencias de layout; sin errores de consola nuevos.
- **Nota operativa**: si se agregan clases nuevas o se cambia `tailwind.config.ts` / `globals.css`, hay que correr `npm run build:css` y commitear el `public/tailwind-build.css` regenerado — no hay build step automático en el deploy de Vercel (usa `@vercel/node` directo sobre `server/index.js`, no corre `npm run build`).
- **Archivos**: `package.json`, `src/tailwind-input.css` (nuevo), `public/tailwind-build.css` (nuevo, generado), `public/index.html`, `public/tratamientos.html`, `public/market.html`, `public/cart.html`, `public/admin.html`, borrado `public/tailwind-theme.js`.

### fix(security): el seed SQL ya no pisa la contraseña de admin al re-ejecutarse

- **Qué**: `supabase-canitoskin.sql` insertaba el admin inicial con `on conflict (business_id) do update set password_hash = ...` — un UPSERT. Si el script se volvía a correr contra producción (reseed, disaster recovery, seguir la guía de setup de nuevo), pisaba silenciosamente cualquier contraseña que el negocio ya hubiera cambiado desde el panel, volviendo a dejar activa `admin123`. Se cambió a `on conflict (business_id) do nothing`: sigue creando el admin inicial en un setup nuevo, pero nunca vuelve a tocar una cuenta que ya existe.
- **Por qué**: surgió al auditar los cambios de performance — el hash de `admin123` está commiteado en el repo (documentado como password inicial), así que es efectivamente público. `server/index.js` no tiene un fallback de auto-seed para Supabase (`seedDefaultBusiness()` hace early-return si `USE_SUPABASE`), o sea que este `.sql` es la ÚNICA vía de creación del admin en producción — no se podía borrar el bloque entero sin dejar un setup nuevo sin forma de loguearse.
- **Pendiente (no lo puedo hacer yo)**: verificar que `ADMIN_SESSION_SECRET` esté seteado en las env vars de Vercel (tiene fallback hardcodeado en `server/index.js:30` si falta) y, si el repo tuvo colaboradores externos o fue público, tratar el hash de `admin123` como comprometido más allá de este fix.
- **Archivos**: `supabase-canitoskin.sql`.
