function todayKey() {
  return `wins_${new Date().toISOString().slice(0, 10)}`
}

export function trackWin(type, data = {}) {
  try {
    const key = todayKey()
    const wins = JSON.parse(localStorage.getItem(key) || '[]')
    wins.push({ type, ...data, ts: Date.now() })
    localStorage.setItem(key, JSON.stringify(wins))
  } catch {}
}

export function getWinsForPeriod(days = 1) {
  try {
    const wins = []
    for (let i = 0; i < days; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = `wins_${d.toISOString().slice(0, 10)}`
      wins.push(...JSON.parse(localStorage.getItem(key) || '[]'))
    }
    return wins
  } catch { return [] }
}
