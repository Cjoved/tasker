import { reminderTaskCounts } from './buildReminder.js'
import { habitDayKeyManila, manilaWeekday, todayKeyManila } from './manilaTime.js'

function appOrigin() {
  return String(process.env.APP_URL || process.env.VITE_APP_URL || '').replace(/\/$/, '') || ''
}

function absoluteAsset(path) {
  const origin = appOrigin()
  if (!origin) return path
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

function isHabitDueOn(habit, dateKey) {
  const frequency = habit.frequency || 'daily'
  if (frequency === 'daily') return true

  if (frequency === 'weekly' || frequency === 'custom_days') {
    const days = Array.isArray(habit.target_days) ? habit.target_days : []
    if (!days.length) return true
    return days.includes(manilaWeekday(dateKey))
  }

  // Conservative: treat other schedules as due so we don't miss nudges
  return true
}

export async function fetchPendingHabits(supabase, userId) {
  const dayKey = habitDayKeyManila()

  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, title, frequency, target_days, is_archived')
    .eq('user_id', userId)
    .eq('is_archived', false)

  if (habitsError) throw habitsError

  const active = (habits ?? []).filter((habit) => isHabitDueOn(habit, dayKey))
  if (!active.length) return []

  const ids = active.map((habit) => habit.id)
  const { data: checks, error: checksError } = await supabase
    .from('habit_checks')
    .select('habit_id, status')
    .eq('user_id', userId)
    .eq('checked_on', dayKey)
    .in('habit_id', ids)

  if (checksError) throw checksError

  const done = new Set((checks ?? []).map((row) => row.habit_id))
  return active.filter((habit) => !done.has(habit.id))
}

export async function hasExpenseToday(supabase, userId) {
  const today = todayKeyManila()
  const { count, error } = await supabase
    .from('budget_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('occurred_on', today)

  if (error) throw error
  return (count ?? 0) > 0
}

function habitLines(pendingHabits) {
  const n = pendingHabits.length
  if (!n) return { title: null, body: null }

  if (n === 1) {
    return {
      title: 'Habit check-in',
      body: `Still need: ${pendingHabits[0].title}. One tap to keep your streak.`,
      kind: 'habits',
    }
  }

  if (n <= 3) {
    const names = pendingHabits.map((habit) => habit.title).join(', ')
    return {
      title: 'Habits waiting',
      body: `${n} left today — ${names}`,
      kind: 'habits',
    }
  }

  return {
    title: "Don't break the chain",
    body: `${n} habits still open. Open Hub and check them off.`,
    kind: 'habits',
  }
}

function taskLines(tasks) {
  const { overdue, dueToday } = reminderTaskCounts(tasks)
  if (!overdue && !dueToday) return { title: null, body: null }

  if (overdue) {
    return {
      title: 'Tasks need you',
      body: `${overdue} overdue · ${dueToday} due today.`,
      kind: 'tasks',
    }
  }

  return {
    title: 'Tasks due today',
    body: `${dueToday} due today. Open Hub to clear them.`,
    kind: 'tasks',
  }
}

function shortHabitSummary(pendingHabits) {
  const n = pendingHabits.length
  if (!n) return null
  if (n === 1) return `1 habit left`
  return `${n} habits left`
}

function shortTaskSummary(tasks) {
  const { overdue, dueToday } = reminderTaskCounts(tasks)
  if (!overdue && !dueToday) return null
  if (overdue && dueToday) return `${overdue} overdue · ${dueToday} due today`
  if (overdue) return `${overdue} overdue`
  return `${dueToday} task${dueToday === 1 ? '' : 's'} due today`
}

/**
 * Build a single English Web Push payload for a cron slot.
 * @returns {null | { title, body, icon, badge, tag, url, kind }}
 */
export function buildWebPushPayload({ slot, tasks, pendingHabits, expenseLogged }) {
  const badge = absoluteAsset('/pwa-badge-72.png')
  const icons = {
    habits: absoluteAsset('/notif-habits.png'),
    expenses: absoluteAsset('/notif-expenses.png'),
    tasks: absoluteAsset('/notif-tasks.png'),
    hub: absoluteAsset('/pwa-192.png'),
  }

  const habit = habitLines(pendingHabits)
  const task = taskLines(tasks)

  if (slot === 'night') {
    const extras = [shortHabitSummary(pendingHabits), shortTaskSummary(tasks)].filter(Boolean)
    const body = extras.length
      ? `Don't forget to list your expenses. · ${extras.join(' · ')}`
      : "Don't forget to list your expenses."

    return {
      title: 'Expenses',
      body,
      icon: icons.expenses,
      badge,
      tag: 'hub-reminder-expenses',
      renotify: true,
      url: '/?system=budget&section=activity',
      kind: 'expenses',
    }
  }

  const parts = []
  if (habit.body) parts.push(habit.body)
  if (task.body) parts.push(task.body)

  if (slot === 'afternoon' && !expenseLogged) {
    const expenseBody =
      'Quick entry now — coffee, rides, transfers. Empty days are easy to forget.'
    if (!parts.length) {
      return {
        title: "Log today's expenses",
        body: expenseBody,
        icon: icons.expenses,
        badge,
        tag: 'hub-reminder-expenses',
        renotify: true,
        url: '/?system=budget&section=activity',
        kind: 'expenses',
      }
    }
    parts.push(expenseBody)
  }

  if (!parts.length) return null

  const primary = habit.title ? habit : task
  const kind = primary.kind || 'hub'
  const url =
    kind === 'habits'
      ? '/?system=habits'
      : kind === 'tasks'
        ? '/?system=tasker'
        : '/'

  return {
    title: primary.title || 'Personal Hub',
    body: parts.join(' · '),
    icon: icons[kind] || icons.hub,
    badge,
    tag: `hub-reminder-${kind}`,
    renotify: true,
    url,
    kind,
  }
}
