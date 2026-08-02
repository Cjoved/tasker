<script setup>
import { computed, onMounted } from 'vue'
import AppSelect from './AppSelect.vue'
import { useTheme } from '../composables/useTheme'
import { useWebPush } from '../composables/useWebPush'

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
  spaces: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update', 'close'])

const { isDark, setTheme } = useTheme()
const {
  isSupported,
  isSubscribed,
  isBusy,
  errorMessage,
  statusLabel,
  refreshSubscriptionState,
  subscribe,
  unsubscribe,
} = useWebPush()

const timezoneOptions = computed(() => {
  const common = ['Asia/Manila', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']
  const current = props.settings.timezone
  const values = current && !common.includes(current) ? [current, ...common] : common
  return values.map((value) => ({ value, label: value }))
})

const spaceOptions = computed(() => [
  { value: '', label: 'None (Dashboard)' },
  ...props.spaces.map((space) => ({ value: space.id, label: space.name })),
])

function update(patch) {
  emit('update', patch)
}

function handleBackdropClick(event) {
  if (event.target === event.currentTarget) emit('close')
}

async function toggleDevicePush(event) {
  const enabled = event.target.checked
  if (enabled) {
    const ok = await subscribe()
    if (ok) update({ webPushReminders: true })
    else event.target.checked = false
    return
  }
  await unsubscribe()
}

onMounted(() => {
  refreshSubscriptionState()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="task-editor-backdrop fixed inset-0 z-[260] grid place-items-center px-0 py-0 sm:px-4 sm:py-6"
      @click="handleBackdropClick"
    >
      <section class="task-editor-modal task-editor-modal--settings" role="dialog" aria-modal="true" @click.stop>
        <div class="task-editor-handle" aria-hidden="true"></div>
        <div class="task-editor-accent"></div>

        <header class="task-editor-header">
          <div class="min-w-0">
            <p class="type-label text-emerald-600 dark:text-emerald-400">Preferences</p>
            <h2 class="type-section-title mt-1 text-slate-950 dark:text-slate-100">Settings</h2>
          </div>
          <button class="task-editor-close" type="button" aria-label="Close" @click="emit('close')">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div class="task-editor-body">
          <section class="task-editor-section">
            <p class="task-editor-section-title">Appearance</p>
            <label class="task-editor-toggle">
              <span>
                <span class="task-editor-toggle__title">Dark mode</span>
                <span class="task-editor-toggle__hint">Applies across Tasker, Habits, and Budget</span>
              </span>
              <input
                type="checkbox"
                class="task-editor-toggle__input"
                :checked="isDark"
                @change="setTheme($event.target.checked ? 'dark' : 'light')"
              />
            </label>
          </section>

          <section class="task-editor-section">
            <div class="task-editor-field">
              <label class="task-editor-label">Timezone</label>
              <AppSelect
                :model-value="settings.timezone"
                :options="timezoneOptions"
                block
                aria-label="Timezone"
                @update:model-value="update({ timezone: $event })"
              />
            </div>

            <div class="task-editor-field">
              <label class="task-editor-label">Default space on sign-in</label>
              <AppSelect
                :model-value="settings.defaultSpaceId || ''"
                :options="spaceOptions"
                block
                aria-label="Default space"
                @update:model-value="update({ defaultSpaceId: $event || null })"
              />
            </div>
          </section>

          <section class="task-editor-section">
            <p class="task-editor-section-title">Reminders</p>

            <label class="task-editor-toggle">
              <span>
                <span class="task-editor-toggle__title">Device notifications</span>
                <span class="task-editor-toggle__hint">
                  {{ statusLabel }}. Brave: allow notifications for this site. 8PM expense reminder + habit/task digests.
                </span>
              </span>
              <input
                type="checkbox"
                class="task-editor-toggle__input"
                :checked="isSubscribed && settings.webPushReminders !== false"
                :disabled="!isSupported || isBusy"
                @change="toggleDevicePush"
              />
            </label>
            <p v-if="errorMessage" class="mt-2 text-sm text-rose-600 dark:text-rose-400">{{ errorMessage }}</p>

            <label class="task-editor-toggle">
              <span>
                <span class="task-editor-toggle__title">Send digests to this account</span>
                <span class="task-editor-toggle__hint">Master switch for scheduled Web Push (keeps subscription)</span>
              </span>
              <input
                type="checkbox"
                class="task-editor-toggle__input"
                :checked="settings.webPushReminders !== false"
                @change="update({ webPushReminders: $event.target.checked })"
              />
            </label>

            <label class="task-editor-toggle">
              <span>
                <span class="task-editor-toggle__title">Telegram reminders</span>
                <span class="task-editor-toggle__hint">4× daily check-ins</span>
              </span>
              <input
                type="checkbox"
                class="task-editor-toggle__input"
                :checked="settings.telegramReminders"
                @change="update({ telegramReminders: $event.target.checked })"
              />
            </label>

            <label class="task-editor-toggle">
              <span>
                <span class="task-editor-toggle__title">AI-enhanced digests</span>
                <span class="task-editor-toggle__hint">Uses AI when available; off is safer on free tiers</span>
              </span>
              <input
                type="checkbox"
                class="task-editor-toggle__input task-editor-toggle__input--violet"
                :checked="settings.aiTelegramDigest"
                @change="update({ aiTelegramDigest: $event.target.checked })"
              />
            </label>
          </section>
        </div>

        <footer class="task-editor-footer">
          <button class="task-editor-btn task-editor-btn--primary" type="button" @click="emit('close')">Done</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
