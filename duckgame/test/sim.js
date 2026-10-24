// Проверка логики без часов: node test/sim.js
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

console.log('--- Сохранение ---')
{
  const d = G.defaultSave()
  assert.strictEqual(d.coins, 0)
  assert.strictEqual(d.duck.hunger, G.HUNGER_MAX)
  assert.strictEqual(JSON.stringify(d.owned.duck), '["plain"]')

  const bad = G.mergeSave({ coins: -9, owned: { duck: ['nope'] }, eq: { duck: 'nope' }, duck: { speed: 999, hunger: -50 } })
  assert.strictEqual(bad.coins, 0)
  assert.strictEqual(bad.duck.speed, G.DUCKS[0].statCap, 'потолок утки соблюдается')
  assert.strictEqual(bad.duck.hunger, 0, 'голод не уходит в минус')
  assert.strictEqual(G.mergeSave(null).coins, 0)
  console.log('мусор в сохранении — ок')
}

console.log('\n--- Голод по реальному времени ---')
{
  const s = G.defaultSave()
  G.applyHungerDecay(s, 1000)
  assert.strictEqual(s.duck.hunger, G.HUNGER_MAX, 'первый вызов только запоминает время')
  const sixHoursMs = 6 * 60 * 60 * 1000
  G.applyHungerDecay(s, 1000 + sixHoursMs)
  assert(s.duck.hunger <= 5, 'за 6 часов голод падает почти до нуля: ' + s.duck.hunger)

  const s2 = G.defaultSave()
  G.applyHungerDecay(s2, 5000)
  G.applyHungerDecay(s2, 5000 + 30 * 60 * 1000) // 30 минут
  assert(s2.duck.hunger > 90 && s2.duck.hunger < 100, 'за полчаса голод падает немного: ' + s2.duck.hunger)
}

console.log('\n--- Кормление ---')
{
  // Идеальный бот: корзина мгновенно под кормом
  const f = G.startFeeding(mulberry(1))
  let guard = 0
  while (!f.done && guard++ < 3000) {
    const falling = f.items.filter(it => it.y < 95)
    if (falling.length) f.basket = falling[0].x
    G.feedStep(f, DT)
  }
  assert(f.done)
  assert(f.caught > 0, 'идеальная ловля даёт поимки: ' + f.caught)

  const s = G.defaultSave()
  s.duck.hunger = 10
  const res = G.applyFeeding(s, f)
  assert(res.hunger > 0, 'кормление поднимает голод')
  assert(s.duck.hunger > 10, 'голод в сохранении вырос')
  assert.strictEqual(s.stats.feeds, 1)

  const s2 = G.defaultSave()
  s2.duck.hunger = G.HUNGER_MAX
  const res2 = G.applyFeeding(s2, f)
  assert.strictEqual(s2.duck.hunger, G.HUNGER_MAX, 'голод не превышает максимум')

  // Плохой бот: корзина стоит в центре и не управляется — ловит меньше, чем идеальный
  const bad = G.startFeeding(mulberry(2))
  guard = 0
  while (!bad.done && guard++ < 3000) G.feedStep(bad, DT)
  assert(bad.caught < f.caught, 'без управления ловится меньше, чем идеально: ' + bad.caught + ' vs ' + f.caught)
}

console.log('\n--- Тренировка и голод ---')
{
  const s = G.defaultSave()
  s.duck.hunger = 5
  assert.strictEqual(G.canTrain(s), false, 'голодная утка не может тренироваться')
  s.duck.hunger = 50
  assert.strictEqual(G.canTrain(s), true)

  const t = G.startTraining(mulberry(3), 'speed')
  let guard = 0
  while (!t.done && guard++ < 2000) { t.needle = t.target; G.trainStep(t, DT) }
  assert(t.gain >= 1)
  const before = s.duck.speed
  const hungerBefore = s.duck.hunger
  const got = G.applyTraining(s, t)
  assert(got > 0)
  assert.strictEqual(s.duck.speed, before + got)
  assert(s.duck.hunger < hungerBefore, 'тренировка тратит голод')

  const bad = G.startTraining(mulberry(4), 'power')
  bad.needle = 0
  guard = 0
  while (!bad.done && guard++ < 2000) G.trainStep(bad, DT)
  assert.strictEqual(bad.gain, 0)
  const s2 = G.defaultSave()
  assert.strictEqual(G.applyTraining(s2, bad), 0)
}

console.log('\n--- Забег ---')
{
  function run(seed, save, locId, skill) {
    save.eq.loc = locId
    const r = G.startRace(mulberry(seed), save)
    let guard = 0
    while (!r.finished && guard++ < 20000) {
      G.raceStep(r, DT)
      if (skill > 0 && Math.random() < skill * DT) G.raceBoost(r)
    }
    return r
  }

  const weak = G.defaultSave()
  let weakWins = 0
  for (let i = 0; i < 60; i++) if (run(i, weak, 'stadium', 2).rank === 1) weakWins++
  assert(weakWins < 10, 'слабая утка редко выигрывает топовую локацию: ' + weakWins + '/60')

  const strong = G.defaultSave()
  strong.duck.speed = 10; strong.duck.power = 10; strong.duck.stamina = 10
  let strongWins = 0
  for (let i = 0; i < 60; i++) if (run(i, strong, 'yard', 3).rank === 1) strongWins++
  assert(strongWins > 40, 'сильная утка часто выигрывает лёгкую локацию: ' + strongWins + '/60')

  // Голодная утка бежит хуже сытой при прочих равных (сравниваем время финиша, без рывков)
  const fed = G.defaultSave()
  fed.duck.speed = 6; fed.duck.power = 6; fed.duck.stamina = 6
  fed.duck.hunger = G.HUNGER_MAX
  const hungry = G.defaultSave()
  hungry.duck.speed = 6; hungry.duck.power = 6; hungry.duck.stamina = 6
  hungry.duck.hunger = 5
  let fedTotal = 0, hungryTotal = 0
  const N = 30
  for (let i = 0; i < N; i++) {
    fedTotal += run(i, fed, 'park', 0).time
    hungryTotal += run(i + 1000, hungry, 'park', 0).time
  }
  assert(hungryTotal > fedTotal, 'голодная утка финиширует дольше сытой: ' + (hungryTotal / N).toFixed(1) + 'с vs ' + (fedTotal / N).toFixed(1) + 'с')

  const s = G.defaultSave()
  s.duck.speed = 10; s.duck.power = 10; s.duck.stamina = 10
  const r1 = run(7, s, 'yard', 3)
  const coins1 = G.finishRewards(s, r1, 'yard')
  assert(coins1 > 0)
  assert.strictEqual(s.stats.races, 1)
  assert(s.duck.hunger < G.HUNGER_MAX, 'забег тратит голод')

  console.log('локации, голод в забеге, награды — ок')
}

console.log('\n--- Локации и магазин ---')
{
  assert(G.LOCATIONS.length >= 5, 'локаций должно быть не меньше 5')
  let s = G.defaultSave()
  s.coins = 10
  assert(G.buy(s, 'duck', 'racer').indexOf('Не хватает') === 0)
  s.coins = 1000
  assert(G.buy(s, 'duck', 'racer').indexOf('Куплено') === 0)
  assert.strictEqual(s.coins, 700)
  assert(G.buy(s, 'duck', 'plain').indexOf('Выбрано') === 0)
  assert.strictEqual(s.coins, 700)
  assert(G.buy(s, 'item', 'shoes').indexOf('Куплено') === 0)
  assert.strictEqual(G.buy(s, 'item', 'shoes').indexOf('Уже куплено'), 0)
  assert.strictEqual(G.buy(s, 'loc', 'park').indexOf('Куплено'), 0)
  console.log('покупки — ок')
}

console.log('\nВсе проверки пройдены')
