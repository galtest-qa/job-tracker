import TelegramBot from 'node-telegram-bot-api'
import { getDb, all, get, run } from './db.js'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHECK_INTERVAL = 60 * 1000 // check every minute
let bot = null
let chatId = null

// Store chat ID in a simple file
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const CHAT_ID_FILE = join(__dirname, '.telegram-chat-id')

function loadChatId() {
  if (existsSync(CHAT_ID_FILE)) {
    chatId = readFileSync(CHAT_ID_FILE, 'utf-8').trim()
  }
}

function saveChatId(id) {
  chatId = String(id)
  writeFileSync(CHAT_ID_FILE, chatId)
}

// ── Format helpers ──

function formatReminder(r) {
  const due = new Date(r.due_at)
  const now = new Date()
  const diffMs = due - now
  const diffMins = Math.round(Math.abs(diffMs) / 60000)
  const diffHours = Math.round(Math.abs(diffMs) / 3600000)
  const diffDays = Math.round(Math.abs(diffMs) / 86400000)

  let timeStr
  if (diffMs < 0) {
    if (diffMins < 60) timeStr = `${diffMins}m overdue`
    else if (diffHours < 24) timeStr = `${diffHours}h overdue`
    else timeStr = `${diffDays}d overdue`
  } else {
    if (diffMins < 60) timeStr = `in ${diffMins}m`
    else if (diffHours < 24) timeStr = `in ${diffHours}h`
    else if (diffDays <= 7) timeStr = `in ${diffDays}d`
    else timeStr = due.toLocaleDateString()
  }

  const company = r.company || ''
  const role = r.role || ''
  const jobInfo = company ? `${company}${role ? ` - ${role}` : ''}` : ''

  return { timeStr, jobInfo, isOverdue: diffMs < 0 }
}

// ── Check and send reminders ──

const notifiedIds = new Set() // track what we've already notified about this session

async function checkReminders() {
  if (!chatId) { console.log('[Telegram] No chat ID — send /start to the bot'); return }
  if (!bot) return

  const now = new Date()
  const reminders = all(`
    SELECT r.*, j.company, j.role
    FROM reminders r
    JOIN jobs j ON r.job_id = j.id
    WHERE r.completed = 0
      AND (r.snoozed_until IS NULL OR r.snoozed_until < ?)
    ORDER BY r.due_at ASC
  `, [now.toISOString()])

  const toNotify = reminders.filter(r => {
    if (notifiedIds.has(r.id)) return false
    const due = new Date(r.due_at)
    const diffMs = due - now
    // Notify if overdue or due within 30 minutes
    return diffMs < 30 * 60 * 1000
  })

  for (const r of toNotify) {
    const { timeStr, jobInfo, isOverdue } = formatReminder(r)
    const emoji = isOverdue ? '🔴' : '🟡'
    let msg = `${emoji} <b>${r.title}</b> — ${timeStr}`
    if (jobInfo) msg += `\n📋 ${jobInfo}`
    if (r.note) msg += `\n📝 ${r.note}`

    try {
      await bot.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Done', callback_data: `done_${r.id}` },
            { text: '⏰ Snooze 1h', callback_data: `snooze1h_${r.id}` },
            { text: '⏰ Snooze 1d', callback_data: `snooze1d_${r.id}` },
          ]]
        }
      })
      notifiedIds.add(r.id)
    } catch (err) {
      console.error('Telegram send error:', err.message)
    }
  }
}

// ── Daily summary ──

async function sendDailySummary() {
  if (!chatId || !bot) return

  const now = new Date()
  const reminders = all(`
    SELECT r.*, j.company, j.role
    FROM reminders r
    JOIN jobs j ON r.job_id = j.id
    WHERE r.completed = 0
      AND (r.snoozed_until IS NULL OR r.snoozed_until < ?)
    ORDER BY r.due_at ASC
  `, [now.toISOString()])

  if (reminders.length === 0) {
    await bot.sendMessage(chatId, '✨ No pending reminders. You\'re all caught up!')
    return
  }

  const overdue = reminders.filter(r => new Date(r.due_at) < now)
  const today = reminders.filter(r => {
    const due = new Date(r.due_at)
    return due >= now && due.toDateString() === now.toDateString()
  })
  const upcoming = reminders.filter(r => {
    const due = new Date(r.due_at)
    return due > now && due.toDateString() !== now.toDateString()
  })

  let msg = '📊 <b>Daily Reminder Summary</b>\n\n'

  if (overdue.length > 0) {
    msg += `🔴 <b>Overdue (${overdue.length})</b>\n`
    overdue.forEach(r => {
      const { timeStr, jobInfo } = formatReminder(r)
      msg += `  • ${r.title} — ${timeStr}${jobInfo ? ` (${jobInfo})` : ''}\n`
    })
    msg += '\n'
  }

  if (today.length > 0) {
    msg += `🟡 <b>Due Today (${today.length})</b>\n`
    today.forEach(r => {
      const { timeStr, jobInfo } = formatReminder(r)
      msg += `  • ${r.title} — ${timeStr}${jobInfo ? ` (${jobInfo})` : ''}\n`
    })
    msg += '\n'
  }

  if (upcoming.length > 0) {
    msg += `🔵 <b>Upcoming (${upcoming.length})</b>\n`
    upcoming.slice(0, 5).forEach(r => {
      const { timeStr, jobInfo } = formatReminder(r)
      msg += `  • ${r.title} — ${timeStr}${jobInfo ? ` (${jobInfo})` : ''}\n`
    })
    if (upcoming.length > 5) msg += `  ... and ${upcoming.length - 5} more\n`
  }

  await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' })
}

// ── Start bot ──

export async function startTelegramBot() {
  if (!TOKEN) {
    console.log('⚠ Set TELEGRAM_BOT_TOKEN for Telegram notifications')
    return
  }

  await getDb()
  loadChatId()

  bot = new TelegramBot(TOKEN, { polling: true })
  console.log('✓ Telegram bot started')
  if (chatId) console.log(`✓ Telegram chat ID loaded: ${chatId}`)

  // Log all incoming messages for debugging
  bot.on('message', (msg) => {
    console.log(`[Telegram] Message from ${msg.chat.id}: ${msg.text}`)
    // Auto-register chat on any message if not yet registered
    if (!chatId) {
      saveChatId(msg.chat.id)
      console.log(`✓ Telegram chat ID saved: ${chatId}`)
    }
  })

  // /start command — registers the chat
  bot.onText(/\/start/, (msg) => {
    saveChatId(msg.chat.id)
    console.log(`✓ Telegram chat registered: ${msg.chat.id}`)
    bot.sendMessage(msg.chat.id,
      '👋 Job Tracker bot connected!\n\n' +
      'I\'ll send you reminders when they\'re due.\n\n' +
      'Commands:\n' +
      '/summary — See all pending reminders\n' +
      '/today — See today\'s reminders\n' +
      '/overdue — See overdue reminders'
    )
  })

  // /summary command
  bot.onText(/\/summary/, async () => {
    if (!chatId) return
    await sendDailySummary()
  })

  // /today command
  bot.onText(/\/today/, async () => {
    if (!chatId) return
    const now = new Date()
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59)

    const reminders = all(`
      SELECT r.*, j.company, j.role
      FROM reminders r JOIN jobs j ON r.job_id = j.id
      WHERE r.completed = 0 AND r.due_at <= ?
        AND (r.snoozed_until IS NULL OR r.snoozed_until < ?)
      ORDER BY r.due_at ASC
    `, [todayEnd.toISOString(), now.toISOString()])

    if (reminders.length === 0) {
      bot.sendMessage(chatId, '✅ Nothing due today!')
      return
    }

    let msg = `📅 <b>Today's Reminders (${reminders.length})</b>\n\n`
    reminders.forEach(r => {
      const { timeStr, jobInfo, isOverdue } = formatReminder(r)
      msg += `${isOverdue ? '🔴' : '🟡'} ${r.title} — ${timeStr}`
      if (jobInfo) msg += ` (${jobInfo})`
      msg += '\n'
    })
    bot.sendMessage(chatId, msg, { parse_mode: 'HTML' })
  })

  // /overdue command
  bot.onText(/\/overdue/, async () => {
    if (!chatId) return
    const now = new Date()
    const reminders = all(`
      SELECT r.*, j.company, j.role
      FROM reminders r JOIN jobs j ON r.job_id = j.id
      WHERE r.completed = 0 AND r.due_at < ?
        AND (r.snoozed_until IS NULL OR r.snoozed_until < ?)
      ORDER BY r.due_at ASC
    `, [now.toISOString(), now.toISOString()])

    if (reminders.length === 0) {
      bot.sendMessage(chatId, '✅ No overdue reminders!')
      return
    }

    let msg = `🔴 <b>Overdue (${reminders.length})</b>\n\n`
    reminders.forEach(r => {
      const { timeStr, jobInfo } = formatReminder(r)
      msg += `• ${r.title} — ${timeStr}`
      if (jobInfo) msg += ` (${jobInfo})`
      msg += '\n'
    })
    bot.sendMessage(chatId, msg, { parse_mode: 'HTML' })
  })

  // Callback buttons (Done / Snooze)
  bot.on('callback_query', async (query) => {
    const data = query.data
    const match = data.match(/^(done|snooze1h|snooze1d)_(\d+)$/)
    if (!match) return

    const [, action, idStr] = match
    const id = Number(idStr)

    if (action === 'done') {
      run('UPDATE reminders SET completed = 1 WHERE id = ?', [id])
      await bot.answerCallbackQuery(query.id, { text: '✅ Marked as done!' })
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      })
    } else if (action === 'snooze1h') {
      const until = new Date(Date.now() + 3600000).toISOString()
      run('UPDATE reminders SET snoozed_until = ? WHERE id = ?', [until, id])
      notifiedIds.delete(id)
      await bot.answerCallbackQuery(query.id, { text: '⏰ Snoozed for 1 hour' })
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      })
    } else if (action === 'snooze1d') {
      const until = new Date(Date.now() + 86400000).toISOString()
      run('UPDATE reminders SET snoozed_until = ? WHERE id = ?', [until, id])
      notifiedIds.delete(id)
      await bot.answerCallbackQuery(query.id, { text: '⏰ Snoozed for 1 day' })
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      })
    }
  })

  // Check reminders every minute
  setInterval(checkReminders, CHECK_INTERVAL)
  // Also check immediately on start
  setTimeout(checkReminders, 5000)

  // Daily summary at 8am
  scheduleDailySummary()
}

function scheduleDailySummary() {
  const now = new Date()
  const next8am = new Date(now)
  next8am.setHours(8, 0, 0, 0)
  if (now >= next8am) next8am.setDate(next8am.getDate() + 1)

  const msUntil = next8am - now
  setTimeout(() => {
    sendDailySummary()
    // Then repeat every 24h
    setInterval(sendDailySummary, 24 * 60 * 60 * 1000)
  }, msUntil)
}
