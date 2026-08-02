import { buildReminderMessage } from '../../lib/server/ai/reminderMessage.js'
import { fetchReminderTasks, reminderTaskCounts } from '../../lib/server/buildReminder.js'
import {
  buildWebPushPayload,
  fetchPendingHabits,
  hasExpenseToday,
} from '../../lib/server/buildWebPushDigest.js'
import { getAdminClient, resolveUserId } from '../../lib/server/supabaseAdmin.js'
import { sendTelegramMessage } from '../../lib/server/telegram.js'
import { fetchPushSubscriptions, sendWebPushToSubscriptions } from '../../lib/server/webPush.js'

const ALLOWED_SLOTS = new Set(['morning', 'noon', 'afternoon', 'night', 'monthly-report'])

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return req.headers.authorization === `Bearer ${cronSecret}`
}

async function fetchUserSettings(supabase, userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('telegram_reminders, ai_telegram_digest, web_push_reminders')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  return {
    telegramReminders: data?.telegram_reminders ?? true,
    aiTelegramDigest: data?.ai_telegram_digest ?? false,
    webPushReminders: data?.web_push_reminders ?? true,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method not allowed')
  }

  if (!isAuthorized(req)) {
    return res.status(401).send('Unauthorized')
  }

  const slot = String(req.query?.slot || 'morning')
  if (!ALLOWED_SLOTS.has(slot)) {
    return res.status(400).json({ ok: false, error: 'Invalid slot' })
  }

  try {
    const supabase = getAdminClient()
    const userId = await resolveUserId(supabase)
    const settings = await fetchUserSettings(supabase, userId)
    const tasks = await fetchReminderTasks(supabase, userId)
    const counts = reminderTaskCounts(tasks)

    let telegram = { sent: false, reason: null, source: null }
    if (settings.telegramReminders) {
      const { message, source } = await buildReminderMessage(tasks, {
        slot,
        supabase,
        useAi: settings.aiTelegramDigest,
      })
      await sendTelegramMessage(message)
      telegram = { sent: true, reason: null, source }
    } else {
      telegram = { sent: false, reason: 'telegram_disabled', source: null }
    }

    let webPush = { sent: false, reason: null, result: null, payload: null }
    if (slot !== 'monthly-report' && settings.webPushReminders) {
      const subscriptions = await fetchPushSubscriptions(supabase, userId)
      if (!subscriptions.length) {
        webPush = { sent: false, reason: 'no_subscriptions', result: null, payload: null }
      } else {
        const pendingHabits = await fetchPendingHabits(supabase, userId)
        const expenseLogged = await hasExpenseToday(supabase, userId)
        const payload = buildWebPushPayload({
          slot,
          tasks,
          pendingHabits,
          expenseLogged,
        })

        if (!payload) {
          webPush = { sent: false, reason: 'empty_digest', result: null, payload: null }
        } else {
          const result = await sendWebPushToSubscriptions(supabase, subscriptions, payload)
          webPush = {
            sent: result.sent > 0,
            reason: result.sent > 0 ? null : 'send_failed',
            result,
            payload: { title: payload.title, kind: payload.kind },
          }
        }
      }
    } else if (slot === 'monthly-report') {
      webPush = { sent: false, reason: 'monthly_report_skip', result: null, payload: null }
    } else {
      webPush = { sent: false, reason: 'web_push_disabled', result: null, payload: null }
    }

    return res.status(200).json({
      ok: true,
      slot,
      dueToday: counts.dueToday,
      overdue: counts.overdue,
      telegram,
      webPush,
    })
  } catch (error) {
    console.error('task-reminder failed', error)
    return res.status(500).json({ ok: false, error: error.message })
  }
}
