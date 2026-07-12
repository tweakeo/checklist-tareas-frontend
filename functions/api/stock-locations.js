// GET /api/stock-locations — datos para el formulario de conteo (/conteo/):
//   · ubicaciones → mapa físico (base UBICACIONES del sistema CONTROL DE STOCK),
//     ordenado por ORDEN CONTEO, con los artículos del plan de cada ubicación.
//   · articulos   → catálogo ligero de INVENTARIO GENERAL (id + nombre + categoría),
//     para resolver nombres del plan y para añadir artículos fuera de plan.
// Requiere NOTION_TOKEN (secreto server-side, el mismo del resto de la app).

const UBICACIONES = "a3af8e23-ecf8-43fb-b941-7f49c7a972fa";
const INVENTARIO = "ce2c83ab-a472-49db-9028-5c3eeb42d3df";
const NOTION_VERSION = "2025-09-03";

export async function onRequestGet({ env }) {
  if (!env.NOTION_TOKEN) return json({ error: "Falta NOTION_TOKEN" }, 500);

  let ubicRows, invRows;
  try {
    [ubicRows, invRows] = await Promise.all([queryAll(UBICACIONES, env), queryAll(INVENTARIO, env)]);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }

  const ubicaciones = ubicRows
    .map((p) => {
      const P = p.properties;
      return {
        id: p.id,
        nombre: text(P["UBICACIÓN"]?.title),
        equipo: P.EQUIPO?.select?.name || "",
        zona: P.ZONA?.select?.name || "",
        rol: P.ROL?.select?.name || "",
        orden: P["ORDEN CONTEO"]?.number ?? 999,
        plan: (P["ARTÍCULOS"]?.relation || []).map((r) => r.id),
        contenido: text(P["CONTENIDO (últ. conteo)"]?.rich_text),
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
