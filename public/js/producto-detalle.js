(async function () {
  const { escapeHtml, formatPrice, fetchJson, loadConfig, renderTopbar, renderHeader, renderFooter, buildWhatsAppUrl, productoWhatsAppMessage } = window.PS;

  let config;
  try { config = await loadConfig(); } catch (_) { config = {}; }
  renderTopbar(config);
  renderHeader(config, { active: "" });
  renderFooter(config);

  const id = window.location.pathname.split("/").pop();

  let producto;
  try {
    producto = await fetchJson(`/api/productos/${id}`);
  } catch (_) {
    document.getElementById("productoNoEncontrado").classList.remove("hidden");
    return;
  }

  document.getElementById("pageTitle").textContent = `${producto.nombre} — Planeta Surf`;
  document.getElementById("productoContent").classList.remove("hidden");
  document.getElementById("productoContent").classList.add("grid");

  document.getElementById("prodCategoria").textContent = producto.categoria?.nombre || "";
  document.getElementById("prodNombre").textContent = producto.nombre;

  if (producto.etiqueta) {
    const isAccent = /sale|oferta/i.test(producto.etiqueta);
    document.getElementById("prodTag").innerHTML = `<span class="ps-tag ${isAccent ? "ps-tag--accent" : ""}" style="position:static;display:inline-block;">${escapeHtml(producto.etiqueta)}</span>`;
  }

  const tienePromo = producto.precioPromocional != null && producto.precioPromocional < producto.precio;
  document.getElementById("prodPrecio").innerHTML = tienePromo
    ? `<span class="text-secondary line-through">${formatPrice(producto.precio)}</span> <span class="ml-2 font-semibold text-brand-accent">${formatPrice(producto.precioPromocional)}</span>`
    : `<span class="font-semibold">${formatPrice(producto.precio)}</span>`;
  if (tienePromo && producto.promocionTitulo) {
    const tituloEl = document.createElement("p");
    tituloEl.className = "mt-1 text-sm font-semibold text-brand-accent";
    tituloEl.textContent = producto.promocionTitulo;
    document.getElementById("prodPrecio").after(tituloEl);
  }

  document.getElementById("prodDisponibilidad").textContent = producto.disponible ? "Disponible" : "Sin stock por el momento";
  document.getElementById("prodDescripcion").textContent = producto.descripcion || "";

  if (producto.talles?.length) {
    document.getElementById("prodTallesWrap").classList.remove("hidden");
    document.getElementById("prodTalles").innerHTML = producto.talles
      .map((t) => `<span class="border border-brand-line px-3 py-1 text-sm">${escapeHtml(t)}</span>`).join("");
  }

  const imagenes = [producto.imagenPrincipal, ...(producto.imagenesAdicionales || [])].filter(Boolean);
  const principal = document.getElementById("galeriaPrincipal");
  const miniaturas = document.getElementById("galeriaMiniaturas");

  function mostrarImagen(url) {
    principal.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(producto.nombre)}" class="h-full w-full object-cover" />` : "";
  }

  if (imagenes.length) {
    mostrarImagen(imagenes[0]);
    if (imagenes.length > 1) {
      miniaturas.innerHTML = imagenes.map((url, i) => `
        <button type="button" data-idx="${i}" class="aspect-square overflow-hidden bg-brand-mist border ${i === 0 ? "border-brand-ink" : "border-transparent"}">
          <img src="${escapeHtml(url)}" alt="" class="h-full w-full object-cover" />
        </button>`).join("");
      miniaturas.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          mostrarImagen(imagenes[Number(btn.dataset.idx)]);
          miniaturas.querySelectorAll("button").forEach((b) => b.classList.remove("border-brand-ink"));
          btn.classList.add("border-brand-ink");
        });
      });
    }
  } else {
    principal.innerHTML = `<div class="flex h-full items-center justify-center text-meta-sm">Sin imagen</div>`;
  }

  const waUrl = buildWhatsAppUrl(config.whatsappNumero, productoWhatsAppMessage(producto));
  const btn = document.getElementById("btnConsultar");
  if (waUrl) {
    btn.href = waUrl;
  } else {
    btn.classList.add("hidden");
  }
})();
