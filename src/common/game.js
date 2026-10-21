// Логика игры «Рыбалка». Чистый JS без системных API, поэтому проверяется в Node (test/sim.js).

var FISH = {
  bleak:    { name: 'Уклейка',       min: 0.02, max: 0.15, price: 4,  speed: 70,  zone: 120 },
  roach:    { name: 'Плотва',        min: 0.1,  max: 0.7,  price: 5,  speed: 85,  zone: 110 },
  crucian:  { name: 'Карась',        min: 0.2,  max: 1.5,  price: 8,  speed: 95,  zone: 100 },
  bream:    { name: 'Лещ',           min: 0.5,  max: 3.5,  price: 10, speed: 110, zone: 92 },
  perch:    { name: 'Окунь',         min: 0.1,  max: 1.2,  price: 9,  speed: 105, zone: 96 },
  carp:     { name: 'Карп',          min: 1.0,  max: 8.0,  price: 12, speed: 130, zone: 86 },
  zander:   { name: 'Судак',         min: 0.5,  max: 6.0,  price: 14, speed: 150, zone: 84 },
  pike:     { name: 'Щука',          min: 1.0,  max: 12,   price: 15, speed: 170, zone: 78 },
  catfish:  { name: 'Сом',           min: 4.0,  max: 40,   price: 18, speed: 200, zone: 74 },
  flounder: { name: 'Камбала',       min: 0.3,  max: 3.0,  price: 16, speed: 90,  zone: 100 },
  horse:    { name: 'Ставрида',      min: 0.1,  max: 0.6,  price: 7,  speed: 120, zone: 104 },
  seaperch: { name: 'Морской окунь', min: 0.3,  max: 4.0,  price: 13, speed: 140, zone: 88 },
  boot:     { name: 'Старый сапог',  min: 0.3,  max: 0.6,  price: 0,  speed: 0,   zone: 0, junk: true }
}

var LOCATIONS = [
  { id: 'pond',  name: 'Пруд',  price: 0,    fish: { bleak: 30, roach: 30, crucian: 20, perch: 8, boot: 3 } },
  { id: 'river', name: 'Река',  price: 150,  fish: { roach: 14, perch: 16, pike: 12, catfish: 5, bleak: 12, boot: 3 } },
  { id: 'lake',  name: 'Озеро', price: 400,  fish: { bream: 16, carp: 10, perch: 12, pike: 10, zander: 8 } },
  { id: 'sea',   name: 'Море',  price: 1000, fish: { flounder: 14, horse: 18, seaperch: 12, zander: 4 } }
]

// reach — насколько дальше забрасывает (и крупнее рыба), lineMax — кг, с которых леска перегружена
var RODS = [
  { id: 'bamboo', name: 'Бамбуковая', price: 0,   reach: 1.0, lineMax: 1.5 },
  { id: 'carbon', name: 'Карбоновая', price: 120, reach: 1.3, lineMax: 6 },
  { id: 'spin',   name: 'Спиннинг',   price: 500, reach: 1.6, lineMax: 20 }
]
// drain — сколько рыба выматывает шкалу, gain — скорость зоны от коронки
var REELS = [
  { id: 'simple',  name: 'Простая',     price: 0,   drain: 1.0, gain: 1.0 },
  { id: 'feeder',  name: 'Фидерная',    price: 200, drain: 0.8, gain: 1.1 },
  { id: 'inertia', name: 'Инерционная', price: 700, drain: 0.6, gain: 1.25 }
]
// boost/mult — какие рыбы клюют лучше на наживку
var BAITS = [
  { id: 'worm',   name: 'Червь',  price: 0,  boost: [],                                     mult: 1 },
  { id: 'maggot', name: 'Опарыш', price: 30, boost: ['bleak', 'roach', 'crucian', 'bream'], mult: 2.5 },
  { id: 'lure',   name: 'Блесна', price: 90, boost: ['pike', 'perch', 'zander', 'catfish'], mult: 3 }
]

var CAT_LIST = { rod: RODS, reel: REELS, bait: BAITS, loc: LOCATIONS }
var TRACK = 300
var FISH_H = 34
var GAIN = 0.8
var POWER_GAIN = 0.12
var BITE_WINDOW = 1.4
var HOOK_THRESHOLD = 20
var FIGHT_LIMIT = 28
var COIN_RATE = 1.5 // монет за 1 кг * цену

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }
function round2(v) { return Math.round(v * 100) / 100 }
function find(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return list[0]
}

function defaultSave() {
  return {
    coins: 0,
    owned: { rod: ['bamboo'], reel: ['simple'], bait: ['worm'], loc: ['pond'] },
    eq: { rod: 'bamboo', reel: 'simple', bait: 'worm', loc: 'pond' },
    stats: { caught: 0, lost: 0, earned: 0, bestId: '', bestKg: 0 }
  }
}

// Приводит сохранение к безопасному виду: мусор и старые форматы заменяются дефолтом
function mergeSave(s) {
  var d = defaultSave()
  if (!s || typeof s !== 'object') return d
  if (typeof s.coins === 'number' && s.coins >= 0) d.coins = s.coins
  var cats = Object.keys(d.owned)
  for (var i = 0; i < cats.length; i++) {
    var c = cats[i]
    var valid = CAT_LIST[c].map(function (x) { return x.id })
    if (s.owned && Array.isArray(s.owned[c])) {
      d.owned[c] = s.owned[c].filter(function (id) { return valid.indexOf(id) >= 0 })
    }
    if (d.owned[c].length === 0) d.owned[c] = [valid[0]]
    if (s.eq && d.owned[c].indexOf(s.eq[c]) >= 0) d.eq[c] = s.eq[c]
    else d.eq[c] = d.owned[c][0]
  }
  if (s.stats && typeof s.stats === 'object') {
    var st = s.stats
    if (typeof st.caught === 'number') d.stats.caught = st.caught
    if (typeof st.lost === 'number') d.stats.lost = st.lost
    if (typeof st.earned === 'number') d.stats.earned = st.earned
    if (typeof st.bestKg === 'number') { d.stats.bestKg = st.bestKg; d.stats.bestId = FISH[st.bestId] ? st.bestId : '' }
  }
  return d
}

// Список для магазина: какие вещи есть и что надето
function shopItems(save, cat) {
  return CAT_LIST[cat].map(function (it) {
    return {
      cat: cat,
      id: it.id,
      name: it.name,
      price: it.price,
      owned: save.owned[cat].indexOf(it.id) >= 0,
      equipped: save.eq[cat] === it.id
    }
  })
}

// Покупка или выбор вещи. Возвращает текст для игрока.
function buy(save, cat, id) {
  var item = find(CAT_LIST[cat], id)
  if (save.owned[cat].indexOf(item.id) >= 0) {
    save.eq[cat] = item.id
    return 'Надето: ' + item.name
  }
  if (save.coins < item.price) return 'Не хватает монет: нужно ' + item.price
  save.coins -= item.price
  save.owned[cat].push(item.id)
  save.eq[cat] = item.id
  return 'Куплено: ' + item.name
}

function gear(g) {
  var e = g.save.eq
  return {
    rod: find(RODS, e.rod),
    reel: find(REELS, e.reel),
    bait: find(BAITS, e.bait),
    loc: find(LOCATIONS, e.loc)
  }
}

function create(rnd, save) {
  return {
    rnd: rnd || Math.random,
    save: save || defaultSave(),
    state: 'idle',      // idle | casting | wait | bite | fight | result
    timer: 0,
    phase: 0,
    power: 50,          // дальность заброса 0..100
    bobY: 40,
    fishId: '',
    weight: 0,
    hookAcc: 0,
    zoneY: 0,
    zoneH: 120,
    fishY: 0,
    target: 0,
    retarget: 0,
    progress: 30,
    fightTime: 0,
    inside: false,
    events: [],         // 'bite' | 'hook' | 'win' | 'lose' — страница превращает их в вибрацию
    dirty: false,       // true — нужно сохранить прогресс
    last: null          // итог последней рыбалки: { won, title, line, gain, fishId, kg }
  }
}

function pickFish(g) {
  var gr = gear(g)
  var ids = Object.keys(gr.loc.fish)
  var ws = []
  var total = 0
  for (var i = 0; i < ids.length; i++) {
    var w = gr.loc.fish[ids[i]]
    if (gr.bait.boost.indexOf(ids[i]) >= 0) w *= gr.bait.mult
    ws.push(w)
    total += w
  }
  var r = g.rnd() * total
  for (i = 0; i < ids.length; i++) {
    r -= ws[i]
    if (r <= 0) return ids[i]
  }
  return ids[0]
}

// Дальний заброс с мощной удочкой даёт более крупную рыбу
function pickWeight(g, f) {
  var gr = gear(g)
  var bias = clamp((g.power / 100) * gr.rod.reach, 0, 1)
  var e = 1.6 - bias * 1.2
  return round2(f.min + (f.max - f.min) * Math.pow(g.rnd(), e))
}

function tap(g) {
  if (g.state === 'idle') {
    g.state = 'casting'
    g.timer = 0.8
    g.phase = 0
    g.hookAcc = 0
  } else if (g.state === 'wait') {
    finish(g, false, 'Рано!', 'Дёрнул слишком рано — рыба ушла')
  } else if (g.state === 'bite') {
    hook(g)
  } else if (g.state === 'result') {
    g.state = 'idle'
    g.last = null
  }
}

// Коронка: в простое — дальность, при поклёвке — подсечка, в бою — зона
function crown(g, d) {
  if (g.state === 'idle') {
    g.power = clamp(g.power + d * POWER_GAIN, 0, 100)
  } else if (g.state === 'bite') {
    g.hookAcc += Math.abs(d)
    if (g.hookAcc >= HOOK_THRESHOLD) hook(g)
  } else if (g.state === 'fight') {
    g.zoneY = clamp(g.zoneY + d * GAIN * gear(g).reel.gain, 0, TRACK - g.zoneH)
  }
}

// Долгое нажатие в бою — отпустить рыбу
function longpress(g) {
  if (g.state === 'fight') finish(g, false, 'Отпустил', 'Рыба ушла сама')
}

function hook(g) {
  g.events.push('hook')
  var f = FISH[g.fishId]
  if (f.junk) {
    finish(g, true, f.name, 'Ну хоть что-то...')
    return
  }
  g.state = 'fight'
  g.zoneH = f.zone
  g.zoneY = (TRACK - g.zoneH) / 2
  g.fishY = TRACK / 2 - FISH_H / 2
  g.target = g.fishY
  g.retarget = 0
  g.progress = 30
  g.fightTime = 0
  g.inside = false
}

function finish(g, win, title, line) {
  var s = g.save
  var f = FISH[g.fishId]
  g.state = 'result'
  g.last = { won: win, title: title, line: line, gain: 0, fishId: g.fishId, kg: g.weight }
  if (win) {
    if (!f.junk) {
      var coins = Math.max(1, Math.round(g.weight * f.price * COIN_RATE))
      g.last.gain = coins
      s.coins += coins
      s.stats.earned += coins
      s.stats.caught += 1
      if (g.weight > s.stats.bestKg) {
        s.stats.bestKg = g.weight
        s.stats.bestId = g.fishId
      }
    }
    g.events.push('win')
  } else {
    s.stats.lost += 1
    g.events.push('lose')
  }
  g.dirty = true
}

function step(g, dt) {
  g.phase += dt
  var s = g.state

  if (s === 'idle') {
    g.bobY = 40
  } else if (s === 'casting') {
    g.timer -= dt
    var k = clamp(1 - g.timer / 0.8, 0, 1)
    g.bobY = -70 + 110 * k
    if (g.timer <= 0) {
      g.state = 'wait'
      g.timer = 2 + g.rnd() * 3 + (g.power / 100) * 2
      g.fishId = pickFish(g)
      g.weight = pickWeight(g, FISH[g.fishId])
    }
  } else if (s === 'wait') {
    g.bobY = 40 + Math.sin(g.phase * 3) * 4
    g.timer -= dt
    if (g.timer <= 0) {
      g.state = 'bite'
      g.timer = BITE_WINDOW
      g.hookAcc = 0
      g.events.push('bite')
    }
  } else if (s === 'bite') {
    g.bobY = 40 + 22 * Math.abs(Math.sin(g.phase * 16))
    g.timer -= dt
    if (g.timer <= 0) finish(g, false, 'Сорвалась', 'Не успел подсечь')
  } else if (s === 'fight') {
    fightStep(g, dt)
  }
}

function fightStep(g, dt) {
  var f = FISH[g.fishId]
  var gr = gear(g)
  g.fightTime += dt

  var frac = clamp((g.weight - f.min) / (f.max - f.min), 0, 1)
  var speed = f.speed * (0.85 + 0.3 * frac)

  g.retarget -= dt
  if (g.retarget <= 0) {
    g.retarget = 0.5 + g.rnd() * 0.9
    g.target = g.rnd() * (TRACK - FISH_H)
  }
  var diff = g.target - g.fishY
  var move = speed * dt
  if (Math.abs(diff) <= move) g.fishY = g.target
  else g.fishY += diff > 0 ? move : -move

  var c = g.fishY + FISH_H / 2
  g.inside = c >= g.zoneY && c <= g.zoneY + g.zoneH

  // Тяжелая рыба на тонкой леске выматывает вдвое быстрее
  var overload = g.weight > gr.rod.lineMax ? 2 : 1
  var drain = (20 + f.speed / 10) * gr.reel.drain * overload
  g.progress += (g.inside ? 18 : -drain) * dt
  g.progress = clamp(g.progress, 0, 100)

  if (g.progress >= 100) {
    finish(g, true, f.name, g.weight + ' кг')
  } else if (g.progress <= 0 || g.fightTime >= FIGHT_LIMIT) {
    finish(g, false, 'Сорвалась', f.name + ' ушла с крючка')
  }
}

function powerLabel(power) {
  if (power < 34) return 'Близко'
  if (power < 67) return 'Средне'
  return 'Далеко'
}

export default {
  FISH: FISH,
  LOCATIONS: LOCATIONS,
  RODS: RODS,
  REELS: REELS,
  BAITS: BAITS,
  TRACK: TRACK,
  FISH_H: FISH_H,
  defaultSave: defaultSave,
  mergeSave: mergeSave,
  shopItems: shopItems,
  buy: buy,
  gear: gear,
  create: create,
  tap: tap,
  crown: crown,
  longpress: longpress,
  step: step,
  powerLabel: powerLabel
}
