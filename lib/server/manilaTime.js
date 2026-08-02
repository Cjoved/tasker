const MANILA_TZ = 'Asia/Manila'

export function manilaDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export function todayKeyManila() {
  return manilaDateKey(new Date())
}

/** Habit day in Asia/Manila — rolls at 4:00 AM (same rule as client habitDayKey). */
export function habitDayKeyManila(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  let year = Number(parts.year)
  let month = Number(parts.month)
  let day = Number(parts.day)
  const hour = Number(parts.hour)

  if (hour < 4) {
    const shifted = new Date(Date.UTC(year, month - 1, day))
    shifted.setUTCDate(shifted.getUTCDate() - 1)
    year = shifted.getUTCFullYear()
    month = shifted.getUTCMonth() + 1
    day = shifted.getUTCDate()
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function manilaWeekday(dateKey) {
  // Manila noon → unambiguous calendar weekday (UTC day matches PH date)
  return new Date(`${dateKey}T12:00:00+08:00`).getUTCDay()
}

export function formatManilaDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: MANILA_TZ,
  }).format(date)
}
