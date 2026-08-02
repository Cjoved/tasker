import { computed, ref, watch } from 'vue'

const SYSTEM_KEY = 'tasker:active-system'
const BUDGET_SECTION_KEY = 'tasker:budget-section'
const HABIT_SECTION_KEY = 'tasker:habit-section'
const FINANCE_ACTIVITY_TAB_KEY = 'tasker:finance-activity-tab'
const FINANCE_BUDGET_TAB_KEY = 'tasker:finance-budget-tab'
const FINANCE_NETWORTH_TAB_KEY = 'tasker:finance-networth-tab'

const VALID_SYSTEMS = ['tasker', 'habits', 'budget']
const VALID_BUDGET_SECTIONS = [
  'dashboard',
  'overview',
  'activity',
  'transactions',
  'accounts',
  'budget',
  'budgets',
  'limits',
  'subscriptions',
  'networth',
  'wealth',
  'investments',
  'debts',
  'goals',
]
const VALID_HABIT_SECTIONS = ['today', 'insights', 'categories', 'habits', 'stats', 'journal']
const VALID_ACTIVITY_TABS = ['transactions', 'accounts']
const VALID_BUDGET_TABS = ['limits', 'recurring']
const VALID_NETWORTH_TABS = ['investments', 'debts']

function readStorage(key, allowed, fallback) {
  try {
    const saved = localStorage.getItem(key)
    if (allowed.includes(saved)) return saved
  } catch {
    /* ignore */
  }
  return fallback
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function useAppSystem(user) {
  const activeSystem = ref(readStorage(SYSTEM_KEY, VALID_SYSTEMS, 'tasker'))
  const isSystemPickerOpen = ref(false)
  const habitSection = ref(readStorage(HABIT_SECTION_KEY, VALID_HABIT_SECTIONS, 'today'))
  const budgetSection = ref(readStorage(BUDGET_SECTION_KEY, VALID_BUDGET_SECTIONS, 'dashboard'))
  const financeActivityTab = ref(readStorage(FINANCE_ACTIVITY_TAB_KEY, VALID_ACTIVITY_TABS, 'transactions'))
  const financeBudgetTab = ref(readStorage(FINANCE_BUDGET_TAB_KEY, VALID_BUDGET_TABS, 'limits'))
  const financeNetworthTab = ref(readStorage(FINANCE_NETWORTH_TAB_KEY, VALID_NETWORTH_TABS, 'investments'))

  const userId = computed(() => user?.value?.id)

  const isTasker = computed(() => activeSystem.value === 'tasker')
  const isHabits = computed(() => activeSystem.value === 'habits')
  const isBudget = computed(() => activeSystem.value === 'budget')

  const systemLabel = computed(() => {
    if (isHabits.value) return 'Habit Tracker'
    if (isBudget.value) return 'Personal Finance'
    return 'Personal Tasker'
  })

  function openSystemPicker() {
    isSystemPickerOpen.value = true
  }

  function closeSystemPicker() {
    isSystemPickerOpen.value = false
  }

  function selectSystem(system) {
    if (!VALID_SYSTEMS.includes(system)) return
    activeSystem.value = system
    isSystemPickerOpen.value = false
    if (system === 'habits') {
      habitSection.value = readStorage(HABIT_SECTION_KEY, VALID_HABIT_SECTIONS, 'today')
    }
    if (system === 'budget') {
      budgetSection.value = readStorage(BUDGET_SECTION_KEY, VALID_BUDGET_SECTIONS, 'dashboard')
    }
  }

  function applyUrlDeepLink() {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const system = params.get('system')
    if (!system || !VALID_SYSTEMS.includes(system)) return

    selectSystem(system)
    const section = params.get('section')
    if (!section) return

    if (system === 'budget' && VALID_BUDGET_SECTIONS.includes(section)) {
      budgetSection.value = section
    }
    if (system === 'habits' && VALID_HABIT_SECTIONS.includes(section)) {
      habitSection.value = section
    }
  }

  watch(activeSystem, (value) => writeStorage(SYSTEM_KEY, value))
  watch(budgetSection, (value) => {
    if (VALID_BUDGET_SECTIONS.includes(value)) writeStorage(BUDGET_SECTION_KEY, value)
  })
  watch(habitSection, (value) => {
    if (VALID_HABIT_SECTIONS.includes(value)) writeStorage(HABIT_SECTION_KEY, value)
  })
  watch(financeActivityTab, (value) => {
    if (VALID_ACTIVITY_TABS.includes(value)) writeStorage(FINANCE_ACTIVITY_TAB_KEY, value)
  })
  watch(financeBudgetTab, (value) => {
    if (VALID_BUDGET_TABS.includes(value)) writeStorage(FINANCE_BUDGET_TAB_KEY, value)
  })
  watch(financeNetworthTab, (value) => {
    if (VALID_NETWORTH_TABS.includes(value)) writeStorage(FINANCE_NETWORTH_TAB_KEY, value)
  })

  watch(userId, (id, prev) => {
    if (id && id !== prev) {
      activeSystem.value = readStorage(SYSTEM_KEY, VALID_SYSTEMS, 'tasker')
      habitSection.value = readStorage(HABIT_SECTION_KEY, VALID_HABIT_SECTIONS, 'today')
      budgetSection.value = readStorage(BUDGET_SECTION_KEY, VALID_BUDGET_SECTIONS, 'dashboard')
      financeActivityTab.value = readStorage(FINANCE_ACTIVITY_TAB_KEY, VALID_ACTIVITY_TABS, 'transactions')
      financeBudgetTab.value = readStorage(FINANCE_BUDGET_TAB_KEY, VALID_BUDGET_TABS, 'limits')
      financeNetworthTab.value = readStorage(FINANCE_NETWORTH_TAB_KEY, VALID_NETWORTH_TABS, 'investments')
    }
  })

  return {
    activeSystem,
    isSystemPickerOpen,
    habitSection,
    budgetSection,
    financeActivityTab,
    financeBudgetTab,
    financeNetworthTab,
    isTasker,
    isHabits,
    isBudget,
    systemLabel,
    openSystemPicker,
    closeSystemPicker,
    selectSystem,
    applyUrlDeepLink,
  }
}
