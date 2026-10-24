// Логика «Утиной фермы». Чистый JS без системных API — проверяется в Node (test/sim.js).
// Утка: кормите (голод влияет на тренировки), качаете характеристики, бежите забеги по локациям.

var STAT_MIN = 1
var STAT_MAX = 10
var HUNGER_MAX = 100
var HUNGER_TRAIN_MIN = 20     // ниже этого тренировка не идёт — утка голодна
var HUNGER_DECAY_PER_MS = HUNGER_MAX / (1000 * 60 * 60 * 6) // падает до нуля примерно за 6 часов

var DUCKS = [
  { id: 'plain',  name: 'Обычная утка',  price: 0,    statCap: 10, color: '#f4c542' },
  { id: 'racer',  name: 'Гоночная утка', price: 300,  statCap: 13, color: '#4fd1ff' },
  { id: 'golden', name: 'Золотая утка',  price: 900,  statCap: 16, color: '#ffd166' }
]

var ITEMS = [
  { id: 'shoes',  name: 'Кроссовки',     price: 80,  stat: 'speed',   bonus: 2 },
  { id: 'weight', name: 'Гантели',       price: 80,  stat: 'power',   bonus: 2 },
  { id: 'bottle', name: 'Фляга',         price: 80,  stat: 'stamina', bonus: 2 },
  { id: 'cape',   name: 'Плащ чемпиона', price: 250, stat: 'speed',   bonus: 3 }
]

// Локации = трассы. rivals — соперники со своими характеристиками.
var LOCATIONS = [
  { id: 'yard',    name: 'Двор',       price: 0,    length: 120,
    rivals: [{ name: 'Кряк', speed: 3, power: 2, stamina: 3 }, { name: 'Пушок', speed: 2, power: 3, stamina: 2 }] },
  { id: 'park',    name: 'Парк',       price: 200,  length: 180,
    rivals: [{ name: 'Шустрик', speed: 5, power: 4, stamina: 4 }, { name: 'Ватрушка', speed: 4, power: 5, stamina: 4 }] },
  { id: 'farm',    name: 'Ферма',      price: 350,  length: 220,
    rivals: [{ name: 'Кудах', speed: 5, power: 6, stamina: 5 }, { name: 'Хрюня', speed: 6, power: 5, stamina: 5 }] },
  { id: 'river',   name: 'Набережная', price: 500,  length: 260,
    rivals: [{ name: 'Торпедо', speed: 7, power: 5, stamina: 6 }, { name: 'Турбинка', speed: 6, power: 6, stamina: 6 }] },
  { id: 'desert',  name: 'Пустыня',    price: 800,  length: 300,
    rivals: [{ name: 'Кактус', speed: 7, power: 7, stamina: 8 }, { name: 'Бархан', speed: 8, power: 6, stamina: 7 }] },
  { id: 'stadium', name: 'Стадион',    price: 1200, length: 360,
    rivals: [{ name: 'Молния', speed: 9, power: 7, stamina: 8 }, { name: 'Ракета', speed: 8, power: 8, stamina: 8 }] }
]

var CAT_LIST = { duck: DUCKS, item: ITEMS, loc: LOCATIONS }

var TRAIN_TIME = 6
var TRAIN_TARGET = 70
var RACE_BOOST_GAIN = 14
var RACE_TICK_SPEED = 2.1
var FEED_TIME = 8          // секунд на кормление
var FEED_FALL_SPEED = 95   // px/с падения корма
var FEED_INTERVAL = 0.85   // с между кусками корма

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }
function find(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return list[0]
}

function defaultSave() {
  return {
    coins: 0,
    owned: { duck: ['plain'], item: [], loc: ['yard'] },
    eq: { duck: 'plain', loc: 'yard' },
    duck: { speed: 1, power: 1, stamina: 1, hunger: HUNGER_MAX },
    lastSeen: 0, // timestamp мс — для расчёта голода по реальному времени; 0 = не считать
    stats: { races: 0, wins: 0, feeds: 0 }
  }
}

function mergeSave(s) {
  var d = defaultSave()
  if (!s || typeof s !== 'object') return d
  if (typeof s.coins === 'number' && s.coins >= 0 && isFinite(s.coins)) d.coins = Math.floor(s.coins)

  var cats = ['duck', 'item', 'loc']
  for (var i = 0; i < cats.length; i++) {
    var c = cats[i]
    var valid = CAT_LIST[c].map(function (x) { return x.id })
    if (s.owned && Array.isArray(s.owned[c])) {
      d.owned[c] = s.owned[c].filter(function (id) { return valid.indexOf(id) >= 0 })
    }
    if (c !== 'item' && d.owned[c].length === 0) d.owned[c] = [valid[0]]
    if (c === 'duck' || c === 'loc') {
      if (s.eq && d.owned[c].indexOf(s.eq[c]) >= 0) d.eq[c] = s.eq[c]
      else d.eq[c] = d.owned[c][0]
    }
  }

  if (s.duck && typeof s.duck === 'object') {
    var cap = find(DUCKS, d.eq.duck).statCap
    ;['speed', 'power', 'stamina'].forEach(function (k) {
      var v = s.duck[k]
      if (typeof v === 'number' && isFinite(v)) d.duck[k] = clamp(Math.round(v), STAT_MIN, cap)
    })
    if (typeof s.duck.hunger === 'number' && isFinite(s.duck.hunger)) {
      d.duck.hunger = clamp(s.duck.hunger, 0, HUNGER_MAX)
    }
  }
  if (typeof s.lastSeen === 'number' && s.lastSeen >= 0) d.lastSeen = s.lastSeen

  if (s.stats && typeof s.stats === 'object') {
    ;['races', 'wins', 'feeds'].forEach(function (k) {
      if (typeof s.stats[k] === 'number' && s.stats[k] >= 0) d.stats[k] = Math.floor(s.stats[k])
    })
  }
  return d
}

// Голод падает в реальном времени, пока приложение не открыто. Вызывать при входе.
function applyHungerDecay(save, nowMs) {
  if (!save.lastSeen) { save.lastSeen = nowMs; return 0 }
  var dt = Math.max(0, nowMs - save.lastSeen)
  var drop = Math.round(dt * HUNGER_DECAY_PER_MS)
  if (drop > 0) save.duck.hunger = clamp(save.duck.hunger - drop, 0, HUNGER_MAX)
  save.lastSeen = nowMs
  return drop
}

function shopItems(save, cat) {
  return CAT_LIST[cat].map(function (it) {
    return {
      cat: cat,
      id: it.id,
      name: it.name,
      price: it.price,
      owned: cat === 'item' ? save.owned.item.indexOf(it.id) >= 0 : save.owned[cat].indexOf(it.id) >= 0,
      equipped: cat !== 'item' && save.eq[cat] === it.id
    }
  })
}

function buy(save, cat, id) {
  var item = find(CAT_LIST[cat], id)
  if (cat === 'item') {
    if (save.owned.item.indexOf(item.id) >= 0) return 'Уже куплено: ' + item.name
    if (save.coins < item.price) return 'Не хватает монет: нужно ' + item.price
    save.coins -= item.price
    save.owned.item.push(item.id)
    return 'Куплено: ' + item.name
  }
  if (save.owned[cat].indexOf(item.id) >= 0) {
    save.eq[cat] = item.id
    if (cat === 'duck') {
      var cap = item.statCap
      save.duck.speed = clamp(save.duck.speed, STAT_MIN, cap)
      save.duck.power = clamp(save.duck.power, STAT_MIN, cap)
      save.duck.stamina = clamp(save.duck.stamina, STAT_MIN, cap)
    }
    return 'Выбрано: ' + item.name
  }
  if (save.coins < item.price) return 'Не хватает монет: нужно ' + item.price
  save.coins -= item.price
  save.owned[cat].push(item.id)
  save.eq[cat] = item.id
  return 'Куплено: ' + item.name
}

function effectiveStat(save, key) {
  var v = save.duck[key]
  save.owned.item.forEach(function (id) {
    var it = find(ITEMS, id)
    if (it.stat === key) v += it.bonus
  })
  return v
}

function gear(save) {
  return { duck: find(DUCKS, save.eq.duck), loc: find(LOCATIONS, save.eq.loc) }
}

// ---------- Кормление ----------
// Корм падает сверху, игрок двигает корзину коронкой и ловит. Каждый пойманный кусок
// восстанавливает голод; редкий золотой корм даёт +1 к случайной характеристике.

function startFeeding(rnd) {
  return {
    mode: 'feed',
    time: 0,
    rnd: rnd || Math.random,
    basket: 50,     // 0..100, позиция корзины
    items: [],       // { x, y, golden }
    spawnT: 0,
    caught: 0,
    goldenCaught: 0,
    done: false
  }
}

function feedCrown(f, d) {
  if (f.done) return
  f.basket = clamp(f.basket + d * 0.25, 5, 95)
}

function feedStep(f, dt) {
  if (f.done) return
  f.time += dt
  f.spawnT += dt
  if (f.spawnT >= FEED_INTERVAL) {
    f.spawnT = 0
    f.items.push({ x: 10 + f.rnd() * 80, y: 0, golden: f.rnd() < 0.15 })
  }
  var basketW = 16
  f.items = f.items.filter(function (it) {
    it.y += FEED_FALL_SPEED * dt
    if (it.y >= 92 && it.y <= 100) {
      if (Math.abs(it.x - f.basket) <= basketW) {
        f.caught++
        if (it.golden) f.goldenCaught++
        return false
      }
    }
    return it.y < 105
  })
  if (f.time >= FEED_TIME) f.done = true
}

function applyFeeding(save, f) {
  if (!f.done) return { hunger: 0, stat: null }
  var hungerGain = Math.min(HUNGER_MAX - save.duck.hunger, f.caught * 8)
  save.duck.hunger = clamp(save.duck.hunger + f.caught * 8, 0, HUNGER_MAX)
  save.stats.feeds += 1
  var statGain = null
  if (f.goldenCaught > 0) {
    var keys = ['speed', 'power', 'stamina']
    var key = keys[Math.floor((f.rnd ? f.rnd() : Math.random()) * keys.length)]
    var cap = find(DUCKS, save.eq.duck).statCap
    var before = save.duck[key]
    save.duck[key] = clamp(before + f.goldenCaught, STAT_MIN, cap)
    if (save.duck[key] > before) statGain = { key: key, amount: save.duck[key] - before }
  }
  return { hunger: hungerGain, stat: statGain }
}

// ---------- Тренировка ----------

function startTraining(rnd, kind) {
  return {
    mode: 'train', kind: kind, time: 0, effort: 0,
    needle: 50, target: 50, targetW: 22, vel: 0,
    rnd: rnd || Math.random, done: false, gain: 0
  }
}

function canTrain(save) { return save.duck.hunger >= HUNGER_TRAIN_MIN }

function trainCrown(t, d) {
  if (t.done) return
  t.vel += d * 0.35
}

function trainStep(t, dt) {
  if (t.done) return
  t.time += dt
  t.vel *= 0.9
  t.needle = clamp(t.needle + t.vel * dt * 10, 0, 100)
  t.targetTimer = (t.targetTimer || 0) + dt
  if (t.targetTimer > 1.1) {
    t.targetTimer = 0
    t.target = clamp(t.target + (t.rnd() - 0.5) * 50, 15, 85)
  }
  if (Math.abs(t.needle - t.target) <= t.targetW / 2) t.effort += dt * 100 / TRAIN_TIME
  if (t.time >= TRAIN_TIME) {
    t.done = true
    var pct = clamp(t.effort / TRAIN_TARGET, 0, 1.6)
    t.gain = pct >= 1.3 ? 2 : (pct >= 0.5 ? 1 : 0)
  }
}

function applyTraining(save, t) {
  if (!t.done || t.gain <= 0) return 0
  var cap = find(DUCKS, save.eq.duck).statCap
  var before = save.duck[t.kind]
  save.duck[t.kind] = clamp(before + t.gain, STAT_MIN, cap)
  save.duck.hunger = clamp(save.duck.hunger - 8, 0, HUNGER_MAX) // тренировка тратит силы
  return save.duck[t.kind] - before
}

// ---------- Забег ----------

function startRace(rnd, save) {
  var g = gear(save)
  var speed = effectiveStat(save, 'speed')
  var power = effectiveStat(save, 'power')
  var stamina = effectiveStat(save, 'stamina')
  // голодная утка бежит слабее
  var hungerFactor = save.duck.hunger < HUNGER_TRAIN_MIN ? 0.7 : 1
  var runners = [{ name: 'Вы', isPlayer: true, speed: speed * hungerFactor, power: power, stamina: stamina, pos: 0, fatigue: 0, boostT: 0 }]
  g.loc.rivals.forEach(function (r) {
    runners.push({ name: r.name, isPlayer: false, speed: r.speed, power: r.power, stamina: r.stamina, pos: 0, fatigue: 0, boostT: 0 })
  })
  return { mode: 'race', rnd: rnd || Math.random, length: g.loc.length, runners: runners, time: 0, lastBoost: -10, finished: false, rank: 0 }
}

function raceBoost(r) {
  var player = r.runners[0]
  var gap = r.time - r.lastBoost
  var power = Math.max(1, player.power)
  var cost = gap < 0.6 ? 10 : 5
  if (player.fatigue + cost > 100) return
  var factor = gap < 0.6 ? 0.3 : 1
  player.boostT = 0.5
  player.fatigue = clamp(player.fatigue + cost, 0, 100)
  player.pos += (RACE_BOOST_GAIN * (power / 10)) * factor
  r.lastBoost = r.time
}

function raceStep(r, dt) {
  if (r.finished) return
  r.time += dt
  r.runners.forEach(function (run) {
    var fatiguePenalty = 1 - run.fatigue / 220
    var base = run.speed * RACE_TICK_SPEED * fatiguePenalty
    if (run.boostT > 0) run.boostT -= dt
    if (!run.isPlayer) {
      run.aiT = (run.aiT || 0) + dt
      if (run.aiT > 1.4 - run.stamina * 0.05) { run.aiT = 0; run.pos += run.power * 0.9 }
      run.fatigue = clamp(run.fatigue + dt * (8 - run.stamina * 0.4), 0, 100)
    } else {
      run.fatigue = clamp(run.fatigue - dt * (2 + run.stamina * 0.3), 0, 100)
    }
    run.pos += base * dt
  })
  if (r.runners.some(function (run) { return run.pos >= r.length })) {
    r.finished = true
    var order = r.runners.slice().sort(function (a, b) { return b.pos - a.pos })
    r.rank = order.indexOf(r.runners[0]) + 1
  }
}

function finishRewards(save, r, locId) {
  var loc = find(LOCATIONS, locId)
  var base = Math.round(loc.length / 4)
  var mult = r.rank === 1 ? 2 : (r.rank === 2 ? 1 : (r.rank === 3 ? 0.5 : 0.2))
  var coins = Math.max(1, Math.round(base * mult))
  save.coins += coins
  save.stats.races += 1
  if (r.rank === 1) save.stats.wins += 1
  save.duck.hunger = clamp(save.duck.hunger - 12, 0, HUNGER_MAX) // забег тоже тратит силы
  return coins
}

export default {
  STAT_MIN: STAT_MIN, STAT_MAX: STAT_MAX, HUNGER_MAX: HUNGER_MAX, HUNGER_TRAIN_MIN: HUNGER_TRAIN_MIN,
  DUCKS: DUCKS, ITEMS: ITEMS, LOCATIONS: LOCATIONS,
  TRAIN_TIME: TRAIN_TIME, FEED_TIME: FEED_TIME,
  defaultSave: defaultSave, mergeSave: mergeSave, applyHungerDecay: applyHungerDecay,
  shopItems: shopItems, buy: buy, gear: gear, effectiveStat: effectiveStat,
  startFeeding: startFeeding, feedCrown: feedCrown, feedStep: feedStep, applyFeeding: applyFeeding,
  startTraining: startTraining, canTrain: canTrain, trainCrown: trainCrown, trainStep: trainStep, applyTraining: applyTraining,
  startRace: startRace, raceBoost: raceBoost, raceStep: raceStep, finishRewards: finishRewards
}
