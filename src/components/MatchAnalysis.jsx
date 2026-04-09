import React from 'react'

function parseItem(str) {
  // Parse "Requirement (-Xpts) — Evidence" format
  const ptsMatch = str.match(/\((-?\d+)pts?\)/)
  const points = ptsMatch ? parseInt(ptsMatch[1]) : null
  // Split on " — " to get requirement and evidence
  const dashIdx = str.indexOf(' — ')
  if (dashIdx > -1) {
    let req = str.slice(0, dashIdx)
    if (ptsMatch) req = req.replace(/\s*\(-?\d+pts?\)/, '')
    return { requirement: req.trim(), evidence: str.slice(dashIdx + 3).trim(), points }
  }
  return { requirement: str, evidence: '', points }
}

export default function MatchAnalysis({ job }) {
  const met = (job.requirements_met || []).map(parseItem)
  const partial = (job.requirements_partial || []).map(parseItem)
  const unmet = (job.requirements_unmet || []).map(parseItem)
  const total = met.length + partial.length + unmet.length

  if (total === 0) return null

  const totalDeducted = [...partial, ...unmet].reduce((sum, r) => sum + Math.abs(r.points || 0), 0)

  return (
    <div className="match-analysis">
      <h4>Requirements Analysis</h4>

      {job.match_score != null && (
        <div className="score-explanation">
          <span className="score-formula">100 - {totalDeducted} pts = </span>
          <span className={`score-result ${job.match_score >= 70 ? 'high' : job.match_score >= 40 ? 'mid' : 'low'}`}>
            {job.match_score}%
          </span>
        </div>
      )}

      <div className="match-bar">
        <div className="match-segment met" style={{ width: `${(met.length / total) * 100}%` }} />
        <div className="match-segment partial" style={{ width: `${(partial.length / total) * 100}%` }} />
        <div className="match-segment unmet" style={{ width: `${(unmet.length / total) * 100}%` }} />
      </div>
      <div className="match-legend">
        <span className="legend-item"><span className="dot met" /> Meet ({met.length})</span>
        <span className="legend-item"><span className="dot partial" /> Partial ({partial.length})</span>
        <span className="legend-item"><span className="dot unmet" /> Gap ({unmet.length})</span>
      </div>

      {met.length > 0 && (
        <div className="req-section">
          <h5 className="req-title met">Requirements You Meet</h5>
          <ul>
            {met.map((r, i) => (
              <li key={i} className="req-item">
                <div className="req-item-header">
                  <span className="req-item-name">{r.requirement}</span>
                  <span className="req-item-pts met-pts">+0</span>
                </div>
                {r.evidence && <span className="req-item-evidence">{r.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {partial.length > 0 && (
        <div className="req-section">
          <h5 className="req-title partial">Partially Meet</h5>
          <ul>
            {partial.map((r, i) => (
              <li key={i} className="req-item">
                <div className="req-item-header">
                  <span className="req-item-name">{r.requirement}</span>
                  {r.points != null && <span className="req-item-pts partial-pts">{r.points}pts</span>}
                </div>
                {r.evidence && <span className="req-item-evidence">{r.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unmet.length > 0 && (
        <div className="req-section">
          <h5 className="req-title unmet">Gaps to Address</h5>
          <ul>
            {unmet.map((r, i) => (
              <li key={i} className="req-item">
                <div className="req-item-header">
                  <span className="req-item-name">{r.requirement}</span>
                  {r.points != null && <span className="req-item-pts unmet-pts">{r.points}pts</span>}
                </div>
                {r.evidence && <span className="req-item-evidence">{r.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
