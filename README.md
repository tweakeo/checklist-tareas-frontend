# Checklist de Tareas — Frontend

Frontend visual y táctil (uso desde **tablet**) para marcar las tareas recurrentes diarias del equipo de **Chamberí Brothers / Paletos**, montado sobre el sistema que vive en Notion (HEADQUARTERS › OPERATIVA DIARIA). Estética: **design system de Paletos Club**.

- 📄 **Concepto técnico canónico:** [`concepto.md`](./concepto.md)
- 🤝 **Despliegue (guía para Claude Desktop):** [`GUIA-CLAUDE-DESKTOP.md`](./GUIA-CLAUDE-DESKTOP.md)
- 🗂️ **Proyecto en Notion:** HEADQUARTERS › PROYECTOS & MEJORA CONTINUA › *SISTEMA DE TAREAS*
- 🎨 **Design System:** `…/Chamberí Brothers/Paletos Club/Design System/`

## Cómo funciona (resumen)

1. La web lee las tareas de **HOY** desde la biblioteca de Notion (filtra las fórmulas `ES HOY = true` y `Hecha hoy = false`).
2. Al pulsar **Check**, crea un registro en *REGISTRO DE TAREAS EJECUTADAS* (no edita campos).
3. Notion recalcula los rollups/fórmulas: la tarea desaparece de HOY y, al día siguiente, reaparece sola.

## Estado

🚧 En kickoff — ver checkpoints en `concepto.md` y en la página de Notion.

## Stack (previsto)

- Frontend estático optimizado para tablet (botones grandes, alto contraste).
- Proxy serverless (Cloudflare Worker) con el token de Notion server-side.
- Notion API `2025-09-03`.

## 🖥️ Instalar como app en Windows (icono PWA)

Además del uso desde tablet, la web se puede **instalar como aplicación** en los
PC del local (en Edge/Chrome: menú → *Aplicaciones → Instalar este sitio como una
aplicación*). El acceso directo toma su icono del `manifest.webmanifest`, para
**distinguir cada app de un vistazo** frente a las calculadoras hermanas.

**Diseño — Design System de Paletos** (este repo es la fuente canónica del DS,
`assets/styles.css`): badge de sello — color de marca a sangre + sombra *stamp*
de tinta + panel de papel `#F6F1E7` con borde de tinta + glifo en tinta.

- **Tareas** → rojo `#D7261E`, glifo **check**. (`theme-color` del `<head>` pasó
  de tinta `#0E0E0E` a rojo para que el marco de la app instalada combine con el icono.)
- Hermanas: **Salsas** → dorado `#D9A800` (biberón) · **Postres** → rosa `#C2487E` (porción de tarta).

### Archivos
| Archivo | Uso |
|---|---|
| `assets/icons/icon-512.png`, `icon-192.png` | iconos PWA (`purpose: any`) |
| `assets/icons/icon-maskable-512.png` | icono adaptativo (`maskable`, con zona segura) |
| `assets/icons/apple-touch-icon.png` (180) | iOS / Safari |
| `assets/icons/favicon-32.png` · `favicon.ico` (16/32/48) | pestaña del navegador |
| `assets/icons/icon.svg` | favicon escalable |
| `manifest.webmanifest` | nombre, colores de marca y lista de iconos |

### Regenerar los iconos
`python3 tools/gen-icons.py` (requiere **Pillow**). Un único archivo de geometría
vectorial genera todos los PNG, el `.ico` y el SVG de **las tres apps** (salsas,
postres, tareas); edita glifos/colores allí y vuelve a ejecutarlo. Luego copia
`build/<app>/` sobre `assets/icons/` (y `favicon.ico` a la raíz).
