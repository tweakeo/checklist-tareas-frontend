// POST /api/stock-count — registra una tanda de conteo de una ubicación.
// body: { fecha: "YYYY-MM-DD", turno: "Mediodía"|"Noche"|"Cierre"|null,
//         ubicacionId, ubicacionNombre, items: [{ id?, nombre, cantidad }] }
// Crea UNA página por artículo en la base CONTEOS con todo lo repetitivo automatizado:
// ALCANCE = "Parcial (ubicación)", UBICACIÓN = la de la tanda, FECHA = la elegida
// (hoy por defecto en el frontend), título autocompuesto. TRAMO (L–J / V–D) lo
// calcula Notion por fórmula. La distinción clave: cantidad 0 = rotura de stock;
// artículo no enviado = no contado.

const CONTEOS = "693690e4-70b9-4358-82ab-357042886658";
const NOTION_VERSION = "2025-09-03";

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: "Falta NOTION_TOKEN" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const { fecha, turno, ubicacionId, ubicacionNombre, items } = body || {};

  if (!ubicacionId) return json({ error: "Falta ubicacionId" }, 400);
  if (!Array.isArray(items) || items.length === 0) return json({ error: "Sin items" }, 400);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(fecha || "") ? fecha : new Date().toISOString().slice(0, 10);
  const lugar = String(ubicacionNombre || "").split("—")[0].trim() || "Ubicación";

  let created = 0;
  const errores = [];
  for (const it of items) {
    const qty = Number(it?.cantidad);
    if (!it?.nombre || !Number.isFinite(qty) || qty < 0) {
      errores.push(`item inválido: ${JSON.stringify(it).slice(0, 80)}`);
      continue;
    }
    const props = {
      CONTEO: { title: [{ text: { content: `${dia} · ${lugar} — ${it.nombre}` } }] },
      FECHA: { date: { start: dia } },
      CANTIDAD: { number: qty },
      ALCANCE: { select: { name: "Parcial (ubicación)" } },
      "UBICACIÓN": { relation: [{ id: ubicacionId }] },
    };
    if (turno) props.TURNO = { select: { name: turno } };
    if (it.id) props["ARTÍCULO"] = { relation: [{ id: it.id }] };

    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: CONTEOS }, properties: props }),
    });
    if (r.ok) created++;
    else errores.push(`${it.nombre}: notion ${r.status} ${(await r.text()).slice(0, 120)}`);
  }

  if (created === 0) return json({ error: "No se creó ningún conteo", errores }, 502);
  return json({ ok: true, created, ...(errores.length ? { errores } : {}) });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
