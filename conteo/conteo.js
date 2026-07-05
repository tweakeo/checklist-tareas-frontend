/* Conteo de Stock — formulario táctil sobre las bases del sistema CONTROL DE STOCK.
   Flujo: eliges ubicación → anotas cantidades de sus artículos del plan (o añades
   uno fuera de plan) → Guardar crea las filas en CONTEOS vía /api/stock-count.
   Campo vacío = artículo NO contado (no se envía). 0 = contado y no queda (rotura). */

const $ = (sel) => document.querySelector(sel);
const state = {
  ubicaciones: [],
  articulos: [],
  artById: new Map(),
  qty: new Map(),      // `${ubicId}|${artId}` -> number
  extras: new Map(),   // ubicId -> Set(artId) añadidos fuera de plan
  counted: new Map(),  // ubicId -> "HH:MM"
  turno: null,
};

const TURNOS = ["Mediodía", "Noche", "Cierre"];

init();

function init() {
  const hoy = localISO(new Date());
  $("#fechaInput").value = hoy;
  $("#dateLabel").textContent = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  state.turno = turnoPorHora(new Date().getHours());
  renderTurnos();
  $("#reloadBtn").addEventListener("click", load);
  load();
}

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function turnoPorHora(h) {
  if (h >= 6 && h < 17) return "Mediodía";
  if (h >= 17 && h < 23) return "Noche";
  return "Cierre";
}

function renderTurnos() {
  const bar = $("#turnoBar");
  bar.querySelectorAll(".chip").forEach((c) => c.remove());
  for (const t of TURNOS) {
    const b = document.createElement("button");
    b.className = "chip" + (state.turno === t ? " is-active" : "");
    b.textContent = t;
    b.addEventListener("click", () => { state.turno = state.turno === t ? null : t; renderTurnos(); });
    bar.appendChild(b);
  }
}

async function load() {
  $("#board").innerHTML = '<div class="loading">Cargando ubicaciones…</div>';
  try {
    const r = await fetch("/api/stock-locations");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    state.ubicaciones = data.ubicaciones || [];
    state.articulos = data.articulos || [];
    state.artById = new Map(state.articulos.map((a) => [a.id, a]));
    renderBoard();
  } catch (e) {
    $("#board").innerHTML = '<div class="loading">⚠️ No se pudieron cargar las ubicaciones. Revisa la conexión y recarga.</div>';
    toast("Error cargando datos: " + e.message, true);
  }
}

function renderBoard() {
  const board = $("#board");
  board.innerHTML = "";
  const zonas = [...new Set(state.ubicaciones.map((u) => u.zona))];
  for (const zona of zonas) {
    const grupo = document.createElement("section");
    grupo.className = "group";
    const head = document.createElement("div");
    head.className = "group__head";
    head.innerHTML = `<span class="group__title">${esc(zona || "Sin zona")}</span>`;
    grupo.appendChild(head);
    const list = document.createElement("div");
    list.className = "group__list";
    for (const u of state.ubicaciones.filter((x) => x.zona === zona)) list.appendChild(locCard(u));
    grupo.appendChild(list);
    board.appendChild(grupo);
  }
  updateScore();
}

function locCard(u) {
  const el = document.createElement("div");
  el.className = "loc";
  el.dataset.id = u.id;

  const head = document.createElement("button");
  head.className = "loc__head";
  head.innerHTML = `
    <span class="loc__name">${esc(u.nombre)}
      ${u.contenido ? `<span class="loc__last">últ.: ${esc(u.contenido)}</span>` : ""}
    </span>
    <span class="locbadge" hidden></span>
    <span class="loc__chev">›</span>`;
  head.addEventListener("click", () => {
    const abierto = el.classList.contains("is-open");
    document.querySelectorAll(".loc.is-open").forEach((x) => x.classList.remove("is-open"));
    if (!abierto) el.classList.add("is-open");
  });
  el.appendChild(head);

  const body = document.createElement("div");
  body.className = "loc__body";
  const itemsWrap = document.createElement("div");
  body.appendChild(itemsWrap);

  const planIds = u.plan.filter((id) => state.artById.has(id));
  for (const artId of planIds) itemsWrap.appendChild(itemRow(u, artId, false));

  // Añadir artículo fuera de plan
  const addWrap = document.createElement("div");
  addWrap.className = "addwrap";
  const search = document.createElement("input");
  search.className = "addsearch";
  search.placeholder = "＋ Añadir otro artículo visto aquí (buscar…)";
  const results = document.createElement("div");
  results.className = "addresults";
  search.addEventListener("input", () => {
    results.innerHTML = "";
    const q = search.value.trim().toLowerCase();
    if (q.length < 2) return;
    const ya = new Set([...u.plan, ...(state.extras.get(u.id) || [])]);
    state.articulos
      .filter((a) => !ya.has(a.id) && a.nombre.toLowerCase().includes(q))
      .slice(0, 8)
      .forEach((a) => {
        const b = document.createElement("button");
        b.textContent = `${a.nombre}${a.cat ? "  ·  " + a.cat : ""}`;
        b.addEventListener("click", () => {
          if (!state.extras.has(u.id)) state.extras.set(u.id, new Set());
          state.extras.get(u.id).add(a.id);
          itemsWrap.appendChild(itemRow(u, a.id, true));
          search.value = "";
          results.innerHTML = "";
          refreshSave(el, u);
        });
        results.appendChild(b);
      });
  });
  addWrap.appendChild(search);
  addWrap.appendChild(results);
  body.appendChild(addWrap);

  const save = document.createElement("button");
  save.className = "loc__save";
  save.textContent = "Guardar conteo";
  save.disabled = true;
  save.addEventListener("click", () => guardar(el, u, save));
  body.appendChild(save);

  el.appendChild(body);
  return el;
}

function itemRow(u, artId, extra) {
  const art = state.artById.get(artId);
  const row = document.createElement("div");
  row.className = "item" + (extra ? " item--extra" : "");
  row.innerHTML = `
    <span class="item__name">${esc(corto(art.nombre))}</span>
    <div class="qty">
      <button class="qty__btn" data-d="-1" aria-label="menos">−</button>
      <input class="qty__num" inputmode="numeric" pattern="[0-9]*" placeholder="—" aria-label="cantidad" />
      <button class="qty__btn" data-d="1" aria-label="más">＋</button>
      <button class="qty__clear" title="No contar este artículo">✕</button>
    </div>`;
  const key = `${u.id}|${artId}`;
  const num = row.querySelector(".qty__num");
  const setVal = (v) => {
    if (v === null || v === "" || isNaN(v)) { state.qty.delete(key); num.value = ""; row.classList.remove("has-qty"); }
    else { const n = Math.max(0, Math.floor(Number(v))); state.qty.set(key, n); num.value = String(n); row.classList.add("has-qty"); }
    const card = row.closest(".loc");
    if (card) refreshSave(card, u);
  };
  row.querySelectorAll(".qty__btn").forEach((b) =>
    b.addEventListener("click", () => {
      const cur = state.qty.has(key) ? state.qty.get(key) : null;
      const d = Number(b.dataset.d);
      setVal(cur === null ? (d > 0 ? 1 : 0) : Math.max(0, cur + d));
    })
  );
  num.addEventListener("input", () => setVal(num.value === "" ? null : num.value));
  row.querySelector(".qty__clear").addEventListener("click", () => setVal(null));
  return row;
}

function itemsDeCard(u) {
  const ids = [...u.plan, ...(state.extras.get(u.id) || [])];
  return ids
    .filter((id) => state.qty.has(`${u.id}|${id}`))
    .map((id) => ({ id, nombre: state.artById.get(id)?.nombre || "?", cantidad: state.qty.get(`${u.id}|${id}`) }));
}

function refreshSave(card, u) {
  const save = card.querySelector(".loc__save");
  const n = itemsDeCard(u).length;
  save.disabled = n === 0;
  save.textContent = n === 0 ? "Guardar conteo" : `Guardar conteo (${n})`;
}

async function guardar(card, u, btn) {
  const items = itemsDeCard(u);
  if (!items.length) return;
  btn.disabled = true;
  btn.classList.add("is-saving");
  btn.textContent = "Guardando…";
  try {
    const r = await fetch("/api/stock-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: $("#fechaInput").value,
        turno: state.turno,
        ubicacionId: u.id,
        ubicacionNombre: u.nombre,
        items,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "HTTP " + r.status);
    const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    state.counted.set(u.id, hora);
    const badge = card.querySelector(".locbadge");
    badge.hidden = false;
    badge.textContent = `✓ ${hora}`;
    card.classList.remove("is-open");
    toast(`✓ ${data.created} conteo${data.created > 1 ? "s" : ""} registrado${data.created > 1 ? "s" : ""} — ${corto(u.nombre)}`);
    updateScore();
  } catch (e) {
    toast("Error al guardar: " + e.message, true);
  } finally {
    btn.classList.remove("is-saving");
    refreshSave(card, u);
  }
}

function updateScore() {
  $("#scoreDone").textContent = state.counted.size;
  $("#scoreTotal").textContent = state.ubicaciones.length;
}

function corto(nombre) {
  return nombre.length > 46 ? nombre.slice(0, 44) + "…" : nombre;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer;
function toast(msg, err = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("is-error", err);
  el.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-show"), 3200);
}
