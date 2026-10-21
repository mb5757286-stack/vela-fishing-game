// Проверка логики без часов: node test/sim.js
// Гоняем ботов-игроков по всем локациям и проверяем механику, магазин и снаряжение.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const assert = require('assert')

const src = fs.readFileSync(path.join(__dirname, '../src/common/game.js'), 'utf8')
  .replace('export default', 'module.exports =')
const sb = { module: { exports: {} }, Math, console }
vm.runInNewContext(src, sb)
const G = sb.module.exports

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DT = 0.04

// Бот: skill — макс. px зоны за тик (0 = коронку не трогает), lag — задержка реакции в тиках
function play(seed, save, loc, power, skill, lag) {
  save.eq.loc = loc
  const g = G.create(mulberry(seed), save)
  g.power = power
  G.tap(g)
  const hist = []
  let guard = 0, biteTicks = 0
  while (g.state !== 'result' && guard++ < 6000) {
    G.step(g, DT)
    if (g.state === 'bite' && ++biteTicks > 5) G.tap(g)
    if (g.state === 'fight' && skill > 0) {
      hist.push(g.fishY + G.FISH_H / 2)
      const seen = hist[Math.max(0, hist.length - 1 - lag)]
      const err = seen - (g.zoneY + g.zoneH / 2)
      const dz = Math.max(-skill, Math.min(skill, err * 0.6))
      G.crown(g, dz / (0.8 * G.gear(g).reel.gain))
    }
  }
  return g
}

function freshSave() { return G.defaultSave() }
function geared() {
  const s = G.defaultSave()
  s.coins = 5000
  s.owned.rod = ['bamboo', 'carbon', 'spin']; s.eq.rod = 'spin'
  s.owned.reel = ['simple', 'feeder', 'inertia']; s.eq.reel = 'inertia'
  s.owned.bait = ['worm', 'maggot', 'lure']; s.eq.bait = 'lure'
  return s
}

function rate(label, seeds, fn) {
  let won = 0, total = 0, coins = 0
  for (let i = 0; i < seeds; i++) {
    const g = fn(1000 + i)
    total++
    if (g.last && g.last.won) won++
    if (g.last) coins += g.last.gain
  }
  const pct = Math.round(100 * won / total)
  console.log(label.padEnd(44) + (won + '/' + total).padEnd(11) + pct + '%  монет: ' + coins)
  return { won, total, pct, coins }
}

console.log('--- Статистика ботов ---')
const N = 400

// Умелый игрок с базовым снаряжением, на пруду
const pond = rate('Пруд, умелый, бамбук', N, (s) => play(s, freshSave(), 'pond', 40, 12, 5))
assert(pond.pct >= 50, 'на пруду умелый игрок должен ловить чаще половины')

// Со всеми локациями на снаряжении: каждая должна давать поклёвки и улов
for (const loc of G.LOCATIONS) {
  const r = rate(loc.name + ', умелый, спиннинг+блесна', N, (s) => play(s, geared(), loc.id, 40, 12, 5))
  assert(r.won > 0, loc.name + ': ни одной поимки')
}

// Снаряжение должно влиять: на щуку спиннинг лучше бамбука
const pikeBase = (save) => {
  let won = 0, total = 0
  for (let i = 0; i < 1500; i++) {
    const g = play(5000 + i, save, 'river', 60, 12, 5)
    if (g.last && g.last.fishId === 'pike') { total++; if (g.last.won) won++ }
  }
  return { won, total, pct: total ? Math.round(100 * won / total) : 0 }
}
const bambooPike = pikeBase(freshSave())
const spinPike = pikeBase(geared())
console.log('Щука, бамбук:      ' + bambooPike.won + '/' + bambooPike.total + ' (' + bambooPike.pct + '%)')
console.log('Щука, спиннинг:    ' + spinPike.won + '/' + spinPike.total + ' (' + spinPike.pct + '%)')
assert(spinPike.pct > bambooPike.pct, 'спиннинг должен помогать против щуки')

// Монеты начисляются за улов, сорт (сапог) — без монет
const coinsRun = play(77, freshSave(), 'pond', 40, 12, 5)
if (coinsRun.last && coinsRun.last.won && !G.FISH[coinsRun.last.fishId].junk) {
  assert(coinsRun.save.coins > 0, 'за поимку должны начисляться монеты')
}

console.log('\n--- Магазин ---')
let s = freshSave()
s.coins = 10
assert(G.buy(s, 'rod', 'spin').indexOf('Не хватает') === 0, 'без денег не покупается')
assert(s.owned.rod.indexOf('spin') < 0, 'не купилось — не в списке')
s.coins = 1000
assert(G.buy(s, 'rod', 'spin').indexOf('Куплено') === 0, 'покупка с деньгами')
assert.strictEqual(s.coins, 500, 'деньги списались')
assert.strictEqual(s.eq.rod, 'spin', 'купленное сразу надевается')
G.buy(s, 'rod', 'bamboo')
assert.strictEqual(s.eq.rod, 'bamboo', 'уже купленное можно переодеть')
assert.strictEqual(s.coins, 500, 'повторно ничего не списывается')
assert.strictEqual(G.buy(s, 'loc', 'lake').indexOf('Куплено'), 0, 'локация 400 — при 500 покупается')
console.log('покупки и списание монет — ок')

console.log('\n--- Сохранение ---')
const bad = G.mergeSave({ coins: -5, owned: { rod: ['nope'], reel: 'x' }, eq: { rod: 'nope' }, stats: { bestKg: 3, bestId: 'nope' } })
assert.strictEqual(bad.coins, 0, 'отрицательные монеты отбрасываются')
assert.strictEqual(JSON.stringify(bad.owned.rod), '["bamboo"]', 'неизвестное снаряжение отбрасывается')
assert.strictEqual(bad.eq.rod, 'bamboo')
assert.strictEqual(bad.stats.bestId, '', 'неизвестная рыба отбрасывается')
const good = G.mergeSave(JSON.parse(JSON.stringify(geared())))
assert.strictEqual(good.eq.rod, 'spin')
assert.strictEqual(G.mergeSave(null).coins, 0)
console.log('мусор в сохранении — ок')

console.log('\n--- Механика ---')
let g = G.create(mulberry(1), freshSave())
G.tap(g); G.step(g, 0.9)
assert.strictEqual(g.state, 'wait', 'после заброса должно быть ожидание, а не ' + g.state)
G.tap(g)
assert(g.state === 'result' && g.last && !g.last.won, 'ранняя подсечка = провал')

g = G.create(mulberry(2), freshSave()); g.power = 50
G.tap(g); while (g.state !== 'bite') G.step(g, DT)
G.crown(g, 10); assert.strictEqual(g.state, 'bite', 'малый поворот не подсекает')
G.crown(g, 15); assert(g.state === 'fight' || g.state === 'result', 'поворот коронки подсекает')

g = G.create(mulberry(3), freshSave()); G.crown(g, 100)
assert(Math.abs(g.power - 62) < 0.01, 'коронка меняет дальность: ' + g.power)

g = G.create(mulberry(4), freshSave())
G.tap(g); while (g.state !== 'bite') G.step(g, DT)
G.tap(g); while (g.state === 'fight') { G.step(g, DT); if (g.state === 'fight') G.longpress(g) }
assert(g.state === 'result', 'долгое нажатие в бою завершает рыбалку')

console.log('\n--- Датчики и балансир ---')
{
  const m = G.motionNew()
  let flicks = 0
  for (let i = 0; i < 50; i++) if (G.motionFeed(m, 0, 0, 9.8, i * 0.02).flick) flicks++
  assert.strictEqual(flicks, 0, 'ровно лежащие часы не дают рывков')
  const m2 = G.motionNew()
  G.motionFeed(m2, 0, 0, 9.8, 0)
  assert.strictEqual(G.motionFeed(m2, 0, 0, 21.8, 0.02).flick, true, 'резкий рывок распознаётся')
  assert.strictEqual(G.motionFeed(m2, 0, 0, 9.8, 0.04).flick, false, 'один рывок не считается дважды')
  let f2 = 0
  for (let i = 0; i < 10; i++) if (G.motionFeed(m2, 0, 0, 9.8 + (i % 2) * 12, 1 + i * 0.05).flick) f2++
  assert(f2 <= 1, 'частые рывки за 0.8 с учитываются один раз, а не ' + f2)
  assert.strictEqual(G.motionFeed(G.motionNew(), 0.5, 0, 9.8, 0).tilt, 0, 'наклон в мёртвой зоне — 0')
  const tl = G.motionFeed(G.motionNew(), 5, 0, 9.8, 0).tilt
  assert(tl > 0.4 && tl <= 1, 'наклон даёт ход зоны: ' + tl)
  const gt = G.create(mulberry(9), freshSave()); gt.state = 'fight'; gt.zoneH = 120; gt.zoneY = 100
  G.tilt(gt, 1, 0.1)
  assert(gt.zoneY > 100, 'наклон двигает зону в бою')
  G.tilt(gt, 1, 10)
  assert(gt.zoneY <= G.TRACK - 120, 'зона не выходит за поле')
  const gi = G.create(mulberry(9), freshSave()); G.tilt(gi, 1, 1)
  assert.strictEqual(gi.zoneY, 0, 'вне боя наклон ничего не делает')
  const sd = G.mergeSave({ settings: { motion: false, sens: 2, tilt: 'да' } })
  assert.strictEqual(sd.settings.motion, false)
  assert.strictEqual(sd.settings.sens, 2)
  assert.strictEqual(sd.settings.tilt, true, 'мусор в настройках заменяется дефолтом')
}
console.log('рывки, мёртвая зона, балансир, настройки — ок')

console.log('\nВсе проверки пройдены')
