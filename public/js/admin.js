(function () {
  const { escapeHtml, formatPrice } = window.PS;

  let adminToken = localStorage.getItem("adminToken") || "";
  let categoriasCache = [];

  async function api(path, options = {}) {
    const headers = options.headers || {};
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`/api${path}`, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    // El login (/admin/login) también devuelve 401 cuando la contraseña
    // está mal -- eso no es una sesión expirada, es una contraseña
    // incorrecta, y tiene que mostrar el mensaje real del servidor.
    if (res.status === 401 && path !== "/admin/login") {
      logout();
      throw new Error("Sesión expirada.");
    }
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
  }

  function logout() {
    adminToken = "";
    localStorage.removeItem("adminToken");
    document.getElementById("app").classList.add("hidden");
    document.getElementById("loginCard").classList.remove("hidden");
  }

  function showMensaje(el, texto, tipo = "success") {
    el.textContent = texto;
    el.classList.remove("hidden", "text-success", "text-danger");
    el.classList.add(tipo === "success" ? "text-success" : "text-danger");
    if (tipo === "success") setTimeout(() => el.classList.add("hidden"), 2500);
  }

  // ============================================================
  // LOGIN
  // ============================================================
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("loginPassword").value;
    const errorEl = document.getElementById("loginError");
    errorEl.classList.add("hidden");
    try {
      const data = await api("/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      adminToken = data.token;
      localStorage.setItem("adminToken", adminToken);
      enterApp();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
    }
  });

  document.getElementById("btnLogout").addEventListener("click", logout);

  // ============================================================
  // ROUTER
  // ============================================================
  function switchView(view) {
    document.querySelectorAll(".view").forEach((el) => el.classList.toggle("hidden", el.id !== `view-${view}`));
    document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("is-active", el.dataset.view === view));
    const loaders = { dashboard: loadDashboard, productos: loadProductos, categorias: loadCategorias, home: loadHome, configuracion: loadConfiguracion };
    loaders[view]?.();
  }
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  async function enterApp() {
    document.getElementById("loginCard").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    categoriasCache = await api("/admin/categorias");
    switchView("dashboard");
  }

  if (adminToken) enterApp().catch(() => logout());

  // ============================================================
  // DASHBOARD
  // ============================================================
  async function loadDashboard() {
    const productos = await api("/admin/productos");
    document.getElementById("kpiProductos").textContent = productos.filter((p) => p.activo).length;
    document.getElementById("kpiHome").textContent = productos.filter((p) => p.mostrarEnHome).length;
    document.getElementById("kpiCategorias").textContent = categoriasCache.length;
  }

  // ============================================================
  // PRODUCTOS
  // ============================================================
  const prodForm = document.getElementById("formProducto");
  const prodFields = {
    id: document.getElementById("prodId"),
    nombre: document.getElementById("prodNombre"),
    categoria: document.getElementById("prodCategoria"),
    descripcion: document.getElementById("prodDescripcion"),
    precio: document.getElementById("prodPrecio"),
    tienePromocion: document.getElementById("prodTienePromocion"),
    promocionCampos: document.getElementById("prodPromocionCampos"),
    promocionTipo: document.getElementById("prodPromocionTipo"),
    promocionValorLabel: document.getElementById("prodPromocionValorLabel"),
    promocionValor: document.getElementById("prodPromocionValor"),
    promocionTitulo: document.getElementById("prodPromocionTitulo"),
    promocionPreview: document.getElementById("prodPromocionPreview"),
    stock: document.getElementById("prodStock"),
    etiqueta: document.getElementById("prodEtiqueta"),
    talles: document.getElementById("prodTalles"),
    destacado: document.getElementById("prodDestacado"),
    disponible: document.getElementById("prodDisponible"),
  };
  // "Mostrar en Home" y su orden ya no se editan en este formulario (se
  // manejan desde Contenido Home), pero hay que reenviarlos tal cual al
  // guardar para no pisarlos con el PUT del resto de los campos.
  let productoActualMostrarEnHome = false;
  let productoActualOrdenHome = null;
  // Para un producto nuevo todavía no hay id donde subir la imagen, así
  // que se guardan en memoria (con preview local) y se suben recién
  // cuando se crea el producto, junto con el resto del guardado.
  let imagenesEnEspera = [];

  function fillCategoriaSelect(select, selectedId) {
    select.innerHTML = '<option value="">Sin categoría</option>' +
      categoriasCache.map((c) => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(c.nombre)}</option>`).join("");
  }

  // Stock en 0 fuerza "sin stock" (mismo criterio que el server) — se
  // refleja en el checkbox para que no quede una combinación inconsistente.
  prodFields.stock.addEventListener("input", () => {
    const sinStock = prodFields.stock.value === "0";
    prodFields.disponible.disabled = sinStock;
    if (sinStock) prodFields.disponible.checked = false;
  });

  function actualizarPreviewPromocion() {
    const precio = Number(prodFields.precio.value) || 0;
    const valor = Number(prodFields.promocionValor.value) || 0;
    if (!prodFields.tienePromocion.checked || !valor || !precio) {
      prodFields.promocionPreview.textContent = "";
      return;
    }
    const precioFinal = prodFields.promocionTipo.value === "porcentaje"
      ? Math.round(precio * (1 - Math.min(99, valor) / 100))
      : valor;
    prodFields.promocionPreview.textContent = precioFinal > 0 && precioFinal < precio
      ? `Se va a mostrar: ${formatPrice(precio)} tachado → ${formatPrice(precioFinal)}`
      : "El precio de la promoción tiene que ser menor al precio normal.";
  }

  prodFields.tienePromocion.addEventListener("change", () => {
    prodFields.promocionCampos.classList.toggle("hidden", !prodFields.tienePromocion.checked);
    actualizarPreviewPromocion();
  });
  prodFields.promocionTipo.addEventListener("change", () => {
    prodFields.promocionValorLabel.textContent = prodFields.promocionTipo.value === "porcentaje" ? "Descuento (%)" : "Precio promocional";
    actualizarPreviewPromocion();
  });
  [prodFields.promocionValor, prodFields.precio].forEach((el) => el.addEventListener("input", actualizarPreviewPromocion));

  document.getElementById("btnNuevoProducto").addEventListener("click", () => abrirFormProducto(null));
  document.getElementById("btnCancelarProducto").addEventListener("click", () => prodForm.classList.add("hidden"));

  function abrirFormProducto(producto) {
    prodForm.reset();
    fillCategoriaSelect(prodFields.categoria, producto?.categoriaId);
    prodFields.id.value = producto?.id || "";
    prodFields.nombre.value = producto?.nombre || "";
    prodFields.descripcion.value = producto?.descripcion || "";
    prodFields.precio.value = producto?.precio ?? "";
    prodFields.stock.value = producto?.stock ?? "";
    prodFields.disponible.disabled = producto?.stock === 0;
    const tienePromo = Boolean(producto?.promocionTipo);
    prodFields.tienePromocion.checked = tienePromo;
    prodFields.promocionCampos.classList.toggle("hidden", !tienePromo);
    prodFields.promocionTipo.value = producto?.promocionTipo || "porcentaje";
    prodFields.promocionValorLabel.textContent = prodFields.promocionTipo.value === "porcentaje" ? "Descuento (%)" : "Precio promocional";
    prodFields.promocionValor.value = producto?.promocionValor ?? "";
    prodFields.promocionTitulo.value = producto?.promocionTitulo || "";
    prodFields.promocionPreview.textContent = "";
    prodFields.etiqueta.value = producto?.etiqueta || "";
    prodFields.talles.value = (producto?.talles || []).join(", ");
    prodFields.destacado.checked = Boolean(producto?.destacado);
    prodFields.disponible.checked = producto ? producto.disponible : true;
    productoActualMostrarEnHome = Boolean(producto?.mostrarEnHome);
    productoActualOrdenHome = producto?.ordenHome ?? null;
    document.getElementById("prodMensaje").classList.add("hidden");

    document.getElementById("prodImagenesSection").classList.remove("hidden");
    document.getElementById("prodImagenesHint").classList.add("hidden");
    imagenesEnEspera.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    imagenesEnEspera = [];
    if (producto?.id) {
      renderProductoImagenes(producto);
    } else {
      renderImagenesEnEspera();
    }
    prodForm.classList.remove("hidden");
    prodForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Wiring genérico del input + dropzone: junta los archivos elegidos
  // (click o drag&drop) y los pasa a onFiles, sea para subir ya (producto
  // existente) o para guardarlos en espera (producto nuevo, sin id todavía).
  function wireDropzone(onFiles) {
    const dropZone = document.getElementById("prodImagenesDropzone");
    dropZone.replaceWith(dropZone.cloneNode(true)); // saca listeners de drag&drop viejos
    const freshDropZone = document.getElementById("prodImagenesDropzone");
    document.getElementById("prodImagenInput").onchange = async (e) => {
      await onFiles([...e.target.files].filter((f) => f.type.startsWith("image/")));
      e.target.value = "";
    };
    ["dragenter", "dragover"].forEach((evt) => freshDropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      freshDropZone.classList.add("border-brand-ink", "bg-brand-mist");
    }));
    ["dragleave", "drop"].forEach((evt) => freshDropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      freshDropZone.classList.remove("border-brand-ink", "bg-brand-mist");
    }));
    freshDropZone.addEventListener("drop", async (e) => {
      await onFiles([...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/")));
    });
  }

  // ---- Producto existente: cada imagen se sube al toque ----
  function renderProductoImagenes(producto) {
    const list = document.getElementById("prodImagenesList");
    const imagenes = [];
    if (producto.imagenPrincipal) imagenes.push({ url: producto.imagenPrincipal, principal: true });
    (producto.imagenesAdicionales || []).forEach((url) => imagenes.push({ url, principal: false }));

    list.innerHTML = imagenes.map((img) => `
      <div class="relative w-24">
        <div class="aspect-square overflow-hidden border ${img.principal ? "border-brand-ink" : "border-border"}">
          <img src="${escapeHtml(img.url)}" class="h-full w-full object-cover" />
        </div>
        <div class="mt-1 flex flex-col gap-0.5 text-center text-[10px]">
          ${img.principal ? '<span class="font-semibold">Principal</span>' : `<button type="button" data-set-principal="${escapeHtml(img.url)}" class="underline">Marcar principal</button>`}
          <button type="button" data-delete-imagen="${escapeHtml(img.url)}" class="text-danger underline">Eliminar</button>
        </div>
      </div>`).join("");

    list.querySelectorAll("[data-set-principal]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const data = await api(`/admin/productos/${producto.id}/imagen-principal`, {
          method: "PATCH", body: JSON.stringify({ url: btn.dataset.setPrincipal }),
        });
        producto.imagenPrincipal = data.imagenPrincipal;
        producto.imagenesAdicionales = data.imagenesAdicionales;
        renderProductoImagenes(producto);
      });
    });
    list.querySelectorAll("[data-delete-imagen]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const data = await api(`/admin/productos/${producto.id}/imagenes`, {
          method: "DELETE", body: JSON.stringify({ url: btn.dataset.deleteImagen }),
        });
        producto.imagenPrincipal = data.imagenPrincipal;
        producto.imagenesAdicionales = data.imagenesAdicionales;
        renderProductoImagenes(producto);
      });
    });

    async function subirImagenProducto(file) {
      const previewUrl = URL.createObjectURL(file);
      const tempTile = document.createElement("div");
      tempTile.className = "w-24";
      tempTile.innerHTML = `
        <div class="aspect-square overflow-hidden border border-border opacity-60">
          <img src="${previewUrl}" class="h-full w-full object-cover" />
        </div>
        <div class="mt-1 text-center text-[10px] text-secondary">Subiendo…</div>`;
      list.appendChild(tempTile);
      try {
        const fd = new FormData();
        fd.append("imagen", file);
        const data = await api(`/admin/productos/${producto.id}/imagenes`, { method: "POST", body: fd });
        producto.imagenPrincipal = data.imagenPrincipal;
        producto.imagenesAdicionales = data.imagenesAdicionales;
        renderProductoImagenes(producto);
      } catch (error) {
        tempTile.remove();
        alert(error.message);
      } finally {
        URL.revokeObjectURL(previewUrl);
      }
    }

    // Sube de a una (no en paralelo: el server decide "es la principal?"
    // mirando el estado actual, subir varias a la vez pisaría esa lógica).
    wireDropzone(async (files) => {
      for (const file of files) await subirImagenProducto(file);
    });
  }

  // ---- Producto nuevo: no hay id todavía, se guardan en memoria con
  // preview local y se suben recién al crear el producto ----
  function renderImagenesEnEspera() {
    const list = document.getElementById("prodImagenesList");
    list.innerHTML = imagenesEnEspera.map((img, i) => `
      <div class="relative w-24">
        <div class="aspect-square overflow-hidden border ${i === 0 ? "border-brand-ink" : "border-border"}">
          <img src="${img.previewUrl}" class="h-full w-full object-cover" />
        </div>
        <div class="mt-1 flex flex-col gap-0.5 text-center text-[10px]">
          ${i === 0 ? '<span class="font-semibold">Principal</span>' : ""}
          <button type="button" data-quitar-espera="${i}" class="text-danger underline">Eliminar</button>
        </div>
      </div>`).join("");
    list.querySelectorAll("[data-quitar-espera]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [removida] = imagenesEnEspera.splice(Number(btn.dataset.quitarEspera), 1);
        URL.revokeObjectURL(removida.previewUrl);
        renderImagenesEnEspera();
      });
    });
    wireDropzone(async (files) => {
      files.forEach((file) => imagenesEnEspera.push({ file, previewUrl: URL.createObjectURL(file) }));
      renderImagenesEnEspera();
    });
  }

  prodForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      nombre: prodFields.nombre.value,
      descripcion: prodFields.descripcion.value,
      precio: prodFields.precio.value,
      tienePromocion: prodFields.tienePromocion.checked,
      promocionTipo: prodFields.promocionTipo.value,
      promocionValor: prodFields.promocionValor.value,
      promocionTitulo: prodFields.promocionTitulo.value,
      categoriaId: prodFields.categoria.value,
      etiqueta: prodFields.etiqueta.value,
      talles: prodFields.talles.value,
      destacado: prodFields.destacado.checked,
      disponible: prodFields.disponible.checked,
      mostrarEnHome: productoActualMostrarEnHome,
      ordenHome: productoActualOrdenHome ?? "",
      stock: prodFields.stock.value,
    };
    const mensaje = document.getElementById("prodMensaje");
    try {
      if (prodFields.id.value) {
        await api(`/admin/productos/${prodFields.id.value}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        if (!imagenesEnEspera.length) {
          showMensaje(mensaje, "Subí al menos una imagen del producto.", "error");
          return;
        }
        const fd = new FormData();
        Object.entries(body).forEach(([key, value]) => fd.append(key, value));
        fd.append("imagen", imagenesEnEspera[0].file);
        const creado = await api("/admin/productos", { method: "POST", body: fd });
        for (const img of imagenesEnEspera.slice(1)) {
          const fd2 = new FormData();
          fd2.append("imagen", img.file);
          await api(`/admin/productos/${creado.id}/imagenes`, { method: "POST", body: fd2 });
        }
        imagenesEnEspera.forEach((img) => URL.revokeObjectURL(img.previewUrl));
        imagenesEnEspera = [];
      }
      await loadProductos();
      prodForm.classList.add("hidden");
    } catch (error) {
      showMensaje(mensaje, error.message, "error");
    }
  });

  async function loadProductos() {
    const productos = await api("/admin/productos");
    const tbody = document.getElementById("productosTableBody");
    tbody.innerHTML = productos.map((p) => `
      <tr class="border-t border-border">
        <td class="p-3">${escapeHtml(p.nombre)}</td>
        <td class="p-3">${escapeHtml(p.categoria?.nombre || "—")}</td>
        <td class="p-3">${formatPrice(p.precioPromocional ?? p.precio)}</td>
        <td class="p-3">${p.mostrarEnHome ? "Sí" : "—"}</td>
        <td class="p-3"><span class="badge-${p.activo ? "success" : "neutral"} rounded px-2 py-0.5 text-xs">${p.activo ? "Activo" : "Inactivo"}</span></td>
        <td class="p-3">
          <button data-edit="${p.id}" class="text-sm underline">Editar</button>
          <button data-toggle="${p.id}" class="ml-2 text-sm underline">${p.activo ? "Desactivar" : "Activar"}</button>
          <button data-delete="${p.id}" class="ml-2 text-sm text-danger underline">Eliminar</button>
        </td>
      </tr>`).join("");

    tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => {
      abrirFormProducto(productos.find((p) => String(p.id) === btn.dataset.edit));
    }));
    tbody.querySelectorAll("[data-toggle]").forEach((btn) => btn.addEventListener("click", async () => {
      const p = productos.find((x) => String(x.id) === btn.dataset.toggle);
      await api(`/admin/productos/${p.id}`, { method: "PUT", body: JSON.stringify({ ...productoToBody(p), activo: !p.activo }) });
      loadProductos();
    }));
    tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este producto? No se puede deshacer.")) return;
      await api(`/admin/productos/${btn.dataset.delete}`, { method: "DELETE" });
      loadProductos();
    }));
  }

  function productoToBody(p) {
    return {
      nombre: p.nombre, descripcion: p.descripcion, precio: p.precio,
      tienePromocion: Boolean(p.promocionTipo), promocionTipo: p.promocionTipo || "porcentaje",
      promocionValor: p.promocionValor ?? "", promocionTitulo: p.promocionTitulo || "",
      categoriaId: p.categoriaId ?? "", etiqueta: p.etiqueta || "", talles: (p.talles || []).join(","),
      destacado: p.destacado, disponible: p.disponible, mostrarEnHome: p.mostrarEnHome, ordenHome: p.ordenHome ?? "", stock: p.stock ?? "",
    };
  }

  // ============================================================
  // CATEGORÍAS
  // ============================================================
  const catForm = document.getElementById("formCategoria");
  document.getElementById("btnNuevaCategoria").addEventListener("click", () => abrirFormCategoria(null));
  document.getElementById("btnCancelarCategoria").addEventListener("click", () => catForm.classList.add("hidden"));

  function abrirFormCategoria(categoria) {
    catForm.reset();
    document.getElementById("catId").value = categoria?.id || "";
    document.getElementById("catNombre").value = categoria?.nombre || "";
    document.getElementById("catActivo").checked = categoria ? categoria.activo : true;
    document.getElementById("catMensaje").classList.add("hidden");

    const imgSection = document.getElementById("catImagenSection");
    const imgHint = document.getElementById("catImagenHint");
    const preview = document.getElementById("catImagenPreview");
    if (categoria?.id) {
      imgSection.classList.remove("hidden");
      imgHint.classList.add("hidden");
      preview.innerHTML = categoria.imagenUrl ? `<img src="${escapeHtml(categoria.imagenUrl)}" class="h-full w-full object-cover" />` : "";
      document.getElementById("catImagenInput").onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const previewUrl = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${previewUrl}" class="h-full w-full object-cover opacity-60" />`;
        try {
          const fd = new FormData();
          fd.append("imagen", file);
          const data = await api(`/admin/categorias/${categoria.id}/imagen`, { method: "PATCH", body: fd });
          preview.innerHTML = `<img src="${escapeHtml(data.imagenUrl)}" class="h-full w-full object-cover" />`;
        } finally {
          URL.revokeObjectURL(previewUrl);
        }
      };
    } else {
      imgSection.classList.add("hidden");
      imgHint.classList.remove("hidden");
    }
    catForm.classList.remove("hidden");
    catForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  catForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      nombre: document.getElementById("catNombre").value,
      activo: document.getElementById("catActivo").checked,
    };
    const mensaje = document.getElementById("catMensaje");
    try {
      const id = document.getElementById("catId").value;
      if (id) {
        await api(`/admin/categorias/${id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/admin/categorias", { method: "POST", body: JSON.stringify(body) });
      }
      await loadCategorias();
      catForm.classList.add("hidden");
    } catch (error) {
      showMensaje(mensaje, error.message, "error");
    }
  });

  async function loadCategorias() {
    categoriasCache = await api("/admin/categorias");
    const tbody = document.getElementById("categoriasTableBody");
    tbody.innerHTML = categoriasCache.map((c, i) => `
      <tr class="border-t border-border">
        <td class="p-3">${escapeHtml(c.nombre)}</td>
        <td class="p-3">${escapeHtml(c.slug)}</td>
        <td class="p-3">
          <span class="mr-2 tabular-nums">${i + 1}</span>
          <button data-mover="${c.id}" data-dir="up" ${i === 0 ? "disabled" : ""} class="disabled:opacity-30" title="Subir">▲</button>
          <button data-mover="${c.id}" data-dir="down" ${i === categoriasCache.length - 1 ? "disabled" : ""} class="disabled:opacity-30" title="Bajar">▼</button>
        </td>
        <td class="p-3"><span class="badge-${c.activo ? "success" : "neutral"} rounded px-2 py-0.5 text-xs">${c.activo ? "Activa" : "Inactiva"}</span></td>
        <td class="p-3">
          <button data-edit="${c.id}" class="text-sm underline">Editar</button>
          <button data-delete="${c.id}" class="ml-2 text-sm text-danger underline">Eliminar</button>
        </td>
      </tr>`).join("");
    tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => {
      abrirFormCategoria(categoriasCache.find((c) => String(c.id) === btn.dataset.edit));
    }));
    tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta categoría? Los productos que la usan quedarán sin categoría.")) return;
      await api(`/admin/categorias/${btn.dataset.delete}`, { method: "DELETE" });
      loadCategorias();
    }));
    tbody.querySelectorAll("[data-mover]").forEach((btn) => btn.addEventListener("click", async () => {
      await api(`/admin/categorias/${btn.dataset.mover}/mover`, { method: "PATCH", body: JSON.stringify({ direction: btn.dataset.dir }) });
      loadCategorias();
    }));
  }

  // ============================================================
  // HOME (hero)
  // ============================================================
  async function loadHome() {
    const config = await api("/config").catch(() => null) || (await fetch("/api/config").then((r) => r.json()));
    const lineas = String(config.heroTitulo || "").split("\\n");
    document.getElementById("heroLinea1").value = lineas[0] || "";
    document.getElementById("heroLinea2").value = lineas[1] || "";
    document.getElementById("heroSubtitulo").value = config.heroSubtitulo || "";
    document.getElementById("heroCta1Texto").value = config.heroCtaPrimarioTexto || "";
    document.getElementById("heroCta1Link").value = config.heroCtaPrimarioLink || "";
    document.getElementById("heroCta2Texto").value = config.heroCtaSecundarioTexto || "";
    document.getElementById("heroCta2Link").value = config.heroCtaSecundarioLink || "";
    document.getElementById("beneficio1Titulo").value = config.beneficio1Titulo || "";
    document.getElementById("beneficio1Subtitulo").value = config.beneficio1Subtitulo || "";
    document.getElementById("beneficio2Titulo").value = config.beneficio2Titulo || "";
    document.getElementById("beneficio2Subtitulo").value = config.beneficio2Subtitulo || "";
    document.getElementById("beneficio3Titulo").value = config.beneficio3Titulo || "";
    document.getElementById("beneficio3Subtitulo").value = config.beneficio3Subtitulo || "";
    await loadProductosHome();
    await loadHeroSlides();
  }

  async function loadProductosHome() {
    const productos = await api("/admin/productos");
    const enHome = productos.filter((p) => p.mostrarEnHome).sort((a, b) => (a.ordenHome ?? 0) - (b.ordenHome ?? 0));
    const resto = productos.filter((p) => !p.mostrarEnHome);
    const ordenados = [...enHome, ...resto];
    const list = document.getElementById("productosHomeList");
    list.innerHTML = ordenados.map((p, i) => {
      const posEnHome = enHome.findIndex((h) => h.id === p.id);
      return `
      <div class="flex items-center gap-3 py-2">
        <input type="checkbox" data-toggle-home="${p.id}" ${p.mostrarEnHome ? "checked" : ""} />
        <span class="flex-1 text-sm">${escapeHtml(p.nombre)}</span>
        ${p.mostrarEnHome ? `
          <button data-mover-home="${p.id}" data-dir="up" ${posEnHome === 0 ? "disabled" : ""} class="disabled:opacity-30" title="Subir">▲</button>
          <button data-mover-home="${p.id}" data-dir="down" ${posEnHome === enHome.length - 1 ? "disabled" : ""} class="disabled:opacity-30" title="Bajar">▼</button>
        ` : ""}
      </div>`;
    }).join("");

    list.querySelectorAll("[data-toggle-home]").forEach((cb) => cb.addEventListener("change", async () => {
      await api(`/admin/productos/${cb.dataset.toggleHome}/mostrar-home`, { method: "PATCH", body: JSON.stringify({ mostrarEnHome: cb.checked }) });
      loadProductosHome();
    }));
    list.querySelectorAll("[data-mover-home]").forEach((btn) => btn.addEventListener("click", async () => {
      await api(`/admin/productos/${btn.dataset.moverHome}/mover-home`, { method: "PATCH", body: JSON.stringify({ direction: btn.dataset.dir }) });
      loadProductosHome();
    }));
  }

  document.getElementById("btnGuardarBeneficios").addEventListener("click", async () => {
    const body = {
      beneficio1Titulo: document.getElementById("beneficio1Titulo").value,
      beneficio1Subtitulo: document.getElementById("beneficio1Subtitulo").value,
      beneficio2Titulo: document.getElementById("beneficio2Titulo").value,
      beneficio2Subtitulo: document.getElementById("beneficio2Subtitulo").value,
      beneficio3Titulo: document.getElementById("beneficio3Titulo").value,
      beneficio3Subtitulo: document.getElementById("beneficio3Subtitulo").value,
    };
    const mensaje = document.getElementById("beneficiosMensaje");
    try {
      await api("/admin/business", { method: "PATCH", body: JSON.stringify(body) });
      showMensaje(mensaje, "Guardado.");
    } catch (error) {
      showMensaje(mensaje, error.message, "error");
    }
  });

  document.getElementById("btnGuardarHeroTexto").addEventListener("click", async () => {
    const body = {
      heroTitulo: `${document.getElementById("heroLinea1").value}\\n${document.getElementById("heroLinea2").value}`,
      heroSubtitulo: document.getElementById("heroSubtitulo").value,
      heroCtaPrimarioTexto: document.getElementById("heroCta1Texto").value,
      heroCtaPrimarioLink: document.getElementById("heroCta1Link").value,
      heroCtaSecundarioTexto: document.getElementById("heroCta2Texto").value,
      heroCtaSecundarioLink: document.getElementById("heroCta2Link").value,
    };
    const mensaje = document.getElementById("heroMensaje");
    try {
      await api("/admin/business", { method: "PATCH", body: JSON.stringify(body) });
      showMensaje(mensaje, "Guardado.");
    } catch (error) {
      showMensaje(mensaje, error.message, "error");
    }
  });

  async function loadHeroSlides() {
    const slides = await api("/admin/hero-slides");
    const list = document.getElementById("heroSlidesList");
    list.innerHTML = slides.map((s) => `
      <div class="relative w-24">
        <div class="aspect-[3/4] overflow-hidden border border-border"><img src="${escapeHtml(s.imagenUrl)}" class="h-full w-full object-cover" /></div>
        <button type="button" data-delete-slide="${s.id}" class="mt-1 w-full text-center text-[10px] text-danger underline">Eliminar</button>
      </div>`).join("");
    list.querySelectorAll("[data-delete-slide]").forEach((btn) => btn.addEventListener("click", async () => {
      await api(`/admin/hero-slides/${btn.dataset.deleteSlide}`, { method: "DELETE" });
      loadHeroSlides();
    }));
  }

  document.getElementById("heroSlideInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const list = document.getElementById("heroSlidesList");
    const tempTile = document.createElement("div");
    tempTile.className = "w-24";
    tempTile.innerHTML = `
      <div class="aspect-[3/4] overflow-hidden border border-border opacity-60"><img src="${previewUrl}" class="h-full w-full object-cover" /></div>
      <div class="mt-1 text-center text-[10px] text-secondary">Subiendo…</div>`;
    list.appendChild(tempTile);
    try {
      const fd = new FormData();
      fd.append("imagen", file);
      await api("/admin/hero-slides", { method: "POST", body: fd });
      loadHeroSlides();
    } catch (error) {
      tempTile.remove();
      alert(error.message);
    } finally {
      URL.revokeObjectURL(previewUrl);
      e.target.value = "";
    }
  });

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================
  async function loadConfiguracion() {
    const config = await fetch("/api/config").then((r) => r.json());
    document.getElementById("cfgNombre").value = config.nombre || "";
    document.getElementById("cfgColor").value = config.colorMarca || "#111111";
    document.getElementById("cfgDireccion").value = config.direccion || "";
    document.getElementById("cfgHorario").value = config.horarioTexto || "";
    document.getElementById("cfgInstagram").value = config.instagramUrl || "";
    document.getElementById("cfgWhatsapp").value = config.whatsappNumero || "";
    document.getElementById("cfgLogoPreview").innerHTML = `<img src="${escapeHtml(config.logoUrl || "/images/logo-header.png")}" class="h-full w-full object-contain" />`;
  }

  document.getElementById("formConfig").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      nombre: document.getElementById("cfgNombre").value,
      colorMarca: document.getElementById("cfgColor").value,
      direccion: document.getElementById("cfgDireccion").value,
      horarioTexto: document.getElementById("cfgHorario").value,
      instagramUrl: document.getElementById("cfgInstagram").value,
      whatsappNumero: document.getElementById("cfgWhatsapp").value,
    };
    const mensaje = document.getElementById("cfgMensaje");
    try {
      await api("/admin/business", { method: "PATCH", body: JSON.stringify(body) });
      showMensaje(mensaje, "Guardado.");
    } catch (error) {
      showMensaje(mensaje, error.message, "error");
    }
  });

  document.getElementById("cfgLogoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const logoPreview = document.getElementById("cfgLogoPreview");
    logoPreview.innerHTML = `<img src="${previewUrl}" class="h-full w-full object-contain opacity-60" />`;
    const fd = new FormData();
    fd.append("logo", file);
    try {
      const data = await api("/admin/logo", { method: "PATCH", body: fd });
      logoPreview.innerHTML = `<img src="${escapeHtml(data.logoUrl)}" class="h-full w-full object-contain" />`;
    } catch (error) {
      alert(error.message);
    } finally {
      URL.revokeObjectURL(previewUrl);
      e.target.value = "";
    }
  });

  document.getElementById("formPassword").addEventListener("submit", async (e) => {
    e.preventDefault();
    const actual = document.getElementById("pwActual").value;
    const nueva = document.getElementById("pwNueva").value;
    const mensaje = document.getElementById("pwMensaje");
    try {
      await api("/admin/password", { method: "POST", body: JSON.stringify({ actual, nueva }) });
      showMensaje(mensaje, "Contraseña actualizada.");
      e.target.reset();
    } catch (error) {
      showMensaje(mensaje, error.message, "error");
    }
  });
})();
