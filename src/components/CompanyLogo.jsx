import React, { useState, useRef, useEffect } from 'react'

const COLORS = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'],
  ['#e0c3fc', '#8ec5fc'],
  ['#f6d365', '#fda085'],
  ['#89f7fe', '#66a6ff'],
]

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
}

function guessDomain(company) {
  const clean = company.toLowerCase().replace(/[^a-z0-9.]/g, '')
  if (company.includes('.')) {
    const match = company.match(/[\w-]+\.[\w]+/)
    if (match) return match[0].toLowerCase()
  }
  return `${clean}.com`
}

function getLogoSources(company) {
  const domain = guessDomain(company)
  return [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ]
}

export default function CompanyLogo({ company, size = 'md', logoUrl, editable, onLogoChange }) {
  const [sourceIdx, setSourceIdx] = useState(0)
  const [allFailed, setAllFailed] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const fileRef = useRef(null)
  const wrapperRef = useRef(null)

  const sources = getLogoSources(company)
  const colorIdx = hashCode(company) % COLORS.length
  const [c1, c2] = COLORS[colorIdx]
  const initial = company.charAt(0).toUpperCase()
  const sizeClass = size === 'sm' ? 'company-logo-sm' : size === 'lg' ? 'company-logo-lg' : ''

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const handleImgError = () => {
    if (sourceIdx < sources.length - 1) {
      setSourceIdx(sourceIdx + 1)
    } else {
      setAllFailed(true)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (onLogoChange) onLogoChange(reader.result)
      setShowMenu(false)
    }
    reader.readAsDataURL(file)
  }

  const handleUrlPrompt = () => {
    setShowMenu(false)
    // Use setTimeout so the menu closes before the prompt blocks the UI
    setTimeout(() => {
      const url = prompt('Enter logo image URL:')
      if (url && onLogoChange) onLogoChange(url)
    }, 50)
  }

  const handleRemove = () => {
    if (onLogoChange) onLogoChange('')
    setAllFailed(false)
    setSourceIdx(0)
    setShowMenu(false)
  }

  const hasCustomLogo = logoUrl && logoUrl.length > 0
  const showFallback = !hasCustomLogo && allFailed
  const imgSrc = hasCustomLogo ? logoUrl : sources[sourceIdx]

  return (
    <div ref={wrapperRef} className={`company-logo-wrapper ${editable ? 'editable' : ''}`}>
      <div
        className={`company-logo ${sizeClass}`}
        style={{ background: showFallback ? `linear-gradient(135deg, ${c1}, ${c2})` : '#fff' }}
        onClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu) } : undefined}
      >
        {!showFallback ? (
          <img
            src={imgSrc}
            alt=""
            onError={hasCustomLogo ? () => setAllFailed(true) : handleImgError}
            loading="lazy"
          />
        ) : (
          initial
        )}

        {editable && (
          <div className="logo-edit-badge">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
          </div>
        )}
      </div>

      {showMenu && (
        <div className="logo-menu" onClick={e => e.stopPropagation()}>
          <button onClick={() => { setShowMenu(false); fileRef.current?.click() }}>
            Upload image
          </button>
          <button onClick={handleUrlPrompt}>
            Paste image URL
          </button>
          {hasCustomLogo && (
            <button onClick={handleRemove}>
              Remove custom logo
            </button>
          )}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} hidden />
    </div>
  )
}
