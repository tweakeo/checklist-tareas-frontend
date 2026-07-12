/* Conteo de Stock — formulario táctil sobre las bases del sistema CONTROL DE STOCK.
   Flujo: eliges ubicación → anotas cantidades de sus artículos del plan (o añades
   uno fuera de plan) → Guardar crea las filas en CONTEOS vía /api/stock-count.
   Campo vacío = artículo NO contado (no se envía). 0 = contado y no queda (rotura).
   Extras: estimación rápida por fracción de la capacidad (base CAPACIDADES),
   «Sin cambios» que replica el último conteo de la ubicación, y borrado de filas
   añadidas fuera de plan. Estimaciones y sin-cambios dejan nota en el registro. */

const $ = (sel) => document.querySelector(sel);
const state = {
  ubicaciones: [],
  articulos: [],
  artById: new Map(),
  qty: new Map(),      // `${ubicId}|${artId}` -> number
  notas: new Map(),    // `${ubicId}|${artId}` -> nota (estimación…)
  fillers: new Map(),  // `${ubicId}|${artId}` -> setVal de esa fila (autorrelleno)
  extras: new Map(),   // ubicId -> Set(artId) añadidos fuera de plan
  counted: new Map(),  // ubicId -> "HH:MM"
  turno: null,
};

const TURNOS = ["Apertura", "Entreturnos", "Cierre"];
const FRACS = [["⅕", 1 / 5], ["¼", 1 / 4], ["⅓", 1 / 3], ["½", 1 / 2], ["⅔", 2 / 3], ["¾", 3 / 4], ["Lleno", 1]];

init();

function init() {
  $("#fechaInput").value = localISO(new Date());
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
  if (h >= 5 && h < 14) return "Apertura";
  if (h >= 14 && h < 19) return "Entreturnos";
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
  state.fillers.clear();
  const grupos = [...new Set(state.ubicaciones.map((u) => u.grupo))];
  for (const grupo of grupos) {
    const grupoEl = document.createElement("section");
    grupoEl.className = "group";
    const head = document.createElement("div");
    head.className = "group__head";
    head.innerHTML = `<span class="group__title">${esc(grupo || "Sin grupo")}</span>`;
    grupoEl.appendChild(head);
    const list = document.createElement("div");
    list.className = "group__list";
    for (const u of state.ubicaciones.filter((x) => x.grupo === grupo)) list.appendChild(locCard(u));
    grupoEl.appendChild(list);
    board.appendChild(grupoEl);
  }
  updateScore();
}

function locCard(u) {
  const el = document.createElement("div");
  el.className = "loc";
  el.dataset.id = u.id;

  const planIds = u.plan.filter((id) => state.artById.has(id));

  const head = document.createElement("button");
  head.className = "loc__head";
  head.innerHTML = `
    <span class="loc__name">${esc(u.nombre)}
      ${u.contenido ? `<span class="loc__last">últ.: ${esc(u.contenido)}</span>` : ""}
    </span>
    ${planIds.length ? `<span class="loc__count">${planIds.length} art.</span>` : ""}
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

  // «Sin cambios»: autorrellena las filas con el último registro de cada artículo
  // (NO envía nada: se revisa a la vista y se confirma con «Guardar conteo»)
  const prevConId = (u.ultimo?.items || []).filter((it) => it.id && state.artById.has(it.id));
  if (prevConId.length) {
    const nc = document.createElement("button");
    nc.className = "nochange";
    nc.textContent = `↩ Rellenar con el último registro (${prevConId.length} art. · últ. ${u.ultimo.fecha})`;
    nc.addEventListener("click", () => {
      let filled = 0;
      for (const it of prevConId) {
        const key = `${u.id}|${it.id}`;
        if (!state.fillers.has(key)) {
          if (!state.extras.has(u.id)) state.extras.set(u.id, new Set());
          state.extras.get(u.id).add(it.id);
          itemsWrap.appendChild(itemRow(u, it.id, true));
        }
        state.fillers.get(key)(it.cantidad, `Sin cambios respecto al registro de ${it.fecha}.`);
        filled++;
      }
      refreshSave(el, u);
      toast(`↩ ${filled} fila${filled > 1 ? "s" : ""} rellenada${filled > 1 ? "s" : ""} — revisa las cifras y pulsa Guardar`);
    });
    body.appendChild(nc);
  }

  const itemsWrap = document.createElement("div");
  body.appendChild(itemsWrap);

  for (const artId of planIds) itemsWrap.appendChild(itemRow(u, artId, false));
  if (!planIds.length) {
    const hint = document.createElement("p");
    hint.className = "loc__hint";
    hint.textContent = "Sin artículos asignados a esta ubicación. Busca abajo lo que hayas visto aquí.";
    itemsWrap.appendChild(hint);
  }

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
  save.addEventListener("click", async () => {
    const items = itemsDeCard(u);
    if (!items.length) return;
    save.disabled = true;
    save.classList.add("is-saving");
    save.textContent = "Guardando…";
    await enviar(el, u, items);
    save.classList.remove("is-saving");
    refreshSave(el, u);
  });
  body.appendChild(save);

  el.appendChild(body);
  return el;
}

function itemRow(u, artId, extra) {
  const art = state.artById.get(artId);
  const prev = (u.ultimo?.items || []).find((it) => it.id === artId);
  const row = document.createElement("div");
  row.className = "item" + (extra ? " item--extra" : "");
  row.innerHTML = `
    <span class="item__name">${esc(corto(art.nombre))}</span>
    ${prev ? `<button class="item__prev" title="Rellenar con el último registro (${esc(prev.fecha)})">↩ ${prev.cantidad}</button>` : ""}
    <button class="item__est" title="Estimación rápida: fracción de la capacidad máxima">≈</button>
    <div class="qty">
      <button class="qty__btn" data-d="-1" aria-label="menos">−</button>
      <input class="qty__num" inputmode="numeric" pattern="[0-9]*" placeholder="—" aria-label="cantidad" />
      <button class="qty__btn" data-d="1" aria-label="más">＋</button>
      ${extra
        ? `<button class="qty__clear qty__del" title="Quitar esta fila añadida por error">🗑</button>`
        : `<button class="qty__clear" title="No contar este artículo">✕</button>`}
    </div>
    <div class="estrow">${FRACS.map((f, i) => `<button class="estchip" data-i="${i}">${f[0]}</button>`).join("")}</div>`;

  const key = `${u.id}|${artId}`;
  const num = row.querySelector(".qty__num");
  const setVal = (v, nota) => {
    if (v === null || v === "" || isNaN(v)) {
      state.qty.delete(key); state.notas.delete(key);
      num.value = ""; row.classList.remove("has-qty");
    } else {
      const n = Math.max(0, Math.floor(Number(v)));
      state.qty.set(key, n);
      if (nota) state.notas.set(key, nota); else state.notas.delete(key);
      num.value = String(n); row.classList.add("has-qty");
    }
    const card = row.closest(".loc");
    if (card) refreshSave(card, u);
  };
  state.fillers.set(key, setVal);
  if (prev) {
    row.querySelector(".item__prev").addEventListener("click", () =>
      setVal(prev.cantidad, `Sin cambios respecto al registro de ${prev.fecha}.`)
    );
  }
  row.querySelectorAll(".qty__btn").forEach((b) =>
    b.addEventListener("click", () => {
      const cur = state.qty.has(key) ? state.qty.get(key) : null;
      const d = Number(b.dataset.d);
      setVal(cur === null ? (d > 0 ? 1 : 0) : Math.max(0, cur + d));
    })
  );
  num.addEventListener("input", () => setVal(num.value === "" ? null : num.value));

  // Estimación por fracción de la capacidad (base CAPACIDADES)
  const estBtn = row.querySelector(".item__est");
  const estRow = row.querySelector(".estrow");
  estBtn.addEventListener("click", () => {
    const abierto = estRow.classList.toggle("is-open");
    estBtn.classList.toggle("is-on", abierto);
  });
  estRow.querySelectorAll(".estchip").forEach((chip) =>
    chip.addEventListener("click", () => {
      const cap = (u.caps || {})[artId];
      if (!cap) {
        toast("Falta definir la capacidad máxima de este artículo en esta ubicación (base CAPACIDADES).", true);
        return;
      }
      const [label, frac] = FRACS[Number(chip.dataset.i)];
      const val = Math.max(0, Math.round(frac * cap));
      setVal(val, `Estimación a ojo: ≈${label} de la capacidad (${val}/${cap}).`);
      estRow.classList.remove("is-open");
      estBtn.classList.remove("is-on");
    })
  );

  // Fila extra: la papelera elimina la fila entera (añadida por error)
  if (extra) {
    row.querySelector(".qty__del").addEventListener("click", () => {
      setVal(null);
      state.extras.get(u.id)?.delete(artId);
      state.fillers.delete(key);
      const card = row.closest(".loc");
      row.remove();
      if (card) refreshSave(card, u);
    });
  } else {
    row.querySelector(".qty__clear").addEventListener("click", () => setVal(null));
  }
  return row;
}

function itemsDeCard(u) {
  const ids = [...u.plan, ...(state.extras.get(u.id) || [])];
  return ids
    .filter((id) => state.qty.has(`${u.id}|${id}`))
    .map((id) => ({
      id,
      nombre: state.artById.get(id)?.nombre || "?",
      cantidad: state.qty.get(`${u.id}|${id}`),
      nota: state.notas.get(`${u.id}|${id}`) || undefined,
    }));
}

function refreshSave(card, u) {
  const save = card.querySelector(".loc__save");
  const n = itemsDeCard(u).length;
  save.disabled = n === 0;
  save.textContent = n === 0 ? "Guardar conteo" : `Guardar conteo (${n})`;
}

async function enviar(card, u, items) {
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
    return true;
  } catch (e) {
    toast("Error al guardar: " + e.message, true);
    return false;
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
