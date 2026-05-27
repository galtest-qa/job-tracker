import React, { useState, useEffect } from 'react'
import { api } from '../api.js'

const WEIGHT_LABEL = { critical: 'Critical', important: 'Important', nice_to_have: 'Nice to have' }
const STATUS_OPTIONS = [
  { key: 'met',     label: 'Meets',   pts: 0 },
  { key: 'partial', label: 'Partial'         },
  { key: 'unmet',   label: 'Gap'             },
]

function computeScore(breakdown, overrides) {
  let total = 0
  for (let i = 0; i < breakdown.length; i++) {
    const item = breakdown[i]
    const status = overrides[i] ?? item.status
    if (status === 'met') continue
    // Use original points_deducted — scale for partial vs unmet
    const origPts = Number(item.points_deducted) || 0
    if (status === item.status) {
      total += origPts
    } else if (status === 'partial' && item.status === 'unmet') {
      // User upgraded unmet → partial: use ~half the original deduction
      total += Math.round(origPts * 0.5)
    } else if (status === 'unmet' && item.status === 'partial') {
      // User downgraded partial → unmet: double the original deduction
      total += Math.min(origPts * 2, item.weight === 'critical' ? 25 : item.weight === 'important' ? 12 : 5)
    }
    // met override → 0 deduction (already handled by continue above)
  }
  return Math.max(0, 100 - total)
}

export default function MatchAnalysis({ job, onScoreUpdate }) {
  const breakdown = job.score_breakdown || []
  const [overrides, setOverrides] = useState(job.score_breakdown_overrides || {})
  const [saving, setSaving] = useState(false)

  // Reset overrides when job is re-analyzed
  useEffect(() => {
    setOverrides(job.score_breakdown_overrides || {})
  }, [job.id, job.score_breakdown])

  // Fall back to legacy string arrays if no score_breakdown stored
  const hasStructured = breakdown.length > 0

  if (!hasStructured) return <LegacyMatchAnalysis job={job} />

  const effectiveScore = computeScore(breakdown, overrides)
  const totalDeducted = 100 - effectiveScore
  const overrideCount = Object.keys(overrides).length

  const handleOverride = async (idx, newStatus) => {
    const item = breakdown[idx]
    const current = overrides[idx] ?? item.status

    // Toggle off if clicking current
    let next = { ...overrides }
    if (current === newStatus) {
      delete next[idx]
    } else {
      next[idx] = newStatus
    }
    setOverrides(next)
    setSaving(true)
    await api.updateJob(job.id, { score_breakdown_overrides: next })
    setSaving(false)
    if (onScoreUpdate) onScoreUpdate(computeScore(breakdown, next))
  }

  const handleReset = async (idx) => {
    const next = { ...overrides }
    delete next[idx]
    setOverrides(next)
    await api.updateJob(job.id, { score_breakdown_overrides: next })
    if (onScoreUpdate) onScoreUpdate(computeScore(breakdown, next))
  }

  const handleResetAll = async () => {
    setOverrides({})
    await api.updateJob(job.id, { score_breakdown_overrides: {} })
    if (onScoreUpdate) onScoreUpdate(computeScore(breakdown, {}))
  }

  const met     = breakdown.filter((r, i) => (overrides[i] ?? r.status) === 'met')
  const partial = breakdown.filter((r, i) => (overrides[i] ?? r.status) === 'partial')
  const unmet   = breakdown.filter((r, i) => (overrides[i] ?? r.status) === 'unmet')
  const total   = breakdown.length

  return (
    <div className="match-analysis">
      <div className="match-analysis-header">
        <h4>Requirements Analysis</h4>
        {overrideCount > 0 && (
          <div className="override-summary">
            <span className="override-badge">{overrideCount} edited</span>
            <button className="override-reset-all" onClick={handleResetAll}>Reset all</button>
            {saving && <span className="override-saving">Saving…</span>}
          </div>
        )}
      </div>

      <div className="score-explanation">
        <span className="score-formula">100 − {totalDeducted} pts = </span>
        <span className={`score-result ${effectiveScore >= 70 ? 'high' : effectiveScore >= 40 ? 'mid' : 'low'}`}>
          {effectiveScore}%
        </span>
        {overrideCount > 0 && <span className="score-adjusted-tag">adjusted</span>}
      </div>

      <div className="match-bar">
        <div className="match-segment met"     style={{ width: `${(met.length / total) * 100}%` }} />
        <div className="match-segment partial" style={{ width: `${(partial.length / total) * 100}%` }} />
        <div className="match-segment unmet"   style={{ width: `${(unmet.length / total) * 100}%` }} />
      </div>
      <div className="match-legend">
        <span className="legend-item"><span className="dot met" /> Meets ({met.length})</span>
        <span className="legend-item"><span className="dot partial" /> Partial ({partial.length})</span>
        <span className="legend-item"><span className="dot unmet" /> Gap ({unmet.length})</span>
      </div>

      <div className="req-list">
        {[...breakdown]
          .map((item, idx) => ({ item, idx }))
          .sort((a, b) => {
            const order = { met: 0, partial: 1, unmet: 2 }
            const statusA = overrides[a.idx] ?? a.item.status
            const statusB = overrides[b.idx] ?? b.item.status
            return (order[statusA] ?? 1) - (order[statusB] ?? 1)
          })
          .map(({ item, idx }) => {
          const aiStatus   = item.status
          const userStatus = overrides[idx]
          const current    = userStatus ?? aiStatus
          const isEdited   = userStatus !== undefined && userStatus !== aiStatus

          return (
            <div key={idx} className={`req-row req-row-${current} ${isEdited ? 'req-row-edited' : ''}`}>
              <div className="req-row-top">
                <div className="req-row-meta">
                  <span className={`req-weight req-weight-${item.weight}`}>{WEIGHT_LABEL[item.weight]}</span>
                  <span className="req-name">{item.requirement}</span>
                  {isEdited && (
                    <span className="req-edited-tag" title={`AI said: ${aiStatus}`}>
                      ✏ edited
                      <button className="req-reset-btn" onClick={() => handleReset(idx)}>↩ reset</button>
                    </span>
                  )}
                </div>

                <div className="req-toggle">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      className={`req-toggle-btn req-toggle-${opt.key} ${current === opt.key ? 'active' : ''}`}
                      onClick={() => handleOverride(idx, opt.key)}
                      title={aiStatus === opt.key ? `AI: ${opt.label}` : opt.label}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {item.evidence && (
                <p className="req-evidence">{item.evidence}</p>
              )}

              {current !== 'met' && (
                <span className={`req-pts req-pts-${current}`}>
                  −{current === item.status
                    ? item.points_deducted
                    : current === 'partial' && item.status === 'unmet'
                    ? Math.round(item.points_deducted * 0.5)
                    : Math.min(item.points_deducted * 2, item.weight === 'critical' ? 25 : item.weight === 'important' ? 12 : 5)
                  } pts
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Fallback for jobs analyzed before score_breakdown was stored
function LegacyMatchAnalysis({ job }) {
  function parseItem(str) {
    const ptsMatch = str.match(/\((-?\d+)pts?\)/)
    const points = ptsMatch ? parseInt(ptsMatch[1]) : null
    const dashIdx = str.indexOf(' — ')
    if (dashIdx > -1) {
      let req = str.slice(0, dashIdx)
      if (ptsMatch) req = req.replace(/\s*\(-?\d+pts?\)/, '')
      return { requirement: req.trim(), evidence: str.slice(dashIdx + 3).trim(), points }
    }
    return { requirement: str, evidence: '', points }
  }

  const met     = (job.requirements_met || []).map(parseItem)
  const partial = (job.requirements_partial || []).map(parseItem)
  const unmet   = (job.requirements_unmet || []).map(parseItem)
  const total   = met.length + partial.length + unmet.length
  if (total === 0) return null

  const totalDeducted = [...partial, ...unmet].reduce((s, r) => s + Math.abs(r.points || 0), 0)

  return (
    <div className="match-analysis">
      <div className="match-analysis-header">
        <h4>Requirements Analysis</h4>
        <span className="legacy-tag">Re-analyze to enable editing</span>
      </div>
      {job.match_score != null && (
        <div className="score-explanation">
          <span className="score-formula">100 − {totalDeducted} pts = </span>
          <span className={`score-result ${job.match_score >= 70 ? 'high' : job.match_score >= 40 ? 'mid' : 'low'}`}>{job.match_score}%</span>
        </div>
      )}
      <div className="match-bar">
        <div className="match-segment met"     style={{ width: `${(met.length / total) * 100}%` }} />
        <div className="match-segment partial" style={{ width: `${(partial.length / total) * 100}%` }} />
        <div className="match-segment unmet"   style={{ width: `${(unmet.length / total) * 100}%` }} />
      </div>
      <div className="match-legend">
        <span className="legend-item"><span className="dot met" />Meets ({met.length})</span>
        <span className="legend-item"><span className="dot partial" />Partial ({partial.length})</span>
        <span className="legend-item"><span className="dot unmet" />Gap ({unmet.length})</span>
      </div>
      {[['met', 'Requirements You Meet', met], ['partial', 'Partially Meet', partial], ['unmet', 'Gaps to Address', unmet]].map(([key, label, items]) =>
        items.length > 0 && (
          <div key={key} className="req-section">
            <h5 className={`req-title ${key}`}>{label}</h5>
            <ul>{items.map((r, i) => (
              <li key={i} className="req-item">
                <div className="req-item-header">
                  <span className="req-item-name">{r.requirement}</span>
                  {r.points != null && key !== 'met' && <span className={`req-item-pts ${key}-pts`}>{r.points}pts</span>}
                </div>
                {r.evidence && <span className="req-item-evidence">{r.evidence}</span>}
              </li>
            ))}</ul>
          </div>
        )
      )}
    </div>
  )
}
