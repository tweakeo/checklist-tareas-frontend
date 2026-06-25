// POST /api/check  body: { taskId, tarea }
// Marcar = CREAR un registro en REGISTRO DE TAREAS EJECUTADAS (no editar campos).
// El rollup + las fórmulas de Notion hacen el resto (la tarea desaparece de HOY).

const REGISTRO = "262028f9-a188-4f8b-a1a3-5ff768906107";
const NOTION_VERSION = "2025-09-03";

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_TOKEN) return json({ error: "Falta NOTION_TOKEN" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const { taskId, tarea } = body || {};
  if (!taskId) return json({ error: "Falta taskId" }, 400);

  const today = new Date().toISOString().slice(0, 10);

  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: REGISTRO },
      properties: {
        Tarea: { title: [{ text: { content: tarea || "Tarea" } }] },
        Fecha: { date: { start: today } },
        Plantilla: { relation: [{ id: taskId }] },
      },
    }),
  });

  if (!r.ok) return json({ error: "notion " + r.status, detail: await r.text() }, 502);
  const page = await r.json();
  return json({ ok: true, executionId: page.id });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
