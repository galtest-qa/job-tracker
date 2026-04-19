import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react'

const SECTION_PATTERN = /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|LANGUAGES|AWARDS|PROFESSIONAL SUMMARY|WORK EXPERIENCE|TECHNICAL SKILLS|PROFESSIONAL EXPERIENCE|OBJECTIVE|PROFILE)\s*$/i

function splitIntoSections(text) {
  const lines = (text || '').split('\n')
  const sections = []
  let current = { title: 'HEADER', lines: [] }

  for (const line of lines) {
    if (SECTION_PATTERN.test(line.trim())) {
      if (current.lines.length > 0 || current.title !== 'HEADER') sections.push(current)
      current = { title: line.trim().toUpperCase(), lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.lines.length > 0 || current.title !== 'HEADER') sections.push(current)
  return sections
}

function diffWords(oldText, newText) {
  // Simple word-level diff
  const oldWords = oldText.split(/(\s+)/)
  const newWords = newText.split(/(\s+)/)

  if (oldText.trim() === newText.trim()) return [{ type: 'same', text: newText }]

  // Find common prefix
  let prefix = 0
  while (prefix < oldWords.length && prefix < newWords.length && oldWords[prefix] === newWords[prefix]) prefix++

  // Find common suffix
  let suffixO = oldWords.length - 1
  let suffixN = newWords.length - 1
  while (suffixO > prefix && suffixN > prefix && oldWords[suffixO] === newWords[suffixN]) { suffixO--; suffixN-- }

  const parts = []
  if (prefix > 0) parts.push({ type: 'same', text: oldWords.slice(0, prefix).join('') })
  const removedMid = oldWords.slice(prefix, suffixO + 1).join('')
  const addedMid = newWords.slice(prefix, suffixN + 1).join('')
  if (removedMid) parts.push({ type: 'removed', text: removedMid })
  if (addedMid) parts.push({ type: 'added', text: addedMid })
  if (suffixO + 1 < oldWords.length) parts.push({ type: 'same', text: oldWords.slice(suffixO + 1).join('') })

  return parts
}

function diffSectionLines(origLines, tailLines) {
  const changes = []
  const maxLen = Math.max(origLines.length, tailLines.length)

  for (let i = 0; i < maxLen; i++) {
    const orig = i < origLines.length ? origLines[i] : null
    const tail = i < tailLines.length ? tailLines[i] : null

    if (orig !== null && tail !== null && orig.trim() === tail.trim()) {
      // Unchanged
      changes.push({ type: 'unchanged', text: tail })
    } else if (orig !== null && tail !== null && orig.trim() && tail.trim()) {
      // Modified — show word-level diff
      changes.push({ type: 'modified', original: orig, tailored: tail, words: diffWords(orig, tail) })
    } else if (orig !== null && orig.trim() && (tail === null || !tail.trim())) {
      // Removed
      changes.push({ type: 'removed', text: orig })
    } else if (tail !== null && tail.trim() && (orig === null || !orig.trim())) {
      // Added
      changes.push({ type: 'added', text: tail })
    } else if (orig !== null || tail !== null) {
      changes.push({ type: 'unchanged', text: tail || orig || '' })
    }
  }
  return changes
}

function buildEffectiveText(allSections, decisions) {
  const lines = []
  let changeIdx = 0
  for (const sec of allSections) {
    if (sec.title !== 'HEADER') lines.push(sec.title)
    for (const change of sec.changes) {
      const key = `${sec.title}-${changeIdx}`
      const decision = decisions[key]
      if (change.type === 'unchanged') {
        lines.push(change.text)
      } else if (change.type === 'modified') {
        lines.push(decision === 'reject' ? change.original : change.tailored)
      } else if (change.type === 'added') {
        if (decision !== 'reject') lines.push(change.text)
      } else if (change.type === 'removed') {
        if (decision !== 'accept') lines.push(change.text)
      }
      changeIdx++
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

const ResumeDiff = forwardRef(function ResumeDiff({ original, tailored, onApply }, ref) {
  const origSections = splitIntoSections(original)
  const tailSections = splitIntoSections(tailored)

  // Build section pairs
  const sectionPairs = []
  const tailMap = new Map(tailSections.map(s => [s.title, s]))
  const seen = new Set()

  for (const orig of origSections) {
    const tail = tailMap.get(orig.title)
    if (tail) {
      sectionPairs.push({ title: orig.title, origLines: orig.lines, tailLines: tail.lines })
      seen.add(orig.title)
    } else {
      sectionPairs.push({ title: orig.title, origLines: orig.lines, tailLines: [] })
    }
  }
  // New sections in tailored that aren't in original
  for (const tail of tailSections) {
    if (!seen.has(tail.title)) {
      sectionPairs.push({ title: tail.title, origLines: [], tailLines: tail.lines })
    }
  }

  // Compute changes per section
  const allSections = sectionPairs.map(sec => ({
    ...sec,
    changes: diffSectionLines(sec.origLines, sec.tailLines),
  }))

  // Track accepted/rejected per change
  const [decisions, setDecisions] = useState({}) // key -> 'accept' | 'reject'

  useImperativeHandle(ref, () => ({
    getEffectiveText: () => buildEffectiveText(allSections, decisions)
  }), [allSections, decisions])

  const totalChanges = allSections.reduce((sum, s) =>
    sum + s.changes.filter(c => c.type !== 'unchanged').length, 0)
  const decided = Object.keys(decisions).length
  const accepted = Object.values(decisions).filter(v => v === 'accept').length
  const rejected = Object.values(decisions).filter(v => v === 'reject').length

  const decide = (key, value) => {
    setDecisions(prev => ({ ...prev, [key]: value }))
  }

  const handleApplyAll = () => {
    if (onApply) onApply(buildEffectiveText(allSections, decisions))
  }

  // Accept all / reject all
  const handleAcceptAll = () => {
    const all = {}
    let idx = 0
    for (const sec of allSections) {
      for (const change of sec.changes) {
        if (change.type !== 'unchanged') all[`${sec.title}-${idx}`] = 'accept'
        idx++
      }
    }
    setDecisions(all)
  }

  const handleRejectAll = () => {
    const all = {}
    let idx = 0
    for (const sec of allSections) {
      for (const change of sec.changes) {
        if (change.type !== 'unchanged') all[`${sec.title}-${idx}`] = 'reject'
        idx++
      }
    }
    setDecisions(all)
  }

  let globalIdx = 0

  return (
    <div className="resume-diff">
      <div className="diff-toolbar">
        <div className="diff-stats">
          <span className="diff-stat">{totalChanges} changes</span>
          {decided > 0 && (
            <>
              <span className="diff-stat diff-stat-accepted">{accepted} accepted</span>
              <span className="diff-stat diff-stat-rejected">{rejected} rejected</span>
            </>
          )}
        </div>
        <div className="diff-bulk-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleAcceptAll}>Accept All</button>
          <button className="btn btn-ghost btn-sm" onClick={handleRejectAll}>Reject All</button>
          {decided > 0 && (
            <button className="btn btn-primary btn-sm" onClick={handleApplyAll}>Apply Decisions</button>
          )}
        </div>
      </div>

      {allSections.map((sec) => {
        const hasChanges = sec.changes.some(c => c.type !== 'unchanged')
        return (
          <div key={sec.title} className={`diff-section ${hasChanges ? '' : 'diff-section-unchanged'}`}>
            <div className="diff-section-header">
              <span className="diff-section-title">{sec.title}</span>
              {!hasChanges && <span className="diff-section-badge unchanged">No changes</span>}
            </div>

            <div className="diff-section-body">
              {sec.changes.map((change) => {
                const key = `${sec.title}-${globalIdx}`
                const decision = decisions[key]
                globalIdx++

                if (change.type === 'unchanged') {
                  return <div key={key} className="diff-line-unchanged">{change.text || '\u00A0'}</div>
                }

                if (change.type === 'modified') {
                  // Show as a normal line with only changed words highlighted
                  return (
                    <div key={key} className={`diff-line-modified ${decision ? `diff-decided diff-${decision}ed` : ''}`}>
                      <div className="diff-inline-sentence">
                        {change.words.map((w, wi) => (
                          <span key={wi} className={w.type !== 'same' ? `diff-word-highlight diff-word-${w.type}` : ''}>{w.text}</span>
                        ))}
                      </div>
                      <div className="diff-change-actions">
                        <button
                          className={`diff-action-btn diff-accept ${decision === 'accept' ? 'active' : ''}`}
                          onClick={() => decide(key, decision === 'accept' ? undefined : 'accept')}
                          title="Accept change"
                        >&#10003;</button>
                        <button
                          className={`diff-action-btn diff-reject ${decision === 'reject' ? 'active' : ''}`}
                          onClick={() => decide(key, decision === 'reject' ? undefined : 'reject')}
                          title="Keep original"
                        >&#10005;</button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={key} className={`diff-change ${decision ? `diff-decided diff-${decision}ed` : ''}`}>
                    <div className="diff-change-content">
                      {change.type === 'added' && (
                        <div className="diff-line-added">{change.text}</div>
                      )}
                      {change.type === 'removed' && (
                        <div className="diff-line-removed">{change.text}</div>
                      )}
                    </div>
                    <div className="diff-change-actions">
                      <button
                        className={`diff-action-btn diff-accept ${decision === 'accept' ? 'active' : ''}`}
                        onClick={() => decide(key, decision === 'accept' ? undefined : 'accept')}
                        title="Accept"
                      >&#10003;</button>
                      <button
                        className={`diff-action-btn diff-reject ${decision === 'reject' ? 'active' : ''}`}
                        onClick={() => decide(key, decision === 'reject' ? undefined : 'reject')}
                        title="Reject"
                      >&#10005;</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
})

export default ResumeDiff
