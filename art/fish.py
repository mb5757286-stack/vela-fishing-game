# Генератор иллюстраций рыб: каждая рыба — SVG с градиентами, плавниками, узором.
# Рыба смотрит вправо. Холст 200x100.
import math, random

CY = 50


def hx(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def mix(c1, c2, t):
    a, b = hx(c1), hx(c2)
    return '#%02x%02x%02x' % tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def dark(c, k):
    return mix(c, '#000000', k)


def light(c, k):
    return mix(c, '#ffffff', k)


def spline(pts, k=1 / 6):
    d = ''
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < n else pts[i + 1]
        c1 = (p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k)
        c2 = (p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k)
        d += 'C%.2f,%.2f %.2f,%.2f %.2f,%.2f ' % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    return d


def bump(f, p, ah, at, tw):
    if f <= p:
        return math.sin(math.pi / 2 * f / p) ** ah
    v = math.cos(math.pi / 2 * (f - p) / (1 - p)) ** at
    return max(tw, v)


FS = [0, .012, .035, .07, .12, .19, .27, .36, .46, .56, .66, .76, .86, .94, 1.0]


class Fish:
    def __init__(self, sp):
        self.sp = sp
        g = sp.get
        self.xn = g('xn', 188)
        self.L = sp['L']
        self.Ht, self.Hb = sp['Ht'], sp['Hb']
        self.pt, self.pb = g('pt', .4), g('pb', .45)
        self.ah, self.at, self.tw = g('ah', .8), g('at', 1.1), g('tw', .16)
        self.ns = g('ns', 0)

    def X(self, f):
        return self.xn - f * self.L

    def _h(self, f, p):
        v = bump(f, p, self.ah, self.at, self.tw)
        if self.ns and f < self.ns:
            v *= (f / self.ns) ** 0.6
        return v

    def TY(self, f):
        return CY - self.Ht * self._h(f, self.pt)

    def BY(self, f):
        return CY + self.Hb * self._h(f, self.pb)

    # ---------- детали ----------
    def body_path(self):
        top = [(self.X(f), self.TY(f)) for f in FS]
        bot = [(self.X(f), self.BY(f)) for f in reversed(FS)]
        return 'M%.2f,%.2f ' % top[0] + spline(top) + 'L%.2f,%.2f ' % bot[0] + spline(bot) + 'Z'

    def fin(self, side, f0, f1, h, sw=.4, fill=None, ray=True, op=.95, sink=2.0, skew=0):
        """плавник на спине/брюхе от f0 (спереди) до f1 (сзади)"""
        s = -1 if side == 'top' else 1
        yb = (lambda f: self.TY(f)) if side == 'top' else (lambda f: self.BY(f))
        x0, x1 = self.X(f0), self.X(f1)
        y0, y1 = yb(f0) - s * sink, yb(f1) - s * sink
        xt = x0 + (x1 - x0) * sw
        yt = min(y0, y1) + s * 0 + s * h if side == 'bot' else min(y0, y1) - h
        yt += skew
        # передний край — выпуклый, задний — вогнутый
        mid = ((xt + x1) / 2, (yt + y1) / 2)
        ctrl = (mid[0] + (x0 - mid[0]) * .2, mid[1] + (y0 - mid[1]) * .2)
        d = 'M%.2f,%.2f C%.2f,%.2f %.2f,%.2f %.2f,%.2f Q%.2f,%.2f %.2f,%.2f Z' % (
            x0, y0, x0 - (x0 - xt) * .05, y0 + (yt - y0) * .7, xt + (x0 - xt) * .35, yt, xt, yt,
            ctrl[0], ctrl[1], x1, y1)
        out = '<path d="%s" fill="%s" fill-opacity="%.2f" stroke="%s" stroke-width="1" stroke-linejoin="round"/>' % (
            d, fill, op, dark(fill, .35))
        if ray:
            for i in range(1, 6):
                t = i / 6
                bx, by = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                ex = xt + (x1 - xt) * t * .9 + (x0 - xt) * (1 - t) * .15
                ey = yt + (y1 - yt) * t * .8
                out += '<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="%s" stroke-opacity=".35" stroke-width=".6"/>' % (
                    bx, by, ex, ey, dark(fill, .5))
        return out

    def tail(self, kind, tl, th, fill, notch=.55, hetero=0):
        xt = self.X(1.0) + 1
        tw = self.Ht * self.tw
        tb = self.Hb * self.tw
        top_tip = (xt - tl * (1 + hetero * .35), CY - th * (1 + hetero * .45))
        bot_tip = (xt - tl * (1 - hetero * .1), CY + th * (1 - hetero * .35))
        if kind == 'round':
            ext = xt - tl * 1.1
            d = ('M%.2f,%.2f C%.2f,%.2f %.2f,%.2f %.2f,%.2f C%.2f,%.2f %.2f,%.2f %.2f,%.2f '
                 'C%.2f,%.2f %.2f,%.2f %.2f,%.2f Z') % (
                xt, CY - tw, xt - tl * .4, CY - th * .6, ext + tl * .2, CY - th * .95, ext, CY - th * .45,
                ext - tl * .06, CY - th * .1, ext - tl * .06, CY + th * .1, ext, CY + th * .45,
                ext + tl * .2, CY + th * .95, xt - tl * .4, CY + th * .6, xt, CY + tb)
        else:
            nx = xt - tl * notch
            cyn = CY
            if kind == 'lunate':
                top_tip = (xt - tl * .85, CY - th)
                bot_tip = (xt - tl * .85, CY + th)
                nx = xt - tl * .35
            if kind == 'square':
                nx = xt - tl * .85
            ct1 = ((top_tip[0] + nx) / 2 + tl * .1, (top_tip[1] + cyn) / 2 + th * .05)
            ct2 = ((bot_tip[0] + nx) / 2 + tl * .1, (bot_tip[1] + cyn) / 2 - th * .05)
            d = ('M%.2f,%.2f C%.2f,%.2f %.2f,%.2f %.2f,%.2f Q%.2f,%.2f %.2f,%.2f Q%.2f,%.2f %.2f,%.2f '
                 'C%.2f,%.2f %.2f,%.2f %.2f,%.2f Z') % (
                xt, CY - tw, xt - tl * .35, CY - tw - th * .1, top_tip[0] + tl * .25, top_tip[1] + th * .05,
                top_tip[0], top_tip[1],
                ct1[0], ct1[1], nx, cyn,
                ct2[0], ct2[1], bot_tip[0], bot_tip[1],
                bot_tip[0] + tl * .25, bot_tip[1] - th * .05, xt - tl * .35, CY + tb + th * .1, xt, CY + tb)
        out = '<path d="%s" fill="%s" stroke="%s" stroke-width="1" stroke-linejoin="round"/>' % (d, fill, dark(fill, .4))
        for i in range(-4, 5):
            ex = xt - tl * (.95 if kind == 'round' else (.8 - abs(i) * .04))
            ey = CY + i * th * (.2 if kind == 'round' else .2)
            out += '<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f" stroke="%s" stroke-opacity=".3" stroke-width=".6"/>' % (
                xt - 1, CY + i * tw * .25, ex, ey, dark(fill, .55))
        return out

    def leaf(self, f, dy, ln, wd, fill, ang=18, op=.95):
        """грудной/брюшной плавник — лист, смотрит назад-вниз"""
        x, y = self.X(f), CY + dy
        a = math.radians(ang)
        ex, ey = x - ln * math.cos(a), y + ln * math.sin(a)
        nx, ny = math.sin(a), math.cos(a)
        d = 'M%.2f,%.2f C%.2f,%.2f %.2f,%.2f %.2f,%.2f C%.2f,%.2f %.2f,%.2f %.2f,%.2f Z' % (
            x, y,
            x - ln * .3 * math.cos(a) - nx * wd, y + ln * .3 * math.sin(a) - ny * wd * 0,
            ex + ln * .25 * math.cos(a) - nx * wd * .5, ey - ln * .25 * math.sin(a) - ny * wd * .2,
            ex, ey,
            ex + ln * .25 * math.cos(a) + nx * wd * .9, ey - ln * .25 * math.sin(a) + ny * wd * .9,
            x - ln * .3 * math.cos(a) + nx * wd * .7, y + ln * .3 * math.sin(a) + ny * wd * .7,
            x, y)
        return '<path d="%s" fill="%s" fill-opacity="%.2f" stroke="%s" stroke-width=".9" stroke-linejoin="round"/>' % (
            d, fill, op, dark(fill, .35))


def svg_fish(sp):
    F = Fish(sp)
    g = sp.get
    back, mid, belly = sp['back'], sp['mid'], sp['belly']
    fin = sp.get('fin', dark(mid, .25))
    body = F.body_path()
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">']
    out.append('<defs>'
               '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
               '<stop offset="0" stop-color="%s"/><stop offset=".42" stop-color="%s"/>'
               '<stop offset=".62" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>'
               '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">'
               '<stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".55" stop-color="#000" stop-opacity="0"/>'
               '<stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>'
               '<linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">'
               '<stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
               '<pattern id="sc" width="%.1f" height="%.1f" patternUnits="userSpaceOnUse">'
               '<path d="M0,%.1f Q%.1f,0 %.1f,%.1f" fill="none" stroke="#fff" stroke-opacity="%.2f" stroke-width=".7"/>'
               '<path d="M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f" fill="none" stroke="#000" stroke-opacity="%.2f" stroke-width=".5"/></pattern>'
               '<clipPath id="cp"><path d="%s"/></clipPath></defs>' % (
                   back, mid, light(mid, .15) if g('silver') else mid, belly,
                   g('sc', 6), g('sc', 6) * .85, g('sc', 6) * .85, g('sc', 6) / 2, g('sc', 6), g('sc', 6) * .85,
                   g('sc_op', .22),
                   -g('sc', 6) / 2, g('sc', 6) * .85, 0, 0, g('sc', 6) / 2, g('sc', 6) * .85, g('sc_op', .22) * .5,
                   body))
    # --- плавники за телом ---
    for f in sp.get('back_fins', []):
        out.append(f(F, fin))
    out.append(F.tail(sp.get('tail', 'fork'), sp.get('tl', 30), sp.get('th', 26), sp.get('tailc', fin),
                      sp.get('notch', .55), sp.get('hetero', 0)))
    for fn in sp.get('rear', []):
        out.append(fn(F, fin))
    # --- тело ---
    out.append('<path d="%s" fill="url(#bg)"/>' % body)
    out.append('<g clip-path="url(#cp)">')
    out.append('<rect x="0" y="0" width="200" height="100" fill="url(#pat)" opacity="0"/>')
    out.append('<rect x="0" y="0" width="200" height="100" fill="url(#sc)"/>')
    for fn in sp.get('pattern', []):
        out.append(fn(F))
    out.append('<rect x="0" y="0" width="200" height="100" fill="url(#shade)"/>')
    out.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="url(#shine)" opacity="%.2f"/>' % (
        F.X(.5), CY - F.Ht * .55, F.L * .36, F.Ht * .22, g('shine', .55)))
    out.append('</g>')
    # --- жаберная крышка ---
    gx, gt, gb = F.X(g('gill', .205)), F.TY(g('gill', .205)) + 2, F.BY(g('gill', .205)) - 3
    out.append('<path d="M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f" fill="none" stroke="%s" stroke-width="1.2" stroke-opacity=".7" stroke-linecap="round"/>' % (
        gx + 1, gt + 1, gx - F.L * .075, CY + g('gill_dy', 2), gx + 2, gb, dark(back, .35)))
    out.append('<path d="M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f" fill="none" stroke="#fff" stroke-width="1" stroke-opacity=".28" stroke-linecap="round"/>' % (
        gx - 2.2, gt + 3, gx - F.L * .09, CY + g('gill_dy', 2), gx - 1, gb - 1))
    for fn in sp.get('front', []):
        out.append(fn(F, fin))
    # --- грудной и брюшной плавники ---
    pf = g('pec', (.215, 9, 22, 7, fin))
    out.append(F.leaf(pf[0], pf[1], pf[2], pf[3], pf[4], g('pec_ang', 16)))
    # --- контур ---
    out.append('<path d="%s" fill="none" stroke="%s" stroke-width="1.3" stroke-linejoin="round"/>' % (body, dark(back, .5)))
    # --- рот ---
    mx, my = F.X(0) , CY + g('mouth_dy', 2)
    ml = g('mouth', 9)
    out.append('<path d="M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f" fill="none" stroke="%s" stroke-width="1.2" stroke-linecap="round"/>' % (
        mx - .5, my, mx - ml * .55, my + g('smile', 1.6), mx - ml, my - g('smile', 1.6) * .3, dark(back, .6)))
    # --- глаз ---
    er = g('eye', 4.6)
    ex = F.X(g('eye_f', .1))
    ey = CY + g('eye_dy', -F.Ht * .22)
    ring = g('eye_ring', '#e8e6df')
    out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" stroke="%s" stroke-width=".8"/>' % (ex, ey, er + 1.3, ring, dark(back, .5)))
    out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (ex, ey, er, g('iris', '#d9a21b')))
    out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#0b0b0b"/>' % (ex + .3, ey, er * .62))
    out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#fff"/>' % (ex - er * .28, ey - er * .3, er * .26))
    for fn in sp.get('over', []):
        out.append(fn(F, fin))
    out.append('</svg>')
    return '\n'.join(out)


# ---------- функции-узоры ----------
def bars(n, c, op=.55, f0=.25, f1=.82, wid=3.2, skew=3):
    def fn(F):
        s = ''
        for i in range(n):
            f = f0 + (f1 - f0) * i / max(1, n - 1)
            x = F.X(f)
            s += '<path d="M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f" stroke="%s" stroke-opacity="%.2f" stroke-width="%.1f" fill="none" stroke-linecap="round"/>' % (
                x + skew, F.TY(f) - 2, x, CY, x - skew * .5, F.BY(f) - F.Hb * .22, c, op, wid)
        return s
    return fn


def spots(seed, n, colors, r=(1.0, 2.0), f0=.15, f1=.95, y0=-.8, y1=.35, halo=None, op=.9):
    def fn(F):
        rnd = random.Random(seed)
        s = ''
        for _ in range(n):
            f = rnd.uniform(f0, f1)
            t = rnd.uniform(y0, y1)
            x = F.X(f)
            y = CY + t * (F.Ht if t < 0 else F.Hb) * (F._h(f, F.pt if t < 0 else F.pb))
            rr = rnd.uniform(*r)
            c = rnd.choice(colors)
            if halo:
                s += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" fill-opacity=".8"/>' % (x, y, rr + 1.1, halo)
            s += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" fill-opacity="%.2f"/>' % (x, y, rr, c, op)
        return s
    return fn


def xspots(seed, n, c, f0=.15, f1=.9, y0=-.85, y1=.15, size=1.6):
    def fn(F):
        rnd = random.Random(seed)
        s = ''
        for _ in range(n):
            f = rnd.uniform(f0, f1)
            t = rnd.uniform(y0, y1)
            x = F.X(f)
            y = CY + t * (F.Ht if t < 0 else F.Hb) * (F._h(f, F.pt if t < 0 else F.pb))
            s += '<path d="M%.1f,%.1f l%.1f,%.1f M%.1f,%.1f l%.1f,%.1f" stroke="%s" stroke-width="1.1" stroke-linecap="round"/>' % (
                x - size, y - size, size * 2, size * 2, x - size, y + size, size * 2, -size * 2, c)
        return s
    return fn


def stripe(c, y=0.0, wid=2.2, op=.5, f0=.2, f1=.97):
    def fn(F):
        pts = [(F.X(f), CY + y * F.Ht) for f in [f0 + (f1 - f0) * i / 6 for i in range(7)]]
        d = 'M%.1f,%.1f ' % pts[0] + spline(pts)
        return '<path d="%s" stroke="%s" stroke-opacity="%.2f" stroke-width="%.1f" fill="none" stroke-linecap="round"/>' % (d, c, op, wid)
    return fn


def lines(n, c, y0=-.5, y1=.35, op=.45, wid=1.1, f0=.22, f1=.96):
    def fn(F):
        s = ''
        for i in range(n):
            y = y0 + (y1 - y0) * i / max(1, n - 1)
            pts = [(F.X(f), CY + y * (F.Ht if y < 0 else F.Hb) * F._h(f, F.pt) * 1.0) for f in [f0 + (f1 - f0) * k / 6 for k in range(7)]]
            s += '<path d="M%.1f,%.1f %s" stroke="%s" stroke-opacity="%.2f" stroke-width="%.1f" fill="none"/>' % (pts[0][0], pts[0][1], spline(pts), c, op, wid)
        return s
    return fn


def backband(c, op=.6, depth=.45):
    """тёмная спинка сверху"""
    def fn(F):
        pts = [(F.X(f), F.TY(f) + F.Ht * F._h(f, F.pt) * depth) for f in FS[2:]]
        d = 'M%.1f,%.1f ' % (F.X(.03), F.TY(.03)) + 'L%.1f,%.1f ' % pts[0] + spline(pts) + 'L%.1f,%.1f ' % (F.X(1), F.TY(1)) + 'L%.1f,%.1f L%.1f,%.1f Z' % (F.X(1), 0, F.X(.03), 0)
        return '<path d="%s" fill="%s" fill-opacity="%.2f"/>' % (d, c, op)
    return fn


def blotch(seed, n, c, f0=.2, f1=.95, op=.35, rr=(2, 5)):
    def fn(F):
        rnd = random.Random(seed)
        s = ''
        for _ in range(n):
            f = rnd.uniform(f0, f1)
            t = rnd.uniform(-.8, .6)
            x = F.X(f)
            y = CY + t * (F.Ht if t < 0 else F.Hb) * F._h(f, F.pt)
            s += '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" fill-opacity="%.2f" transform="rotate(%d %.1f %.1f)"/>' % (
                x, y, rnd.uniform(*rr) * 1.3, rnd.uniform(*rr), c, op, rnd.randint(-30, 30), x, y)
        return s
    return fn


def scutes(c, f0=.2, f1=.97, rows=((-.6, 5),), size=2.6, op=.9):
    def fn(F):
        s = ''
        for (yy, n) in rows:
            for i in range(n):
                f = f0 + (f1 - f0) * i / max(1, n - 1)
                x = F.X(f)
                y = CY + yy * (F.Ht if yy < 0 else F.Hb) * F._h(f, F.pt)
                s += '<path d="M%.1f,%.1f l%.1f,%.1f l%.1f,%.1f z" fill="%s" fill-opacity="%.2f" stroke="%s" stroke-width=".5"/>' % (
                    x + size, y + size, -size, -size * 1.5, -size, size * 1.5, c, op, dark(c, .5))
        return s
    return fn


def barbels(items, c):
    def fn(F, fin):
        s = ''
        for (dy, ln, ang, wav) in items:
            x, y = F.X(.03), CY + dy
            a = math.radians(ang)
            ex, ey = x + ln * math.cos(a) * 0.55, y + ln * math.sin(a)
            s += '<path d="M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f" stroke="%s" stroke-width="1.6" fill="none" stroke-linecap="round"/>' % (
                x, y, x + ln * .3, y + wav, ex, ey, c)
        return s
    return fn
