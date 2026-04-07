import React from 'react'

export default function MatchAnalysis({ job }) {
  const met = job.requirements_met || []
  const partial = job.requirements_partial || []
  const unmet = job.requirements_unmet || []
  const total = met.length + partial.length + unmet.length

  if (total === 0) return null

  return (
    <div className="match-analysis">
      <h4>Requirements Analysis</h4>

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
          <ul>{met.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}

      {partial.length > 0 && (
        <div className="req-section">
          <h5 className="req-title partial">Partially Meet</h5>
          <ul>{partial.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}

      {unmet.length > 0 && (
        <div className="req-section">
          <h5 className="req-title unmet">Gaps to Address</h5>
          <ul>{unmet.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
