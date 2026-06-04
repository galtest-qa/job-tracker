import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SearchIcon,
  TargetIcon,
  TrendingUpIcon,
  BriefcaseIcon,
  MapPinIcon,
  XIcon,
  SparklesIcon,
} from 'lucide-react'
import { AnimatedAIChat } from './ui/animated-ai-chat.jsx'
import { callOpenAI } from '../lib/openai.js'
import { getCandidateContext } from '../lib/candidateContext.js'

const COMMANDS = [
  {
    icon: <SearchIcon className="w-4 h-4" />,
    label: 'Refine Search',
    description: 'Improve your current search keywords',
    prefix: '/refine',
  },
  {
    icon: <BriefcaseIcon className="w-4 h-4" />,
    label: 'Job Titles',
    description: 'Find all titles that match your background',
    prefix: '/titles',
  },
  {
    icon: <TargetIcon className="w-4 h-4" />,
    label: 'Best Platforms',
    description: 'Which job boards to prioritize for your role',
    prefix: '/platforms',
  },
  {
    icon: <TrendingUpIcon className="w-4 h-4" />,
    label: 'Salary Insights',
    description: 'Typical compensation for your target role',
    prefix: '/salary',
  },
]

function buildPrompt(userMessage, candidateContext, currentQuery) {
  const searchContext = currentQuery ? `The user is currently searching for: "${currentQuery}"\n\n` : ''
  return `You are a job search assistant embedded in a job tracking app. Help the user find the right job opportunities.

${searchContext}${candidateContext}

User message: ${userMessage}

Rules:
- Be concise and practical (2-4 sentences max unless listing items)
- When suggesting search terms or job titles, put each one on its own line starting with "•"
- If you suggest clickable search terms, end with a line: SEARCH_SUGGESTIONS: term1 | term2 | term3
- For /refine: suggest 3-5 improved search queries based on their profile
- For /titles: list 5-8 job titles they should be searching for
- For /platforms: explain which 2-3 platforms are best for their specific role
- For /salary: give a realistic range for their target role and experience level
- Always tailor advice to the candidate's actual profile and experience`
}

function parseResponse(rawText, onSuggestionClick) {
  if (typeof rawText !== 'string') return { content: String(rawText), suggestions: null }

  const suggestionMatch = rawText.match(/SEARCH_SUGGESTIONS:\s*(.+)$/m)
  let suggestions = null
  let content = rawText

  if (suggestionMatch) {
    suggestions = suggestionMatch[1].split('|').map(s => s.trim()).filter(Boolean)
    content = rawText.replace(/SEARCH_SUGGESTIONS:.+$/m, '').trim()
  }

  return {
    content,
    suggestions,
    onSuggestionClick,
  }
}

export default function JobSearchChat({ currentQuery, onSearchSuggestion }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const candidateContextRef = useRef(null)

  const loadContext = useCallback(async () => {
    if (!candidateContextRef.current) {
      candidateContextRef.current = await getCandidateContext()
    }
    return candidateContextRef.current
  }, [])

  const handleSend = useCallback(async (text) => {
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsTyping(true)

    try {
      const context = await loadContext()
      const prompt = buildPrompt(text, context, currentQuery)
      const raw = await callOpenAI(prompt, { temperature: 0.5 })
      const rawText = typeof raw === 'string' ? raw : raw?.response || raw?.message || JSON.stringify(raw)

      const onSuggestionClick = (suggestion) => {
        onSearchSuggestion?.(suggestion)
        setMessages(prev => [
          ...prev,
          { role: 'user', content: `Search for: ${suggestion}` },
        ])
      }

      const parsed = parseResponse(rawText, onSuggestionClick)
      setMessages(prev => [...prev, { role: 'assistant', ...parsed }])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Sorry, I couldn't get a response: ${err.message}` },
      ])
    } finally {
      setIsTyping(false)
    }
  }, [currentQuery, loadContext, onSearchSuggestion])

  return (
    <>
      {/* Floating toggle button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className={`
          fixed bottom-6 right-6 z-40
          flex items-center gap-2 px-4 py-2.5
          rounded-full shadow-lg text-sm font-medium
          transition-all duration-200
          ${open
            ? 'bg-[#1a1a2e] border border-violet-500/40 text-violet-300'
            : 'bg-[#1a1a2e] border border-white/10 text-white/80 hover:border-violet-500/40 hover:text-violet-300'
          }
        `}
        style={{
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)',
          boxShadow: open
            ? '0 0 0 1px rgba(139,92,246,0.3), 0 8px 32px rgba(139,92,246,0.15)'
            : '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <SparklesIcon className="w-4 h-4" style={{ color: open ? '#a78bfa' : '#6b7280' }} />
        <span>{open ? 'Close AI' : 'AI Assistant'}</span>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-20 right-6 z-40 w-[380px] flex flex-col overflow-hidden"
            style={{
              height: '520px',
              background: 'linear-gradient(160deg, #0a0a1a 0%, #111128 50%, #0d0d20 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '20px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.1)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                >
                  <SparklesIcon className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <span className="text-sm font-medium text-white/90">Job Search AI</span>
                  {currentQuery && (
                    <p className="text-xs text-white/40 leading-tight">Searching: "{currentQuery}"</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Chat */}
            <div className="flex-1 min-h-0">
              <AnimatedAIChat
                messages={messages}
                onSend={handleSend}
                isTyping={isTyping}
                commandSuggestions={COMMANDS}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}