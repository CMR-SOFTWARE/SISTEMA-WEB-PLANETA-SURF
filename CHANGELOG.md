# Changelog

Registro de cambios y correcciones. Formato: fecha, qué se hizo, por qué, archivos tocados.

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
