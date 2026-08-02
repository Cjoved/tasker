import { computed, ref, watch } from 'vue'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const STORAGE_KEY = 'tasker:settings'

const defaults = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila',
  defaultSpaceId: null,
  telegramReminders: true,
  aiTelegramDigest: false,
  webPushReminders: true,
  onboardingComplete: false,
}

const settings = ref({ ...defaults })
let loadedForUser = null

function readLocalSettings(userId) {
  if (!userId) return { ...defaults }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`)
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

function writeLocalSettings(userId, snapshot) {
  if (!userId) return
  localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(snapshot))
}

function mapRowToSettings(row) {
  if (!row) return null
  return {
    timezone: row.timezone || defaults.timezone,
    defaultSpaceId: row.default_space_id,
    telegramReminders: row.telegram_reminders ?? true,
    aiTelegramDigest: row.ai_telegram_digest ?? false,
    webPushReminders: row.web_push_reminders ?? true,
    onboardingComplete: row.onboarding_complete ?? false,
  }
}

function mapSettingsToRow(userId, snapshot) {
  return {
    user_id: userId,
    timezone: snapshot.timezone,
    default_space_id: snapshot.defaultSpaceId,
    telegram_reminders: snapshot.telegramReminders,
    ai_telegram_digest: snapshot.aiTelegramDigest,
    web_push_reminders: snapshot.webPushReminders,
    onboarding_complete: snapshot.onboardingComplete,
  }
}

async function loadRemoteSettings(userId) {
  if (!isSupabaseConfigured) return null

  const { data, error } = await supabase
    .from('user_settings')
    .select('timezone, default_space_id, telegram_reminders, ai_telegram_digest, web_push_reminders, onboarding_complete')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Failed to load user_settings', error.message)
    return null
  }

  return mapRowToSettings(data)
}

async function persistRemoteSettings(userId, snapshot) {
  if (!isSupabaseConfigured) return

  const { error } = await supabase.from('user_settings').upsert(mapSettingsToRow(userId, snapshot))
  if (error) console.warn('Failed to save user_settings', error.message)
}

export function useSettings(user) {
  const userId = computed(() => user.value?.id)

  watch(
    userId,
    async (id) => {
      if (!id) {
        settings.value = { ...defaults }
        loadedForUser = null
        return
      }

      if (loadedForUser === id) return

      const local = readLocalSettings(id)
      const remote = await loadRemoteSettings(id)
      settings.value = remote ? { ...local, ...remote } : local
      writeLocalSettings(id, settings.value)
      loadedForUser = id

      if (!remote) {
        await persistRemoteSettings(id, settings.value)
      }
    },
    { immediate: true },
  )

  function update(patch) {
    settings.value = { ...settings.value, ...patch }
    writeLocalSettings(userId.value, settings.value)
    if (userId.value) persistRemoteSettings(userId.value, settings.value)
  }

  function completeOnboarding() {
    update({ onboardingComplete: true })
  }

  return {
    settings,
    timezone: computed(() => settings.value.timezone),
    defaultSpaceId: computed(() => settings.value.defaultSpaceId),
    telegramReminders: computed(() => settings.value.telegramReminders),
    aiTelegramDigest: computed(() => settings.value.aiTelegramDigest),
    webPushReminders: computed(() => settings.value.webPushReminders),
    onboardingComplete: computed(() => settings.value.onboardingComplete),
    update,
    completeOnboarding,
  }
}
