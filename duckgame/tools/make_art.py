#!/usr/bin/env python3
"""Свои спрайты для «Утиной фермы» (не копии из других игр).
Запуск: python3 tools/make_art.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'common', 'img')
S = 4
W, H = 120, 100

DUCKS = {
    'plain':  dict(body=(244, 197, 66), wing=(220, 170, 40), beak=(230, 120, 40)),
    'racer':  dict(body=(79, 209, 255), wing=(40, 160, 210), beak=(255, 150, 60)),
    'golden': dict(body=(255, 209, 102), wing=(230, 170, 50), beak=(255, 120, 60)),
}


def draw_duck(c):
    w, h = W * S, H * S
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    body = c['body']
    d.ellipse([w * .18, h * .32, w * .86, h * .86], fill=body)
    d.ellipse([w * .52, h * .08, w * .88, h * .42], fill=body)
    d.polygon([(w * .84, h * .22), (w * 1.0, h * .20), (w * .84, h * .32)], fill=c['beak'])
    d.ellipse([w * .74, h * .14, w * .80, h * .20], fill=(30, 30, 30))
    d.ellipse([w * .30, h * .5, w * .62, h * .76], fill=c['wing'])
    d.ellipse([w * .30, h * .82, w * .44, h * .92], fill=(240, 150, 60))
    d.ellipse([w * .56, h * .82, w * .70, h * .92], fill=(240, 150, 60))
    return im.resize((W, H), Image.LANCZOS)


def draw_food():
    w, h = 40 * S, 40 * S
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([w * .15, h * .15, w * .85, h * .85], fill=(150, 200, 90))
    d.ellipse([w * .35, h * .35, w * .5, h * .5], fill=(110, 160, 60))
    return im.resize((40, 40), Image.LANCZOS)


def draw_food_gold():
    w, h = 40 * S, 40 * S
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([w * .12, h * .12, w * .88, h * .88], fill=(255, 210, 60))
    d.ellipse([w * .3, h * .3, w * .5, h * .5], fill=(255, 240, 150))
    return im.resize((40, 40), Image.LANCZOS)


def background(name, top, bot, ground):
    s = 432
    im = Image.new('RGB', (s, s))
    d = ImageDraw.Draw(im)
    horizon = int(s * 0.45)
    for y in range(s):
        t = y / s
        c = tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3))
        d.line([(0, y), (s, y)], fill=c)
    d.rectangle([0, horizon, s, s], fill=ground)
    for i in range(6):
        x = i * 80 + 20
        d.line([(x, horizon), (x, s)], fill=(255, 255, 255), width=3)
    im = Image.blend(im, Image.new('RGB', (s, s), (4, 12, 20)), .15)
    im.save(os.path.join(OUT, 'bg_%s.png' % name), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    for did, c in DUCKS.items():
        draw_duck(c).save(os.path.join(OUT, 'duck_%s.png' % did), optimize=True)
    draw_food().save(os.path.join(OUT, 'food.png'), optimize=True)
    draw_food_gold().save(os.path.join(OUT, 'food_gold.png'), optimize=True)
    background('yard',    (170, 210, 235), (210, 235, 245), (90, 150, 90))
    background('park',    (150, 200, 170), (200, 230, 200), (80, 140, 80))
    background('farm',    (220, 200, 150), (240, 225, 180), (150, 120, 70))
    background('river',   (130, 190, 220), (170, 220, 230), (70, 130, 150))
    background('desert',  (255, 210, 140), (255, 225, 170), (200, 160, 90))
    background('stadium', (255, 200, 140), (255, 150, 120), (90, 150, 90))
    print('готово:', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
