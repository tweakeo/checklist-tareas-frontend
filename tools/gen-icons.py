#!/usr/bin/env python3
"""
Paletos Design System app icons for the three Tweakeo web-apps.
Badge motif: full-bleed app colour + ink "stamp" offset + cream panel (ink keyline)
+ bold ink product glyph. One geometry -> Pillow PNGs (+ .ico) and a scalable SVG.
"""
import os
from PIL import Image, ImageDraw

INK   = (14, 14, 14, 255)      # #0E0E0E
PAPER = (246, 241, 231, 255)   # #F6F1E7
def hx(c): return "#%02X%02X%02X" % (c[0], c[1], c[2])

APPS = {
    "salsas":  {"bg": (217, 168, 0,   255)},  # #D9A800 gold
    "postres": {"bg": (194, 72,  126, 255)},  # #C2487E pink
    "tareas":  {"bg": (215, 38,  30,  255)},  # #D7261E red
}

# ---- glyphs in a 0..100 box (x right, y down), primitives share PNG+SVG ----
def glyph(app):
    if app == "tareas":                       # bold check mark
        return [
            {"t": "pline", "pts": [(19, 55), (43, 78), (83, 24)], "w": 15, "col": INK},
        ]
    if app == "salsas":                        # squeeze / condiment bottle
        return [
            {"t": "rrect", "xywh": (32, 42, 36, 50), "r": 9,  "fill": INK},   # body
            {"t": "poly",  "pts": [(36, 43), (64, 43), (59, 31), (41, 31)], "fill": INK},  # shoulder
            {"t": "rrect", "xywh": (43, 24, 14, 8),  "r": 2,  "fill": INK},   # neck
            {"t": "rrect", "xywh": (41, 17, 18, 8),  "r": 2,  "fill": INK},   # cap band
            {"t": "poly",  "pts": [(47, 18), (53, 18), (51, 6), (49, 6)], "fill": INK},     # spout
            {"t": "circle","c": (64, 15), "r": 3.4, "fill": INK},            # sauce drop
            {"t": "rrect", "xywh": (32, 60, 36, 13), "r": 2,  "fill": PAPER}, # label cut-out
        ]
    if app == "postres":                       # cheesecake slice + cherry
        return [
            {"t": "poly",   "pts": [(13, 75), (87, 27), (87, 75)], "fill": INK},   # wedge
            {"t": "rrect",  "xywh": (34, 63, 53, 5), "r": 2, "fill": PAPER},       # crust line
            {"t": "pline",  "pts": [(79, 15), (73, 7)], "w": 2.6, "col": INK},     # cherry stem
            {"t": "circle", "c": (79, 21), "r": 7.2, "fill": INK},                 # cherry
        ]
    return []

# ---- layout (logical 512 square) ----
S = 512
def layout(maskable):
    if maskable:
        side, off = 300, 15
    else:
        side, off = 324, 22
    x0 = (S - side) / 2
    return {"side": side, "off": off, "x0": x0, "y0": x0, "r": 34,
            "border": 11, "glyph_inset": 0.60}

# ================= Pillow renderer =================
def render_png(app, maskable, out_px):
    DRAW = 1536
    sc = DRAW / S
    def p(v): return v * sc
    img = Image.new("RGBA", (DRAW, DRAW), APPS[app]["bg"])
    d = ImageDraw.Draw(img)
    L = layout(maskable)
    side, off, x0, y0, r = L["side"], L["off"], L["x0"], L["y0"], L["r"]
    # stamp shadow
    d.rounded_rectangle([p(x0 + off), p(y0 + off), p(x0 + off + side), p(y0 + off + side)],
                        radius=p(r), fill=INK)
    # cream panel + ink keyline
    d.rounded_rectangle([p(x0), p(y0), p(x0 + side), p(y0 + side)],
                        radius=p(r), fill=PAPER, outline=INK, width=int(round(p(L["border"]))))
    # glyph box
    box = side * L["glyph_inset"]
    bx0 = x0 + (side - box) / 2
    by0 = y0 + (side - box) / 2
    def g(x, y): return (p(bx0 + x / 100 * box), p(by0 + y / 100 * box))
    for pr in glyph(app):
        if pr["t"] == "poly":
            d.polygon([g(*q) for q in pr["pts"]], fill=pr["fill"])
        elif pr["t"] == "rrect":
            x, y, w, h = pr["xywh"]
            (X0, Y0), (X1, Y1) = g(x, y), g(x + w, y + h)
            d.rounded_rectangle([X0, Y0, X1, Y1], radius=p(pr["r"] / 100 * box), fill=pr["fill"])
        elif pr["t"] == "circle":
            cx, cy = pr["c"]; rr = pr["r"] / 100 * box
            CX, CY = g(cx, cy)
            d.ellipse([CX - p(rr), CY - p(rr), CX + p(rr), CY + p(rr)], fill=pr["fill"])
        elif pr["t"] == "pline":
            w = pr["w"] / 100 * box
            pts = [g(*q) for q in pr["pts"]]
            d.line(pts, fill=pr["col"], width=int(round(p(w))), joint="curve")
            rad = p(w) / 2
            for (CX, CY) in pts:  # round caps/joins
                d.ellipse([CX - rad, CY - rad, CX + rad, CY + rad], fill=pr["col"])
    return img.resize((out_px, out_px), Image.LANCZOS)

# ================= SVG emitter =================
def render_svg(app):
    L = layout(False)
    side, off, x0, y0, r = L["side"], L["off"], L["x0"], L["y0"], L["r"]
    box = side * L["glyph_inset"]
    bx0 = x0 + (side - box) / 2; by0 = y0 + (side - box) / 2
    def gx(x): return round(bx0 + x / 100 * box, 2)
    def gy(y): return round(by0 + y / 100 * box, 2)
    def gs(v): return round(v / 100 * box, 2)
    e = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">',
         f'<rect width="{S}" height="{S}" fill="{hx(APPS[app]["bg"])}"/>',
         f'<rect x="{x0+off}" y="{y0+off}" width="{side}" height="{side}" rx="{r}" fill="{hx(INK)}"/>',
         f'<rect x="{x0}" y="{y0}" width="{side}" height="{side}" rx="{r}" '
         f'fill="{hx(PAPER)}" stroke="{hx(INK)}" stroke-width="{L["border"]}"/>']
    for pr in glyph(app):
        f = hx(pr.get("fill", INK))
        if pr["t"] == "poly":
            pts = " ".join(f"{gx(x)},{gy(y)}" for x, y in pr["pts"])
            e.append(f'<polygon points="{pts}" fill="{f}"/>')
        elif pr["t"] == "rrect":
            x, y, w, h = pr["xywh"]
            e.append(f'<rect x="{gx(x)}" y="{gy(y)}" width="{gs(w)}" height="{gs(h)}" '
                     f'rx="{gs(pr["r"])}" fill="{f}"/>')
        elif pr["t"] == "circle":
            cx, cy = pr["c"]
            e.append(f'<circle cx="{gx(cx)}" cy="{gy(cy)}" r="{gs(pr["r"])}" fill="{f}"/>')
        elif pr["t"] == "pline":
            pts = " ".join(f"{gx(x)},{gy(y)}" for x, y in pr["pts"])
            e.append(f'<polyline points="{pts}" fill="none" stroke="{hx(pr["col"])}" '
                     f'stroke-width="{gs(pr["w"])}" stroke-linecap="round" stroke-linejoin="round"/>')
    e.append("</svg>")
    return "\n".join(e)

# ================= build =================
def build(app, outdir):
    os.makedirs(outdir, exist_ok=True)
    master = render_png(app, False, 512)
    master.save(os.path.join(outdir, "icon-512.png"))
    master.resize((192, 192), Image.LANCZOS).save(os.path.join(outdir, "icon-192.png"))
    render_png(app, True, 512).save(os.path.join(outdir, "icon-maskable-512.png"))
    # apple-touch (opaque, 180)
    at = master.resize((180, 180), Image.LANCZOS).convert("RGB")
    at.save(os.path.join(outdir, "apple-touch-icon.png"))
    # favicon png + ico
    master.resize((32, 32), Image.LANCZOS).save(os.path.join(outdir, "favicon-32.png"))
    ico_base = master.resize((256, 256), Image.LANCZOS)
    ico_base.save(os.path.join(outdir, "favicon.ico"), format="ICO",
                  sizes=[(48, 48), (32, 32), (16, 16)])
    with open(os.path.join(outdir, "icon.svg"), "w") as fh:
        fh.write(render_svg(app))
    # contact sheet preview (512 masters side by side handled outside)
    print(f"[{app}] -> {outdir}")

if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))
    for app in APPS:
        build(app, os.path.join(base, "build", app))
    # preview contact sheet of the three full-bleed masters + maskable
    sheet = Image.new("RGBA", (512 * 3 + 40 * 4, 512 + 200 + 60), (255, 255, 255, 255))
    ds = ImageDraw.Draw(sheet)
    for i, app in enumerate(APPS):
        m = Image.open(os.path.join(base, "build", app, "icon-512.png"))
        x = 40 + i * (512 + 40)
        sheet.paste(m, (x, 30))
        # small 64 + 32 previews under each
        for j, sz in enumerate((128, 64, 32)):
            s = m.resize((sz, sz), Image.LANCZOS)
            sheet.paste(s, (x + j * 150, 30 + 512 + 30))
    sheet.save(os.path.join(base, "build", "_preview.png"))
    print("preview -> build/_preview.png")
