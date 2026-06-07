import { useState } from 'react'
import JobSearchChat from './JobSearchChat.jsx'
import { PLATFORMS } from '../lib/platforms.js'

const DEFAULT_SELECTED = ['linkedin', 'indeed', 'glassdoor']

export default function FindJobs() {
  const [selected, setSelected] = useState(DEFAULT_SELECTED)

  const togglePlatform = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectedPlatforms = PLATFORMS.filter(p => selected.includes(p.id))
  const international = PLATFORMS.filter(p => !p.isLocal)
  const local = PLATFORMS.filter(p => p.isLocal)

  return (
    <div className="find-jobs-layout">
      <div className="find-jobs-main">
        <JobSearchChat selectedPlatforms={selectedPlatforms} allPlatforms={PLATFORMS} />
      </div>

      <aside className="platform-rail">
        <div className="platform-rail-heading">Platforms</div>

        <div className="platform-rail-group">
          {international.map(p => (
            <PlatformRailItem
              key={p.id}
              platform={p}
              active={selected.includes(p.id)}
              onToggle={() => togglePlatform(p.id)}
            />
          ))}
        </div>

        <div className="platform-rail-divider">Israel</div>

        <div className="platform-rail-group">
          {local.map(p => (
            <PlatformRailItem
              key={p.id}
              platform={p}
              active={selected.includes(p.id)}
              onToggle={() => togglePlatform(p.id)}
            />
          ))}
        </div>

        {selected.length > 0 && (
          <button className="platform-rail-clear" onClick={() => setSelected([])}>
            Clear all
          </button>
        )}
        {selected.length === 0 && (
          <button className="platform-rail-clear" onClick={() => setSelected(DEFAULT_SELECTED)}>
            Reset
          </button>
        )}
      </aside>
    </div>
  )
}

function PlatformRailItem({ platform, active, onToggle }) {
  return (
    <button
      className={`platform-rail-item${active ? ' platform-rail-item-active' : ''}`}
      onClick={onToggle}
      title={platform.name}
    >
      <span
        className="platform-rail-dot"
        style={{ background: active ? platform.color : 'transparent', borderColor: platform.color }}
      />
      <span className="platform-rail-name">{platform.name}</span>
      {active && (
        <svg className="platform-rail-check" width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
