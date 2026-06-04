import { useEffect, useRef, useCallback, useTransition, useState, forwardRef } from "react"
import { cn } from "@/lib/utils"
import {
  SearchIcon,
  TargetIcon,
  TrendingUpIcon,
  BriefcaseIcon,
  SendIcon,
  XIcon,
  LoaderIcon,
  Sparkles,
  Command,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

function useAutoResizeTextarea({ minHeight, maxHeight }) {
  const textareaRef = useRef(null)

  const adjustHeight = useCallback((reset) => {
    const textarea = textareaRef.current
    if (!textarea) return
    if (reset) { textarea.style.height = `${minHeight}px`; return }
    textarea.style.height = `${minHeight}px`
    const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Infinity))
    textarea.style.height = `${newHeight}px`
  }, [minHeight, maxHeight])

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) textarea.style.height = `${minHeight}px`
  }, [minHeight])

  useEffect(() => {
    const handleResize = () => adjustHeight()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [adjustHeight])

  return { textareaRef, adjustHeight }
}

const Textarea = forwardRef(({ className, containerClassName, showRing = true, ...props }, ref) => {
  const [isFocused, setIsFocused] = useState(false)
  return (
    <div className={cn("relative", containerClassName)}>
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "transition-all duration-200 ease-in-out",
          "placeholder:text-muted-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          showRing ? "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" : "",
          className
        )}
        ref={ref}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
      {showRing && isFocused && (
        <motion.span
          className="absolute inset-0 rounded-md pointer-events-none ring-2 ring-offset-0 ring-violet-500/30"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </div>
  )
})
Textarea.displayName = "Textarea"

export { Textarea, useAutoResizeTextarea }

function TypingDots() {
  return (
    <div className="flex items-center ml-1">
      {[1, 2, 3].map((dot) => (
        <motion.div
          key={dot}
          className="w-1.5 h-1.5 bg-white/90 rounded-full mx-0.5"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.1, 0.85] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
          style={{ boxShadow: "0 0 4px rgba(255,255,255,0.3)" }}
        />
      ))}
    </div>
  )
}

export function AnimatedAIChat({ messages, onSend, isTyping, commandSuggestions = [] }) {
  const [value, setValue] = useState("")
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [, startTransition] = useTransition()
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 60, maxHeight: 200 })
  const commandPaletteRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (value.startsWith('/') && !value.includes(' ')) {
      setShowCommandPalette(true)
      const idx = commandSuggestions.findIndex(cmd => cmd.prefix.startsWith(value))
      setActiveSuggestion(idx >= 0 ? idx : -1)
    } else {
      setShowCommandPalette(false)
    }
  }, [value, commandSuggestions])

  useEffect(() => {
    const handleMouseMove = (e) => setMousePosition({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      const commandButton = document.querySelector('[data-command-button]')
      if (commandPaletteRef.current &&
        !commandPaletteRef.current.contains(event.target) &&
        !commandButton?.contains(event.target)) {
        setShowCommandPalette(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e) => {
    if (showCommandPalette) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(p => p < commandSuggestions.length - 1 ? p + 1 : 0) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(p => p > 0 ? p - 1 : commandSuggestions.length - 1) }
      else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        if (activeSuggestion >= 0) selectCommand(activeSuggestion)
      }
      else if (e.key === 'Escape') { e.preventDefault(); setShowCommandPalette(false) }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) handleSend()
    }
  }

  const handleSend = () => {
    if (!value.trim() || isTyping) return
    startTransition(() => {
      onSend(value.trim())
      setValue("")
      adjustHeight(true)
    })
  }

  const selectCommand = (index) => {
    setValue(commandSuggestions[index].prefix + ' ')
    setShowCommandPalette(false)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full w-full bg-transparent text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full filter blur-[128px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full filter blur-[128px] animate-pulse" style={{ animationDelay: '700ms' }} />
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative z-10 min-h-0">
        {messages.length === 0 && (
          <motion.div
            className="text-center space-y-2 mt-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-xl font-medium bg-clip-text text-transparent bg-gradient-to-r from-white/90 to-white/40">
              Job Search Assistant
            </h2>
            <p className="text-sm text-white/40">Ask me to refine your search, suggest roles, or find the right platform.</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {commandSuggestions.map((s, i) => (
                <motion.button
                  key={s.prefix}
                  onClick={() => { setValue(s.prefix + ' '); textareaRef.current?.focus() }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-xs text-white/60 hover:text-white/90 transition-all"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                >
                  {s.icon}<span>{s.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              msg.role === 'user'
                ? "bg-white text-[#0A0A0B] rounded-br-sm"
                : "bg-white/[0.06] border border-white/[0.08] text-white/90 rounded-bl-sm"
            )}>
              {msg.content}
              {msg.suggestions && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.suggestions.map((s, si) => (
                    <button
                      key={si}
                      onClick={() => msg.onSuggestionClick?.(s)}
                      className="px-2.5 py-1 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-full text-xs text-violet-300 hover:text-violet-200 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <motion.div
            className="flex justify-start"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2 text-sm text-white/60">
              <span>Thinking</span><TypingDots />
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="relative z-10 p-3">
        <motion.div
          className="relative backdrop-blur-2xl bg-white/[0.03] rounded-2xl border border-white/[0.07] shadow-2xl"
          initial={{ scale: 0.98 }} animate={{ scale: 1 }}
        >
          <AnimatePresence>
            {showCommandPalette && (
              <motion.div
                ref={commandPaletteRef}
                className="absolute left-4 right-4 bottom-full mb-2 backdrop-blur-xl bg-black/90 rounded-lg z-50 shadow-lg border border-white/10 overflow-hidden"
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
              >
                <div className="py-1 bg-black/95">
                  {commandSuggestions.map((s, i) => (
                    <motion.div
                      key={s.prefix}
                      onClick={() => selectCommand(i)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors",
                        activeSuggestion === i ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5"
                      )}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <div className="w-5 h-5 flex items-center justify-center text-white/60">{s.icon}</div>
                      <div className="font-medium">{s.label}</div>
                      <div className="text-white/40 ml-1">{s.prefix}</div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-3">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => { setValue(e.target.value); adjustHeight() }}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Ask about job titles, search strategies, platforms… or type /"
              containerClassName="w-full"
              className={cn(
                "w-full px-3 py-2 resize-none bg-transparent border-none",
                "text-white/90 text-sm focus:outline-none placeholder:text-white/20 min-h-[52px]"
              )}
              style={{ overflow: "hidden" }}
              showRing={false}
            />
          </div>

          <div className="px-3 pb-3 flex items-center justify-between">
            <motion.button
              type="button"
              data-command-button
              onClick={(e) => { e.stopPropagation(); setShowCommandPalette(p => !p) }}
              whileTap={{ scale: 0.94 }}
              className={cn(
                "p-1.5 text-white/40 hover:text-white/90 rounded-lg transition-colors text-xs flex items-center gap-1.5",
                showCommandPalette && "bg-white/10 text-white/90"
              )}
            >
              <Command className="w-3.5 h-3.5" />
              <span>commands</span>
            </motion.button>

            <motion.button
              type="button"
              onClick={handleSend}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              disabled={isTyping || !value.trim()}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                value.trim() && !isTyping
                  ? "bg-white text-[#0A0A0B] shadow-lg shadow-white/10"
                  : "bg-white/[0.05] text-white/30 cursor-not-allowed"
              )}
            >
              {isTyping ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
              <span>Send</span>
            </motion.button>
          </div>
        </motion.div>
      </div>

      {inputFocused && (
        <motion.div
          className="fixed w-[40rem] h-[40rem] rounded-full pointer-events-none z-0 opacity-[0.025] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 blur-[96px]"
          animate={{ x: mousePosition.x - 320, y: mousePosition.y - 320 }}
          transition={{ type: "spring", damping: 25, stiffness: 150, mass: 0.5 }}
        />
      )}
    </div>
  )
}