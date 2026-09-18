// Helpers compartidos por todas las páginas públicas del sitio.
window.PS = (function () {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function formatPrice(value) {
    const n = Number(value) || 0;
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  }

  // Convención del backend: "\n" literal (dos caracteres) separa líneas del headline.
  function splitLines(text) {
    return String(text || "").split("\\n");
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
  }

  function buildWhatsAppUrl(numero, texto) {
    const num = String(numero || "").replace(/\D/g, "");
    if (!num) return null;
    return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
  }

  function productoWhatsAppMessage(producto) {
    const precio = producto.precioPromocional ?? producto.precio;
    const url = `${window.location.origin}/producto/${producto.id}`;
    return `Hola! Quiero consultar por este producto:\n${producto.nombre} - ${formatPrice(precio)}\n${url}`;
  }

  async function loadConfig() {
    const config = await fetchJson("/api/config");
    if (config.colorMarca) {
      document.documentElement.style.setProperty("--ps-ink", config.colorMarca);
    }
    return config;
  }

  function renderTopbar(config) {
    const el = document.querySelector("[data-topbar]");
    if (!el) return;
    const partes = [];
    if (config.direccion) {
      partes.push(`<span class="flex items-center gap-1.5"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>${escapeHtml(config.direccion)}</span>`);
    }
    if (config.horarioTexto) {
      partes.push(`<span class="hidden items-center gap-1.5 sm:flex"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>${escapeHtml(config.horarioTexto)}</span>`);
    }
    const social = [];
    if (config.instagramUrl) {
      social.push(`<a href="${escapeHtml(config.instagramUrl)}" target="_blank" rel="noopener" aria-label="Instagram" class="opacity-80 hover:opacity-100"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>`);
    }
    const waUrl = buildWhatsAppUrl(config.whatsappNumero, "Hola! Quería hacer una consulta.");
    if (waUrl) {
      social.push(`<a href="${waUrl}" target="_blank" rel="noopener" aria-label="WhatsApp" class="opacity-80 hover:opacity-100"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor"><g transform="translate(12 12) scale(1.25) translate(-12 -12)"><path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-7.94 7.94c0 1.4.37 2.76 1.07 3.96L4 20l4.2-1.1a7.9 7.9 0 0 0 3.85 1h.003a7.94 7.94 0 0 0 7.94-7.94 7.9 7.9 0 0 0-2.34-5.64ZM12.05 18.4a6.4 6.4 0 0 1-3.27-.9l-.23-.14-2.44.64.65-2.38-.15-.24a6.4 6.4 0 0 1-1-3.44 6.46 6.46 0 0 1 11.02-4.58 6.4 6.4 0 0 1 1.9 4.58 6.46 6.46 0 0 1-6.46 6.46Zm3.54-4.84c-.19-.1-1.15-.57-1.33-.63-.18-.06-.3-.1-.44.1-.13.2-.5.63-.6.75-.12.13-.23.15-.42.05-.19-.1-.82-.3-1.56-.96a5.8 5.8 0 0 1-1.08-1.34c-.11-.19 0-.3.09-.4.09-.09.19-.23.29-.34.1-.12.13-.2.2-.33.06-.13.03-.25 0-.35-.05-.1-.44-1.06-.6-1.45-.16-.38-.32-.33-.44-.33h-.37c-.13 0-.34.05-.52.25-.18.2-.68.67-.68 1.63 0 .96.7 1.9.8 2.02.1.13 1.37 2.1 3.33 2.94.47.2.83.32 1.12.4.47.15.9.13 1.24.08.38-.06 1.15-.47 1.31-.92.16-.46.16-.85.11-.93-.05-.08-.18-.13-.37-.23Z"/></g></svg></a>`);
    }
    el.innerHTML = `
      <div class="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2 text-[11px] sm:px-6">
        <div class="flex items-center gap-4">${partes.join("")}</div>
        <div class="flex items-center gap-3">${social.join("")}</div>
      </div>`;
  }

  function renderHeader(config, opts = {}) {
    const el = document.querySelector("[data-header]");
    if (!el) return;
    const active = opts.active || "";
    const navLink = (href, label, extraClass) =>
      `<a href="${href}" class="ps-nav-link ${extraClass || ""} ${active === label ? "is-active" : ""}">${label}</a>`;
    el.innerHTML = `
      <div class="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <a href="/" class="flex shrink-0 items-center gap-2" aria-label="Ir al inicio">
          <img src="${escapeHtml(config?.logoUrl || "/images/logo-header.png")}" alt="" class="h-10 w-auto object-contain" />
          <span class="font-display text-sm font-black uppercase tracking-tight">${escapeHtml(config?.nombre || "Planeta Surf")}</span>
        </a>
        <nav class="hidden items-center gap-7 lg:flex" aria-label="Secciones">
          ${navLink("/productos?orden=novedades", "Nuevos ingresos")}
          ${navLink("/productos?promocion=1", "Sale de invierno", "ps-nav-link--accent")}
          ${navLink("/productos", "Productos")}
        </nav>
        <div class="flex shrink-0 items-center gap-4">
          <form action="/productos" method="get" class="hidden items-center md:flex" role="search">
            <input type="search" name="q" placeholder="Buscar productos" aria-label="Buscar productos"
              class="w-40 border-b border-transparent bg-transparent py-1 text-sm focus:border-brand-ink focus:outline-none" />
            <button type="submit" aria-label="Buscar" class="ml-1">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
          </form>
          <button type="button" aria-label="Mi cuenta" class="hidden sm:inline-flex" title="Próximamente">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
          </button>
          <button type="button" aria-label="Favoritos" class="hidden sm:inline-flex" title="Próximamente">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          </button>
        </div>
      </div>`;
  }

  function renderFooter(config) {
    const el = document.querySelector("[data-footer]");
    if (!el) return;
    el.innerHTML = `
      <div class="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
        <div class="grid gap-8 sm:grid-cols-3">
          <div>
            <div class="font-display text-sm font-black uppercase">${escapeHtml(config?.nombre || "Planeta Surf")}</div>
            <p class="mt-2 text-meta">${escapeHtml(config?.direccion || "")}</p>
          </div>
          <div>
            <div class="text-h3">Horarios</div>
            <p class="mt-2 text-meta">${escapeHtml(config?.horarioTexto || "")}</p>
          </div>
          <div>
            <div class="text-h3">Seguinos</div>
            <div class="mt-2 flex gap-3">
              ${config?.instagramUrl ? `<a href="${escapeHtml(config.instagramUrl)}" target="_blank" rel="noopener" class="text-meta hover:text-brand-ink">Instagram</a>` : ""}
            </div>
          </div>
        </div>
        <p class="mt-8 border-t border-brand-line pt-4 text-meta-sm">© ${new Date().getFullYear()} ${escapeHtml(config?.nombre || "Planeta Surf")} · Sistema desarrollado por <a href="https://www.instagram.com/cmrsoftware.sn/" target="_blank" rel="noopener" class="hover:text-brand-ink hover:underline">CMR Software Solutions</a></p>
      </div>`;
  }

  function productoTag(producto) {
    if (!producto.etiqueta) return "";
    const isAccent = /sale|oferta/i.test(producto.etiqueta);
    return `<span class="ps-tag ${isAccent ? "ps-tag--accent" : ""}">${escapeHtml(producto.etiqueta)}</span>`;
  }

  function productoPrecioHtml(producto) {
    const tienePromo = producto.precioPromocional != null && producto.precioPromocional < producto.precio;
    if (!tienePromo) return `<span class="font-semibold">${formatPrice(producto.precio)}</span>`;
    return `
      <span class="text-secondary line-through">${formatPrice(producto.precio)}</span>
      <span class="ml-1.5 font-semibold text-brand-accent">${formatPrice(producto.precioPromocional)}</span>`;
  }

  function renderProductCard(producto) {
    const img = producto.imagenPrincipal
      ? `<img src="${escapeHtml(producto.imagenPrincipal)}" alt="${escapeHtml(producto.nombre)}" loading="lazy" />`
      : `<div class="flex h-full items-center justify-center text-meta-sm">Sin imagen</div>`;
    const sinStock = !producto.disponible;
    return `
      <a href="/producto/${producto.id}" class="ps-product-card">
        <div class="ps-product-card__media">
          ${img}
          ${productoTag(producto)}
          <span class="ps-fav-btn" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          </span>
          ${sinStock ? `<div class="absolute inset-0 flex items-center justify-center bg-white/70"><span class="ps-tag">Sin stock</span></div>` : ""}
        </div>
        <div class="mt-3">
          <div class="text-sm">${escapeHtml(producto.nombre)}</div>
          <div class="mt-1 text-sm">${productoPrecioHtml(producto)}</div>
          ${producto.precioPromocional != null && producto.promocionTitulo
            ? `<div class="text-xs font-semibold text-brand-accent">${escapeHtml(producto.promocionTitulo)}</div>` : ""}
        </div>
      </a>`;
  }

  return {
    escapeHtml, formatPrice, splitLines, fetchJson, buildWhatsAppUrl, productoWhatsAppMessage,
    loadConfig, renderTopbar, renderHeader, renderFooter, renderProductCard,
  };
})();
