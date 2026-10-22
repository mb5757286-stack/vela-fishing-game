// Геометрия запретных зон. Чистый JS, без системных API.
// Зона: { name, type: 'poly', pts: [[lat, lon], ...] } или { name, type: 'circle', c: [lat, lon], r: метры }

function distanceM(lat1, lon1, lat2, lon2) {
  var R = 6371000
  var toRad = Math.PI / 180
  var dLat = (lat2 - lat1) * toRad
  var dLon = (lon2 - lon1) * toRad
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Луч вправо: сколько раз пересекли границу многоугольника
function inPolygon(lat, lon, pts) {
  var inside = false
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var yi = pts[i][0], xi = pts[i][1]
    var yj = pts[j][0], xj = pts[j][1]
    var cross = (yi > lat) !== (yj > lat) &&
      lon < (xj - xi) * (lat - yi) / (yj - yi) + xi
    if (cross) inside = !inside
  }
  return inside
}

function inZone(lat, lon, z) {
  if (!z) return false
  if (z.type === 'circle') return distanceM(lat, lon, z.c[0], z.c[1]) <= z.r
  if (z.type === 'poly' && z.pts && z.pts.length >= 3) return inPolygon(lat, lon, z.pts)
  return false
}

export default { distanceM: distanceM, inPolygon: inPolygon, inZone: inZone }
