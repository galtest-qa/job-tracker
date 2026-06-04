import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SearchIcon,
  TargetIcon,
  TrendingUpIcon,
  BriefcaseIcon,
  SendIcon,
  XIcon,
  LoaderIcon,
  SparklesIcon,
  Command,
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
- When suggesting search terms or job titles, put each on its own line starting with "•"
- If you suggest clickable search queries, end with exactly this line: SEARCH_SUGGESTIONS: term1 | term2 | term3
- For /refine: suggest 3-5 improved search queries based on their profile
- For /titles: list 5-8 job titles they should be searching for
- For /platforms: explain which 2-3 platforms are best for their specific role
- For /salary: give a realistic salary range for their target role and experience level
- Always tailor advice to the candidate's actual profile and experience`
}

function parseAIResponse(rawText, onSuggestionClick) {
  const text = typeof rawText === 'string' ? rawText : JSON.stringify(rawText)
  const suggestionMatch = text.match(/SEARCH_SUGGESTIONS:\s*(.+)$/m)
  let suggestions = null
  let content = text

  if (suggestionMatch) {
    suggestions = suggestionMatch[1].split('|').map(s => s.trim()).filter(Boolean)
    content = text.replace(/SEARCH_SUGGESTIONS:.+$/m, '').trim()
  }

  return { content, suggestions, onSuggestionClick }
}

export default function JobSearchChat({ currentQuery, onSearchSuggestion }) {
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
      const rawText = await callOpenAI(prompt, { temperature: 0.5, raw: true })

      const onSuggestionClick = (suggestion) => {
        onSearchSuggestion?.(suggestion)
      }

      const parsed = parseAIResponse(rawText, onSuggestionClick)
      setMessages(prev => [...prev, { role: 'assistant', ...parsed }])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Sorry, couldn't get a response: ${err.message}` },
      ])
    } finally {
      setIsTyping(false)
    }
  }, [currentQuery, loadContext, onSearchSuggestion])

  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #0a0a1a 0%, #111128 60%, #0d0d20 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 0 0 1px rgba(139,92,246,0.08)',
        height: '360px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
        >
          <SparklesIcon className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-white/90">AI Job Search</span>
          {currentQuery && (
            <span className="ml-2 text-xs text-white/40">· searching "{currentQuery}"</span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-xs text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
          >
            <XIcon className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Chat body */}
      <div className="flex-1 min-h-0">
        <AnimatedAIChat
          messages={messages}
          onSend={handleSend}
          isTyping={isTyping}
          commandSuggestions={COMMANDS}
        />
      </div>
    </div>
  )
}
