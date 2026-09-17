(async function () {
  const { escapeHtml, splitLines, fetchJson, loadConfig, renderTopbar, renderHeader, renderFooter, renderProductCard } = window.PS;

  let config;
  try {
    config = await loadConfig();
  } catch (_) {
    config = {};
  }
  renderTopbar(config);
  renderHeader(config, { active: "" });
  renderFooter(config);

  const lineas = splitLines(config.heroTitulo || "TU ESTILO.\\nTU PLANETA.");
  document.getElementById("heroTitulo").innerHTML = lineas.map((l) => escapeHtml(l)).join("<br />");
  document.getElementById("heroSubtitulo").textContent = config.heroSubtitulo || "";

  const ctaPrimario = document.getElementById("heroCtaPrimario");
  if (config.heroCtaPrimarioTexto) ctaPrimario.textContent = config.heroCtaPrimarioTexto;
  if (config.heroCtaPrimarioLink) ctaPrimario.href = config.heroCtaPrimarioLink;

  const ctaSecundario = document.getElementById("heroCtaSecundario");
  if (config.heroCtaSecundarioTexto) ctaSecundario.textContent = config.heroCtaSecundarioTexto;
  if (config.heroCtaSecundarioLink) ctaSecundario.href = config.heroCtaSecundarioLink;

  document.getElementById("beneficio1Titulo").textContent = config.beneficio1Titulo || "";
  document.getElementById("beneficio1Subtitulo").textContent = config.beneficio1Subtitulo || "";
  document.getElementById("beneficio2Titulo").textContent = config.beneficio2Titulo || "";
  document.getElementById("beneficio2Subtitulo").textContent = config.beneficio2Subtitulo || "";
  document.getElementById("beneficio3Titulo").textContent = config.beneficio3Titulo || "";
  document.getElementById("beneficio3Subtitulo").textContent = config.beneficio3Subtitulo || "";

  // Galería del hero
  try {
    const slides = await fetchJson("/api/hero-slides");
    const gallery = document.getElementById("heroGallery");
    const dots = document.getElementById("heroDots");
    if (slides.length) {
      gallery.innerHTML = slides.slice(0, 4).map((s) => `
        <div class="aspect-[3/4] w-[70%] shrink-0 snap-start overflow-hidden bg-brand-mist sm:w-auto sm:shrink sm:snap-none">
          <img src="${escapeHtml(s.imagenUrl)}" alt="" class="h-full w-full object-cover" loading="lazy" />
        </div>`).join("");
      dots.innerHTML = slides.slice(0, 4).map((_, i) => `<span class="h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-brand-ink" : "bg-brand-line"}"></span>`).join("");
    } else {
      gallery.innerHTML = Array.from({ length: 4 }).map(() => `
        <div class="aspect-[3/4] w-[70%] shrink-0 snap-start border border-dashed border-brand-line bg-white/40 sm:w-auto sm:shrink sm:snap-none"></div>`).join("");
      const caption = document.createElement("p");
      caption.className = "mt-2 text-center text-meta-sm";
      caption.textContent = "Cargá imágenes del hero desde el panel admin";
      gallery.after(caption);
    }
  } catch (_) { /* sin datos, se deja vacío */ }

  // Productos destacados (mostrar en home)
  try {
    const productos = await fetchJson("/api/productos-home");
    const grid = document.getElementById("destacadosGrid");
    const vacio = document.getElementById("destacadosVacio");
    if (productos.length) {
      grid.innerHTML = productos.map(renderProductCard).join("");
    } else {
      vacio.classList.remove("hidden");
    }
  } catch (_) { /* sin datos */ }

  // Categorías
  try {
    const categorias = await fetchJson("/api/categorias");
    const grid = document.getElementById("categoriasGrid");
    grid.innerHTML = categorias.map((c) => `
      <a href="/productos?categoria=${encodeURIComponent(c.slug)}" class="ps-category-tile">
        ${c.imagenUrl ? `<img src="${escapeHtml(c.imagenUrl)}" alt="${escapeHtml(c.nombre)}" loading="lazy" />` : `<div class="h-full w-full bg-brand-mist"></div>`}
        <div class="ps-category-tile__label">
          <div class="font-display text-lg font-black uppercase">${escapeHtml(c.nombre)}</div>
          <div class="text-xs font-semibold uppercase tracking-wide">Ver más →</div>
        </div>
      </a>`).join("");
  } catch (_) { /* sin datos */ }
})();
