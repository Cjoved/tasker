<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  modelValueEnd: {
    type: String,
    default: '',
  },
  id: {
    type: String,
    default: '',
  },
  name: {
    type: String,
    default: '',
  },
  required: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  ariaLabel: {
    type: String,
    default: '',
  },
  allowClear: {
    type: Boolean,
    default: true,
  },
  /** One picker: tap once for a day, or tap start then end for a range */
  range: {
    type: Boolean,
    default: false,
  },
  /** YYYY-MM — open calendar on this month when nothing is selected */
  initialMonth: {
    type: String,
    default: '',
  },
})

defineOptions({ inheritAttrs: false })

const emit = defineEmits(['update:modelValue', 'update:modelValueEnd'])

const root = ref(null)
const buttonRef = ref(null)
const menuRef = ref(null)
const isOpen = ref(false)
const menuStyle = ref({})
const viewYear = ref(new Date().getFullYear())
const viewMonth = ref(new Date().getMonth())

/** In-progress selection while the menu is open */
const draftStart = ref('')
const draftEnd = ref('')
/** After first tap in range mode, wait for second tap */
const awaitingEnd = ref(false)

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function parseKey(key) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return null
  const [y, m, d] = String(key).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isSameDay(a, b) {
  return Boolean(
    a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate(),
  )
}

function formatShort(date) {
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function normalizeRange(startKey, endKey) {
  const start = startKey || ''
  const end = endKey || ''
  if (!start) return { start: '', end: '' }
  if (!end || end === start) return { start, end: '' }
  if (end < start) return { start: end, end: start }
  return { start, end }
}

const committedStart = computed(() => parseKey(props.modelValue))
const committedEnd = computed(() => parseKey(props.modelValueEnd))

const displayLabel = computed(() => {
  const start = committedStart.value
  if (!start) return props.range ? 'Pick a date or range' : 'Pick a date'
  const end = committedEnd.value
  if (!props.range || !end || isSameDay(start, end)) return formatShort(start)
  return `${formatShort(start)} – ${formatShort(end)}`
})

const monthLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(viewYear.value, viewMonth.value, 1),
  ),
)

const previewStart = computed(() => parseKey(draftStart.value))
const previewEnd = computed(() => {
  if (!props.range) return previewStart.value
  if (awaitingEnd.value) return null
  return parseKey(draftEnd.value) || previewStart.value
})

const rangeHint = computed(() => {
  if (!props.range || !isOpen.value) return ''
  if (!draftStart.value) return 'Tap a start date'
  if (awaitingEnd.value) return 'Tap an end date — or the same day for one day only'
  if (draftEnd.value && draftEnd.value !== draftStart.value) {
    return `${formatShort(previewStart.value)} – ${formatShort(parseKey(draftEnd.value))}`
  }
  return formatShort(previewStart.value) || 'Date selected'
})

const calendarDays = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const start = previewStart.value
  const end = previewEnd.value
  const startKey = start ? toKey(start) : ''
  const endKey = end ? toKey(end) : startKey
  const lo = startKey && endKey && endKey < startKey ? endKey : startKey
  const hi = startKey && endKey && endKey < startKey ? startKey : endKey

  const cells = []
  for (let i = 0; i < startPad; i += 1) {
    cells.push({ key: `e-${i}`, empty: true })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(viewYear.value, viewMonth.value, day)
    const key = toKey(date)
    const isStart = Boolean(start && isSameDay(date, start))
    const isEnd = Boolean(end && isSameDay(date, end))
    const inMiddle = Boolean(props.range && lo && hi && lo !== hi && key > lo && key < hi)
    cells.push({
      key,
      empty: false,
      date,
      day,
      isSelected: props.range ? isStart || isEnd : isSameDay(date, committedStart.value),
      isRangeStart: props.range && isStart,
      isRangeEnd: props.range && isEnd,
      isInRange: inMiddle,
      isToday: isSameDay(date, new Date()),
    })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `e-end-${cells.length}`, empty: true })
  }
  return cells
})

function loadDraftFromProps() {
  draftStart.value = props.modelValue || ''
  draftEnd.value = props.range ? props.modelValueEnd || '' : ''
  awaitingEnd.value = false
}

function setCalendarMonth(date) {
  viewYear.value = date.getFullYear()
  viewMonth.value = date.getMonth()
}

function resolveOpenMonth() {
  if (draftStart.value) {
    const d = parseKey(draftStart.value)
    if (d) return d
  }
  if (/^\d{4}-\d{2}$/.test(String(props.initialMonth || ''))) {
    const [y, m] = props.initialMonth.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }
  return new Date()
}

function commit(startKey, endKey) {
  const next = normalizeRange(startKey, endKey)
  emit('update:modelValue', next.start)
  if (props.range) emit('update:modelValueEnd', next.end)
}

async function updateMenuPosition() {
  if (!buttonRef.value || !isOpen.value) return
  await nextTick()

  const isMobile = window.matchMedia('(max-width: 767px)').matches
  if (isMobile) {
    const width = Math.min(22.5 * 16, window.innerWidth - 24)
    menuStyle.value = {
      left: '50%',
      top: '50%',
      width: `${width}px`,
      maxHeight: 'min(88dvh, 36rem)',
      transform: 'translate(-50%, -50%)',
      overflowY: 'auto',
    }
    return
  }

  const rect = buttonRef.value.getBoundingClientRect()
  const menuHeight = menuRef.value?.offsetHeight || 340
  const menuWidth = Math.min(Math.max(rect.width, 300), window.innerWidth - 16)
  const pad = 8
  const spaceBelow = window.innerHeight - rect.bottom - pad
  const spaceAbove = rect.top - pad
  const openUpward = spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow
  const left = Math.min(Math.max(pad, rect.left), window.innerWidth - menuWidth - pad)
  const available = openUpward ? spaceAbove - 6 : spaceBelow - 6

  menuStyle.value = {
    left: `${left}px`,
    width: `${menuWidth}px`,
    top: openUpward ? `${rect.top - 6}px` : `${rect.bottom + 4}px`,
    transform: openUpward ? 'translateY(-100%)' : 'none',
    maxHeight: `${Math.max(240, Math.min(menuHeight, available))}px`,
    overflowY: 'auto',
  }
}

async function openMenu() {
  loadDraftFromProps()
  setCalendarMonth(resolveOpenMonth())
  isOpen.value = true
  await nextTick()
  updateMenuPosition()
  await nextTick()
  updateMenuPosition()
}

function closeMenu() {
  isOpen.value = false
  awaitingEnd.value = false
}

async function toggleMenu() {
  if (props.disabled) return
  if (isOpen.value) {
    closeMenu()
    return
  }
  await openMenu()
}

function shiftMonth(delta) {
  const date = new Date(viewYear.value, viewMonth.value + delta, 1)
  setCalendarMonth(date)
  nextTick(() => updateMenuPosition())
}

function pickDay(date) {
  if (!date) return
  const key = toKey(date)

  if (!props.range) {
    commit(key, '')
    closeMenu()
    return
  }

  // First tap (or restart after a finished draft): set start, wait for end
  if (!awaitingEnd.value) {
    draftStart.value = key
    draftEnd.value = ''
    awaitingEnd.value = true
    return
  }

  // Second tap: same day = single day; otherwise range
  draftEnd.value = key === draftStart.value ? '' : key
  awaitingEnd.value = false
  commit(draftStart.value, draftEnd.value)
  closeMenu()
}

function pickToday() {
  const key = toKey(new Date())
  if (!props.range) {
    commit(key, '')
    closeMenu()
    return
  }
  draftStart.value = key
  draftEnd.value = ''
  awaitingEnd.value = false
  commit(key, '')
  closeMenu()
}

function applyDraft() {
  if (!props.range) {
    closeMenu()
    return
  }
  // Done after only a start date → filter that one day
  if (draftStart.value) {
    const end = awaitingEnd.value ? '' : draftEnd.value
    commit(draftStart.value, end)
  }
  closeMenu()
}

function clearDate() {
  if (!props.allowClear) return
  draftStart.value = ''
  draftEnd.value = ''
  awaitingEnd.value = false
  commit('', '')
  closeMenu()
}

function handleClickOutside(event) {
  if (!isOpen.value) return
  if (root.value?.contains(event.target) || menuRef.value?.contains(event.target)) return
  // Keep in-progress single-day if user tapped start then clicked away / Done-equivalent
  if (props.range && draftStart.value && awaitingEnd.value) {
    commit(draftStart.value, '')
  }
  closeMenu()
}

function onKeydown(event) {
  if (!isOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeMenu()
  }
}

watch(
  () => props.initialMonth,
  (month) => {
    if (isOpen.value || props.modelValue) return
    if (/^\d{4}-\d{2}$/.test(String(month || ''))) {
      const [y, m] = month.split('-').map(Number)
      setCalendarMonth(new Date(y, m - 1, 1))
    }
  },
)

watch(isOpen, (open) => {
  if (open) {
    window.addEventListener('scroll', updateMenuPosition, true)
    window.addEventListener('resize', updateMenuPosition)
    return
  }
  window.removeEventListener('scroll', updateMenuPosition, true)
  window.removeEventListener('resize', updateMenuPosition)
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', updateMenuPosition, true)
  window.removeEventListener('resize', updateMenuPosition)
})
</script>

<template>
  <div ref="root" class="finance-date-input">
    <button
      :id="id || undefined"
      ref="buttonRef"
      class="finance-date-input__trigger"
      :class="{ 'finance-date-input__trigger--open': isOpen }"
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel || $attrs['aria-label'] || 'Pick date'"
      :aria-expanded="isOpen"
      aria-haspopup="dialog"
      :aria-required="required || undefined"
      @click.stop="toggleMenu"
    >
      <span class="finance-date-input__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      </span>
      <span
        class="finance-date-input__label"
        :class="{ 'finance-date-input__label--muted': !committedStart }"
      >
        {{ displayLabel }}
      </span>
    </button>

    <input
      class="sr-only"
      type="text"
      :name="name || undefined"
      :value="modelValue"
      :required="required"
      tabindex="-1"
      aria-hidden="true"
      readonly
    />

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="finance-date-menu"
        :style="menuStyle"
        role="dialog"
        aria-label="Choose date"
        @click.stop
      >
        <div class="finance-date-menu__cal">
          <div class="finance-date-menu__nav">
            <button class="finance-date-menu__nav-btn" type="button" aria-label="Previous month" @click="shiftMonth(-1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <p class="finance-date-menu__month">{{ monthLabel }}</p>
            <button class="finance-date-menu__nav-btn" type="button" aria-label="Next month" @click="shiftMonth(1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <p v-if="rangeHint" class="finance-date-menu__hint">{{ rangeHint }}</p>

          <div class="finance-date-menu__weekdays" aria-hidden="true">
            <span v-for="day in WEEKDAYS" :key="day">{{ day }}</span>
          </div>

          <div class="finance-date-menu__grid">
            <template v-for="cell in calendarDays" :key="cell.key">
              <span v-if="cell.empty" class="finance-date-menu__day finance-date-menu__day--empty" />
              <button
                v-else
                class="finance-date-menu__day"
                type="button"
                :class="{
                  'finance-date-menu__day--selected': cell.isSelected,
                  'finance-date-menu__day--range': cell.isInRange,
                  'finance-date-menu__day--range-start': cell.isRangeStart,
                  'finance-date-menu__day--range-end': cell.isRangeEnd,
                  'finance-date-menu__day--today': cell.isToday && !cell.isSelected,
                }"
                @click="pickDay(cell.date)"
              >
                {{ cell.day }}
              </button>
            </template>
          </div>
        </div>

        <div class="finance-date-menu__footer">
          <button class="finance-date-menu__ghost" type="button" @click="pickToday">Today</button>
          <div class="finance-date-menu__footer-actions">
            <button
              v-if="allowClear && (modelValue || modelValueEnd)"
              class="finance-date-menu__ghost"
              type="button"
              @click="clearDate"
            >
              Clear
            </button>
            <button class="finance-date-menu__done" type="button" @click="applyDraft">Done</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
