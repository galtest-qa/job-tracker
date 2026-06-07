import { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { SendIcon, LoaderIcon, SparklesIcon, XIcon, ExternalLinkIcon } from 'lucide-react'
import { callOpenAI } from '../lib/openai.js'
import { getCandidateContext } from '../lib/candidateContext.js'
import { PLATFORM_BY_NAME } from '../lib/platforms.js'

const QUICK_PROMPTS = [
  'Show me Product Manager jobs in Tel Aviv',
  'Find Software Engineer roles on LinkedIn',
  'Best platforms for my background',
  'Senior QA Engineer jobs in Israel',
]

function buildPrompt(userMessage, candidateContext, selectedPlatforms) {
  const platformList = selectedPlatforms.length
    ? selectedPlatforms.map(p => p.name).join(', ')
    : 'LinkedIn, Indeed, Glassdoor, Wellfound'

  return `You are a job search assistant embedded in a job tracking app.

Available platforms: LinkedIn, Glassdoor, Indeed, Google Jobs, Wellfound, Greenhouse, AllJobs, JobMaster, Drushim
User's selected platforms: ${platformList}

${candidateContext}

User request: "${userMessage}"

Respond with ONLY valid JSON (no markdown, no code fences). Use this exact format:
{
  "intro": "One sentence intro describing what you found",
  "links": [
    { "label": "Role – Location", "query": "exact search query", "platforms": ["PlatformName"] }
  ],
  "suggestions": ["alternative title 1", "alternative title 2"],
  "tips": "optional tip string or null"
}

Rules:
- links[].platforms must only contain names from: LinkedIn, Glassdoor, Indeed, Google Jobs, Wellfound, Greenhouse, AllJobs, JobMaster, Drushim
- If user mentions a specific platform (e.g. "on LinkedIn"), use ONLY that platform in links
- If no platform mentioned, use the user's selected platforms above
- If user mentions a location, include it in every query string
- Return 2–5 links covering useful role variations (e.g. "Product Manager", "Senior PM", "Product Owner")
- suggestions: 2–4 alternative job titles without location, for follow-up searches
- tips: one optional insight (e.g. platform recommendation, market tip) or null
- If the request is in Hebrew, understand it but generate English queries
- ALWAYS return links first. This is the most important part of the response.`
}

function resolveLinks(links, allPlatforms) {
  return links.map(link => ({
    ...link,
    resolvedPlatforms: link.platforms
      .map(name => {
        const key = name.toLowerCase().replace(/\s+/g, '')
        return (
          allPlatforms.find(p => p.name.toLowerCase().replace(/\s+/g, '') === key) ||
          PLATFORM_BY_NAME[name.toLowerCase()] ||
          null
        )
      })
      .filter(Boolean),
  }))
}

function SearchResult({ data, allPlatforms, onSuggestionClick }) {
  const links = resolveLinks(data.links || [], allPlatforms)

  return (
    <div className="jsc-result">
      {data.intro && <p className="jsc-result-intro">{data.intro}</p>}

      {links.length > 0 && (
        <div className="jsc-links">
          {links.map((link, i) => (
            <div key={i} className="jsc-link-card">
              <span className="jsc-link-label">{link.label}</span>
              <div className="jsc-link-btns">
                {link.resolvedPlatforms.map(platform => (
                  <a
                    key={platform.id}
                    href={platform.searchUrl(link.query)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jsc-link-btn"
                    style={{ '--c': platform.color }}
                  >
                    <span
                      className="jsc-link-dot"
                      style={{ background: platform.color }}
                    />
                    {platform.name}
                    <ExternalLinkIcon size={10} />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.suggestions?.length > 0 && (
        <div className="jsc-also">
          <span className="jsc-also-label">Also try:</span>
          <div className="jsc-also-chips">
            {data.suggestions.map((s, i) => (
              <button key={i} className="jsc-also-chip" onClick={() => onSuggestionClick(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.tips && (
        <p className="jsc-tips">💡 {data.tips}</p>
      )}
    </div>
  )
}

export default function JobSearchChat({ selectedPlatforms, allPlatforms }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const candidateContextRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const loadContext = useCallback(async () => {
    if (!candidateContextRef.current) {
      candidateContextRef.current = await getCandidateContext()
    }
    return candidateContextRef.current
  }, [])

  const send = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed || isTyping) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setIsTyping(true)

    try {
      const context = await loadContext()
      const prompt = buildPrompt(trimmed, context, selectedPlatforms)
      const data = await callOpenAI(prompt, { temperature: 0.4 })

      if (data && typeof data === 'object' && 'links' in data) {
        setMessages(prev => [...prev, { role: 'assistant', type: 'search', data }])
      } else {
        // fallback for non-search responses
        const text = typeof data === 'string' ? data : JSON.stringify(data)
        setMessages(prev => [...prev, { role: 'assistant', type: 'text', content: text }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant', type: 'text',
        content: `Sorry, something went wrong: ${err.message}`,
      }])
    } finally {
      setIsTyping(false)
    }
  }, [isTyping, selectedPlatforms, loadContext])

  const handleSuggestionClick = useCallback((suggestion) => {
    send(suggestion)
  }, [send])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="jsc-wrap">
      {/* Header */}
      <div className="jsc-header">
        <div className="jsc-header-title">
          <SparklesIcon size={14} style={{ color: 'var(--primary)' }} />
          <span>AI Job Search</span>
        </div>
        <div className="jsc-header-right">
          {selectedPlatforms.length > 0 && (
            <span className="jsc-platform-count">
              {selectedPlatforms.length} platform{selectedPlatforms.length > 1 ? 's' : ''} selected
            </span>
          )}
          {messages.length > 0 && (
            <button className="jsc-clear-btn" onClick={() => setMessages([])}>
              <XIcon size={12} /> New search
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="jsc-messages">
        {messages.length === 0 ? (
          <div className="jsc-empty">
            <p className="jsc-empty-hint">
              Describe what you're looking for — role, location, platform — and I'll generate direct search links.
            </p>
            <div className="jsc-quick-prompts">
              {QUICK_PROMPTS.map(q => (
                <button key={q} className="jsc-quick-btn" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                className={`jsc-msg jsc-msg-${msg.role}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                {msg.role === 'user' ? (
                  <div className="jsc-bubble jsc-bubble-user">{msg.content}</div>
                ) : msg.type === 'search' ? (
                  <div className="jsc-bubble jsc-bubble-ai">
                    <SearchResult
                      data={msg.data}
                      allPlatforms={allPlatforms}
                      onSuggestionClick={handleSuggestionClick}
                    />
                  </div>
                ) : (
                  <div className="jsc-bubble jsc-bubble-ai">{msg.content}</div>
                )}
              </motion.div>
            ))}

            {isTyping && (
              <motion.div
                className="jsc-msg jsc-msg-assistant"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="jsc-bubble jsc-bubble-ai jsc-typing">
                  <span /><span /><span />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="jsc-input-row">
        <textarea
          ref={textareaRef}
          className="jsc-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Try: "Product Manager jobs in Tel Aviv on LinkedIn"'
          rows={1}
        />
        <button
          className="jsc-send-btn"
          onClick={() => send(input)}
          disabled={!input.trim() || isTyping}
        >
          {isTyping
            ? <LoaderIcon size={15} style={{ animation: 'jsc-spin 1s linear infinite' }} />
            : <SendIcon size={15} />
          }
        </button>
      </div>
    </div>
  )
}
