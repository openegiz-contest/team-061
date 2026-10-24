#!/usr/bin/env python3
"""Сборка презентации «Кенташ»: слайды 1920×1080 в index.html, печать в PDF — Chrome (--print-to-pdf).
Скриншоты берутся со Стенда (img/*.jpg), графики сценариев строятся по измерениям модели (data/scenarios/*.json)."""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = "img"
DATA = os.path.join(HERE, "data", "scenarios")
E = html.escape

CSS = """
@page{size:1920px 1080px;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#0b1118;font-family:"Segoe UI","Inter","Helvetica Neue",Arial,sans-serif;color:#e8eef5}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;page-break-after:always;break-after:page;
 background:radial-gradient(1200px 700px at 85% -10%,#1a2838 0%,rgba(11,17,24,0) 60%),#0e151d;padding:64px 84px 0}
.slide:last-child{page-break-after:auto;break-after:auto}
.tag{font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:#e8b20e;font-weight:600}
h1{font-size:92px;line-height:1.02;margin:18px 0 0;font-weight:700;letter-spacing:-.01em}
h2{font-size:58px;line-height:1.08;margin:10px 0 0;font-weight:700;letter-spacing:-.005em;max-width:1560px}
.lead{font-size:30px;line-height:1.38;color:#b8c6d4;margin:20px 0 0;max-width:1500px}
.foot{position:absolute;left:84px;right:84px;bottom:30px;display:flex;justify-content:space-between;font-size:19px;color:#6f8296}
.card{background:#141d28;border:1px solid #243346;border-radius:16px;padding:26px 30px}
.card h3{margin:0 0 10px;font-size:30px;color:#fff}
.card p,.card li{font-size:25px;line-height:1.38;color:#c3d0dc;margin:0}
ul{margin:0;padding-left:30px} li{margin:6px 0}
.grid{display:grid;gap:26px}
.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:1fr 1fr 1fr}.g4{grid-template-columns:repeat(4,1fr)}
.shot{border-radius:14px;border:1px solid #2a3b50;overflow:hidden;background:#0a0f15;box-shadow:0 14px 40px rgba(0,0,0,.45)}
.shot img{display:block;width:100%;height:100%;object-fit:cover;object-position:left top}
.cap{font-size:20px;color:#8ea2b6;margin-top:10px}
.num{font-size:112px;font-weight:700;line-height:1;color:#fff}
.num small{font-size:30px;font-weight:600;color:#e8b20e;display:block;margin-top:10px;letter-spacing:.02em}
.kpi{background:#141d28;border:1px solid #243346;border-radius:16px;padding:28px 30px}
.kpi p{font-size:24px;color:#a9b9c8;margin:14px 0 0;line-height:1.32}
table{border-collapse:collapse;width:100%;font-size:23px}
th{font-size:20px;text-transform:uppercase;letter-spacing:.08em;color:#e8b20e;text-align:left;padding:8px 14px;border-bottom:2px solid #2a3b50}
td{padding:9px 14px;border-bottom:1px solid #223244;vertical-align:top;color:#d4dfea;line-height:1.3}
code,.code{font-family:"Cascadia Mono",Consolas,monospace}
.code{background:#0a0f15;border:1px solid #2a3b50;border-radius:12px;padding:22px 28px;font-size:25px;line-height:1.55;color:#cfe3f5}
.pill{display:inline-block;padding:4px 14px;border-radius:999px;font-size:21px;font-weight:600;margin-right:8px}
.ok{background:#12351f;color:#5ee08a}.warn{background:#3a2e0c;color:#f0c24a}.bad{background:#3b1717;color:#ff8d8d}
.b{color:#fff;font-weight:600}.mut{color:#8ea2b6}.y{color:#e8b20e}
"""


def slide(n, tag, title, body, lead=None, total=None):
    head = f'<div class="tag">{E(tag)}</div>' if tag else ""
    ttl = f"<h2>{title}</h2>" if title else ""
    ld = f'<p class="lead">{lead}</p>' if lead else ""
    return (f'<section class="slide">{head}{ttl}{ld}<div style="margin-top:34px">{body}</div>'
            f'<div class="foot"><span>Кенташ · цифровой рудник на OpenEgiz · команда DBA</span><span>{n}</span></div></section>')


def shot(name, w, h=None, cap=None):
    h = h or round(w * 0.77)
    c = f'<div class="cap">{cap}</div>' if cap else ""
    return f'<div><div class="shot" style="width:{w}px;height:{h}px"><img src="{IMG}/{name}.jpg" alt=""></div>{c}</div>'


# ------------------------------------------------------------------ диаграммы
def chain_svg():
    def box(x, y, w, h, t, sub="", c="#1c2a3a", s="#3a526b", tc="#fff"):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{c}" stroke="{s}" stroke-width="2"/>'
                f'<text x="{x + w / 2}" y="{y + h / 2 - (8 if sub else 0) + 8}" text-anchor="middle" font-size="20" font-weight="600" fill="{tc}">{t}</text>'
                + (f'<text x="{x + w / 2}" y="{y + h / 2 + 22}" text-anchor="middle" font-size="15" fill="#9db0c2">{sub}</text>' if sub else ""))

    def arr(x1, y1, x2, y2, c="#6f8aa6", d=""):
        import math
        L = math.hypot(x2 - x1, y2 - y1) or 1
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        px, py = -uy, ux
        hx, hy = x2 - ux * 14, y2 - uy * 14
        return (f'<line x1="{x1}" y1="{y1}" x2="{hx:.1f}" y2="{hy:.1f}" stroke="{c}" stroke-width="3" {d}/>'
                f'<polygon points="{x2},{y2} {hx + px * 8:.1f},{hy + py * 8:.1f} {hx - px * 8:.1f},{hy - py * 8:.1f}" fill="{c}"/>')

    o = "#3d2c0e"; os_ = "#e8b20e"; g = "#10301f"; gs = "#3fb97a"; b = "#122a44"; bs = "#4aa3ff"; r = "#331616"; rs = "#e85d5d"
    s = ['<svg viewBox="0 0 1752 560" width="1752" height="560" xmlns="http://www.w3.org/2000/svg">']
    # основная линия руды
    xs = [0, 222, 444, 666, 888, 1110, 1332, 1554]
    names = [("Забои, самосвалы", "3 забоя · 6 × 130 т", o, os_), ("Дробление ККД", "ККД-1500/180", o, os_), ("Склад КДР", "60 000 т · питатели", o, os_),
             ("Измельчение", "МПСИ · МШЦ · циклон", g, gs), ("Флотация", "6+4 камеры · перечистки", g, gs),
             ("Сгущение, фильтр", "сгуститель · 2 пресса", g, gs), ("Склад концентрата", "3 500 т", g, gs), ("Ж/д отправка", "20 вагонов × 60 т", g, gs)]
    for x, (t, sub, c, sc) in zip(xs, names):
        s.append(box(x, 40, 198, 112, t, sub, c, sc))
    for a, bx in zip(xs, xs[1:]):
        s.append(arr(a + 198, 96, bx, 96, "#9db0c2"))
    # вскрыша и перегрузочный склад
    s.append(box(0, 220, 198, 84, "Вскрыша → Отвал", "отдельная ветвь", "#241f19", "#93816b"))
    s.append(arr(99, 152, 99, 220, "#93816b"))
    s.append(box(222, 220, 198, 84, "Склад перегрузки", "погрузчик · резерв", "#241f19", "#93816b"))
    s.append(arr(99, 152, 280, 220, "#93816b", 'stroke-dasharray="8 6"'))
    s.append(arr(330, 220, 330, 152, "#93816b", 'stroke-dasharray="8 6"'))
    # хвосты и вода
    s.append(box(1110, 220, 198, 84, "Хвосты", "сгуститель ⌀50 м", b, bs))
    s.append(box(1332, 220, 198, 84, "Пульпопровод", "DN700 · 6,2 км", b, bs))
    s.append(box(1554, 220, 198, 84, "Хвостохранилище", "25 млн м³", b, bs))
    s.append(arr(1209, 152, 1209, 220, bs)); s.append(arr(1308, 262, 1332, 262, bs)); s.append(arr(1530, 262, 1554, 262, bs))
    s.append(box(1332, 340, 420, 70, "Оборотная вода 18 тыс. м³", "барж-насосы → фабрика", "#0f2233", bs))
    s.append(arr(1650, 304, 1650, 340, bs)); s.append(f'<path d="M1332 375 L1000 375 L1000 152" fill="none" stroke="{bs}" stroke-width="3" stroke-dasharray="8 6"/>')
    # обеспечение
    sup = [("Водоотлив", "3 насоса · автоматика"), ("ГПП 110/6 кВ", "2 трансформатора · N-1"), ("АЗС и ГСМ", "2 × 30 м³ · бензовоз"), ("Мастерская", "3 поста · кран 20 т"), ("ТОиР", "468 активов · наряды"), ("Персонал", "130 чел. · 2 смены · GPS"), ("Безопасность", "взрыв · борт · воздух"), ("Экономика", "по отгрузке меди")]
    for i, (t, sub) in enumerate(sup):
        s.append(box(i * 222, 450, 198, 96, t, sub, r if i == 1 else "#1a2230", rs if i == 1 else "#4a5d73"))
    s.append('<text x="0" y="438" font-size="20" fill="#8ea2b6" letter-spacing="3">ОБЕСПЕЧЕНИЕ ПРОИЗВОДСТВА</text>')
    s.append("</svg>")
    return "".join(s)


def arch_svg():
    def node(x, y, w, h, t, sub, c, sc):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{c}" stroke="{sc}" stroke-width="2.5"/>'
                f'<text x="{x + w / 2}" y="{y + 44}" text-anchor="middle" font-size="27" font-weight="700" fill="#fff">{t}</text>'
                + "".join(f'<text x="{x + w / 2}" y="{y + 80 + i * 26}" text-anchor="middle" font-size="19" fill="#b4c4d3">{l}</text>' for i, l in enumerate(sub)))
    def ar(x1, y1, x2, y2, lab, c="#8fa5ba", dy=-12):
        return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="3.5"/><polygon points="{x2},{y2} {x2 - 14},{y2 - 8} {x2 - 14},{y2 + 8}" fill="{c}"/>'
                f'<text x="{(x1 + x2) / 2}" y="{y1 + dy}" text-anchor="middle" font-size="19" fill="#e8b20e">{lab}</text>')
    s = ['<svg viewBox="0 0 1752 520" width="1752" height="520" xmlns="http://www.w3.org/2000/svg">']
    s.append(node(0, 70, 320, 170, "kentash-sim", ["модель процессов, шаг 1 с", "транспорт · фабрика · ТОиР", "контрольные точки SQLite"], "#1c2a3a", "#e8b20e"))
    s.append(node(400, 70, 250, 170, "MQTT", ["telemetry/‹двойник›", "лимит 20 сообщений/с", "приоритет движению"], "#17283a", "#4aa3ff"))
    s.append(node(730, 70, 320, 170, "Eclipse Ditto", ["702 двойника kz.kentash:*", "attributes · features", "связи и иерархия"], "#122a44", "#4aa3ff"))
    s.append(node(1130, 70, 280, 170, "Стенд (веб)", ["Three.js · SVG-мнемосхемы", "данные: поиск + SSE", "прокси подставляет учётку"], "#10301f", "#3fb97a"))
    s.append(node(1490, 70, 262, 170, "Диспетчер", ["сценарии и команды", "ускорение времени", "ТОиР, план, режимы"], "#241f19", "#93816b"))
    s.append(ar(320, 155, 400, 155, "")); s.append(ar(650, 155, 730, 155, "")); s.append(ar(1050, 155, 1130, 155, "")); s.append(ar(1410, 155, 1490, 155, ""))
    s.append('<text x="1220" y="46" text-anchor="middle" font-size="19" fill="#e8b20e">состояние →</text>')
    # обратная связь
    s.append('<path d="M1620 240 L1620 330 L890 330 L890 245" fill="none" stroke="#e8b20e" stroke-width="3.5" stroke-dasharray="10 8"/><polygon points="890,242 881,258 899,258" fill="#e8b20e"/>')
    s.append('<text x="1255" y="320" text-anchor="middle" font-size="20" fill="#e8b20e">команда в двойник control → событие Ditto → MQTT → симулятор</text>')
    s.append('<path d="M890 245 L890 330 L160 330 L160 245" fill="none" stroke="#4aa3ff" stroke-width="3" stroke-dasharray="3 7" opacity="0"/>')
    s.append(node(730, 390, 320, 110, "Telegraf → InfluxDB", ["история показателей"], "#17283a", "#4aa3ff"))
    s.append(node(1130, 390, 280, 110, "Grafana", ["дашборд «Рудник Кенташ»"], "#17283a", "#4aa3ff"))
    s.append(ar(1050, 445, 1130, 445, "")); s.append('<line x1="890" y1="240" x2="890" y2="390" stroke="#4aa3ff" stroke-width="3" stroke-dasharray="4 6"/>')
    s.append("</svg>")
    return "".join(s)


# ------------------------------------------------------------------ графики сценариев
# (ключ, название, цвет, длительность воздействия, показатель, подпись оси, множитель)
SCEN_VIEW = [("grid_out", "Обесточивание ГПП-110 кВ", "#e85d5d", 1, "feed", "питание фабрики, т/ч", 1.0),
             ("crusher_stop", "Остановка ККД на 1 ч", "#e8b20e", 1, "cos", "запас склада КДР, тыс. т", 0.001),
             ("ramp_closed", "Закрыт съезд карьера на 1 ч", "#c04ee0", 1, "mined", "добыча руды, т/ч", 1.0),
             ("oxide", "Зона окисленной руды на 2 ч", "#3fb97a", 2, "rec", "извлечение меди, %", 1.0),
             ("rain_pumps", "Ливень + отказ насосов на 2 ч", "#4aa3ff", 2, "sump", "уровень в зумпфе, %", 1.0)]


def load(name):
    p = os.path.join(DATA, name + ".json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None


def panel(base, sc, title, color, dur, metric, label, k, t_on=1.0):
    W, H, L, B = 560, 170, 56, 30
    bs = [p[metric] * k for p in base["series"]]
    ss = [p[metric] * k for p in sc["series"]]
    lo, hi = min(bs + ss), max(bs + ss)
    if metric in ("feed", "mined"): lo = 0.0
    pad = (hi - lo) * 0.12 or 1.0
    lo, hi = (lo if metric in ("feed", "mined") else lo - pad), hi + pad
    xs = lambda t: L + (W - L - 10) * t / 7.0
    ys = lambda v: 12 + (H - B - 12) * (1 - (v - lo) / (hi - lo))
    out = [f'<svg viewBox="0 0 {W} {H}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">']
    t_off = t_on + dur
    out.append(f'<rect x="{xs(t_on):.1f}" y="12" width="{xs(t_off) - xs(t_on):.1f}" height="{H - B - 12}" fill="{color}" opacity=".14"/>')
    for g in (0, 0.5, 1):
        v = lo + (hi - lo) * g
        fmt = f"{v:.0f}" if hi > 30 else f"{v:.1f}"
        out.append(f'<line x1="{L}" y1="{ys(v):.1f}" x2="{W - 10}" y2="{ys(v):.1f}" stroke="#223244"/><text x="{L - 8}" y="{ys(v) + 6:.1f}" text-anchor="end" font-size="15" fill="#7f93a8">{fmt}</text>')
    for h in range(0, 8):
        out.append(f'<text x="{xs(h):.1f}" y="{H - 12}" text-anchor="middle" font-size="15" fill="#7f93a8">{h} ч</text>' if h % 2 == 0 else "")
    pb = " ".join(f"{xs(p['t']):.1f},{ys(v):.1f}" for p, v in zip(base["series"], bs))
    ps = " ".join(f"{xs(p['t']):.1f},{ys(v):.1f}" for p, v in zip(sc["series"], ss))
    out.append(f'<polyline points="{pb}" fill="none" stroke="#7f93a8" stroke-width="2.5" stroke-dasharray="6 5"/>')
    out.append(f'<polyline points="{ps}" fill="none" stroke="{color}" stroke-width="4"/></svg>')
    d = base["conc"] - sc["conc"]
    pct = 100 * d / base["conc"] if base["conc"] else 0
    cls = "bad" if pct > 3 else "ok"
    extra = ""
    if metric == "mined": extra = f' · стоит самосвалов: до {max(p["parked"] for p in sc["series"])} из 6'
    if metric == "cos": extra = f' · питание фабрики не просело (мин. {min(p["feed"] for p in sc["series"])} т/ч)'
    if metric == "sump": extra = f' · пик {max(ss):.0f} % против {max(bs):.0f} %'
    return (f'<div class="card" style="padding:14px 20px"><div style="font-size:24px;font-weight:700;color:#fff">{E(title)}</div>'
            f'<div class="mut" style="font-size:16px;margin:0 0 2px">{label} · серая линия — без воздействия{extra}</div>{"".join(out)}'
            f'<div style="font-size:20px;margin-top:0">концентрата за 7 ч: <span class="b">{sc["conc"]:.0f} т</span> против {base["conc"]:.0f} т '
            f'<span class="pill {cls}" style="margin-left:6px">{"−" if d >= 0.5 else "≈ "}{abs(d):.0f} т ({abs(pct):.1f} %)</span></div></div>')


def scenarios_slide(n):
    base = load("baseline")
    cells = []
    for key, title, col, dur, metric, label, k in SCEN_VIEW:
        sc = load(key)
        if sc and base:
            cells.append(panel(base, sc, title, col, dur, metric, label, k))
    cells.append('<div class="card" style="display:flex;flex-direction:column;justify-content:center"><h3 style="font-size:30px">Что это показывает</h3>'
                 '<ul style="font-size:21px"><li>склад КДР 60 000 т и запасы в аппаратах гасят короткие остановки ККД и съезда</li>'
                 '<li>потеря питания останавливает всё и восстанавливается последовательным пуском</li>'
                 '<li>качество руды меняет выпуск при том же тоннаже</li></ul></div>')
    body = f'<div class="grid g3" style="gap:22px">{"".join(cells)}</div>'
    return slide(n, "Что если · измерения на модели", "Один и тот же запуск: с воздействием и без", body,)


# ------------------------------------------------------------------ колода
def deck():
    S = []
    n = 0

    def add(*a, **k):
        nonlocal n
        n += 1
        S.append(slide(n, *a, **k))

    # 1. титул
    n += 1
    S.append(f'''<section class="slide" style="padding:0"><div style="position:absolute;inset:0"><img src="{IMG}/pit.jpg" style="width:100%;height:100%;object-fit:cover;opacity:.55" alt=""></div>
<div style="position:absolute;inset:0;background:linear-gradient(90deg,#0a1017 0%,rgba(10,16,23,.88) 42%,rgba(10,16,23,.15) 100%)"></div>
<div style="position:absolute;left:96px;top:250px;width:1080px"><div class="tag">Цифровой двойник · Eclipse Ditto · OpenEgiz</div>
<h1>Кенташ</h1><p style="font-size:46px;line-height:1.25;margin:26px 0 0;color:#dfe9f3">Цифровой медный рудник: от забоя до железнодорожной отправки концентрата</p>
<p style="font-size:28px;color:#9db0c2;margin:44px 0 0">702 двойника · 14 модулей · 15 ситуаций · прогноз «что если» на сутки</p>
<p style="font-size:26px;color:#e8b20e;margin:60px 0 0;font-weight:600">Команда DBA · Dmitriynursh, Arnaktga</p>
<p style="font-size:22px;color:#6f8296;margin:6px 0 0">openegiz-contest/team-061</p></div></section>''')

    add("Замысел", "Как держать выпуск концентрата, когда всё связано",
        '<div class="grid g3">'
        '<div class="card"><h3>Предприятие</h3><p>Вымышленный открытый медный карьер «Кенташ» с флотационной фабрикой: забои, самосвалы, дробление, измельчение, флотация, концентрат, хвосты, вода, энергия, ремонты, персонал.</p></div>'
        '<div class="card"><h3>Пользователь</h3><p>Диспетчер, руководитель смены и руководство рудника. Видят всю цепочку на одном экране, включают ситуации и получают прогноз на сутки с рекомендацией.</p></div>'
        '<div class="card"><h3>Решение</h3><p>Как сохранить выпуск при отказе оборудования, потере питания или закрытии дороги: куда перенаправить самосвалы, сколько руды дать фабрике, какой ремонт делать первым. Двойник показывает последствия до того, как решение принято.</p></div></div>',
        lead="Выбран полный путь от забоя до отправки, чтобы локальная операция имела <span class='b'>наблюдаемые последствия</span> на соседних участках: остановка ККД меняет доставку руды и запас КДР, поломка привода мельницы требует ремонта — возврат питания её не лечит.")

    kp = [("702", "двойника в Ditto", "объекты, узлы, линии, люди и техника, связанные иерархией"), ("468", "актива в реестре", "паспорта, узлы, ТОиР, GPS-метки"), ("130", "сотрудников", "две смены, 65 постов, бригады на пикапах"),
          ("6", "самосвалов 130 т", "3 экскаватора, 2 бурстанка, 3 забоя"), ("14", "модулей", "план, качество, экономика, безопасность, ТОиР…"), ("15", "ситуаций на руднике", "включаются на Стенде, отменяются, меняют цепочку; последствия — в прогнозе на сутки"),
          ("267", "тестов", "балансы массы, меди, воды и энергии, транспорт, ремонты"), ("190 с", "чистый запуск", "make mine из клона, пустые тома, без ручных шагов")]
    cells = "".join(f'<div class="kpi"><div class="num">{a}<small>{b}</small></div><p>{c}</p></div>' for a, b, c in kp)
    add("Масштаб", "Кенташ в цифрах", f'<div class="grid g4" style="gap:24px">{cells}</div>')

    add("Что моделируется", "Технологическая цепочка и всё, что её обеспечивает", f'<div style="margin-top:20px">{chain_svg()}</div>',
        lead="Руда идёт напрямую на ККД или через перегрузочный склад, вскрыша — на отдельный отвал, хвосты — в хвостохранилище, вода возвращается в контур.")

    add("Платформа", "Всё построено на OpenEgiz: данные идут через Ditto", f'<div style="margin-top:6px">{arch_svg()}</div>',
        lead="Симулятор публикует состояние в MQTT, Ditto хранит двойники, Стенд читает их из платформы и отправляет команды обратно через двойник <code>control</code>.")
    S[-1] = S[-1].replace('<div class="foot">', '<div class="grid g3" style="position:absolute;left:84px;right:84px;top:800px;gap:26px">'
        '<div class="card"><h3>Двойник</h3><p>паспорт в <code>attributes</code>, состояние в <code>features</code>, иерархия и связи между объектами</p></div>'
        '<div class="card"><h3>Устойчивость</h3><p>контрольные точки SQLite каждые 15 с, продолжение после перезапуска без проигрывания времени</p></div>'
        '<div class="card"><h3>Нагрузка</h3><p>ограниченная очередь публикаций, приоритет движению; самый большой двойник 40 КБ при лимите 100 КБ</p></div></div><div class="foot">', 1)

    add("Пространство рудника", "Генплан: участки, сети и переходы в 3D",
        f'<div class="grid" style="grid-template-columns:930px 1fr;gap:40px">{shot("plan", 930, 798)}'
        '<div class="card" style="align-self:start"><h3>Что показывает</h3><ul><li>контуры карьера и участков из текущих 3D-моделей</li><li>рельеф, дороги, пульпопровод, ЛЭП</li><li>движение техники и бригад</li><li>двойной щелчок по участку открывает его 3D-сцену</li><li>слои и подписи включаются</li></ul></div></div>')

    add("Карьер", "Добыча: геология, взрывы, самосвалы",
        f'<div class="grid" style="grid-template-columns:960px 1fr;gap:40px">{shot("pit", 960)}'
        '<div class="card" style="align-self:start"><h3>Что внутри</h3><ul><li>уступы и врезанный съезд 9 %</li><li>3 забоя: руда F1, F2 и вскрыша F3</li><li>блочная модель GeoMet: Cu, крепость, извлечение</li><li>БВР: бурение по MWD, зарядка, вывод людей из 300 м, проветривание</li><li>самосвалы 130 т с очередями и посты погрузки</li><li>клик по самосвалу открывает панель водителя</li></ul></div></div>')

    add("Геология", "Геология: блочная модель, разрез и горизонт",
        f'<div class="grid g3" style="gap:26px">{shot("geo3d", 566, 426, "3D-карьер: содержание Cu по уступам")}{shot("geoslice", 566, 426, "Разрез X: блоки 20 × 20 × 15 м")}{shot("geoplan", 566, 426, "Горизонт Cu: план уступа 0…−15 м")}</div>'
        '<div class="grid g3" style="margin-top:22px;gap:26px">'
        '<div class="card"><h3>Блочная модель</h3><ul><li>блоки 20 × 20 × 15 м, интерполяция IDW по пробам GeoMet</li><li>Cu, крепость, извлечение; бортовое содержание 0,30 %</li></ul></div>'
        '<div class="card"><h3>Куда идёт руда</h3><ul><li>0–0,30 % — вскрыша на отвал</li><li>0,30–0,40 % — перегрузочный склад</li><li>от 0,40 % — ККД и фабрика, богатая — приоритет усреднения</li></ul></div>'
        '<div class="card"><h3>Связь с моделью</h3><ul><li>диспетчеризация тянет смесь к целевому содержанию</li><li>взрыв задаёт крупность, окисленная руда снижает извлечение на 14 п. п.</li></ul></div></div>')

    add("Взрывы", "Стоянка техники на время взрывных работ",
        f'<div class="grid" style="grid-template-columns:930px 1fr;gap:40px">{shot("park", 930, 700, "Стоянка у развязки J1: два ряда по три места, обвалование, указатель")}'
        '<div class="card" style="align-self:start"><h3>Как это работает</h3><ul>'
        '<li>перед взрывом самосвалы из зоны 300 м уходят на стоянку, а не к отвалу или ККД</li>'
        '<li>площадка не ближе 345 м к любому забою и целиком в границах 3D-карьера</li>'
        '<li>места занимаются по порядку прибытия, после проветривания машины возвращаются к работе</li>'
        '<li>если диспетчер не подтвердил снятие опасности, через 20 мин это делает горный мастер: рудник не встаёт из-за одного пропущенного клика</li></ul></div></div>')

    add("Дробление и склады", "ККД, перегрузочный склад и склад КДР",
        f'<div class="grid g3" style="gap:26px">{shot("crush", 560, 431, "Дробление: две ямы разгрузки, бункер, ККД")}{shot("rom", 560, 431, "Перегрузочный склад: резервный путь руды")}{shot("stock", 560, 431, "Склад КДР 60 000 т и подача")}</div>'
        '<div class="grid g3" style="margin-top:22px"><div class="card"><p>Самосвал разгружается задним ходом в свободное место, светофоры и гидромолот на негабарите; ККД останавливается защитами.</p></div>'
        '<div class="card"><p>Руда со склада возвращается погрузчиком, когда запас перед ККД мал: так работает сценарий «закрыт съезд».</p></div>'
        '<div class="card"><p>Живая и мёртвая части конуса, бульдозер, пылеподавление, металлодетектор; партии руды хранят Cu и крупность.</p></div></div>')

    add("Измельчение и флотация", "Помол и флотация: крупность, pH, воздух",
        f'<div class="grid g2" style="gap:30px">{shot("grind", 720, 554, "Измельчение: МПСИ, МШЦ, кластер гидроциклонов, зумпф")}{shot("flot", 720, 554, "Флотация: камеры, реагенты, воздуходувки, XRF")}</div>'
        '<div class="grid g2" style="margin-top:22px"><div class="card"><p>Замкнутый цикл с циркулирующей нагрузкой, P80 по плотности и давлению, износ футеровки и шаров, перефутеровка нарядом ТОиР.</p></div>'
        '<div class="card"><p>Основная (6 камер), контрольная (4) и три стадии перечистки, доизмельчение, две воздуходувки (одна в резерве), реагенты и онлайн-анализатор XRF.</p></div></div>')

    add("Концентрат", "Концентрат: погрузка только по анализу",
        f'<div class="grid" style="grid-template-columns:940px 1fr;gap:40px">{shot("thk", 940, None, "Сгуститель ⌀15 м, два фильтр-пресса, склад и погрузка состава")}'
        '<div class="card" style="align-self:start"><h3>Цикл и отправка</h3><ul><li>пресс: фильтрация, отжим, продувка, разгрузка</li><li>склад 3 500 т, партии с Cu и влажностью</li><li>состав 20 вагонов × 60 т, весы, пробоотбор</li><li>погрузка блокируется по Cu ≥ 24 % и влажности ≤ 10 %</li><li>паспорт отправления, выручка при отправлении</li></ul></div></div>')

    add("Хвосты и вода", "Хвосты возвращают воду и ограничивают питание",
        f'<div class="grid g2" style="gap:30px">{shot("tls", 720, 554, "Сгуститель ⌀50 м, насосная, пульпопровод DN700")}{shot("tsf", 720, 554, "Хвостохранилище: карты намыва, пруд, дамба, барж-насосы")}</div>'
        '<div class="grid g2" style="margin-top:22px"><div class="card"><p>Бак станции 400 м³, два насоса с частотным приводом, манометры по трассе, промывка при скорости ниже критической, аварийный пруд; отказ насосов останавливает питание.</p></div>'
        '<div class="card"><p>25 млн м³, четыре карты намыва, пьезометры и коэффициент устойчивости дамбы, оборотная вода 18 тыс. м³ и скважины.</p></div></div>')

    add("Обеспечение", "Вода, энергия и топливо ограничивают производство",
        f'<div class="grid g3" style="gap:26px">{shot("dw", 560, 431, "Водоотлив: зумпф, 3 насоса, автоматика")}{shot("gpp", 560, 431, "ГПП 110/6 кВ: две линии, N-1")}{shot("fs", 560, 431, "АЗС: очередь, колонки, бензовоз")}</div>'
        '<div class="grid g3" style="margin-top:22px"><div class="card"><p>Ведущий/резервный насос, чередование, защиты; ливень поднимает уровень в зумпфе и ограничивает забой.</p></div>'
        '<div class="card"><p>Два трансформатора, секции, батареи конденсаторов; потеря ввода снимает электрических потребителей.</p></div>'
        '<div class="card"><p>Два резервуара по 30 м³, бензовоз прибывает, подключается, разгружается и уезжает; без топлива самосвалы встают.</p></div></div>')

    add("Ремонты и люди", "Самосвал заезжает в ангар, бригада едет на пикапе",
        f'<div class="grid" style="grid-template-columns:940px 1fr;gap:40px">{shot("ws", 940, None, "Мастерская: посты, кран 20 т, склад запчастей")}'
        '<div class="card" style="align-self:start"><h3>ТОиР и персонал</h3><ul><li>наряд → допуск → бригада → материалы → работа → приёмка</li><li>самосвал занимает пост и отмечается «в ремонте»</li><li>бригады ездят на пикапах и паркуются на участке</li><li>две смены 08:00/20:00, 130 человек, GPS-метки</li><li>диагностика, запчасти, поставки, график ППР</li></ul></div></div>')

    add("Устройство самосвала", "Устройство самосвала 130 т: 19 узлов",
        f'<div class="grid" style="grid-template-columns:930px 1fr;gap:34px">{shot("truck1", 930, 698, "Общий вид: рама, кабина под козырьком кузова, мотор-колёса")}'
        f'<div>{shot("truck2", 790, 471, "Разнесённый вид, выбранный узел «Дизель», остальное полупрозрачно; справа данные машины из Ditto")}'
        '<div class="card" style="margin-top:18px"><ul><li>рама, капот, радиатор, дизель, генератор, шкаф АКБ</li><li>кабина, площадки, выхлоп, баки, гидравлика</li><li>подвески, 6 колёс, кузов с гидроцилиндрами</li></ul></div></div></div>')

    add("Устройство самосвала", "Подъём кузова, кабина и колёса",
        f'<div class="grid g3" style="gap:26px">{shot("truck3", 566, 425, "Кузов поднят на 50°, гидроцилиндры следуют за ним")}{shot("truck4", 566, 425, "Кабина под козырьком: стойки, стёкла, интерьер")}{shot("truck5", 566, 425, "Колесо: протектор, обод, шпильки, суппорт")}</div>'
        '<div class="grid g3" style="margin-top:22px;gap:26px">'
        '<div class="card"><h3>Подъём кузова</h3><p>Угол до 50°: кузов и козырёк проходят над кабиной и моторным отсеком без пересечений, цилиндры телескопические.</p></div>'
        '<div class="card"><h3>Кабина</h3><p>Каркас с проёмами и стёклами, кресло, руль, панель, зеркала, маяк. Узлы можно разнести и посмотреть изнутри.</p></div>'
        '<div class="card"><h3>Колёса и подвеска</h3><p>Шина 40.00R57 с грозозацепами, обод на 12 шпильках, у задних — мотор-колесо, у передних — тормозной диск.</p></div></div>')

    add("Модули", "Модули управления: план, экономика, безопасность",
        f'<div class="grid g3" style="gap:26px">{shot("production", 520, 319, "Производственный план на 12 часов: план/факт, ограничения")}{shot("economy", 520, 319, "Экономика: выручка при отправлении, затраты по фактам")}{shot("safety", 520, 319, "Безопасность и экология: допуски, инциденты, воздух")}</div>'
        '<div class="grid g3" style="gap:26px;margin-top:24px">'
        '<div class="card"><p>Задание на 12 часов влияет на питание фабрики и диспетчеризацию; есть новый план и история периодов.</p></div>'
        '<div class="card"><p>Выручка признаётся при отправлении состава, затраты считаются по фактическим количествам топлива, энергии и материалов.</p></div>'
        '<div class="card"><p>Взрыв, газы, борт и вода блокируют работу и ремонт; подтверждение не снимает действующую опасность.</p></div></div>',
        lead="Остальные модули: транспорт и диспетчеризация, геология, БВР, энергетика, переработка, водоотлив, ГСМ, качество концентрата, персонал и смены, оборудование и паспорта, ТОиР, «Технологический процесс».")

    add("ТОиР", "ТОиР: от отказа до возврата в работу",
        f'<div class="grid" style="grid-template-columns:1060px 1fr;gap:40px">{shot("maint", 1060, 651, "Сводка ТОиР: наряды, затраты, отказы по классам, активы под вниманием")}'
        '<div class="card" style="align-self:start"><h3>Что умеет</h3><ul><li>468 активов с паспортами и узлами</li><li>наряды ТО, ТР, КР, аварийные и по состоянию</li><li>очередь по критичности и допуск по условиям безопасности</li><li>ограниченные бригады, материалы и поставки</li><li>график ППР и приёмка после работ</li><li>история — демонстрационная, не реального предприятия</li></ul></div></div>')

    rows = [("Отказ оборудования с ремонтом", "актив недоступен → ограничение цепочки → наряд и бригада"), ("Закрыть участок дороги", "маршруты пересчитываются; при закрытии съезда ККД питается со склада"),
            ("Отказ экскаватора", "его очередь уходит на другие забои"), ("Самосвал выведен из работы", "парк и производительность снижаются"),
            ("Остановка ККД", "руда идёт на перегрузочный склад, фабрика на склад КДР"), ("Обесточивание ГПП-110 кВ", "стоят экскаваторы, бурение, водоотлив, ККД, фабрика"),
            ("Отключение фидера карьера 6 кВ", "стоят электрические экскаваторы, бурение и насосы"), ("Ливень", "мокрые дороги, приток в зумпф, пыль и борт"),
            ("Отказ двух насосов водоотлива", "резерв берёт нагрузку, уровень растёт, забой ограничивается"), ("Некачественный взрыв", "крупнее материал, хуже погрузка и дробление"),
            ("Провести взрыв сейчас", "зарядка, вывод людей, допуск, взрыв, проветривание"), ("Штиль и инверсия", "газы и пыль рассеиваются медленнее"),
            ("Деформация северного борта", "радар, уровни TARP, объезд или ожидание"), ("Зона окисленной руды", "извлечение меди падает на 14 п. п."), ("Срыв поставок топлива", "склад убывает, самосвалы встают")]
    half = (len(rows) + 1) // 2
    def tbl(rs): return "<table><tr><th>Ситуация</th><th>Что происходит</th></tr>" + "".join(f'<tr><td class="b" style="width:42%">{a}</td><td>{b}</td></tr>' for a, b in rs) + "</table>"
    add("Рабочее место", "Рабочее место диспетчера",
        f'<div class="grid" style="grid-template-columns:1000px 1fr;gap:36px">{shot("ui", 1000, 587, "Левое меню по задачам, колокольчик тревог, «На режим», индикатор прогноза в шапке")}'
        '<div style="display:flex;flex-direction:column;gap:18px">'
        '<div class="card"><h3>Колокольчик</h3><p>Тревоги и предупреждения списком; клик по строке выбирает объект на плане.</p></div>'
        '<div class="card"><h3>«На режим»</h3><p>Отменяет ситуации, снимает неисправности, подтверждает допуски и запускает цепочку. Плановые ремонты сохраняются.</p></div>'
        '<div class="card"><h3>«Управление» и «Модули»</h3><p>ТОиР, прогноз, ситуации и журнал — в одной группе, 14 модулей — в отдельном списке.</p></div></div></div>')

    add("Прогноз «что если»", "Прогноз «что если» на сутки: выбор и ход расчёта",
        f'<div class="grid" style="grid-template-columns:790px 1fr;gap:40px">{shot("fcprog", 790, 752, "Ситуации по объектам, горизонт 6 / 12 / 24 ч, прогресс-бар и оставшееся время")}'
        '<div style="display:flex;flex-direction:column;gap:20px">'
        '<div class="card"><h3>Как считается</h3><ul><li>копия текущего состояния рудника; живая модель не меняется</li><li>шаг 10 с, до 8 вариантов параллельно в отдельных процессах</li><li>отказы случайны: штатные сутки и ситуации считаются на трёх исходах, меры — на двух</li></ul></div>'
        '<div class="card"><h3>Что видит пользователь</h3><ul><li>прогресс-бар и «осталось ≈ 4 мин 18 с», в том числе в шапке на любой вкладке</li><li>по окончании — уведомление, звук и запись в журнале</li><li>расчёт можно отменить</li></ul></div></div></div>')

    add("Прогноз «что если»", "Итог прогноза: потери, узкое место и мера",
        f'<div class="grid" style="grid-template-columns:720px 560px;gap:60px;justify-content:center">{shot("fcres1", 720, 560, "Концентрат за 12 ч с диапазоном, потеря против плана, рекомендация, узкое место")}{shot("fcres2", 560, 558, "Проверенные меры и график выпуска по часам")}</div>'
        '<div class="grid g3" style="margin-top:20px;gap:26px">'
        '<div class="card" style="padding:20px 26px"><p style="font-size:22px;line-height:1.35">Сравнение: «без ситуаций», «с ситуациями» и «ситуации + мера» по концентрату, меди, питанию, руде и стоимости меди за вычетом затрат.</p></div>'
        '<div class="card" style="padding:20px 26px"><p style="font-size:22px;line-height:1.35">Меры: снизить питание, накопить склад КДР заранее, питание на максимум, руда вместо вскрыши, бригады на аварийные работы.</p></div>'
        '<div class="card" style="padding:20px 26px"><p style="font-size:22px;line-height:1.35">Рекомендация только если выигрыш выше шума и повторяется на обоих исходах; иначе модель честно пишет, что мера не доказана.</p></div></div>')

    add("Ситуации на руднике", "15 ситуаций на руднике без изменения кода",
        f'<div class="grid g2" style="gap:30px">{tbl(rows[:half])}{tbl(rows[half:])}</div>',
        lead="«Ситуации на руднике» → строка → «Включить»: рудник меняется сейчас. Отмена убирает причину, но не лечит повреждения и не убирает накопленную воду. Последствия заранее — в «Прогнозе».")

    n += 1
    S.append(scenarios_slide(n))

    add("Достоверность", "Балансы сходятся, а найденные дефекты исправлены",
        '<div class="grid g2" style="gap:28px"><div class="card"><h3>Что проверяется</h3><ul>'
        '<li><span class="b">масса</span> и <span class="b">медь</span> по всей цепочке: карьер → ККД → склад → фабрика → концентрат и хвосты</li>'
        '<li>вода и электроэнергия; запасы в аппаратах учитываются</li><li>транспорт: без столкновений, скорости на съезде реалистичны (груженый вверх ≈ 18 км/ч)</li>'
        '<li>ремонты, допуски, смены, сценарии, контрольные точки сохранения</li></ul></div>'
        '<div class="card"><h3>Найдено и исправлено при проверке</h3><ul>'
        '<li>сценарий «Провести взрыв сейчас» мог зависнуть: бригада упиралась в самосвал</li>'
        '<li>модель замедлялась со временем (рост списка партий руды): 4,5 → 44 шага/с</li>'
        '<li>двойник мог превысить предел Ditto 100 КБ и помешать старту</li>'
        '<li>на пустом томе проверка здоровья роняла запуск</li>'
        '<li>после взрыва без подтверждения диспетчера ремонт дороги не начинался, топливо кончалось, фабрика вставала</li>'
        '<li>прогноз с шагом 10 с терял добычу, если время снимка не кратно шагу</li></ul></div></div>'
        '<div class="grid g4" style="margin-top:26px;gap:22px"><div class="kpi"><div class="num" style="font-size:70px">267<small>тестов</small></div></div><div class="kpi"><div class="num" style="font-size:70px">44<small>шага/с, не падает</small></div></div>'
        '<div class="kpi"><div class="num" style="font-size:70px">40 КБ<small>макс. двойник (лимит 100)</small></div></div><div class="kpi"><div class="num" style="font-size:70px">190 с<small>чистый старт</small></div></div></div>')

    add("Данные", "Открытые наборы и честные границы модели",
        '<div class="grid g2" style="gap:30px"><div><table><tr><th>Набор</th><th>Использование</th><th>Лицензия</th></tr>'
        '<tr><td class="b">GeoMet</td><td>Cu, измельчаемость, извлечение (блочная модель)</td><td>CC BY 4.0</td></tr>'
        '<tr><td class="b">El Aljibe</td><td>крупность после взрыва</td><td>CC BY 4.0</td></tr>'
        '<tr><td class="b">MWD</td><td>скорость бурения</td><td>CC BY 4.0</td></tr>'
        '<tr><td class="b">Энергопотребление ГОК</td><td>форма суточной нагрузки</td><td>CC BY-SA 4.0</td></tr>'
        '<tr><td class="b">OpenMines</td><td>правдоподобие транспортных параметров</td><td>MIT</td></tr></table></div>'
        '<div class="card"><h3>Что не заявляется</h3><ul><li>объект вымышленный, не копия месторождения</li><li>приведённые модели аппаратов, без инженерного расчёта конструкции</li><li>нет расчёта коротких замыканий и геотехники дамбы</li><li>анализы концентрата расчётные</li><li>модель не подключена к реальной телеметрии</li></ul></div></div>')

    add("Как увидеть", "Три команды и маршрут демонстрации",
        '<div class="grid g2" style="gap:30px"><div><div class="code">sudo apt-get install -y make curl git<br>git clone …/team-061 &amp;&amp; cd team-061<br>make mine</div>'
        '<p class="lead" style="font-size:26px">Стенд: <span class="b">http://localhost:8200</span><br>Grafana: http://localhost:3000<br>Подробности и проверки: README.md и SUBMISSION.md в репозитории.</p></div>'
        '<div class="card"><h3>Маршрут за 5 минут</h3><ul><li><span class="b">Генплан</span> → <span class="b">Карьер</span>: клик по самосвалу</li><li><span class="b">Производственный план</span>: план и факт</li><li><span class="b">Ситуации на руднике</span> → Обесточивание ГПП-110 кВ → «Включить», ×20; затем «На режим»</li><li><span class="b">Прогноз «что если»</span> → ситуации → «Запустить прогноз»</li><li>в «Ремонтная мастерская» → кнопка «Устройство самосвала»</li><li><span class="b">ТОиР</span> и <span class="b">Качество концентрата</span></li></ul></div></div>')

    return "\n".join(S)


def main():
    page = f'<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Кенташ — цифровой рудник на OpenEgiz</title><style>{CSS}</style></head><body>{deck()}<script>const q=new URLSearchParams(location.search).get("s");if(q){{document.querySelectorAll(".slide").forEach((e,i)=>{{if(i+1!=+q)e.style.display="none"}});}}</script></body></html>'
    open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(page)
    print("index.html:", len(page), "байт; слайдов:", page.count('<section class="slide"'))


if __name__ == "__main__":
    main()
