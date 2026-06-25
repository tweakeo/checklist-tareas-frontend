/* =====================================================================
   Tareas de Hoy — Chamberí Brothers
   Modo SEED (data/seed.json) por defecto · modo LIVE con ?live (usa /api/*)
   "Marcar" = crear un registro de ejecución (en LIVE lo hace el proxy).
   ===================================================================== */

const CONFIG = {
  live: new URLSearchParams(location.search).has("live"),
  seedUrl: "data/seed.json",
  apiToday: "/api/today",
  apiCheck: "/api/check",
};

const TURNO_ORDER = ["🌅 Apertura", "🍽️ Servicio", "🌆 Entreturnos", "🌙 Cierre", "📆 Semanal", "🗓️ Mensual", "Sin turno"];
const PERSON_ORDER = ["León", "Alex", "Chopo", "Manu", "Equipo"];
const PERSON_COLOR = {
  "León": "var(--r-leon)", "Alex": "var(--r-alex)", "Chopo": "var(--r-chopo)",
  "Manu": "var(--r-manu)", "Equipo": "var(--r-equipo)",
};

const state = {
  tasks: [],
  mode: "persona",       // 'persona' | 'turno'
  person: null,          // null = todos
  done: new Set(),
  source: "semilla",
};

const $ = (s) => document.querySelector(s);
const board = $("#board");

/* ---------------- DATA ---------------- */
async function loadTasks() {
  board.innerHTML = '<div class="loading">Cargando tareas…</div>';
  try {
    if (CONFIG.live) {
      const r = await fetch(CONFIG.apiToday, { cache: "no-store" });
      if (!r.ok) throw new Error("api " + r.status);
      const data = await r.json();
      state.tasks = data.tasks || [];
      state.source = "Notion (live)";
    } else {
      const r = await fetch(CONFIG.seedUrl, { cache: "no-store" });
      const data = await r.json();
      state.tasks = data.tasks || [];
      state.source = "semilla · " + (data.generatedAt || "");
    }
  } catch (e) {
    state.tasks = [];
    toast("No se pudieron cargar las tareas", true);
    console.error(e);
  }
  state.done.clear();
  $("#sourceLabel").textContent = "datos: " + state.source;
  render();
}

/* ---------------- HELPERS ---------------- */
function pending() { return state.tasks.filter((t) => !state.done.has(t.id)); }

function uniqueByOrder(values, order) {
  const set = new Set(values);
  const ordered = order.filter((v) => set.has(v));
  const rest = [...set].filter((v) => !order.includes(v));
  return [...ordered, ...rest];
}

function prioClass(p) {
  if (!p) return "";
  const k = p.toLowerCase();
  if (k.startsWith("core")) return "tag--prio-core";
  if (k.startsWith("alta")) return "tag--prio-alta";
  if (k.startsWith("media")) return "tag--prio-media";
  return "tag--prio-baja";
}
function esc(s) { return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ---------------- RENDER ---------------- */
function render() {
  renderScore();
  renderChips();
  const groups = buildGroups();
  board.innerHTML = "";

  const hasAny = groups.some((g) => g.tasks.length > 0);
  $("#emptyState").hidden = hasAny;
  board.hidden = !hasAny;
  if (!hasAny) return;

  for (const g of groups) {
    if (!g.tasks.length) continue;
    const sec = document.createElement("section");
    sec.className = "group";
    const clear = g.tasks.length === 0;
    sec.innerHTML = `
      <div class="group__head">
        <span class="group__title">
          ${g.dot ? `<span class="group__dot" style="background:${g.dot}"></span>` : ""}${esc(g.title)}
        </span>
        <span class="group__count ${clear ? "is-clear" : ""}">${g.tasks.length} pdte${g.tasks.length === 1 ? "" : "s"}</span>
      </div>
      <div class="group__list"></div>`;
    const list = sec.querySelector(".group__list");
    for (const t of g.tasks) list.appendChild(taskCard(t));
    board.appendChild(sec);
  }
}

function buildGroups() {
  const p = pending();
  if (state.mode === "turno") {
    const turnos = uniqueByOrder(p.map((t) => t.turno || "Sin turno"), TURNO_ORDER);
    return turnos.map((turno) => ({
      title: turno,
      tasks: p.filter((t) => (t.turno || "Sin turno") === turno),
    }));
  }
  // persona
  const filtered = state.person ? p.filter((t) => t.responsables.includes(state.person)) : p;
  const persons = state.person
    ? [state.person]
    : uniqueByOrder(filtered.flatMap((t) => t.responsables.length ? t.responsables : ["Sin asignar"]), PERSON_ORDER);
  return persons.map((person) => ({
    title: person,
    dot: PERSON_COLOR[person] || "var(--pc-grey-500)",
    tasks: filtered.filter((t) => (t.responsables.length ? t.responsables : ["Sin asignar"]).includes(person)),
  }));
}

function taskCard(t) {
  const el = document.createElement("article");
  el.className = "task";
  el.dataset.id = t.id;
  const tags = [];
  if (state.mode === "persona" && t.turno) tags.push(`<span class="tag tag--turno">${esc(t.turno)}</span>`);
  if (state.mode === "turno") t.responsables.forEach((r) => tags.push(`<span class="tag" style="border-color:${PERSON_COLOR[r] || "var(--pc-ink)"}">${esc(r)}</span>`));
  if (t.prioridad) tags.push(`<span class="tag ${prioClass(t.prioridad)}">${esc(t.prioridad)}</span>`);
  if (t.mins) tags.push(`<span class="tag tag--mins">${t.mins}′</span>`);
  el.innerHTML = `
    <div class="task__main">
      <p class="task__name">${esc(t.tarea)}</p>
      <div class="task__meta">${tags.join("")}</div>
    </div>
    <button class="checkbtn" aria-label="Marcar como hecha: ${esc(t.tarea)}">
      <span class="checkbtn__icon">✓</span>Check
    </button>`;
  el.querySelector(".checkbtn").addEventListener("click", () => check(t, el));
  return el;
}

function renderScore() {
  $("#scoreDone").textContent = state.done.size;
  $("#scoreTotal").textContent = state.tasks.length;
  const today = new Date(state.tasks.length ? Date.now() : Date.now());
  $("#dateLabel").textContent = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

function renderChips() {
  const bar = $("#chipbar");
  if (state.mode !== "persona") { bar.innerHTML = ""; bar.style.display = "none"; return; }
  bar.style.display = "flex";
  const persons = uniqueByOrder(state.tasks.flatMap((t) => t.responsables), PERSON_ORDER);
  const chip = (label, value, color) =>
    `<button class="chip ${state.person === value ? "is-active" : ""}" data-person="${value === null ? "" : esc(value)}">
      ${color ? `<span class="chip__dot" style="background:${color}"></span>` : ""}${esc(label)}
    </button>`;
  bar.innerHTML = chip("Todos", null, null) + persons.map((p) => chip(p, p, PERSON_COLOR[p])).join("");
  bar.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => { state.person = c.dataset.person || null; render(); })
  );
}

/* ---------------- CHECK ACTION ---------------- */
function check(t, el) {
  if (state.done.has(t.id)) return;
  state.done.add(t.id);
  renderScore();
  el.classList.add("is-checking");
  setTimeout(() => el.classList.add("is-done"), 130);
  setTimeout(render, 470);
  toast(`✓ ${t.tarea}`);

  if (CONFIG.live) {
    fetch(CONFIG.apiCheck, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: t.id, tarea: t.tarea }),
    }).then((r) => { if (!r.ok) throw new Error("check " + r.status); })
      .catch((e) => {
        console.error(e);
        state.done.delete(t.id);   // rollback
        toast("Error al marcar. Reintenta.", true);
        renderScore(); render();
      });
  }
}

/* ---------------- UI CHROME ---------------- */
let toastTimer;
function toast(msg, isError) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("is-error", !!isError);
  el.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-show"), 2200);
}

document.querySelectorAll(".modebtn").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".modebtn").forEach((x) => { x.classList.remove("is-active"); x.setAttribute("aria-selected", "false"); });
    b.classList.add("is-active"); b.setAttribute("aria-selected", "true");
    state.mode = b.dataset.mode;
    render();
  })
);
$("#reloadBtn").addEventListener("click", loadTasks);

loadTasks();
