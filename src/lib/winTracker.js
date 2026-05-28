function dateKey(daysAgo = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `wins_${d.toISOString().slice(0, 10)}`
}

export function trackWin(type, data = {}) {
  try {
    const key = dateKey(0)
    const wins = JSON.parse(localStorage.getItem(key) || '[]')
    wins.push({ type, ...data, ts: Date.now() })
    localStorage.setItem(key, JSON.stringify(wins))
  } catch {}
}

export function getWinsForDate(daysAgo = 0) {
  try { return JSON.parse(localStorage.getItem(dateKey(daysAgo)) || '[]') } catch { return [] }
}

export function getWinsForPeriod(days = 1) {
  try {
    const wins = []
    for (let i = 0; i < days; i++) wins.push(...getWinsForDate(i))
    return wins
  } catch { return [] }
}
