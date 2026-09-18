(async function () {
  const { fetchJson, loadConfig, renderTopbar, renderHeader, renderFooter, renderProductCard } = window.PS;

  const els = {
    buscar: document.getElementById("fBuscar"),
    categoria: document.getElementById("fCategoria"),
    talleWrap: document.getElementById("fTalleWrap"),
    talle: document.getElementById("fTalle"),
    disponible: document.getElementById("fDisponible"),
    promocion: document.getElementById("fPromocion"),
    destacado: document.getElementById("fDestacado"),
    orden: document.getElementById("fOrden"),
    limpiar: document.getElementById("fLimpiar"),
    grid: document.getElementById("productosGrid"),
    vacio: document.getElementById("productosVacio"),
    count: document.getElementById("resultadosCount"),
  };

  function readParamsFromUrl() {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("q")) els.buscar.value = sp.get("q");
    if (sp.get("categoria")) els.categoria.value = sp.get("categoria");
    if (sp.get("orden")) els.orden.value = sp.get("orden");
    if (sp.get("promocion") === "1") els.promocion.checked = true;
    if (sp.get("destacado") === "1") els.destacado.checked = true;
  }
  readParamsFromUrl();

  // Header, filtro de categoría, facetas de talle y la grilla inicial no
  // dependen entre sí — se piden todas en paralelo en vez de una por una.
  const initialLoads = Promise.allSettled([
    loadConfig(),
    fetchJson("/api/categorias"),
    fetchJson("/api/productos"),
  ]);

  function buildQuery() {
    const params = new URLSearchParams();
    if (els.buscar.value.trim()) params.set("q", els.buscar.value.trim());
    if (els.categoria.value) params.set("categoria", els.categoria.value);
    if (els.talle.value) params.set("talle", els.talle.value);
    if (els.disponible.checked) params.set("disponible", "1");
    if (els.promocion.checked) params.set("promocion", "1");
    if (els.destacado.checked) params.set("destacado", "1");
    if (els.orden.value && els.orden.value !== "relevancia") params.set("orden", els.orden.value);
    return params;
  }

  let debounceTimer = null;
  async function refrescar({ updateUrl = true } = {}) {
    const params = buildQuery();
    if (updateUrl) {
      const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
      window.history.replaceState(null, "", newUrl);
    }
    const productos = await fetchJson(`/api/productos?${params.toString()}`);
    els.count.textContent = `${productos.length} producto${productos.length === 1 ? "" : "s"}`;
    if (productos.length) {
      els.grid.innerHTML = productos.map(renderProductCard).join("");
      els.vacio.classList.add("hidden");
    } else {
      els.grid.innerHTML = "";
      els.vacio.classList.remove("hidden");
    }
  }

  function onFilterChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refrescar, 250);
  }

  [els.categoria, els.talle, els.disponible, els.promocion, els.destacado, els.orden]
    .forEach((el) => el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", onFilterChange));
  els.buscar.addEventListener("input", onFilterChange);

  els.limpiar.addEventListener("click", () => {
    els.buscar.value = "";
    els.categoria.value = "";
    els.talle.value = "";
    els.disponible.checked = false;
    els.promocion.checked = false;
    els.destacado.checked = false;
    els.orden.value = "relevancia";
    refrescar();
  });

  refrescar({ updateUrl: false });

  const [configResult, categoriasResult, todosResult] = await initialLoads;

  const config = configResult.status === "fulfilled" ? configResult.value : {};
  renderTopbar(config);
  renderHeader(config, { active: "Productos" });
  renderFooter(config);

  if (categoriasResult.status === "fulfilled") {
    els.categoria.innerHTML += categoriasResult.value.map((c) => `<option value="${c.slug}">${c.nombre}</option>`).join("");
  }

  if (todosResult.status === "fulfilled") {
    // Facetas de talle: se calculan sobre el catálogo completo activo.
    // Mezcla talles de ropa y calzado — el admin carga lo que corresponda por producto.
    const ordenLetras = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
    const talles = [...new Set(todosResult.value.flatMap((p) => p.talles))].sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb; // talles numéricos (calzado, pantalones)
      const ia = ordenLetras.indexOf(a.toUpperCase());
      const ib = ordenLetras.indexOf(b.toUpperCase());
      if (ia !== -1 && ib !== -1) return ia - ib; // talles de letra (ropa)
      return a.localeCompare(b);
    });
    if (talles.length) {
      els.talleWrap.classList.remove("hidden");
      els.talle.innerHTML += talles.map((t) => `<option value="${t}">${t}</option>`).join("");
    }
  }
})();
