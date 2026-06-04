import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SendIcon, LoaderIcon, SparklesIcon, XIcon } from 'lucide-react'
import { callOpenAI } from '../lib/openai.js'
import { getCandidateContext } from '../lib/candidateContext.js'

const COMMANDS = [
  { label: 'Suggest job titles', text: '/titles What job titles match my background?' },
  { label: 'Refine my search', text: '/refine Improve my current search query' },
  { label: 'Best platforms', text: '/platforms Which job boards should I use?' },
  { label: 'Salary range', text: '/salary What salary should I target?' },
]

function buildPrompt(userMessage, candidateContext, currentQuery) {
  const searchContext = currentQuery ? `The user is currently searching for: "${currentQuery}"\n\n` : ''
  return `You are a job search assistant embedded in a job tracking app. Help the user find the right opportunities.

${searchContext}${candidateContext}

User: ${userMessage}

Rules:
- Be concise and practical (2-4 sentences max unless listing items)
- When suggesting search terms or job titles, list each on its own line starting with "•"
- If you have clickable search term suggestions, end with exactly: SEARCH_SUGGESTIONS: term1 | term2 | term3
- /refine: suggest 3-5 improved search queries based on their profile
- /titles: list 5-8 job titles they should be searching for
- /platforms: explain which 2-3 platforms are best for their specific role
- /salary: give a realistic salary range for their target role and experience level
- Always tailor advice to the candidate's actual profile`
}

function parseResponse(rawText, onSuggestionClick) {
  const text = typeof rawText === 'string' ? rawText : String(rawText)
  const match = text.match(/SEARCH_SUGGESTIONS:\s*(.+)$/m)
  const suggestions = match ? match[1].split('|').map(s => s.trim()).filter(Boolean) : null
  const content = match ? text.replace(/SEARCH_SUGGESTIONS:.+$/m, '').trim() : text
  return { content, suggestions, onSuggestionClick }
}

export default function JobSearchChat({ currentQuery, onSearchSuggestion }) {
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
      const prompt = buildPrompt(trimmed, context, currentQuery)
      const rawText = await callOpenAI(prompt, { temperature: 0.5, raw: true })
      const onSuggestionClick = (s) => onSearchSuggestion?.(s)
      setMessages(prev => [...prev, { role: 'assistant', ...parseResponse(rawText, onSuggestionClick) }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setIsTyping(false)
    }
  }, [isTyping, currentQuery, loadContext, onSearchSuggestion])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="job-search-chat">
      {/* Header */}
      <div className="job-search-chat-header">
        <div className="job-search-chat-title">
          <SparklesIcon size={14} style={{ color: 'var(--primary)' }} />
          <span>AI Job Search</span>
          {currentQuery && (
            <span className="job-search-chat-query-pill">"{currentQuery}"</span>
          )}
        </div>
        {messages.length > 0 && (
          <button className="job-search-chat-clear" onClick={() => setMessages([])}>
            <XIcon size={13} /> Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="job-search-chat-messages">
        {isEmpty ? (
          <div className="job-search-chat-empty">
            <p>Ask me about job titles, search strategies, or which platforms to use.</p>
            <div className="job-search-chat-chips">
              {COMMANDS.map(cmd => (
                <button
                  key={cmd.label}
                  className="job-search-chat-chip"
                  onClick={() => send(cmd.text)}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                className={`job-search-chat-msg job-search-chat-msg-${msg.role}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="job-search-chat-bubble">
                  {msg.content}
                </div>
                {msg.suggestions?.length > 0 && (
                  <div className="job-search-chat-suggestions">
                    {msg.suggestions.map((s, si) => (
                      <button
                        key={si}
                        className="job-search-chat-suggestion"
                        onClick={() => msg.onSuggestionClick?.(s)}
                      >
                        🔍 {s}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
            {isTyping && (
              <motion.div
                className="job-search-chat-msg job-search-chat-msg-assistant"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              >
                <div className="job-search-chat-bubble job-search-chat-typing">
                  <span /><span /><span />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="job-search-chat-input-row">
        <textarea
          ref={textareaRef}
          className="job-search-chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about roles, search tips, platforms… (Enter to send)"
          rows={1}
        />
        <button
          className="job-search-chat-send"
          onClick={() => send(input)}
          disabled={!input.trim() || isTyping}
        >
          {isTyping
            ? <LoaderIcon size={15} className="spin" />
            : <SendIcon size={15} />
          }
        </button>
      </div>
    </div>
  )
}
