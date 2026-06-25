// GET /api/today — tareas de HOY desde la biblioteca de Notion.
// Queremos las que cumplen ES HOY="true" y Hecha hoy="false" (ambas fórmulas de texto).
// OJO: Notion rechaza filtrar por estas fórmulas en la query ("Unable to filter based on
// a formula of unknown type", porque dependen de now()/rollup). Por eso traemos la
// biblioteca completa y filtramos por el VALOR de la fórmula en cada página, aquí en el Worker.
// Requiere la variable de entorno NOTION_TOKEN (secreta, server-side).

const BIBLIOTECA = "361e4f0f-ad19-813b-81d2-000b0302a672";
const NOTION_VERSION = "2025-09-03";

export async function onRequestGet({ env }) {
  if (!env.NOTION_TOKEN) return json({ error: "Falta NOTION_TOKEN" }, 500);

  // Traemos todas las páginas de la biblioteca (paginado por si crece > 100).
  const all = [];
  let cursor;
  do {
    const r = await fetch(`https://api.notion.com/v1/data_sources/${BIBLIOTECA}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!r.ok) return json({ error: "notion " + r.status, detail: await r.text() }, 502);
    const data = await r.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  const tasks = all
    .filter((p) => {
      const P = p.properties;
      return P["ES HOY"]?.formula?.string === "true" && P["Hecha hoy"]?.formula?.string === "false";
    })
    .map((p) => {
      const P = p.properties;
      return {
        id: p.id,
        tarea: P.TAREA?.title?.[0]?.plain_text || "",
        responsables: (P.RESPONSABLE?.multi_select || []).map((o) => o.name),
        turno: P.TURNO?.select?.name || "Sin turno",
        dia: (P["DÍA"]?.multi_select || []).map((o) => o.name),
        prioridad: P.PRIORIDAD?.select?.name || null,
        categoria: (P["CATEGORÍA"]?.multi_select || []).map((o) => o.name),
        mins: P["TIEMPO (mins)"]?.number ?? null,
        hechaHoy: false,
      };
    });

  return json({ generatedAt: new Date().toISOString().slice(0, 10), source: "notion", tasks });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
