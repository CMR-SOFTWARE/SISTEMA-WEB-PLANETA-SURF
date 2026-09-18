(async function () {
  const { escapeHtml, splitLines, fetchJson, loadConfig, renderTopbar, renderHeader, renderFooter, renderProductCard } = window.PS;

  // Las 4 llamadas son independientes entre sí — se disparan todas juntas
  // en vez de una despues de la otra, así el tiempo total es el de la más
  // lenta, no la suma de las cuatro.
  const [configResult, slidesResult, productosResult, categoriasResult] = await Promise.allSettled([
    loadConfig(),
    fetchJson("/api/hero-slides"),
    fetchJson("/api/productos-home"),
    fetchJson("/api/categorias"),
  ]);

  const config = configResult.status === "fulfilled" ? configResult.value : {};
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

  // Galería del hero — son las primeras fotos que ve el usuario, se cargan
  // sin loading="lazy" (eso solo tiene sentido para contenido fuera de
  // pantalla, acá solo agrega demora) y con fetchpriority alta.
  try {
    const slides = slidesResult.status === "fulfilled" ? slidesResult.value : [];
    const gallery = document.getElementById("heroGallery");
    const dots = document.getElementById("heroDots");
    if (slides.length) {
      gallery.innerHTML = slides.slice(0, 4).map((s, i) => `
        <div class="aspect-[3/4] w-[70%] shrink-0 snap-start overflow-hidden bg-brand-mist sm:w-auto sm:shrink sm:snap-none">
          <img src="${escapeHtml(s.imagenUrl)}" alt="" class="h-full w-full object-cover" fetchpriority="${i === 0 ? "high" : "auto"}" />
        </div>`).join("");
      dots.innerHTML = slides.slice(0, 4).map((_, i) => `<span class="h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-brand-ink" : "bg-brand-line"}"></span>`).join("");

      // En mobile la galería es un carrusel con scroll-snap; los puntos
      // deben reflejar qué foto está a la vista mientras se desliza.
      const dotEls = [...dots.children];
      let scrollRaf = null;
      gallery.addEventListener("scroll", () => {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = null;
          const tile = gallery.children[0];
          if (!tile) return;
          const tileWidth = tile.getBoundingClientRect().width;
          const gap = 8; // gap-2
          const activeIndex = Math.round(gallery.scrollLeft / (tileWidth + gap));
          dotEls.forEach((dot, i) => {
            dot.classList.toggle("bg-brand-ink", i === activeIndex);
            dot.classList.toggle("bg-brand-line", i !== activeIndex);
          });
        });
      }, { passive: true });
    } else {
      gallery.innerHTML = Array.from({ length: 4 }).map(() => `
        <div class="aspect-[3/4] w-[70%] shrink-0 snap-start border border-dashed border-brand-line bg-white/40 sm:w-auto sm:shrink sm:snap-none"></div>`).join("");
      const caption = document.createElement("p");
      caption.className = "mt-2 text-center text-meta-sm";
      caption.textContent = "Cargá imágenes del hero desde el panel admin";
      gallery.after(caption);
    }
  } catch (_) { /* sin datos, se deja vacío */ }

  // Scroll animado a mano (en vez de scrollBy({behavior:"smooth"})): el
  // smooth nativo del navegador varía de duración/curva entre navegadores
  // y se siente brusco al encadenar clicks. Con requestAnimationFrame +
  // easing propio el deslizamiento es siempre el mismo, suave y prolijo,
  // y un click nuevo interrumpe al anterior en vez de sumarse (sin saltos).
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function smoothScrollBy(el, delta, duration = 500) {
    if (el._scrollRaf) cancelAnimationFrame(el._scrollRaf);
    // El CSS trae scroll-behavior:smooth para el swipe táctil -- si queda
    // activo, el navegador le suma SU propio suavizado a cada asignación
    // de scrollLeft de este loop y el resultado tiembla. Se apaga durante
    // la animación propia y no hace falta reponerlo (el touch usa scroll
    // nativo del dedo, no scrollLeft, así que no lo necesita tampoco).
    el.style.scrollBehavior = "auto";
    const start = el.scrollLeft;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      el.scrollLeft = start + delta * easeInOutCubic(progress);
      el._scrollRaf = progress < 1 ? requestAnimationFrame(step) : null;
    }
    el._scrollRaf = requestAnimationFrame(step);
  }

  // Wiring de flechas prev/next para una fila con scroll horizontal —
  // reutilizado por Destacados y Categorías (mismo patrón de UX).
  function wireScrollRow(grid, prevBtn, nextBtn) {
    // Desliza de a un tile por click (mas sutil que saltar casi una pantalla entera).
    const scrollAmount = () => {
      const tile = grid.children[0];
      if (!tile) return grid.clientWidth;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      return Math.round(tile.getBoundingClientRect().width + gap);
    };
    function actualizarFlechas() {
      // En mobile ya se desliza con el dedo, las flechas solo van en desktop.
      const esMobile = window.innerWidth < 640;
      const max = grid.scrollWidth - grid.clientWidth - 4;
      const puedeVolver = !esMobile && grid.scrollLeft > 4;
      const puedeAvanzar = !esMobile && grid.scrollLeft < max;
      prevBtn.style.opacity = puedeVolver ? "1" : "0";
      prevBtn.style.pointerEvents = puedeVolver ? "auto" : "none";
      nextBtn.style.opacity = puedeAvanzar ? "1" : "0";
      nextBtn.style.pointerEvents = puedeAvanzar ? "auto" : "none";
    }
    prevBtn.addEventListener("click", () => smoothScrollBy(grid, -scrollAmount()));
    nextBtn.addEventListener("click", () => smoothScrollBy(grid, scrollAmount()));
    grid.addEventListener("scroll", actualizarFlechas);
    window.addEventListener("resize", actualizarFlechas);
    window.addEventListener("load", actualizarFlechas);
    // El ancho real de la fila depende del layout de las imágenes, así que
    // se recalcula un frame después de pintar el DOM y de nuevo cuando
    // terminen de cargar todas las imágenes de la página.
    requestAnimationFrame(() => requestAnimationFrame(actualizarFlechas));
  }

  // Productos destacados (mostrar en home)
  try {
    const productos = productosResult.status === "fulfilled" ? productosResult.value : [];
    const grid = document.getElementById("destacadosGrid");
    const vacio = document.getElementById("destacadosVacio");
    if (productos.length) {
      grid.innerHTML = productos.map(renderProductCard).join("");
      wireScrollRow(grid, document.getElementById("destacadosPrev"), document.getElementById("destacadosNext"));
    } else {
      vacio.classList.remove("hidden");
    }
  } catch (_) { /* sin datos */ }

  // Categorías
  try {
    const categorias = categoriasResult.status === "fulfilled" ? categoriasResult.value : [];
    const grid = document.getElementById("categoriasGrid");
    grid.innerHTML = categorias.map((c) => `
      <a href="/productos?categoria=${encodeURIComponent(c.slug)}" class="ps-category-tile">
        ${c.imagenUrl ? `<img src="${escapeHtml(c.imagenUrl)}" alt="${escapeHtml(c.nombre)}" loading="lazy" />` : `<div class="h-full w-full bg-brand-mist"></div>`}
        <div class="ps-category-tile__label">
          <div class="font-display text-lg font-black uppercase text-white">${escapeHtml(c.nombre)}</div>
          <div class="text-xs font-semibold uppercase tracking-wide text-white">Ver más →</div>
        </div>
      </a>`).join("");
    wireScrollRow(grid, document.getElementById("categoriasPrev"), document.getElementById("categoriasNext"));
  } catch (_) { /* sin datos */ }
})();
