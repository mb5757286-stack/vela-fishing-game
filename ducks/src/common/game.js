// Логика «Утиных гонок». Чистый JS без системных API — проверяется в Node (test/sim.js).
// Утка качает три характеристики тренировками на коронке, потом бежит забеги против соперников.

var STAT_MIN = 1
var STAT_MAX = 10

// Утки в магазине: statCap — предел характеристик для этой утки, price — цена.
var DUCKS = [
  { id: 'plain',  name: 'Обычная утка',  price: 0,    statCap: 10, color: '#f4c542' },
  { id: 'racer',  name: 'Гоночная утка', price: 300,  statCap: 13, color: '#4fd1ff' },
  { id: 'golden', name: 'Золотая утка',  price: 900,  statCap: 16, color: '#ffd166' }
]

// Аксессуары: постоянный бонус к характеристике (складывается с базовым значением утки).
var ITEMS = [
  { id: 'shoes',  name: 'Кроссовки',  price: 80,  stat: 'speed',   bonus: 2 },
  { id: 'weight', name: 'Гантели',    price: 80,  stat: 'power',   bonus: 2 },
  { id: 'bottle', name: 'Фляга',      price: 80,  stat: 'stamina', bonus: 2 },
  { id: 'cape',   name: 'Плащ чемпиона', price: 250, stat: 'speed', bonus: 3 }
]

// Трассы: length — дистанция (условные метры), rivals — соперники со своими характеристиками.
var TRACKS = [
  { id: 'yard',   name: 'Двор',        price: 0,    length: 120,
    rivals: [{ name: 'Кряк', speed: 3, power: 2, stamina: 3 }, { name: 'Пушок', speed: 2, power: 3, stamina: 2 }] },
  { id: 'park',   name: 'Парк',        price: 200,  length: 180,
    rivals: [{ name: 'Шустрик', speed: 5, power: 4, stamina: 4 }, { name: 'Ватрушка', speed: 4, power: 5, stamina: 4 }] },
  { id: 'river',  name: 'Набережная',  price: 500,  length: 260,
    rivals: [{ name: 'Торпедо', speed: 7, power: 5, stamina: 6 }, { name: 'Турбинка', speed: 6, power: 6, stamina: 6 }] },
  { id: 'stadium', name: 'Стадион',    price: 1200, length: 360,
    rivals: [{ name: 'Молния', speed: 9, power: 7, stamina: 8 }, { name: 'Ракета', speed: 8, power: 8, stamina: 8 }] }
]

var CAT_LIST = { duck: DUCKS, item: ITEMS, track: TRACKS }

var TRAIN_TIME = 6       // секунд на тренировку
var TRAIN_TARGET = 70    // сколько "очков усилия" нужно набрать для хорошего результата
var RACE_BOOST_GAIN = 14 // сколько прибавляет точный буст в забеге
var RACE_TICK_SPEED = 2.1 // базовая скорость за "единицу" speed

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }
function find(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return list[0]
}

function defaultSave() {
  return {
    coins: 0,
    owned: { duck: ['plain'], item: [], track: ['yard'] },
    eq: { duck: 'plain', track: 'yard' },
    duck: { speed: 1, power: 1, stamina: 1 },
    stats: { races: 0, wins: 0, bestTrack: '', bestTime: 0 }
  }
}

function mergeSave(s) {
  var d = defaultSave()
  if (!s || typeof s !== 'object') return d
  if (typeof s.coins === 'number' && s.coins >= 0 && isFinite(s.coins)) d.coins = Math.floor(s.coins)

  var cats = ['duck', 'item', 'track']
  for (var i = 0; i < cats.length; i++) {
    var c = cats[i]
    var valid = CAT_LIST[c].map(function (x) { return x.id })
    if (s.owned && Array.isArray(s.owned[c])) {
      d.owned[c] = s.owned[c].filter(function (id) { return valid.indexOf(id) >= 0 })
    }
    if (c !== 'item' && d.owned[c].length === 0) d.owned[c] = [valid[0]]
    if (c === 'duck' || c === 'track') {
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
  }

  if (s.stats && typeof s.stats === 'object') {
    if (typeof s.stats.races === 'number' && s.stats.races >= 0) d.stats.races = Math.floor(s.stats.races)
    if (typeof s.stats.wins === 'number' && s.stats.wins >= 0) d.stats.wins = Math.floor(s.stats.wins)
    if (TRACKS.some(function (t) { return t.id === s.stats.bestTrack })) d.stats.bestTrack = s.stats.bestTrack
    if (typeof s.stats.bestTime === 'number' && s.stats.bestTime >= 0) d.stats.bestTime = s.stats.bestTime
  }
  return d
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

// Итоговая характеристика с учётом аксессуаров (бонус от предмета суммируется).
function effectiveStat(save, key) {
  var v = save.duck[key]
  save.owned.item.forEach(function (id) {
    var it = find(ITEMS, id)
    if (it.stat === key) v += it.bonus
  })
  return v
}

function gear(save) {
  return { duck: find(DUCKS, save.eq.duck), track: find(TRACKS, save.eq.track) }
}

// ---------- Тренировка ----------
// Коронка крутится rnd-образно: игрок должен держать усилие в "зелёной" полосе.
// Чем точнее — тем больше очков effort накапливается за TRAIN_TIME секунд.

function startTraining(rnd, kind) {
  return {
    mode: 'train',
    kind: kind,            // 'speed' | 'power' | 'stamina'
    time: 0,
    effort: 0,
    needle: 50,            // текущее положение стрелки 0..100
    target: 50,            // целевая зона
    targetW: 22,
    vel: 0,
    rnd: rnd || Math.random,
    done: false,
    gain: 0
  }
}

function trainCrown(t, d) {
  if (t.done) return
  t.vel += d * 0.35
}

function trainStep(t, dt) {
  if (t.done) return
  t.time += dt
  // стрелка плывёт сама + крутится от коронки, с лёгким трением
  t.vel *= 0.9
  t.needle = clamp(t.needle + t.vel * dt * 10, 0, 100)
  // цель раз в ~1.1с сдвигается (имитация "рыскания")
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
  return save.duck[t.kind] - before
}

// ---------- Забег ----------
// Утка и соперники бегут по дистанции. Игрок коронкой/тапом даёт точные "рывки" —
// слишком частые рывки истощают выносливость и снижают эффект.

function startRace(rnd, save) {
  var g = gear(save)
  var speed = effectiveStat(save, 'speed')
  var power = effectiveStat(save, 'power')
  var stamina = effectiveStat(save, 'stamina')
  var runners = [{ name: 'Вы', isPlayer: true, speed: speed, power: power, stamina: stamina, pos: 0, fatigue: 0, boostT: 0 }]
  g.track.rivals.forEach(function (r) {
    runners.push({ name: r.name, isPlayer: false, speed: r.speed, power: r.power, stamina: r.stamina, pos: 0, fatigue: 0, boostT: 0 })
  })
  return {
    mode: 'race',
    rnd: rnd || Math.random,
    length: g.track.length,
    runners: runners,
    time: 0,
    lastBoost: -10,
    finished: false,
    rank: 0,
    events: []
  }
}

// Тап/крик коронки во время забега — рывок. Слишком частые рывки (< 0.6с) почти не дают эффекта
// и быстро расходуют выносливость.
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
    var fatiguePenalty = 1 - run.fatigue / 220 // лёгкий штраф от усталости
    var base = run.speed * RACE_TICK_SPEED * fatiguePenalty
    if (run.boostT > 0) { run.boostT -= dt; base *= 1.0 }
    if (!run.isPlayer) {
      // соперники сами "рвутся" время от времени, ограничены stamina
      run.aiT = (run.aiT || 0) + dt
      if (run.aiT > 1.4 - run.stamina * 0.05) {
        run.aiT = 0
        run.pos += run.power * 0.9
      }
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

function finishRewards(save, r, trackId) {
  var track = find(TRACKS, trackId)
  var base = Math.round(track.length / 4)
  var mult = r.rank === 1 ? 2 : (r.rank === 2 ? 1 : (r.rank === 3 ? 0.5 : 0.2))
  var coins = Math.max(1, Math.round(base * mult))
  save.coins += coins
  save.stats.races += 1
  if (r.rank === 1) save.stats.wins += 1
  if (!save.stats.bestTrack || save.stats.bestTrack === trackId) {
    if (!save.stats.bestTime || r.time < save.stats.bestTime) {
      save.stats.bestTrack = trackId
      save.stats.bestTime = r.time
    }
  } else if (r.rank === 1 && (!save.stats.bestTime || r.time < save.stats.bestTime)) {
    save.stats.bestTrack = trackId
    save.stats.bestTime = r.time
  }
  return coins
}

export default {
  STAT_MIN: STAT_MIN,
  STAT_MAX: STAT_MAX,
  DUCKS: DUCKS,
  ITEMS: ITEMS,
  TRACKS: TRACKS,
  TRAIN_TIME: TRAIN_TIME,
  defaultSave: defaultSave,
  mergeSave: mergeSave,
  shopItems: shopItems,
  buy: buy,
  gear: gear,
  effectiveStat: effectiveStat,
  startTraining: startTraining,
  trainCrown: trainCrown,
  trainStep: trainStep,
  applyTraining: applyTraining,
  startRace: startRace,
  raceBoost: raceBoost,
  raceStep: raceStep,
  finishRewards: finishRewards
}
