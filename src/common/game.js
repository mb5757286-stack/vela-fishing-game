// Логика игры "Рыбалка" — чистый JS без обращения к системным API,
// поэтому её можно прогнать симуляцией в Node (см. test/sim.js).

var TRACK = 300        // высота поля вываживания, px
var FISH_H = 34        // высота маркера рыбы, px
var GAIN = 0.8         // чувствительность коронки в бою: px зоны на 1 px прокрутки
var POWER_GAIN = 0.12  // чувствительность коронки при выборе дальности
var BITE_WINDOW = 1.4  // сколько секунд даётся на подсечку
var HOOK_THRESHOLD = 20 // сколько "прокрутки" коронкой считается подсечкой
var FIGHT_LIMIT = 28   // максимум секунд на вываживание

// near/far — вес шанса при ближнем/дальнем забросе
var FISH = [
  { id: 'bleak',   name: 'Уклейка', min: 0.03, max: 0.12, pts: 10,  speed: 70,  zone: 120, near: 30, far: 4 },
  { id: 'roach',   name: 'Плотва',  min: 0.10, max: 0.60, pts: 20,  speed: 85,  zone: 110, near: 28, far: 10 },
  { id: 'perch',   name: 'Окунь',   min: 0.15, max: 1.20, pts: 30,  speed: 105, zone: 100, near: 20, far: 16 },
  { id: 'crucian', name: 'Карась',  min: 0.30, max: 1.80, pts: 40,  speed: 95,  zone: 95, near: 14, far: 18 },
  { id: 'bream',   name: 'Лещ',     min: 0.50, max: 3.50, pts: 60,  speed: 120, zone: 88, near: 6,  far: 18 },
  { id: 'pike',    name: 'Щука',    min: 1.00, max: 9.00, pts: 100, speed: 170, zone: 78, near: 2,  far: 18 },
  { id: 'catfish', name: 'Сом',     min: 5.00, max: 40.0, pts: 200, speed: 210, zone: 74,  near: 0,  far: 8 },
  { id: 'boot',    name: 'Старый сапог', min: 0.4, max: 0.8, pts: 1, junk: true,           near: 4,  far: 2 }
]

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }
function round2(v) { return Math.round(v * 100) / 100 }

function create(rnd) {
  return {
    rnd: rnd || Math.random,
    state: 'idle',      // idle | casting | wait | bite | fight | result
    timer: 0,
    phase: 0,
    power: 50,          // дальность заброса 0..100
    bobY: 40,
    fish: null,
    weight: 0,
    hookAcc: 0,
    zoneY: 0, zoneH: 120,
    fishY: 0, target: 0, retarget: 0,
    progress: 30, fightTime: 0, inside: false,
    score: 0, best: 0, bestName: '', caught: 0, lost: 0,
    won: false, title: '', line: '', gain: 0,
    events: [],         // 'bite' | 'hook' | 'win' | 'lose' — страница превращает их в вибрацию
    dirty: false        // true — нужно сохранить прогресс
  }
}

function pickFish(g) {
  var p = g.power / 100
  var total = 0
  var i, w
  var ws = []
  for (i = 0; i < FISH.length; i++) {
    w = FISH[i].near * (1 - p) + FISH[i].far * p
    ws.push(w)
    total += w
  }
  var r = g.rnd() * total
  for (i = 0; i < FISH.length; i++) {
    r -= ws[i]
    if (r <= 0) return FISH[i]
  }
  return FISH[0]
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
  }
}

function crown(g, d) {
  if (g.state === 'idle') {
    g.power = clamp(g.power + d * POWER_GAIN, 0, 100)
  } else if (g.state === 'bite') {
    g.hookAcc += Math.abs(d)
    if (g.hookAcc >= HOOK_THRESHOLD) hook(g)
  } else if (g.state === 'fight') {
    g.zoneY = clamp(g.zoneY + d * GAIN, 0, TRACK - g.zoneH)
  }
}

function hook(g) {
  g.events.push('hook')
  var f = g.fish
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
  g.state = 'result'
  g.won = win
  g.title = title
  g.line = line
  g.gain = 0
  if (win) {
    var f = g.fish
    g.gain = f.pts + Math.round(g.weight * 10)
    g.score += g.gain
    g.caught += 1
    if (!f.junk && g.weight > g.best) {
      g.best = g.weight
      g.bestName = f.name
    }
    g.events.push('win')
  } else {
    g.lost += 1
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
      g.fish = pickFish(g)
      var f = g.fish
      g.weight = round2(f.min + (f.max - f.min) * g.rnd() * g.rnd())
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
    if (g.timer <= 0) {
      finish(g, false, 'Сорвалась', 'Не успел подсечь')
    }
  } else if (s === 'fight') {
    fightStep(g, dt)
  }
}

function fightStep(g, dt) {
  var f = g.fish
  g.fightTime += dt

  var frac = (g.weight - f.min) / (f.max - f.min)
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

  var drain = 20 + f.speed / 10
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
  TRACK: TRACK,
  FISH_H: FISH_H,
  FISH: FISH,
  create: create,
  tap: tap,
  crown: crown,
  step: step,
  powerLabel: powerLabel
}
