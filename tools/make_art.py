#!/usr/bin/env python3
"""Рисует спрайты рыб, фоны локаций и ящик из старого сапога для игры «Рыбалка».

Запуск (из корня репозитория):  python3 tools/make_art.py
Результат: src/common/img/fish_<id>.png, bg_<loc>.png
Если хочешь свои картинки — просто замени PNG с теми же именами.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'common', 'img')

W, H = 160, 80      # размер спрайта рыбы
S = 4               # суперсэмплинг для гладких краёв


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def half_height(u, peak, hh, flat):
    s = u / peak if u < peak else (1 - u) / (1 - peak)
    s = max(0.0, min(1.0, s))
    h = hh * (s ** (0.35 if flat else 0.5))
    return max(h, hh * 0.26)


def draw_fish(p):
    w, h = W * S, H * S
    cx, cy = w / 2, h / 2
    L = w * p.get('length', 0.86)
    tail_len = L * 0.15
    bx0 = cx - L / 2 + tail_len
    bx1 = cx + L / 2
    hh = h * p['height'] / 2
    peak = p.get('peak', 0.4)
    flat = p.get('flat', False)

    def X(u):
        return bx0 + (bx1 - bx0) * u

    def Hh(u):
        return half_height(u, peak, hh, flat)

    N = 160
    top = [(X(i / N), cy - Hh(i / N)) for i in range(N + 1)]
    bot = [(X(i / N), cy + Hh(i / N)) for i in range(N + 1)]
    body = top + bot[::-1]
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).polygon(body, fill=255)

    # плавники рисуем под телом
    fins = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fins)
    fin = p['fin'] + (255,)
    ts = hh * p.get('tail_spread', 1.25)
    tail = p.get('tail', 'fork')
    if tail == 'fork':
        fd.polygon([(bx0 + 4, cy - hh * .3), (bx0 - tail_len, cy - ts), (bx0 + tail_len * .2, cy),
                    (bx0 - tail_len, cy + ts), (bx0 + 4, cy + hh * .3)], fill=fin)
    elif tail == 'round':
        fd.ellipse([bx0 - tail_len, cy - ts * .8, bx0 + 4, cy + ts * .8], fill=fin)
    else:
        fd.polygon([(bx0 + 4, cy - hh * .17), (bx0 - tail_len, cy - ts),
                    (bx0 - tail_len, cy + ts), (bx0 + 4, cy + hh * .17)], fill=fin)

    du, dw, dh = p.get('dorsal', (0.42, 0.22, 0.6))
    dh *= 0.7
    a, b = du - dw / 2, du + dw / 2
    fd.polygon([(X(a), cy - Hh(a)), (X(du), cy - hh * (1 + dh)), (X(b), cy - Hh(b))], fill=fin)

    au, aw, ah = p.get('anal', (0.56, 0.2, 0.45))
    ah *= 0.7
    a, b = au - aw / 2, au + aw / 2
    fd.polygon([(X(a), cy + Hh(a)), (X(au), cy + hh * (1 + ah)), (X(b), cy + Hh(b))], fill=fin)

    fd.ellipse([X(0.66) - hh * .35, cy + hh * .05, X(0.66) + hh * .35, cy + hh * .55], fill=fin)

    # тело: градиент от спинки к брюху
    back, belly = p['back'], p['belly']
    grad = Image.new('RGBA', (w, h), belly + (255,))
    gd = ImageDraw.Draw(grad)
    y0, y1 = cy - hh, cy + hh
    for y in range(max(0, int(y0)), min(h, int(y1) + 1)):
        t = (y - y0) / (2 * hh)
        t = t * t * (3 - 2 * t)
        gd.line([(0, y), (w, y)], fill=mix(back, belly, t) + (255,))
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    layer.paste(grad, (0, 0), mask)

    def clipped(fn):
        lay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        fn(ImageDraw.Draw(lay))
        lay.putalpha(ImageChops.multiply(lay.getchannel('A'), mask))
        return lay

    rnd = random.Random(p.get('seed', 1))

    if 'stripes' in p:
        def st(d):
            for u, sw, col in p['stripes']:
                d.polygon([(X(u - sw), cy - hh * 2), (X(u + sw), cy - hh * 2),
                           (X(u + sw), cy + hh * 2), (X(u - sw), cy + hh * 2)], fill=col + (235,))
        layer = Image.alpha_composite(layer, clipped(st))

    if 'spots' in p:
        col, n, r = p['spots']

        def sp(d):
            for _ in range(n):
                u = rnd.uniform(.12, .9)
                y = cy + rnd.uniform(-.75, .75) * Hh(u)
                rr = hh * r
                d.ellipse([X(u) - rr, y - rr, X(u) + rr, y + rr], fill=col + (220,))
        layer = Image.alpha_composite(layer, clipped(sp))

    if 'scales' in p:
        col = p['scales']

        def sc(d):
            step = hh * .26
            for row in range(-4, 5):
                for k in range(14):
                    u = k / 13 * .9 + .05
                    x = X(u) + (row % 2) * step * .5
                    y = cy + row * step
                    d.arc([x - step * .5, y - step * .5, x + step * .5, y + step * .5],
                          200, 340, fill=col + (150,), width=S * 2)
        layer = Image.alpha_composite(layer, clipped(sc))

    ld = ImageDraw.Draw(layer)
    if p.get('lateral'):
        ld.line([(X(.08), cy - hh * .1), (X(.9), cy - hh * .1)], fill=(20, 30, 30, 70), width=S)
    gx = X(.77)
    ld.arc([gx - hh * .25, cy - hh * .7, gx + hh * .25, cy + hh * .7], 95, 265, fill=(0, 0, 0, 110), width=S * 2)

    ex, ey = X(p.get('eye_u', .86)), cy - hh * p.get('eye_y', .18)
    er = hh * p.get('eye_r', .15)
    ld.ellipse([ex - er, ey - er, ex + er, ey + er], fill=(245, 245, 240, 255), outline=(20, 20, 20, 255), width=S)
    pr = er * .55
    ld.ellipse([ex - pr + S * 2, ey - pr, ex + pr + S * 2, ey + pr], fill=(15, 15, 15, 255))
    ld.ellipse([ex - pr * .2, ey - pr * .9, ex + pr * .25, ey - pr * .45], fill=(255, 255, 255, 255))

    mx = X(.995)
    ld.line([(mx - S * 4, cy + hh * .12), (mx, cy + hh * .2)], fill=(30, 20, 20, 255), width=S * 2)

    for k in range(p.get('whiskers', 0)):
        yy = cy + hh * (.15 + .18 * k)
        ld.line([(X(.99), yy), (X(.99) - hh * .9, yy + hh * .45)], fill=(40, 40, 40, 230), width=S * 2)

    out = Image.alpha_composite(fins, layer)
    return out.resize((W, H), Image.LANCZOS)


FISH = {
    'bleak': dict(length=.9, height=.22, peak=.42, back=(120, 150, 160), belly=(235, 240, 240),
                  fin=(210, 225, 225), dorsal=(.45, .2, .5), anal=(.6, .2, .5), eye_r=.17, lateral=True),
    'roach': dict(length=.88, height=.36, peak=.42, back=(90, 110, 95), belly=(230, 230, 220),
                  fin=(200, 50, 40), dorsal=(.44, .2, .55), anal=(.6, .18, .5), eye_r=.16, lateral=True),
    'crucian': dict(length=.84, height=.5, peak=.45, back=(140, 120, 50), belly=(220, 190, 90),
                    fin=(170, 130, 60), dorsal=(.44, .26, .5), anal=(.58, .22, .45), eye_r=.15, scales=(120, 90, 30)),
    'bream': dict(length=.82, height=.56, peak=.46, back=(110, 95, 70), belly=(200, 190, 150),
                  fin=(90, 80, 60), dorsal=(.44, .24, .4), anal=(.6, .4, .6), eye_r=.14, scales=(70, 60, 40), lateral=True),
    'perch': dict(length=.86, height=.4, peak=.4, back=(70, 100, 60), belly=(230, 200, 120),
                  fin=(220, 80, 40), dorsal=(.42, .36, .7), anal=(.6, .2, .4), eye_r=.17,
                  stripes=[(.3, .025, (30, 35, 25)), (.42, .025, (30, 35, 25)), (.54, .025, (30, 35, 25)),
                           (.66, .025, (30, 35, 25)), (.78, .025, (30, 35, 25))]),
    'carp': dict(length=.86, height=.52, peak=.44, back=(120, 105, 50), belly=(225, 200, 120),
                 fin=(140, 110, 60), dorsal=(.4, .42, .4), anal=(.56, .22, .35), scales=(90, 75, 30),
                 whiskers=2, eye_r=.13, lateral=True),
    'zander': dict(length=.9, height=.3, peak=.5, back=(100, 110, 60), belly=(235, 235, 200),
                   fin=(120, 130, 80), dorsal=(.42, .4, .8), anal=(.6, .2, .4), spots=((40, 35, 20), 22, .06), eye_r=.2),
    'pike': dict(length=.94, height=.24, peak=.58, back=(60, 90, 50), belly=(230, 235, 200),
                 fin=(180, 190, 120), dorsal=(.7, .2, .5), anal=(.72, .14, .35), spots=((230, 230, 180), 40, .04),
                 lateral=True, eye_r=.16),
    'catfish': dict(length=.9, height=.42, peak=.26, flat=True, back=(60, 62, 70), belly=(200, 200, 195),
                    fin=(55, 58, 66), dorsal=(.28, .12, .4), anal=(.7, .45, .3), whiskers=4,
                    eye_r=.09, eye_u=.84, eye_y=.1),
    'flounder': dict(length=.84, height=.6, peak=.5, flat=True, back=(130, 110, 80), belly=(235, 225, 200),
                     fin=(120, 95, 70), tail='square', tail_spread=.7, dorsal=(.5, .85, .12), anal=(.5, .85, .12),
                     eye_r=.12, eye_y=.5, eye_u=.7),
    'horse': dict(length=.9, height=.22, peak=.42, back=(40, 70, 110), belly=(215, 225, 235),
                  fin=(70, 100, 140), dorsal=(.4, .2, .25), anal=(.6, .14, .2), eye_r=.17, lateral=True),
    'seaperch': dict(length=.86, height=.44, peak=.42, back=(200, 70, 50), belly=(245, 190, 160),
                     fin=(190, 50, 40), dorsal=(.42, .4, .8), anal=(.6, .3, .5), eye_r=.16,
                     stripes=[(.36, .03, (240, 240, 230)), (.52, .03, (240, 240, 230)), (.68, .03, (240, 240, 230))]),
}


def draw_boot():
    w, h = W * S, H * S
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rub = (70, 110, 60, 255)
    dark = (40, 65, 35, 255)
    hi = (120, 160, 100, 255)
    d.rounded_rectangle([w * .3, h * .08, w * .62, h * .82], radius=S * 10, fill=rub, outline=dark, width=S * 3)
    d.rounded_rectangle([w * .3, h * .6, w * .9, h * .9], radius=S * 12, fill=rub, outline=dark, width=S * 3)
    d.rectangle([w * .3, h * .82, w * .9, h * .9], fill=dark)
    d.rounded_rectangle([w * .36, h * .12, w * .44, h * .4], radius=S * 4, fill=hi)
    d.rounded_rectangle([w * .28, h * .06, w * .64, h * .16], radius=S * 6, fill=dark)
    return im.resize((W, H), Image.LANCZOS)


# ---------- фоны локаций: 432x432 ----------

def background(name, sky_top, sky_bot, water_top, water_bot, extra):
    s = 432
    horizon = int(s * 0.42)
    im = Image.new('RGB', (s, s))
    d = ImageDraw.Draw(im)
    for y in range(s):
        if y < horizon:
            c = mix(sky_top, sky_bot, y / horizon)
        else:
            c = mix(water_top, water_bot, (y - horizon) / (s - horizon))
        d.line([(0, y), (s, y)], fill=c)
    extra(d, s, horizon)
    # затемняем, чтобы белый текст читался
    im = Image.blend(im, Image.new('RGB', (s, s), (4, 12, 20)), .35)
    im.save(os.path.join(OUT, 'bg_%s.png' % name), optimize=True)


def pond_extra(d, s, hz):
    d.rectangle([0, hz - 2, s, hz + 4], fill=(70, 120, 60))
    d.ellipse([40, hz + 30, s - 40, s - 20], fill=(70, 150, 150))           # вода
    d.ellipse([40, hz + 30, s - 40, s - 20], outline=(60, 120, 60), width=14)  # берег
    for x in range(10, s, 26):                                              # камыш
        d.line([(x, hz + 10), (x + 4, hz - 40 - (x % 3) * 10)], fill=(40, 90, 40), width=5)
    for (x, y, r) in [(120, 280, 26), (300, 330, 20), (210, 380, 30)]:      # кувшинки
        d.ellipse([x - r, y - r * .5, x + r, y + r * .5], fill=(40, 110, 60))


def river_extra(d, s, hz):
    for x in range(0, s, 46):                                               # деревья на горизонте
        d.polygon([(x, hz), (x + 23, hz - 60), (x + 46, hz)], fill=(30, 70, 40))
    d.polygon([(0, 300), (s, 220), (s, 300), (0, 390)], fill=(40, 100, 130))  # река
    for i in range(14):
        x = 30 + i * 28
        y = 300 - (x / s) * 80 + 40
        d.line([(x, y), (x + 14, y - 2)], fill=(150, 200, 220), width=2)
    d.polygon([(0, 390), (s, 300), (s, s), (0, s)], outline=None, fill=(60, 90, 50))


def lake_extra(d, s, hz):
    d.polygon([(0, hz), (80, hz - 70), (170, hz - 20), (260, hz - 90), (360, hz - 30), (s, hz - 60), (s, hz), (0, hz)],
              fill=(80, 110, 120))
    d.ellipse([340, 40, 390, 90], fill=(255, 230, 150))                     # солнце
    for i in range(16):                                                     # блики
        y = hz + 10 + i * 12
        d.line([(230 - i * 6, y), (330 + i * 3, y)], fill=(200, 230, 240), width=2)


def sea_extra(d, s, hz):
    d.ellipse([60, 40, 110, 90], fill=(255, 240, 200))                     # солнце
    for x0, y0 in [(180, 60), (250, 90), (320, 50)]:                       # облака
        d.ellipse([x0, y0, x0 + 60, y0 + 22], fill=(250, 250, 255))
    for i in range(7):                                                      # волны
        y = hz + 30 + i * 36
        for x in range(-20, s, 60):
            d.arc([x, y, x + 60, y + 24], 200, 340, fill=(200, 235, 245), width=3)
    d.polygon([(0, s), (0, 330), (120, 360), (260, s)], fill=(220, 200, 150))  # песок


def make_backgrounds():
    background('pond', (170, 210, 235), (210, 235, 245), (50, 120, 130), (30, 90, 110), pond_extra)
    background('river', (160, 200, 220), (200, 225, 235), (40, 100, 140), (25, 70, 100), river_extra)
    background('lake', (150, 190, 220), (215, 232, 240), (50, 110, 140), (25, 75, 105), lake_extra)
    background('sea', (120, 180, 230), (210, 235, 250), (30, 110, 170), (15, 60, 110), sea_extra)


def main():
    os.makedirs(OUT, exist_ok=True)
    for fid, p in FISH.items():
        draw_fish(p).save(os.path.join(OUT, 'fish_%s.png' % fid), optimize=True)
    draw_boot().save(os.path.join(OUT, 'fish_boot.png'), optimize=True)
    make_backgrounds()
    print('готово:', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
