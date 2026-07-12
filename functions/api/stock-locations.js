// GET /api/stock-locations — datos para el formulario de conteo (/conteo/):
//   · ubicaciones → mapa físico (base UBICACIONES), ordenado por ORDEN CONTEO, con:
//       plan    → artículos asignados a la ubicación
//       caps    → { artId: CAP. SI EXCLUSIVO } desde la base CAPACIDADES (para las
//                 estimaciones rápidas por fracción: ½ de la capacidad, etc.)
//       ultimo  → { fecha, items } del último conteo registrado en esa ubicación
//                 (para el botón "Sin cambios")
//   · articulos → catálogo ligero de INVENTARIO GENERAL (id + nombre + categoría)
// Requiere NOTION_TOKEN (secreto server-side, el mismo del resto de la app).

const UBICACIONES = "a3af8e23-ecf8-43fb-b941-7f49c7a972fa";
const INVENTARIO = "ce2c83ab-a472-49db-9028-5c3eeb42d3df";
const CAPACIDADES = "82df803c-2567-41fb-a259-09b1309c7f17";
const CONTEOS = "693690e4-70b9-4358-82ab-357042886658";
const NOTION_VERSION = "2025-09-03";

export async function onRequestGet({ env }) {
  if (!env.NOTION_TOKEN) return json({ error: "Falta NOTION_TOKEN" }, 500);

  let ubicRows, invRows, capRows, contRows;
  try {
    [ubicRows, invRows, capRows, contRows] = await Promise.all([
      queryAll(UBICACIONES, env),
      queryAll(INVENTARIO, env),
      queryAll(CAPACIDADES, env),
      queryAll(CONTEOS, env),
    ]);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }

  // Capacidades exclusivas por (ubicación, artículo)
  const caps = {};
  for (const p of capRows) {
    const P = p.properties;
    const u = P["UBICACIÓN"]?.relation?.[0]?.id;
    const a = P["ARTÍCULO"]?.relation?.[0]?.id;
    const cap = P["CAP. SI EXCLUSIVO"]?.number;
    if (u && a && Number.isFinite(cap) && cap > 0) (caps[u] = caps[u] || {})[a] = cap;
  }

  // Último conteo por ubicación: todas las filas del día más reciente contado allí
  const porUbic = {};
  for (const p of contRows) {
    const P = p.properties;
    const u = P["UBICACIÓN"]?.relation?.[0]?.id;
    const fecha = P.FECHA?.date?.start || "";
    const cantidad = P.CANTIDAD?.number;
    if (!u || !fecha || !Number.isFinite(cantidad)) continue;
    const artId = P["ARTÍCULO"]?.relation?.[0]?.id || null;
    const titulo = text(P.CONTEO?.title);
    const nombre = artId ? null : (titulo.includes("—") ? titulo.split("—").slice(1).join("—").trim() : titulo);
    (porUbic[u] = porUbic[u] || []).push({ fecha, created: p.created_time, artId, nombre, cantidad });
  }
  // Por artículo, su último registro en esa ubicación (aunque sea de fechas distintas):
  // cada fila del formulario puede autorrellenarse con su propio último valor.
  const ultimo = {};
  for (const u of Object.keys(porUbic)) {
    const rows = porUbic[u];
    const fmax = rows.reduce((m, r) => (r.fecha > m ? r.fecha : m), "");
    const dedup = new Map();
    rows
      .sort((a, b) => (a.fecha + a.created < b.fecha + b.created ? -1 : 1))
      .forEach((r) => dedup.set(r.artId || "txt:" + r.nombre, r));
    ultimo[u] = {
      fecha: fmax,
      items: [...dedup.values()].map((r) => ({ id: r.artId, nombre: r.nombre, cantidad: r.cantidad, fecha: r.fecha })),
    };
  }

  const ubicaciones = ubicRows
    .map((p) => {
      const P = p.properties;
      return {
        id: p.id,
        nombre: text(P["UBICACIÓN"]?.title),
        equipo: P.EQUIPO?.select?.name || "",
        zona: P.ZONA?.select?.name || "",
        grupo: P["EQUIPO GRUPO"]?.select?.name || "",
        rol: P.ROL?.select?.name || "",
        orden: P["ORDEN CONTEO"]?.number ?? 999,
        plan: (P["ARTÍCULOS"]?.relation || []).map((r) => r.id),
        contenido: text(P["CONTENIDO (últ. conteo)"]?.rich_text),
        caps: caps[p.id] || {},
        ultimo: ultimo[p.id] || null,
      };
    })
    .filter((u) => u.nombre)
    .sort((a, b) => a.orden - b.orden);

  const articulos = invRows
    .map((p) => ({
      id: p.id,
      nombre: text(p.properties["ARTÍCULO"]?.title),
      cat: p.properties["CATEGORÍA"]?.select?.name || "",
    }))
    .filter((a) => a.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return json({ source: "notion", ubicaciones, articulos });
}

async function queryAll(dataSourceId, env) {
  const all = [];
  let cursor;
  do {
    const r = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!r.ok) throw new Error("notion " + r.status + " " + (await r.text()).slice(0, 200));
    const data = await r.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return all;
}

function text(rich) {
  return (rich || []).map((x) => x.plain_text).join("");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
