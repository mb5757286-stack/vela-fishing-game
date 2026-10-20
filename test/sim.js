// Симуляция игровой логики без часов: node test/sim.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '../src/common/game.js'), 'utf8')
  .replace('export default', 'module.exports =')
const sandbox = { module: { exports: {} }, Math }
vm.runInNewContext(src, sandbox)
const G = sandbox.module.exports

// детерминированный ГСЧ
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DT = 0.04
const GAIN = 0.8

// игрок: skill — как быстро реагирует (макс. px зоны за тик), 0 = не трогает коронку
function play(seed, power, skill, hookDelayTicks, lag) {
  lag = lag === undefined ? 5 : lag   // реакция человека ~200 мс = 5 тиков
  const hist = []
  const g = G.create(mulberry(seed))
  g.power = power
  G.tap(g)                                  // заброс
  let guard = 0, biteTicks = 0
  while (g.state !== 'result' && guard++ < 5000) {
    G.step(g, DT)
    if (g.state === 'bite') {
      if (++biteTicks > hookDelayTicks) G.tap(g)
    }
    if (g.state === 'fight' && skill > 0) {
      hist.push(g.fishY + G.FISH_H / 2)
      const seen = hist[Math.max(0, hist.length - 1 - lag)]   // видит рыбу с задержкой
      const err = seen - (g.zoneY + g.zoneH / 2)
      let dz = Math.max(-skill, Math.min(skill, err * 0.6))
      G.crown(g, dz / GAIN)
    }
  }
  return g
}

function stats(label, power, skill, hookDelay) {
  const per = {}
  let n = 2000, ended = 0
  for (let i = 0; i < n; i++) {
    const g = play(1000 + i, power, skill, hookDelay)
    if (g.state === 'result') ended++
    const id = g.fish ? g.fish.name : '-'
    per[id] = per[id] || { won: 0, total: 0 }
    per[id].total++
    if (g.won) per[id].won++
  }
  console.log('\n' + label + ' (завершено ' + ended + '/' + n + ')')
  Object.keys(per).forEach(k => {
    console.log('  ' + k.padEnd(14) + (per[k].won + '/' + per[k].total).padEnd(10) +
      Math.round(100 * per[k].won / per[k].total) + '%')
  })
}

stats('Умелый (до 12 px/тик), заброс близко', 10, 12, 5)
stats('Умелый, заброс далеко', 90, 12, 5)
stats('Средний (до 6 px/тик), заброс средне', 50, 6, 8)
stats('Неспешный (до 3 px/тик), заброс средне', 50, 3, 8)
stats('Не трогает коронку, заброс далеко', 90, 0, 5)

// отдельные проверки
let g = G.create(mulberry(1))
G.tap(g); G.step(g, 0.9)
console.assert(g.state === 'wait', 'после заброса должно быть ожидание, а не ' + g.state)
G.tap(g)
console.assert(g.state === 'result' && !g.won, 'ранняя подсечка = провал')

g = G.create(mulberry(2)); g.power = 50
G.tap(g); while (g.state !== 'bite') G.step(g, DT)
G.crown(g, 10); console.assert(g.state === 'bite', 'малый поворот не подсекает')
G.crown(g, 15); console.assert(g.state === 'fight' || g.state === 'result', 'поворот коронки подсекает')

g = G.create(mulberry(3)); G.crown(g, 100)
console.assert(Math.abs(g.power - 62) < 0.01, 'коронка меняет дальность: ' + g.power)
console.log('\nПроверки пройдены')
