import React from 'react'

// Simple line-by-line diff (no external dependencies)
function computeDiff(original, tailored) {
  const origLines = (original || '').split('\n')
  const tailLines = (tailored || '').split('\n')
  const result = []

  // Use a simple LCS-based diff
  const origSet = new Set(origLines.map(l => l.trim()).filter(Boolean))
  const tailSet = new Set(tailLines.map(l => l.trim()).filter(Boolean))

  let oi = 0, ti = 0
  while (oi < origLines.length || ti < tailLines.length) {
    const origLine = oi < origLines.length ? origLines[oi] : null
    const tailLine = ti < tailLines.length ? tailLines[ti] : null

    if (origLine !== null && tailLine !== null && origLine.trim() === tailLine.trim()) {
      // Same line
      result.push({ type: 'same', text: tailLine })
      oi++; ti++
    } else if (tailLine !== null && !origSet.has(tailLine.trim()) && tailLine.trim()) {
      // Added line (in tailored but not in original)
      result.push({ type: 'added', text: tailLine })
      ti++
    } else if (origLine !== null && !tailSet.has(origLine.trim()) && origLine.trim()) {
      // Removed line (in original but not in tailored)
      result.push({ type: 'removed', text: origLine })
      oi++
    } else {
      // Modified or moved — show both
      if (origLine !== null && origLine.trim()) {
        result.push({ type: 'removed', text: origLine })
      }
      if (tailLine !== null && tailLine.trim()) {
        result.push({ type: 'added', text: tailLine })
      }
      if (origLine !== null) oi++
      if (tailLine !== null) ti++
    }
  }

  return result
}

export default function ResumeDiff({ original, tailored }) {
  if (!original || !tailored) return null

  const diff = computeDiff(original, tailored)
  const added = diff.filter(d => d.type === 'added').length
  const removed = diff.filter(d => d.type === 'removed').length

  return (
    <div className="resume-diff">
      <div className="diff-stats">
        <span className="diff-stat diff-added">+{added} added</span>
        <span className="diff-stat diff-removed">-{removed} removed</span>
      </div>
      <div className="diff-content">
        {diff.map((line, i) => (
          <div key={i} className={`diff-line diff-${line.type}`}>
            <span className="diff-marker">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="diff-text">{line.text || '\u00A0'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
