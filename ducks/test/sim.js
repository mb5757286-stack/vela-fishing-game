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
  assert.strictEqual(JSON.stringify(d.owned.duck), '["plain"]')
  assert.strictEqual(d.eq.duck, 'plain')

  const bad = G.mergeSave({ coins: -9, owned: { duck: ['nope'] }, eq: { duck: 'nope' }, duck: { speed: 999 } })
  assert.strictEqual(bad.coins, 0, 'отрицательные монеты отбрасываются')
  assert.strictEqual(JSON.stringify(bad.owned.duck), '["plain"]')
  assert.strictEqual(bad.eq.duck, 'plain')
  assert.strictEqual(bad.duck.speed, G.DUCKS[0].statCap, 'характеристика ограничена потолком утки')
  assert.strictEqual(G.mergeSave(null).coins, 0)
  console.log('мусор в сохранении — ок')
}

console.log('\n--- Магазин ---')
{
  let s = G.defaultSave()
  s.coins = 10
  assert(G.buy(s, 'duck', 'racer').indexOf('Не хватает') === 0, 'без денег не покупается')
  s.coins = 1000
  assert(G.buy(s, 'duck', 'racer').indexOf('Куплено') === 0)
  assert.strictEqual(s.coins, 700)
  assert.strictEqual(s.eq.duck, 'racer')
  assert(G.buy(s, 'duck', 'plain').indexOf('Выбрано') === 0, 'уже купленное переключается')
  assert.strictEqual(s.coins, 700, 'повторный выбор бесплатный')
  assert(G.buy(s, 'item', 'shoes').indexOf('Куплено') === 0)
  assert.strictEqual(G.buy(s, 'item', 'shoes').indexOf('Уже куплено'), 0, 'повторная покупка предмета запрещена')
  assert.strictEqual(G.buy(s, 'track', 'park').indexOf('Куплено'), 0)
  console.log('покупки и списание — ок')
}

console.log('\n--- Эффективные характеристики ---')
{
  const s = G.defaultSave()
  s.duck.speed = 5
  assert.strictEqual(G.effectiveStat(s, 'speed'), 5)
  s.owned.item.push('shoes')
  assert.strictEqual(G.effectiveStat(s, 'speed'), 7, 'аксессуар добавляет бонус')
  assert.strictEqual(G.effectiveStat(s, 'power'), s.duck.power, 'бонус не затрагивает другую характеристику')
}

console.log('\n--- Тренировка ---')
{
  // Идеальный бот: мгновенно наводит стрелку на цель каждый раз, когда она сдвигается
  const t = G.startTraining(mulberry(1), 'speed')
  let guard = 0
  while (!t.done && guard++ < 2000) {
    t.needle = t.target
    G.trainStep(t, DT)
  }
  assert(t.done, 'тренировка завершается по времени')
  assert(t.gain >= 1, 'идеальная тренировка даёт прирост: ' + t.gain)

  const s = G.defaultSave()
  const before = s.duck.speed
  const got = G.applyTraining(s, t)
  assert(got > 0, 'прирост применяется к сохранению')
  assert.strictEqual(s.duck.speed, before + got)

  // Плохой бот: стрелка стоит на месте и не попадает в цель
  const bad = G.startTraining(mulberry(2), 'power')
  bad.needle = 0
  guard = 0
  while (!bad.done && guard++ < 2000) G.trainStep(bad, DT)
  assert.strictEqual(bad.gain, 0, 'без попаданий прирост нулевой')
  const s2 = G.defaultSave()
  assert.strictEqual(G.applyTraining(s2, bad), 0, 'нулевой прирост ничего не меняет')

  // Потолок характеристики не превышается
  const s3 = G.defaultSave()
  s3.duck.speed = G.DUCKS[0].statCap
  const t3 = G.startTraining(mulberry(3), 'speed')
  t3.done = true; t3.gain = 2
  assert.strictEqual(G.applyTraining(s3, t3), 0, 'потолок утки не превышается')
}

console.log('\n--- Забег ---')
{
  function run(seed, save, trackId, skill) {
    save.eq.track = trackId
    const r = G.startRace(mulberry(seed), save)
    let guard = 0
    while (!r.finished && guard++ < 20000) {
      G.raceStep(r, DT)
      if (skill > 0 && Math.random() < skill * DT) G.raceBoost(r)
    }
    return r
  }

  // Слабая утка почти всегда проигрывает топовой трассе сильным соперникам
  const weak = G.defaultSave()
  let weakWins = 0
  for (let i = 0; i < 60; i++) if (run(i, weak, 'stadium', 2).rank === 1) weakWins++
  assert(weakWins < 10, 'слабая утка редко выигрывает топовую трассу: ' + weakWins + '/60')

  // Прокачанная утка на лёгкой трассе выигрывает часто
  const strong = G.defaultSave()
  strong.duck = { speed: 10, power: 10, stamina: 10 }
  let strongWins = 0
  for (let i = 0; i < 60; i++) if (run(i, strong, 'yard', 3).rank === 1) strongWins++
  assert(strongWins > 40, 'сильная утка часто выигрывает лёгкую трассу: ' + strongWins + '/60')

  // Награды начисляются и зависят от места
  const s = G.defaultSave()
  s.duck = { speed: 10, power: 10, stamina: 10 }
  const r1 = run(7, s, 'yard', 3)
  const coins1 = G.finishRewards(s, r1, 'yard')
  assert(coins1 > 0, 'за забег начисляются монеты')
  assert.strictEqual(s.stats.races, 1)

  const weak2 = G.defaultSave()
  const rLose = run(9, weak2, 'stadium', 0)
  const coinsLose = G.finishRewards(weak2, rLose, 'stadium')
  assert(coinsLose >= 1, 'даже за поражение что-то платят')

  // Частые рывки истощают выносливость и дают меньше пользы, чем редкие точные
  function spamRun(seed, save) {
    save.eq.track = 'yard'
    const r = G.startRace(mulberry(seed), save)
    let guard = 0
    while (!r.finished && guard++ < 20000) {
      G.raceStep(r, DT)
      G.raceBoost(r) // спам каждый тик
    }
    return r
  }
  const spamSave = G.defaultSave()
  spamSave.duck = { speed: 5, power: 5, stamina: 5 }
  const spamR = spamRun(11, spamSave)
  assert(spamR.runners[0].fatigue <= 100, 'усталость не уходит за предел: ' + spamR.runners[0].fatigue)
}

console.log('\nВсе проверки пройдены')
