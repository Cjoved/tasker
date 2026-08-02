<script setup>
import { computed, ref, toRefs, watch } from 'vue'
import DashboardBarChart from './DashboardBarChart.vue'
import DashboardDonutChart from './DashboardDonutChart.vue'
import LiveTrendChart from './LiveTrendChart.vue'
import FinanceAiPanel from './FinanceAiPanel.vue'
import FinanceSelect from './FinanceSelect.vue'
import FinanceCategoryIcon from './FinanceCategoryIcon.vue'
import FinanceMoneyInput from './FinanceMoneyInput.vue'
import FinanceDateInput from './FinanceDateInput.vue'
import FinanceHoldingIcon from './FinanceHoldingIcon.vue'
import { FINANCE_ASSET_CLASSES, assetClassLabel } from '../lib/financeAssetClasses'
import { formatInvestNumber, formatMoney, shiftMonthKey } from '../composables/useFinance'
import { localDateKey } from '../lib/localDate'
import { useConfirm } from '../composables/useConfirm'

const props = defineProps({
  api: {
    type: Object,
    required: true,
  },
  section: {
    type: String,
    default: 'dashboard',
  },
})

const emit = defineEmits(['create-transaction', 'edit-transaction', 'manage-categories', 'toast'])

const { confirmDelete, confirmArchive } = useConfirm()

const openModal = ref(null)
const activityTab = defineModel('activityTab', { type: String, default: 'transactions' })
const budgetTab = defineModel('budgetTab', { type: String, default: 'limits' })
const networthTab = defineModel('networthTab', { type: String, default: 'investments' })

function syncTabsFromSection(section) {
  if (section === 'accounts') activityTab.value = 'accounts'
  else if (section === 'transactions') activityTab.value = 'transactions'
  else if (section === 'activity') {
    /* keep current activity tab */
  } else if (section === 'subscriptions') budgetTab.value = 'recurring'
  else if (section === 'limits' || section === 'budgets') budgetTab.value = 'limits'
  else if (section === 'budget') {
    /* keep current budget tab */
  } else if (section === 'investments' || section === 'wealth') networthTab.value = 'investments'
  else if (section === 'debts') networthTab.value = 'debts'
  else if (section === 'networth') {
    /* keep current networth tab */
  }
}

syncTabsFromSection(props.section)

watch(
  () => props.section,
  (section) => {
    syncTabsFromSection(section)
  },
)

const resolvedSection = computed(() => {
  const section = props.section
  if (section === 'overview') return 'dashboard'
  if (['activity', 'transactions', 'accounts'].includes(section)) return 'activity'
  if (['budget', 'budgets', 'limits', 'subscriptions'].includes(section)) return 'budget'
  if (['networth', 'wealth', 'investments', 'debts'].includes(section)) return 'networth'
  return section
})

const showDashboard = computed(() => resolvedSection.value === 'dashboard')
const showActivity = computed(() => resolvedSection.value === 'activity')
const showBudget = computed(() => resolvedSection.value === 'budget')
const showNetworth = computed(() => resolvedSection.value === 'networth')
const showGoals = computed(() => resolvedSection.value === 'goals')

function closeModal() {
  openModal.value = null
  editingAccountId.value = null
  accountForm.value = { name: '', account_type: 'cash', opening_balance: '' }
  resetDailyLimitForm()
}

const {
  selectedMonth,
  filterType,
  filterCategoryId,
  filterSearch,
  filterDateFrom,
  filterDateTo,
  categories,
  recurring,
  accounts,
  goals,
  liabilities,
  holdings,
  isLoading,
  errorMessage,
  expenseCategories,
  incomeCategories,
  activeAccounts,
  accountBalances,
  monthTransactions,
  monthSummary,
  categoryProgress,
  overLimitCategories,
  dailyLimitProgress,
  spendDonutSegments,
  incomeExpenseBars,
  portfolioRows,
  cashAssets,
  investValue,
  liabilitiesTotal,
  netWorth,
  unrealizedGain,
  allocationSegments,
  netWorthTrend,
} = toRefs(props.api)

const debtMethod = ref('snowball')
const subscriptionsOnly = ref(true)
const isBusy = ref(false)
const goalAmountDrafts = ref({})

watch(
  goals,
  (list) => {
    const next = { ...goalAmountDrafts.value }
    for (const goal of list || []) {
      if (next[goal.id] == null) next[goal.id] = String(goal.current_amount ?? 0)
    }
    goalAmountDrafts.value = next
  },
  { immediate: true, deep: true },
)

const accountForm = ref({ name: '', account_type: 'cash', opening_balance: '' })
const editingAccountId = ref(null)
const transferForm = ref({
  from_account_id: '',
  to_account_id: '',
  amount: '',
  note: '',
  occurred_on: localDateKey(),
})
const recurringForm = ref({
  name: '',
  amount: '',
  type: 'expense',
  category_id: '',
  account_id: '',
  cadence: 'monthly',
  next_due: localDateKey(),
  is_subscription: true,
})
const holdingForm = ref({
  name: '',
  asset_class: 'stock',
  units: '',
  unit_cost: '',
  bought_on: localDateKey(),
  account_id: '',
})
const lotForm = ref({
  holding_id: '',
  units: '',
  unit_cost: '',
  bought_on: localDateKey(),
  account_id: '',
})
const sellForm = ref({
  holding_id: '',
  units: '',
  unit_price: '',
  sold_on: localDateKey(),
  account_id: '',
})
const markForm = ref({ holding_id: '', unit_price: '', marked_on: localDateKey() })
const dividendForm = ref({ holding_id: '', amount: '', paid_on: localDateKey(), note: '' })
const goalForm = ref({ name: '', target_amount: '', current_amount: '0', due_on: '' })
const liabilityForm = ref({ name: '', balance: '', apr: '', min_payment: '' })
const paydownForm = ref({ id: '', amount: '' })

const dailyLimitForm = ref({
  account_id: '',
  schedule: 'daily',
  target_days: [],
  amount: '',
  note: '',
})

const DAILY_LIMIT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dailyLimitScheduleOptions = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'custom_days', label: 'Custom days' },
]

function resetDailyLimitForm() {
  const firstAccount = activeAccounts.value?.[0]
  dailyLimitForm.value = {
    account_id: firstAccount?.id || '',
    schedule: 'daily',
    target_days: [],
    amount: '',
    note: '',
  }
}

function openDailyLimitModal(row = null) {
  if (row) {
    const schedule =
      row.schedule === 'custom_days' || row.schedule === 'weekly' ? row.schedule : 'daily'
    dailyLimitForm.value = {
      account_id: row.account_id || '',
      schedule,
      target_days: Array.isArray(row.target_days) ? [...row.target_days] : [],
      amount: row.limit != null ? String(row.limit) : '',
      note: row.note || '',
    }
  } else {
    resetDailyLimitForm()
  }
  openModal.value = 'daily-limit'
}

function setDailyLimitSchedule(next) {
  dailyLimitForm.value.schedule = next
  if (next !== 'custom_days') dailyLimitForm.value.target_days = []
}

function toggleDailyLimitDay(day) {
  const current = dailyLimitForm.value.target_days || []
  dailyLimitForm.value.target_days = current.includes(day)
    ? current.filter((item) => item !== day)
    : [...current, day].sort((a, b) => a - b)
}

const dailyLimitFormValid = computed(() => {
  if (!dailyLimitForm.value.account_id) return false
  if (!(Number(dailyLimitForm.value.amount) > 0)) return false
  if (dailyLimitForm.value.schedule === 'custom_days' && !dailyLimitForm.value.target_days.length) {
    return false
  }
  return true
})

async function onSaveDailyLimit() {
  if (isBusy.value || !dailyLimitFormValid.value) return
  isBusy.value = true
  const ok = await props.api.upsertDailyLimit({
    account_id: dailyLimitForm.value.account_id,
    schedule: dailyLimitForm.value.schedule,
    target_days: dailyLimitForm.value.target_days,
    amount: Number(dailyLimitForm.value.amount),
    note: dailyLimitForm.value.note,
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Spend limit saved' : props.api.errorMessage.value || 'Could not save limit.',
  })
  if (ok) {
    resetDailyLimitForm()
    openModal.value = null
  }
  isBusy.value = false
}

async function onDeleteDailyLimit(row) {
  if (isBusy.value || !row?.id) return
  const confirmed = await confirmDelete('spend limit')
  if (!confirmed) return
  isBusy.value = true
  const ok = await props.api.deleteDailyLimit(row.id)
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Daily limit removed' : props.api.errorMessage.value || 'Could not remove daily limit.',
  })
  isBusy.value = false
}

const accountTypeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'other', label: 'Other' },
]

const recurringTypeOptions = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
]

const cadenceOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const assetClassOptions = FINANCE_ASSET_CLASSES

const accountSelectOptions = computed(() =>
  (activeAccounts.value || []).map((account) => ({
    value: account.id,
    label: account.name,
  })),
)

const accountSelectOptionsWithNone = computed(() => [
  { value: '', label: 'None' },
  ...accountSelectOptions.value,
])

const fundAccountOptions = computed(() => [
  { value: '', label: 'No cash account' },
  ...accountSelectOptions.value,
])

const accountSelectOptionsWithPlaceholder = computed(() => [
  { value: '', label: 'Select account' },
  ...accountSelectOptions.value,
])

const markPreview = computed(() => {
  const holdingId = markForm.value.holding_id
  if (!holdingId || markForm.value.unit_price === '') return null
  const row = (portfolioRows.value || []).find((item) => item.holding.id === holdingId)
  if (!row) return null
  const price = Number(markForm.value.unit_price)
  if (!Number.isFinite(price) || price < 0) return null
  const marketValue = row.units * price
  const gain = marketValue - row.cost
  const gainPct = row.cost > 0 ? (gain / row.cost) * 100 : 0
  return { units: row.units, cost: row.cost, price, marketValue, gain, gainPct }
})

const lotTotalPreview = computed(() => {
  const units = Number(lotForm.value.units)
  const cost = Number(lotForm.value.unit_cost)
  if (!(units > 0) || !Number.isFinite(cost)) return null
  return units * cost
})

const sellTotalPreview = computed(() => {
  const units = Number(sellForm.value.units)
  const price = Number(sellForm.value.unit_price)
  if (!(units > 0) || !Number.isFinite(price) || price < 0) return null
  return units * price
})

const sellAvailableUnits = computed(() => {
  const holdingId = sellForm.value.holding_id
  if (!holdingId) return 0
  const row = (portfolioRows.value || []).find((item) => item.holding.id === holdingId)
  return row ? Number(row.units) || 0 : 0
})

const holdingBuyTotalPreview = computed(() => {
  const units = Number(holdingForm.value.units)
  const cost = Number(holdingForm.value.unit_cost)
  if (!(units > 0) || !Number.isFinite(cost)) return null
  return units * cost
})

const recurringCategoryOptions = computed(() => {
  const list =
    recurringForm.value.type === 'income' ? incomeCategories.value : expenseCategories.value
  return [
    { value: '', label: 'None' },
    ...(list || []).map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ]
})

const holdingSelectOptions = computed(() => [
  { value: '', label: 'Select holding' },
  ...(holdings.value || []).map((holding) => ({
    value: holding.id,
    label: holding.name,
  })),
])

const liabilitySelectOptions = computed(() => [
  { value: '', label: 'Select debt' },
  ...(liabilities.value || []).map((row) => ({
    value: row.id,
    label: row.name,
  })),
])

const monthLabel = computed(() => {
  const [year, month] = String(selectedMonth.value).split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
})

const netWorthChartItems = computed(() =>
  (netWorthTrend.value || []).map((point) => {
    const [year, month] = String(point.monthKey || point.label).split('-').map(Number)
    const label =
      year && month
        ? new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(
            new Date(year, month - 1, 1),
          )
        : point.label
    return {
      label,
      value: point.netWorth,
      sublabel: `Cash ${formatMoney(point.cashAssets)} · Invest ${formatMoney(point.investValue)}`,
    }
  }),
)

const allocationTotal = computed(() =>
  (allocationSegments.value || []).reduce((sum, segment) => sum + (segment.value || 0), 0),
)

const allocationTableRows = computed(() => {
  const total = allocationTotal.value
  if (!total) return []
  return (allocationSegments.value || []).map((segment) => ({
    ...segment,
    pct: Math.round((segment.value / total) * 1000) / 10,
  }))
})

const spendDonutTotal = computed(() =>
  (spendDonutSegments.value || []).reduce((sum, segment) => sum + (segment.value || 0), 0),
)

const spendDonutTableRows = computed(() => {
  const total = spendDonutTotal.value
  if (!total) return []
  return (spendDonutSegments.value || []).map((segment) => ({
    ...segment,
    pct: Math.round((segment.value / total) * 1000) / 10,
  }))
})

const subscriptionRows = computed(() => {
  const rows = recurring.value || []
  if (!subscriptionsOnly.value) return rows
  return rows.filter((row) => row.is_subscription)
})

const debtPlanRows = computed(() => props.api.debtPlan(debtMethod.value))

const recentTransactions = computed(() => (monthTransactions.value || []).slice(0, 6))

const filtersActive = computed(
  () =>
    filterType.value !== 'all' ||
    filterCategoryId.value !== 'all' ||
    Boolean(filterSearch.value?.trim()) ||
    Boolean(filterDateFrom.value) ||
    Boolean(filterDateTo.value),
)

const categoryFilterOptions = computed(() => [
  { value: 'all', label: 'All categories' },
  ...(categories.value || []).map((category) => ({
    value: category.id,
    label: category.name,
  })),
])

function clearFilters() {
  filterType.value = 'all'
  filterCategoryId.value = 'all'
  filterSearch.value = ''
  filterDateFrom.value = ''
  filterDateTo.value = ''
}

function gainClass(value) {
  return Number(value) >= 0
    ? 'text-emerald-600 dark:text-emerald-300'
    : 'text-rose-600 dark:text-rose-300'
}

function formatSignedMoney(amount) {
  const value = Number(amount) || 0
  if (value > 0) return `+${formatMoney(value)}`
  if (value < 0) return `−${formatMoney(Math.abs(value))}`
  return formatMoney(0)
}

function formatSignedPct(pct) {
  const value = Number(pct) || 0
  const body = `${Math.abs(value).toFixed(1)}%`
  if (value > 0) return `+${body}`
  if (value < 0) return `−${body}`
  return body
}

function openBuyMore(holdingId = '') {
  lotForm.value = {
    holding_id: holdingId || '',
    units: '',
    unit_cost: '',
    bought_on: localDateKey(),
    account_id: '',
  }
  openModal.value = 'lot'
}

function openSell(holdingId = '') {
  sellForm.value = {
    holding_id: holdingId || '',
    units: '',
    unit_price: '',
    sold_on: localDateKey(),
    account_id: '',
  }
  openModal.value = 'sell'
}

function openMarkPrice(holdingId = '') {
  markForm.value = {
    holding_id: holdingId || markForm.value.holding_id || '',
    unit_price: '',
    marked_on: localDateKey(),
  }
  openModal.value = 'mark'
}

function categoryName(id) {
  return props.api.categoryById(id)?.name || 'Category'
}

function accountName(id) {
  return id ? props.api.accountById(id)?.name || 'Account' : '—'
}

function accountTypeLabel(type) {
  if (type === 'cash') return 'Cash'
  if (type === 'bank') return 'Bank'
  if (type === 'ewallet') return 'E-wallet'
  return 'Other'
}

function progressTone(row) {
  if (row.over) return 'over'
  if (row.limit != null && row.pct >= 80) return 'warn'
  return 'ok'
}

function prevMonth() {
  selectedMonth.value = shiftMonthKey(selectedMonth.value, -1)
}

function nextMonth() {
  selectedMonth.value = shiftMonthKey(selectedMonth.value, 1)
}

async function onDeleteTransaction(row) {
  const confirmed = await confirmDelete('transaction', row.note || undefined)
  if (!confirmed) return
  const ok = await props.api.deleteTransaction(row.id)
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Transaction deleted' : props.api.errorMessage.value || 'Could not delete transaction.',
  })
}

async function onExportCsv() {
  props.api.exportCsv()
  emit('toast', { type: 'success', message: 'CSV export started.' })
}

async function onCreateAccount() {
  if (isBusy.value || !accountForm.value.name.trim()) return
  isBusy.value = true

  const payload = {
    name: accountForm.value.name,
    account_type: accountForm.value.account_type,
    opening_balance: accountForm.value.opening_balance,
  }

  const ok = editingAccountId.value
    ? await props.api.updateAccount(editingAccountId.value, payload)
    : await props.api.createAccount(payload)

  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok
      ? editingAccountId.value
        ? 'Account updated'
        : 'Account added'
      : props.api.errorMessage.value || (editingAccountId.value ? 'Could not update account.' : 'Could not add account.'),
  })
  if (ok) closeModal()
  isBusy.value = false
}

function openCreateAccount() {
  editingAccountId.value = null
  accountForm.value = { name: '', account_type: 'cash', opening_balance: '' }
  openModal.value = 'account'
}

function openEditAccount(account) {
  editingAccountId.value = account.id
  accountForm.value = {
    name: account.name || '',
    account_type: account.account_type || 'other',
    opening_balance: String(account.opening_balance ?? 0),
  }
  openModal.value = 'account'
}

async function onArchiveAccount(account) {
  if (isBusy.value) return
  const confirmed = await confirmArchive('account', account.name)
  if (!confirmed) return
  isBusy.value = true
  const ok = await props.api.updateAccount(account.id, { is_archived: true })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Account archived' : props.api.errorMessage.value || 'Could not archive account.',
  })
  isBusy.value = false
}

async function onCreateTransfer() {
  if (isBusy.value) return
  isBusy.value = true
  const ok = await props.api.createTransfer({
    ...transferForm.value,
    amount: Number(transferForm.value.amount),
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Transfer recorded' : props.api.errorMessage.value || 'Could not transfer.',
  })
  if (ok) {
    transferForm.value = {
      from_account_id: '',
      to_account_id: '',
      amount: '',
      note: '',
      occurred_on: localDateKey(),
    }
    openModal.value = null
  }
  isBusy.value = false
}

async function onCreateRecurring() {
  if (isBusy.value || !recurringForm.value.name.trim() || !recurringForm.value.amount) return
  isBusy.value = true
  const ok = await props.api.createRecurring({
    ...recurringForm.value,
    category_id: recurringForm.value.category_id || null,
    account_id: recurringForm.value.account_id || null,
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Recurring item created' : props.api.errorMessage.value || 'Could not create recurring item.',
  })
  if (ok) {
    recurringForm.value = {
      name: '',
      amount: '',
      type: 'expense',
      category_id: '',
      account_id: '',
      cadence: 'monthly',
      next_due: localDateKey(),
      is_subscription: subscriptionsOnly.value,
    }
    openModal.value = null
  }
  isBusy.value = false
}

async function onPostRecurring(row) {
  if (isBusy.value) return
  isBusy.value = true
  const ok = await props.api.postRecurring(row.id)
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Posted to transactions' : props.api.errorMessage.value || 'Could not post recurring item.',
  })
  isBusy.value = false
}

async function onToggleRecurring(row) {
  if (isBusy.value) return
  isBusy.value = true
  const ok = await props.api.updateRecurring(row.id, { is_active: !row.is_active })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok
      ? row.is_active
        ? 'Recurring item paused'
        : 'Recurring item activated'
      : props.api.errorMessage.value || 'Could not update recurring item.',
  })
  isBusy.value = false
}

async function onCreateHolding() {
  if (isBusy.value || !holdingForm.value.name.trim()) return
  isBusy.value = true
  const ok = await props.api.createHolding({
    name: holdingForm.value.name,
    asset_class: holdingForm.value.asset_class,
    lot: {
      units: holdingForm.value.units,
      unit_cost: holdingForm.value.unit_cost,
      bought_on: holdingForm.value.bought_on,
      account_id: holdingForm.value.account_id || null,
    },
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Holding added' : props.api.errorMessage.value || 'Could not add holding.',
  })
  if (ok) {
    holdingForm.value = {
      name: '',
      asset_class: 'stock',
      units: '',
      unit_cost: '',
      bought_on: localDateKey(),
      account_id: '',
    }
    openModal.value = null
  }
  isBusy.value = false
}

async function onAddLot() {
  if (isBusy.value || !lotForm.value.holding_id || !lotForm.value.units) return
  isBusy.value = true
  const ok = await props.api.addLot(lotForm.value.holding_id, {
    units: lotForm.value.units,
    unit_cost: lotForm.value.unit_cost,
    bought_on: lotForm.value.bought_on,
    account_id: lotForm.value.account_id || null,
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Buy recorded' : props.api.errorMessage.value || 'Could not record buy.',
  })
  if (ok) {
    lotForm.value = {
      holding_id: '',
      units: '',
      unit_cost: '',
      bought_on: localDateKey(),
      account_id: '',
    }
    openModal.value = null
  }
  isBusy.value = false
}

async function onSellUnits() {
  if (isBusy.value || !sellForm.value.holding_id || !sellForm.value.units) return
  if (sellForm.value.unit_price === '') return
  isBusy.value = true
  const ok = await props.api.sellUnits(sellForm.value.holding_id, {
    units: sellForm.value.units,
    unit_price: sellForm.value.unit_price,
    sold_on: sellForm.value.sold_on,
    account_id: sellForm.value.account_id || null,
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Sell recorded' : props.api.errorMessage.value || 'Could not record sell.',
  })
  if (ok) {
    sellForm.value = {
      holding_id: '',
      units: '',
      unit_price: '',
      sold_on: localDateKey(),
      account_id: '',
    }
    openModal.value = null
  }
  isBusy.value = false
}

async function onMarkPrice() {
  if (isBusy.value || !markForm.value.holding_id || markForm.value.unit_price === '') return
  isBusy.value = true
  const ok = await props.api.markPrice(markForm.value.holding_id, {
    unit_price: markForm.value.unit_price,
    marked_on: markForm.value.marked_on,
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Price updated' : props.api.errorMessage.value || 'Could not update price.',
  })
  if (ok) openModal.value = null
  isBusy.value = false
}

async function onAddDividend() {
  if (isBusy.value || !dividendForm.value.holding_id || !dividendForm.value.amount) return
  isBusy.value = true
  const ok = await props.api.addDividend(dividendForm.value.holding_id, {
    amount: dividendForm.value.amount,
    paid_on: dividendForm.value.paid_on,
    note: dividendForm.value.note,
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Dividend recorded' : props.api.errorMessage.value || 'Could not record dividend.',
  })
  if (ok) {
    dividendForm.value = { holding_id: '', amount: '', paid_on: localDateKey(), note: '' }
    openModal.value = null
  }
  isBusy.value = false
}

async function onCreateGoal() {
  if (isBusy.value || !goalForm.value.name.trim() || !goalForm.value.target_amount) return
  isBusy.value = true
  const ok = await props.api.createGoal(goalForm.value)
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Goal created' : props.api.errorMessage.value || 'Could not create goal.',
  })
  if (ok) {
    goalForm.value = { name: '', target_amount: '', current_amount: '0', due_on: '' }
    openModal.value = null
  }
  isBusy.value = false
}

async function onUpdateGoalAmount(goal) {
  if (isBusy.value) return
  isBusy.value = true
  const amount = goalAmountDrafts.value[goal.id]
  const ok = await props.api.updateGoal(goal.id, { current_amount: amount })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Goal progress updated' : props.api.errorMessage.value || 'Could not update goal.',
  })
  isBusy.value = false
}

function goalProgressPct(goal) {
  const target = Number(goal.target_amount) || 1
  const current = Number(goal.current_amount) || 0
  return Math.min(100, Math.round((current / target) * 100))
}

function goalRemaining(goal) {
  return Math.max(0, (Number(goal.target_amount) || 0) - (Number(goal.current_amount) || 0))
}

async function onCreateLiability() {
  if (isBusy.value || !liabilityForm.value.name.trim()) return
  isBusy.value = true
  const ok = await props.api.createLiability(liabilityForm.value)
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Debt added' : props.api.errorMessage.value || 'Could not add debt.',
  })
  if (ok) {
    liabilityForm.value = { name: '', balance: '', apr: '', min_payment: '' }
    openModal.value = null
  }
  isBusy.value = false
}

async function onPayDownLiability() {
  if (isBusy.value || !paydownForm.value.id || !paydownForm.value.amount) return
  const liability = (liabilities.value || []).find((row) => row.id === paydownForm.value.id)
  if (!liability) return
  const payment = Number(paydownForm.value.amount) || 0
  const nextBalance = Math.max(0, (Number(liability.balance) || 0) - payment)
  isBusy.value = true
  const ok = await props.api.updateLiability(liability.id, { balance: nextBalance })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Payment applied' : props.api.errorMessage.value || 'Could not apply payment.',
  })
  if (ok) paydownForm.value = { id: '', amount: '' }
  isBusy.value = false
}

async function onCreateFromProposal(proposal) {
  const ok = await props.api.createTransaction({
    category_id: proposal.categoryId,
    amount: proposal.amount,
    type: proposal.type,
    account_id: proposal.accountId,
    note: proposal.note,
    occurred_on: proposal.occurred_on,
  })
  emit('toast', {
    type: ok ? 'success' : 'error',
    message: ok ? 'Transaction created from AI' : props.api.errorMessage.value || 'Could not create transaction.',
  })
}
</script>

<template>
  <div class="finance-shell space-y-5">
    <p
      v-if="errorMessage"
      class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <div
      v-if="isLoading"
      class="finance-panel text-center text-sm text-slate-500"
      aria-live="polite"
    >
      Loading finance data…
    </div>

    <template v-else>
      <!-- ── DASHBOARD ─────────────────────────────────────────────── -->
      <template v-if="showDashboard">
        <div class="finance-home space-y-5">
        <section class="finance-hero finance-hero--home">
          <div class="finance-home-hero-grid flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="finance-kicker">Monthly overview</p>
              <h1 class="finance-hero-title mt-1">Home</h1>
              <p class="finance-modal-subtitle finance-home-hero-sub mt-1">Your personal finances at a glance.</p>
            </div>
            <div class="finance-home-hero-actions flex flex-wrap items-center gap-3">
              <div class="finance-home-month flex items-center gap-2">
                <button
                  class="finance-action-btn"
                  type="button"
                  aria-label="Previous month"
                  title="Previous month"
                  :disabled="isLoading"
                  @click="prevMonth"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <strong class="finance-home-month-label min-w-36 text-center type-card-title">{{ monthLabel }}</strong>
                <button
                  class="finance-action-btn"
                  type="button"
                  aria-label="Next month"
                  title="Next month"
                  :disabled="isLoading"
                  @click="nextMonth"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
              <button class="finance-primary-btn" type="button" @click="emit('create-transaction')">
                <span class="finance-primary-btn__full">Add transaction</span>
                <span class="finance-primary-btn__short">Add</span>
              </button>
            </div>
          </div>
        </section>

        <div class="finance-wealth-strip">
          <div>
            <p class="finance-label">Net worth</p>
            <p class="mt-1 text-2xl font-black tabular-nums" :class="gainClass(netWorth)">
              {{ formatMoney(netWorth) }}
            </p>
          </div>
          <div>
            <p class="finance-label">Cash &amp; wallets</p>
            <p class="mt-1 text-lg font-bold tabular-nums text-blue-700 dark:text-blue-300">
              {{ formatMoney(cashAssets) }}
            </p>
          </div>
          <div>
            <p class="finance-label">Investments</p>
            <p class="mt-1 text-lg font-bold tabular-nums text-blue-700 dark:text-blue-300">
              {{ formatMoney(investValue) }}
            </p>
          </div>
          <div>
            <p class="finance-label">Liabilities</p>
            <p class="mt-1 text-lg font-bold tabular-nums text-rose-600 dark:text-rose-300">
              {{ formatMoney(liabilitiesTotal) }}
            </p>
          </div>
          <div>
            <p class="finance-label">Unrealized gain</p>
            <p class="mt-1 text-lg font-bold tabular-nums" :class="gainClass(unrealizedGain)">
              {{ formatMoney(unrealizedGain) }}
            </p>
          </div>
        </div>

        <div class="finance-home-cashflow grid grid-cols-3 gap-2 sm:gap-3">
          <article class="finance-stat-card finance-stat-card--gain">
            <p class="type-caption type-muted">Income</p>
            <p class="mt-1 text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-300">
              {{ formatMoney(monthSummary.income) }}
            </p>
          </article>
          <article class="finance-stat-card finance-stat-card--loss">
            <p class="type-caption type-muted">Expense</p>
            <p class="mt-1 text-2xl font-black tabular-nums text-rose-600 dark:text-rose-300">
              {{ formatMoney(monthSummary.expense) }}
            </p>
          </article>
          <article class="finance-stat-card">
            <p class="type-caption type-muted">Net cashflow</p>
            <p class="mt-1 text-2xl font-black tabular-nums" :class="gainClass(monthSummary.net)">
              {{ formatMoney(monthSummary.net) }}
            </p>
          </article>
        </div>

        <div
          v-if="overLimitCategories.length"
          class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
          role="alert"
        >
          <p class="font-bold">Over budget</p>
          <p class="mt-1">
            {{
              overLimitCategories
                .map((row) => `${row.category.name} (${formatMoney(row.spent)} / ${formatMoney(row.limit)})`)
                .join(' · ')
            }}
            — review caps in Budget.
          </p>
        </div>

        <div class="finance-dash-charts">
          <div class="finance-dash-col finance-dash-col--main">
            <article class="finance-panel finance-dash-trend">
              <div class="mb-2 flex items-end justify-between gap-3">
                <h3 class="type-card-title">Net worth trend</h3>
                <p class="type-caption type-muted hidden sm:block">Last 6 months</p>
              </div>
              <LiveTrendChart
                :items="netWorthChartItems"
                type="line"
                :height="240"
                compact
                value-suffix=""
                color="#1e40af"
                empty-label="Not enough history yet."
              />
            </article>
          </div>

          <div class="finance-dash-col finance-dash-col--side">
            <article class="finance-panel finance-dash-donut">
              <h3 class="type-card-title mb-3">Spend by category</h3>
              <DashboardDonutChart
                :segments="spendDonutSegments"
                size="md"
                layout="stack"
                center-label="Spent"
                empty-label="No expenses this month."
                :format-value="formatMoney"
              />
              <table v-if="spendDonutTableRows.length" class="sr-only">
                <caption>Spend by category percentages</caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in spendDonutTableRows" :key="row.label">
                    <td>{{ row.label }}</td>
                    <td>{{ formatMoney(row.value) }}</td>
                    <td>{{ row.pct }}%</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <article class="finance-panel finance-dash-alloc">
              <h3 class="type-card-title mb-3">Asset allocation</h3>
              <DashboardDonutChart
                :segments="allocationSegments"
                size="md"
                layout="stack"
                center-label="Assets"
                empty-label="No assets tracked yet."
                :format-value="formatMoney"
              />
              <table v-if="allocationTableRows.length" class="sr-only">
                <caption>Asset allocation percentages</caption>
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col">Value</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in allocationTableRows" :key="row.label">
                    <td>{{ row.label }}</td>
                    <td>{{ formatMoney(row.value) }}</td>
                    <td>{{ row.pct }}%</td>
                  </tr>
                </tbody>
              </table>
            </article>
          </div>
        </div>

        <div class="finance-dash-bottom">
          <article class="finance-panel finance-dash-bars">
            <h3 class="type-card-title">Income vs expense</h3>
            <div v-if="!incomeExpenseBars.length" class="type-body-sm type-muted">
              No transactions this month.
            </div>
            <div v-else class="finance-cashflow-compare">
              <div
                v-for="item in incomeExpenseBars"
                :key="item.label"
                class="finance-cashflow-compare__row"
              >
                <div class="finance-cashflow-compare__meta">
                  <span class="finance-cashflow-compare__label">{{ item.label }}</span>
                  <span
                    class="finance-cashflow-compare__value tabular-nums"
                    :class="
                      item.label === 'Expense'
                        ? 'text-rose-600 dark:text-rose-300'
                        : 'text-emerald-600 dark:text-emerald-300'
                    "
                  >
                    {{ formatMoney(item.value) }}
                  </span>
                </div>
                <div class="dashboard-bar-track overflow-hidden">
                  <span
                    class="dashboard-bar-fill block h-full rounded-full"
                    :style="{
                      width: `${Math.max(
                        ((Number(item.value) || 0) /
                          Math.max(...incomeExpenseBars.map((row) => Number(row.value) || 0), 1)) *
                          100,
                        item.value ? 6 : 0,
                      )}%`,
                      background: `linear-gradient(90deg, ${item.color || '#1e40af'}, color-mix(in srgb, ${item.color || '#1e40af'} 70%, white))`,
                    }"
                  />
                </div>
              </div>
            </div>
          </article>

          <article class="finance-panel finance-dash-recent">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="type-card-title">Recent activity</h3>
              <button
                class="finance-ghost-btn !min-h-0 px-3 py-1.5 text-xs"
                type="button"
                @click="emit('create-transaction')"
              >
                Add transaction
              </button>
            </div>
            <div v-if="!recentTransactions.length" class="finance-dash-recent-empty">
              <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">No transactions this month</p>
              <p class="type-caption type-muted mt-1">Add income or expenses to fill this space with live activity.</p>
            </div>
            <ul v-else class="finance-dash-recent-list">
              <li
                v-for="row in recentTransactions"
                :key="row.id"
                class="finance-row !p-3 flex items-center justify-between gap-3"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {{ row.type === 'transfer' ? (row.note || 'Transfer') : categoryName(row.category_id) }}
                  </p>
                  <p class="type-caption type-muted">
                    {{ row.occurred_on }}
                    <span v-if="row.account_id"> · {{ accountName(row.account_id) }}</span>
                  </p>
                </div>
                <strong
                  class="shrink-0 tabular-nums text-sm"
                  :class="row.type === 'income' ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'"
                >
                  {{ row.type === 'income' ? '+' : '-' }}{{ formatMoney(row.amount) }}
                </strong>
              </li>
            </ul>
          </article>
        </div>
        </div>
      </template>

      <!-- ── ACTIVITY (Transactions / Accounts) ───────────────────── -->
      <template v-else-if="showActivity">
        <div class="finance-activity space-y-5">
        <section class="finance-hero finance-hero--activity">
          <div class="finance-activity-hero-grid flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="finance-kicker">Money moves</p>
              <h1 class="finance-hero-title mt-1">Activity</h1>
              <p class="finance-modal-subtitle finance-activity-hero-sub mt-1">Transactions and account balances in one place.</p>
            </div>
            <div class="finance-activity-hero-actions flex flex-wrap items-center gap-3">
              <template v-if="activityTab === 'transactions'">
                <div class="finance-activity-month flex items-center gap-2">
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Previous month"
                    title="Previous month"
                    :disabled="isLoading"
                    @click="prevMonth"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <strong class="finance-activity-month-label min-w-36 text-center type-card-title">{{ monthLabel }}</strong>
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Next month"
                    title="Next month"
                    :disabled="isLoading"
                    @click="nextMonth"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
                <button class="finance-primary-btn" type="button" @click="emit('create-transaction')">
                  <span class="finance-primary-btn__full">Add transaction</span>
                  <span class="finance-primary-btn__short">Add</span>
                </button>
                <button
                  class="finance-action-btn"
                  type="button"
                  aria-label="Export CSV"
                  title="Export CSV"
                  :disabled="!monthTransactions.length"
                  @click="onExportCsv"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M12 3v12" />
                    <path d="m8 11 4 4 4-4" />
                    <path d="M5 19h14" />
                  </svg>
                </button>
              </template>
              <template v-else>
                <button class="finance-primary-btn" type="button" @click="openCreateAccount">
                  <span class="finance-primary-btn__full">Add account</span>
                  <span class="finance-primary-btn__short">Add</span>
                </button>
                <button
                  class="finance-action-btn"
                  type="button"
                  aria-label="Transfer between accounts"
                  title="Transfer"
                  @click="openModal = 'transfer'"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M7 10h13l-3-3M17 14H4l3 3" />
                  </svg>
                </button>
              </template>
            </div>
          </div>

          <div class="finance-activity-tabs mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Activity sections">
            <button
              class="finance-chip"
              :class="{ 'finance-chip--active': activityTab === 'transactions' }"
              type="button"
              role="tab"
              :aria-selected="activityTab === 'transactions'"
              @click="activityTab = 'transactions'"
            >
              Transactions
            </button>
            <button
              class="finance-chip"
              :class="{ 'finance-chip--active': activityTab === 'accounts' }"
              type="button"
              role="tab"
              :aria-selected="activityTab === 'accounts'"
              @click="activityTab = 'accounts'"
            >
              Accounts
            </button>
          </div>
        </section>

        <template v-if="activityTab === 'transactions'">
        <article class="finance-filter-bar">
          <div class="finance-filter-search">
            <svg class="finance-filter-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <label class="sr-only" for="finance-tx-search">Search transactions</label>
            <input
              id="finance-tx-search"
              v-model="filterSearch"
              class="finance-filter-search__input"
              type="search"
              placeholder="Search notes, amount cues…"
              aria-label="Search transactions"
            />
            <button
              v-if="filterSearch"
              class="finance-action-btn finance-filter-search__clear !h-9 !w-9 !min-h-0 !min-w-0"
              type="button"
              aria-label="Clear search"
              title="Clear search"
              @click="filterSearch = ''"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="finance-filter-meta">
            <div class="finance-chip-group" role="group" aria-label="Filter by type">
              <button
                class="finance-chip"
                :class="{ 'finance-chip--active': filterType === 'all' }"
                type="button"
                @click="filterType = 'all'"
              >
                All
              </button>
              <button
                class="finance-chip"
                :class="{ 'finance-chip--active': filterType === 'income' }"
                type="button"
                @click="filterType = 'income'"
              >
                Income
              </button>
              <button
                class="finance-chip"
                :class="{ 'finance-chip--active': filterType === 'expense' }"
                type="button"
                @click="filterType = 'expense'"
              >
                Expense
              </button>
              <button
                class="finance-chip"
                :class="{ 'finance-chip--active': filterType === 'transfer' }"
                type="button"
                @click="filterType = 'transfer'"
              >
                Transfer
              </button>
            </div>

            <div class="finance-filter-dates">
              <div class="finance-filter-date finance-filter-date--range">
                <label class="finance-filter-date__label" for="finance-tx-date">Date</label>
                <FinanceDateInput
                  id="finance-tx-date"
                  v-model="filterDateFrom"
                  v-model:model-value-end="filterDateTo"
                  :range="true"
                  :initial-month="selectedMonth"
                  aria-label="Filter by date or range"
                />
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <label class="sr-only" for="finance-tx-category">Category</label>
              <FinanceSelect
                id="finance-tx-category"
                v-model="filterCategoryId"
                size="filter"
                :options="categoryFilterOptions"
                aria-label="Filter by category"
                placeholder="All categories"
              />
              <button
                v-if="filtersActive"
                class="finance-chip"
                type="button"
                @click="clearFilters"
              >
                Clear filters
              </button>
            </div>
          </div>
        </article>

          <!-- Desktop table -->
          <div class="finance-tx-table-wrap finance-tx-desktop">
            <table class="finance-tx-table">
              <caption class="sr-only">Transactions for {{ monthLabel }}</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Type</th>
                  <th scope="col">Category</th>
                  <th scope="col">Account</th>
                  <th scope="col">Note</th>
                  <th scope="col" class="finance-tx-table__amount">Amount</th>
                  <th scope="col" class="finance-tx-table__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!monthTransactions.length">
                  <td colspan="7" class="finance-tx-table__empty">
                    <p class="font-semibold text-slate-800 dark:text-slate-100">No transactions for {{ monthLabel }}</p>
                    <p class="type-caption type-muted mt-1">Add your first income or expense to get started.</p>
                    <button class="finance-primary-btn mt-3" type="button" @click="emit('create-transaction')">
                      Add transaction
                    </button>
                  </td>
                </tr>
                <tr v-for="row in monthTransactions" :key="row.id">
                  <td class="finance-tx-table__date">{{ row.occurred_on }}</td>
                  <td class="finance-tx-table__type">
                    <span
                      class="finance-tx-type"
                      :class="{
                        'finance-tx-type--income': row.type === 'income',
                        'finance-tx-type--expense': row.type === 'expense',
                        'finance-tx-type--transfer': row.type === 'transfer',
                      }"
                    >
                      {{ row.type === 'income' ? 'Income' : row.type === 'transfer' ? 'Transfer' : 'Expense' }}
                    </span>
                  </td>
                  <td class="finance-tx-table__category">
                    {{ row.type === 'transfer' ? 'Transfer' : categoryName(row.category_id) }}
                  </td>
                  <td class="finance-tx-table__account">{{ row.account_id ? accountName(row.account_id) : '—' }}</td>
                  <td class="finance-tx-table__note">
                    <span :title="row.note || undefined">{{ row.note?.trim() ? row.note : '—' }}</span>
                  </td>
                  <td
                    class="finance-tx-table__amount"
                    :class="row.type === 'income' ? 'finance-tx-table__amount--in' : 'finance-tx-table__amount--out'"
                  >
                    {{ row.type === 'income' ? '+' : '−' }}{{ formatMoney(row.amount) }}
                  </td>
                  <td class="finance-tx-table__actions">
                    <button
                      class="finance-action-btn"
                      type="button"
                      aria-label="Edit transaction"
                      title="Edit"
                      @click="emit('edit-transaction', row)"
                    >
                      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      class="finance-action-btn finance-action-btn--danger"
                      type="button"
                      aria-label="Delete transaction"
                      title="Delete"
                      :disabled="isBusy"
                      @click="onDeleteTransaction(row)"
                    >
                      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile list -->
          <div class="finance-tx-list-wrap finance-tx-mobile">
            <div v-if="!monthTransactions.length" class="finance-tx-empty">
              <p class="font-semibold text-slate-800 dark:text-slate-100">No transactions for {{ monthLabel }}</p>
              <p class="type-caption type-muted mt-1">Add your first income or expense to get started.</p>
              <button class="finance-primary-btn mt-3" type="button" @click="emit('create-transaction')">
                Add transaction
              </button>
            </div>
            <ul v-else class="finance-tx-list" :aria-label="`Transactions for ${monthLabel}`">
              <li v-for="row in monthTransactions" :key="row.id" class="finance-tx-list-item">
                <div class="finance-tx-list-item__main min-w-0">
                  <div class="finance-tx-list-item__row">
                    <strong class="finance-tx-list-item__title truncate">
                      {{ row.type === 'transfer' ? 'Transfer' : categoryName(row.category_id) }}
                    </strong>
                    <span
                      class="finance-tx-list-item__amount tabular-nums"
                      :class="row.type === 'income' ? 'finance-tx-table__amount--in' : 'finance-tx-table__amount--out'"
                    >
                      {{ row.type === 'income' ? '+' : '−' }}{{ formatMoney(row.amount) }}
                    </span>
                  </div>
                  <div class="finance-tx-list-item__meta">
                    <span>{{ row.occurred_on }}</span>
                    <span
                      class="finance-tx-type"
                      :class="{
                        'finance-tx-type--income': row.type === 'income',
                        'finance-tx-type--expense': row.type === 'expense',
                        'finance-tx-type--transfer': row.type === 'transfer',
                      }"
                    >
                      {{ row.type === 'income' ? 'In' : row.type === 'transfer' ? 'Xfer' : 'Out' }}
                    </span>
                    <span class="truncate">{{ row.account_id ? accountName(row.account_id) : '—' }}</span>
                  </div>
                  <p v-if="row.note?.trim()" class="finance-tx-list-item__note truncate">{{ row.note }}</p>
                </div>
                <div class="finance-tx-list-item__actions">
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Edit transaction"
                    title="Edit"
                    @click="emit('edit-transaction', row)"
                  >
                    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    class="finance-action-btn finance-action-btn--danger"
                    type="button"
                    aria-label="Delete transaction"
                    title="Delete"
                    :disabled="isBusy"
                    @click="onDeleteTransaction(row)"
                  >
                    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </template>

        <template v-else>
          <div v-if="!activeAccounts.length" class="finance-empty">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mx-auto mb-3 h-10 w-10 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p class="font-semibold">No accounts yet</p>
            <p class="type-caption type-muted mt-1">Add your cash, bank, or e-wallet accounts to track balances.</p>
            <button class="finance-primary-btn mt-3" type="button" @click="openCreateAccount">
              Add account
            </button>
          </div>
          <div v-else class="finance-account-grid">
            <article
              v-for="account in activeAccounts"
              :key="account.id"
              class="finance-account-card"
              :class="`finance-account-card--${account.account_type || 'other'}`"
            >
              <span class="finance-account-card__glow" aria-hidden="true"></span>
              <span class="finance-account-card__mark" aria-hidden="true">
                <svg
                  v-if="account.account_type === 'cash'"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v10M15.5 9.5c0-1.4-1.6-2.5-3.5-2.5S8.5 8.1 8.5 9.5 10.1 12 12 12s3.5 1.1 3.5 2.5-1.6 2.5-3.5 2.5-3.5-1.1-3.5-2.5" />
                </svg>
                <svg
                  v-else-if="account.account_type === 'bank'"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M3 10h18L12 3 3 10Z" />
                  <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
                  <path d="M3 18h18" />
                </svg>
                <svg
                  v-else-if="account.account_type === 'ewallet'"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2.5" />
                  <path d="M9 6h6" />
                  <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5.5A2.5 2.5 0 0 1 3 15.5v-7Z" />
                  <path d="M3 10h18" />
                  <circle cx="16.5" cy="14" r="1.25" fill="currentColor" stroke="none" />
                </svg>
              </span>

              <div class="finance-account-card__top">
                <span
                  class="finance-account-card__icon"
                  :class="`finance-account-card__icon--${account.account_type || 'other'}`"
                  aria-hidden="true"
                >
                  <svg
                    v-if="account.account_type === 'cash'"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v10M15.5 9.5c0-1.4-1.6-2.5-3.5-2.5S8.5 8.1 8.5 9.5 10.1 12 12 12s3.5 1.1 3.5 2.5-1.6 2.5-3.5 2.5-3.5-1.1-3.5-2.5" />
                  </svg>
                  <svg
                    v-else-if="account.account_type === 'bank'"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M3 10h18L12 3 3 10Z" />
                    <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
                    <path d="M3 18h18" />
                  </svg>
                  <svg
                    v-else-if="account.account_type === 'ewallet'"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="5" y="2" width="14" height="20" rx="2.5" />
                    <path d="M9 6h6" />
                    <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
                  </svg>
                  <svg
                    v-else
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5.5A2.5 2.5 0 0 1 3 15.5v-7Z" />
                    <path d="M3 10h18" />
                    <circle cx="16.5" cy="14" r="1.25" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <div class="finance-account-card__top-end">
                  <span class="finance-account-card__chip">{{ accountTypeLabel(account.account_type) }}</span>
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Edit account"
                    title="Edit"
                    :disabled="isBusy"
                    @click="openEditAccount(account)"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                    </svg>
                  </button>
                  <button
                    class="finance-action-btn finance-account-card__archive"
                    type="button"
                    aria-label="Archive account"
                    title="Archive"
                    :disabled="isBusy"
                    @click="onArchiveAccount(account)"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M3 7h18" />
                      <path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" />
                      <path d="M10 11h4" />
                    </svg>
                  </button>
                </div>
              </div>

              <h3 class="finance-account-card__name">{{ account.name }}</h3>
              <p class="finance-account-card__meta">
                Opening {{ formatMoney(account.opening_balance || 0) }}
              </p>

              <div class="finance-account-card__footer">
                <span class="finance-account-card__balance-label">Available balance</span>
                <p
                  class="finance-account-card__balance"
                  :class="gainClass(accountBalances[account.id] || 0)"
                >
                  {{ formatMoney(accountBalances[account.id] || 0) }}
                </p>
              </div>
            </article>
          </div>
        </template>
        </div>
      </template>

      <!-- ── BUDGET (Limits / Recurring) ────────────────────────────── -->
      <template v-else-if="showBudget">
        <div class="finance-budget space-y-5">
        <section class="finance-hero finance-hero--budget">
          <div class="finance-budget-hero-grid flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="finance-kicker">Spend smarter</p>
              <h1 class="finance-hero-title mt-1">Budget</h1>
              <p class="finance-modal-subtitle finance-budget-hero-sub mt-1">
                Daily and weekly account caps, then monthly category limits.
              </p>
            </div>
            <div class="finance-budget-hero-actions flex flex-wrap items-center gap-3">
              <template v-if="budgetTab === 'limits'">
                <div class="finance-budget-month flex items-center gap-2">
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Previous month"
                    title="Previous month"
                    :disabled="isLoading"
                    @click="prevMonth"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <strong class="finance-budget-month-label min-w-36 text-center type-card-title">{{ monthLabel }}</strong>
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Next month"
                    title="Next month"
                    :disabled="isLoading"
                    @click="nextMonth"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
                <button
                  class="finance-primary-btn"
                  type="button"
                  @click="openDailyLimitModal()"
                >
                  <span class="finance-primary-btn__full">Set spend limit</span>
                  <span class="finance-primary-btn__short">Limit</span>
                </button>
                <button
                  class="finance-primary-btn"
                  type="button"
                  @click="emit('manage-categories')"
                >
                  <span class="finance-primary-btn__full">Manage categories</span>
                  <span class="finance-primary-btn__short">Categories</span>
                </button>
              </template>
              <template v-else>
                <button class="finance-primary-btn" type="button" @click="openModal = 'recurring'">
                  <span class="finance-primary-btn__full">Add recurring</span>
                  <span class="finance-primary-btn__short">Add</span>
                </button>
              </template>
            </div>
          </div>

          <div class="finance-budget-tabs mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Budget sections">
            <button
              class="finance-chip"
              :class="{ 'finance-chip--active': budgetTab === 'limits' }"
              type="button"
              role="tab"
              :aria-selected="budgetTab === 'limits'"
              @click="budgetTab = 'limits'"
            >
              Limits
            </button>
            <button
              class="finance-chip"
              :class="{ 'finance-chip--active': budgetTab === 'recurring' }"
              type="button"
              role="tab"
              :aria-selected="budgetTab === 'recurring'"
              @click="budgetTab = 'recurring'"
            >
              Recurring
            </button>
          </div>
        </section>

        <template v-if="budgetTab === 'limits'">
          <article class="finance-panel finance-budget-panel">
            <header class="finance-budget-panel__head">
              <div>
                <h3 class="type-card-title">Daily & weekly limits</h3>
                <p class="type-body-sm type-muted mt-0.5">
                  Set once per account — every day, this week, or weekdays you pick.
                </p>
              </div>
              <button class="finance-primary-btn" type="button" @click="openDailyLimitModal()">
                <span class="finance-primary-btn__full">Set spend limit</span>
                <span class="finance-primary-btn__short">Limit</span>
              </button>
            </header>

            <div v-if="!dailyLimitProgress.length" class="finance-empty finance-empty--compact">
              <p class="font-semibold">No spend limits yet</p>
              <p class="type-caption type-muted mt-1">
                Cap an account daily, weekly (Mon–Sun), or only on chosen weekdays.
              </p>
              <button class="finance-primary-btn mt-3" type="button" @click="openDailyLimitModal()">
                Set spend limit
              </button>
            </div>

            <div v-else class="finance-limit-grid">
              <article
                v-for="row in dailyLimitProgress"
                :key="row.id"
                class="finance-limit-card finance-limit-card--daily"
                :class="`finance-limit-card--${row.appliesToday ? progressTone(row) : 'ok'}`"
                :style="{ '--limit-accent': row.over ? '#b91c1c' : row.accountColor || '#0f766e' }"
              >
                <span class="finance-limit-card__glow" aria-hidden="true"></span>

                <span
                  class="finance-limit-card__icon"
                  aria-hidden="true"
                  :style="{ background: `color-mix(in srgb, ${row.accountColor || '#0f766e'} 18%, transparent)` }"
                >
                  <svg class="finance-cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="6" width="18" height="12" rx="2" />
                    <path d="M3 10h18" />
                  </svg>
                </span>

                <div class="finance-limit-card__body">
                  <div class="finance-limit-card__row">
                    <h3 class="finance-limit-card__name">{{ row.accountName }}</h3>
                    <div class="finance-limit-card__top-end">
                      <span
                        class="finance-limit-card__status"
                        :class="`finance-limit-card__status--${row.appliesToday ? progressTone(row) : 'ok'}`"
                      >
                        <template v-if="!row.appliesToday">Off today</template>
                        <template v-else-if="row.over">Over</template>
                        <template v-else-if="progressTone(row) === 'warn'">Near</template>
                        <template v-else>On track</template>
                      </span>
                      <div class="finance-limit-card__actions">
                        <button
                          class="finance-action-btn"
                          type="button"
                          aria-label="Edit spend limit"
                          title="Edit"
                          :disabled="isBusy"
                          @click="openDailyLimitModal(row)"
                        >
                          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          class="finance-action-btn finance-action-btn--danger"
                          type="button"
                          aria-label="Remove spend limit"
                          title="Remove"
                          :disabled="isBusy"
                          @click="onDeleteDailyLimit(row)"
                        >
                          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  <p class="finance-limit-card__meta">
                    <span class="finance-limit-card__meta-primary">{{ row.scheduleLabel }}</span>
                    <span v-if="row.appliesToday" class="finance-limit-card__meta-detail">
                      <span aria-hidden="true"> · </span>
                      <template v-if="row.over">Over by {{ formatMoney(Math.abs(row.remaining)) }}</template>
                      <template v-else>
                        {{ formatMoney(row.remaining) }}
                        {{ row.isWeekly ? 'left this week' : 'left today' }}
                      </template>
                      <span aria-hidden="true"> · </span>
                      <span class="tabular-nums">{{ formatMoney(row.spent) }} / {{ formatMoney(row.limit) }}</span>
                    </span>
                    <span v-else class="finance-limit-card__meta-detail">
                      <span aria-hidden="true"> · </span>
                      Not scheduled today
                    </span>
                  </p>

                  <div class="finance-limit-card__figures">
                    <div>
                      <span class="finance-limit-card__label">
                        {{ row.isWeekly ? 'Spent this week' : row.appliesToday ? 'Spent today' : 'Cap' }}
                      </span>
                      <p class="finance-limit-card__spent tabular-nums">
                        {{ row.appliesToday || row.isWeekly ? formatMoney(row.spent) : formatMoney(row.limit) }}
                      </p>
                    </div>
                    <div class="text-right">
                      <span class="finance-limit-card__label">{{ row.isWeekly ? 'Week limit' : 'Day limit' }}</span>
                      <p class="finance-limit-card__limit tabular-nums">{{ formatMoney(row.limit) }}</p>
                    </div>
                  </div>

                  <div
                    v-if="row.appliesToday"
                    class="finance-limit-meter"
                    role="meter"
                    :aria-valuenow="row.pct"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-label="`${row.accountName} spend limit used`"
                  >
                    <span
                      class="finance-limit-meter__fill"
                      :style="{ width: `${Math.min(Math.max(row.pct, row.spent > 0 ? 3 : 0), 100)}%` }"
                    />
                  </div>
                  <p v-if="row.appliesToday" class="finance-limit-card__pct tabular-nums">
                    {{ row.pct }}% used
                  </p>
                  <p v-if="row.note" class="type-caption type-muted mt-1">{{ row.note }}</p>
                </div>
              </article>
            </div>
          </article>

          <article class="finance-panel finance-budget-panel">
            <header class="finance-budget-panel__head">
              <div>
                <h3 class="type-card-title">Category limits</h3>
                <p class="type-body-sm type-muted mt-0.5">How much of each cap you have used this month.</p>
              </div>
              <span v-if="categoryProgress.length" class="finance-budget-chip">
                {{ categoryProgress.filter((row) => row.limit != null).length }} capped
              </span>
            </header>

            <div v-if="!categoryProgress.length" class="finance-empty finance-empty--compact">
              <p class="font-semibold">No limits set yet</p>
              <p class="type-caption type-muted mt-1">Add monthly limits to categories to track spend.</p>
              <button class="finance-primary-btn mt-3" type="button" @click="emit('manage-categories')">
                Manage categories
              </button>
            </div>

            <div v-else class="finance-limit-grid">
              <article
                v-for="row in categoryProgress"
                :key="row.category.id"
                class="finance-limit-card"
                :class="`finance-limit-card--${progressTone(row)}`"
                :style="{ '--limit-accent': row.category.color || '#1e40af' }"
              >
                <span class="finance-limit-card__glow" aria-hidden="true"></span>

                <span class="finance-limit-card__icon" aria-hidden="true">
                  <FinanceCategoryIcon :icon="row.category.icon" />
                </span>

                <div class="finance-limit-card__body">
                  <div class="finance-limit-card__row">
                    <h3 class="finance-limit-card__name">{{ row.category.name }}</h3>
                    <span
                      class="finance-limit-card__status"
                      :class="`finance-limit-card__status--${progressTone(row)}`"
                    >
                      <template v-if="row.limit == null">Tracked</template>
                      <template v-else-if="row.over">Over</template>
                      <template v-else-if="progressTone(row) === 'warn'">Near</template>
                      <template v-else>On track</template>
                    </span>
                  </div>

                  <p class="finance-limit-card__meta">
                    <template v-if="row.limit != null">
                      <span class="finance-limit-card__meta-primary">
                        <template v-if="row.over">Over by {{ formatMoney(Math.abs(row.remaining)) }}</template>
                        <template v-else>{{ formatMoney(row.remaining) }} left</template>
                      </span>
                      <span class="finance-limit-card__meta-detail">
                        <span aria-hidden="true"> · </span>
                        <span class="tabular-nums">{{ formatMoney(row.spent) }} / {{ formatMoney(row.limit) }}</span>
                        <span aria-hidden="true"> · </span>
                        <span class="tabular-nums">{{ row.pct }}%</span>
                      </span>
                    </template>
                    <template v-else>
                      <span class="finance-limit-card__meta-primary">No monthly limit</span>
                      <span class="finance-limit-card__meta-detail">
                        <span aria-hidden="true"> · </span>
                        Spent {{ formatMoney(row.spent) }}
                      </span>
                    </template>
                  </p>

                  <div class="finance-limit-card__figures">
                    <div>
                      <span class="finance-limit-card__label">Spent</span>
                      <p class="finance-limit-card__spent tabular-nums">{{ formatMoney(row.spent) }}</p>
                    </div>
                    <div class="text-right">
                      <span class="finance-limit-card__label">{{ row.limit != null ? 'Limit' : 'Cap' }}</span>
                      <p class="finance-limit-card__limit tabular-nums">
                        {{ row.limit != null ? formatMoney(row.limit) : '—' }}
                      </p>
                    </div>
                  </div>

                  <div
                    v-if="row.limit != null"
                    class="finance-limit-meter"
                    role="meter"
                    :aria-valuenow="row.pct"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-label="`${row.category.name} budget used`"
                  >
                    <span
                      class="finance-limit-meter__fill"
                      :style="{ width: `${Math.min(Math.max(row.pct, row.spent > 0 ? 3 : 0), 100)}%` }"
                    />
                  </div>
                  <p v-if="row.limit != null" class="finance-limit-card__pct tabular-nums">
                    {{ row.pct }}% used
                  </p>
                </div>
              </article>
            </div>
          </article>
        </template>

        <template v-else>
          <div class="mb-3 finance-chip-group" role="group" aria-label="Recurring filter">
            <button
              class="finance-chip"
              :class="{ 'finance-chip--active': subscriptionsOnly }"
              type="button"
              @click="subscriptionsOnly = true"
            >
              Subscriptions
            </button>
            <button
              class="finance-chip"
              :class="{ 'finance-chip--active': !subscriptionsOnly }"
              type="button"
              @click="subscriptionsOnly = false"
            >
              All recurring
            </button>
          </div>

          <div class="finance-tx-table-wrap finance-tx-desktop">
            <table class="finance-tx-table">
              <caption class="sr-only">
                {{ subscriptionsOnly ? 'Subscriptions' : 'Recurring items' }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Cadence</th>
                  <th scope="col">Next due</th>
                  <th scope="col">Category</th>
                  <th scope="col">Account</th>
                  <th scope="col" class="finance-tx-table__amount">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="finance-tx-table__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!subscriptionRows.length">
                  <td colspan="9" class="finance-tx-table__empty">
                    <p class="font-semibold text-slate-800 dark:text-slate-100">No recurring items</p>
                    <p class="type-caption type-muted mt-1">Track subscriptions and recurring bills in one place.</p>
                    <button class="finance-primary-btn mt-3" type="button" @click="openModal = 'recurring'">
                      Add recurring
                    </button>
                  </td>
                </tr>
                <tr v-for="row in subscriptionRows" :key="row.id">
                  <td class="finance-tx-table__category">
                    <span class="font-semibold">{{ row.name }}</span>
                    <span
                      v-if="row.is_subscription"
                      class="finance-recurring-badge finance-recurring-badge--sub"
                    >
                      sub
                    </span>
                  </td>
                  <td>
                    <span
                      class="finance-tx-type"
                      :class="row.type === 'income' ? 'finance-tx-type--income' : 'finance-tx-type--expense'"
                    >
                      {{ row.type === 'income' ? 'Income' : 'Expense' }}
                    </span>
                  </td>
                  <td class="capitalize">{{ row.cadence }}</td>
                  <td class="finance-tx-table__date">{{ row.next_due }}</td>
                  <td>{{ row.category_id ? categoryName(row.category_id) : '—' }}</td>
                  <td>{{ row.account_id ? accountName(row.account_id) : '—' }}</td>
                  <td
                    class="finance-tx-table__amount"
                    :class="row.type === 'income' ? 'finance-tx-table__amount--in' : 'finance-tx-table__amount--out'"
                  >
                    {{ formatMoney(row.amount) }}
                  </td>
                  <td>
                    <span
                      class="finance-recurring-badge"
                      :class="row.is_active ? 'finance-recurring-badge--active' : 'finance-recurring-badge--paused'"
                    >
                      {{ row.is_active ? 'Active' : 'Paused' }}
                    </span>
                  </td>
                  <td class="finance-tx-table__actions">
                    <button
                      class="finance-action-btn finance-action-btn--success"
                      type="button"
                      aria-label="Post recurring item"
                      title="Post"
                      :disabled="isBusy || !row.is_active"
                      @click="onPostRecurring(row)"
                    >
                      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      class="finance-action-btn"
                      type="button"
                      :aria-label="row.is_active ? 'Pause recurring item' : 'Activate recurring item'"
                      :title="row.is_active ? 'Pause' : 'Activate'"
                      :disabled="isBusy"
                      @click="onToggleRecurring(row)"
                    >
                      <svg
                        v-if="row.is_active"
                        class="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                      >
                        <path d="M8 5v14M16 5v14" />
                      </svg>
                      <svg
                        v-else
                        class="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                      >
                        <path d="m7 4 12 8-12 8V4Z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="finance-tx-list-wrap finance-tx-mobile">
            <div v-if="!subscriptionRows.length" class="finance-tx-empty">
              <p class="font-semibold text-slate-800 dark:text-slate-100">No recurring items</p>
              <p class="type-caption type-muted mt-1">Track subscriptions and recurring bills in one place.</p>
              <button class="finance-primary-btn mt-3" type="button" @click="openModal = 'recurring'">
                Add recurring
              </button>
            </div>
            <ul v-else class="finance-tx-list" :aria-label="subscriptionsOnly ? 'Subscriptions' : 'Recurring items'">
              <li v-for="row in subscriptionRows" :key="row.id" class="finance-tx-list-item">
                <div class="finance-tx-list-item__main min-w-0">
                  <div class="finance-tx-list-item__row">
                    <strong class="finance-tx-list-item__title truncate">
                      {{ row.name }}
                      <span
                        v-if="row.is_subscription"
                        class="finance-recurring-badge finance-recurring-badge--sub ml-1"
                      >sub</span>
                    </strong>
                    <span
                      class="finance-tx-list-item__amount tabular-nums"
                      :class="row.type === 'income' ? 'finance-tx-table__amount--in' : 'finance-tx-table__amount--out'"
                    >
                      {{ formatMoney(row.amount) }}
                    </span>
                  </div>
                  <div class="finance-tx-list-item__meta">
                    <span
                      class="finance-tx-type"
                      :class="row.type === 'income' ? 'finance-tx-type--income' : 'finance-tx-type--expense'"
                    >
                      {{ row.type === 'income' ? 'In' : 'Out' }}
                    </span>
                    <span class="capitalize">{{ row.cadence }}</span>
                    <span>{{ row.next_due }}</span>
                    <span
                      class="finance-recurring-badge"
                      :class="row.is_active ? 'finance-recurring-badge--active' : 'finance-recurring-badge--paused'"
                    >
                      {{ row.is_active ? 'Active' : 'Paused' }}
                    </span>
                  </div>
                </div>
                <div class="finance-tx-list-item__actions">
                  <button
                    class="finance-action-btn finance-action-btn--success"
                    type="button"
                    aria-label="Post recurring item"
                    title="Post"
                    :disabled="isBusy || !row.is_active"
                    @click="onPostRecurring(row)"
                  >
                    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    class="finance-action-btn"
                    type="button"
                    :aria-label="row.is_active ? 'Pause recurring item' : 'Activate recurring item'"
                    :title="row.is_active ? 'Pause' : 'Activate'"
                    :disabled="isBusy"
                    @click="onToggleRecurring(row)"
                  >
                    <svg
                      v-if="row.is_active"
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path d="M8 5v14M16 5v14" />
                    </svg>
                    <svg
                      v-else
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path d="m7 4 12 8-12 8V4Z" />
                    </svg>
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </template>
        </div>
      </template>

      <!-- ── NET WORTH (Investments / Debts) ────────────────────────── -->
      <template v-else-if="showNetworth">
        <div class="finance-networth space-y-5">
        <section class="finance-hero finance-hero--networth">
          <div class="finance-networth-hero-grid">
            <div class="finance-networth-hero-copy min-w-0">
              <p class="finance-kicker">Balance sheet</p>
              <h1 class="finance-hero-title mt-1">Net worth</h1>
              <p class="finance-networth-hero-value mt-1 tabular-nums" :class="gainClass(netWorth)">
                {{ formatMoney(netWorth) }}
              </p>
              <p class="finance-modal-subtitle finance-networth-hero-sub mt-1">
                Cash + investments − debts
              </p>
            </div>
            <div class="finance-networth-hero-actions">
              <template v-if="networthTab === 'investments'">
                <button class="finance-primary-btn" type="button" @click="openModal = 'holding'">
                  <span class="finance-primary-btn__full">Add holding</span>
                  <span class="finance-primary-btn__short">Add</span>
                </button>
                <div class="finance-networth-hero-tools" role="group" aria-label="Holding tools">
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Buy more"
                    title="Buy more"
                    @click="openBuyMore()"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Sell"
                    title="Sell"
                    @click="openSell()"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Mark price"
                    title="Mark price"
                    @click="openMarkPrice()"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M4 19h16" />
                      <path d="M6 16V9l3 3 3-5 3 4 3-2v7" />
                    </svg>
                  </button>
                  <button
                    class="finance-action-btn"
                    type="button"
                    aria-label="Add dividend"
                    title="Add dividend"
                    @click="openModal = 'dividend'"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v8M9.5 10.5c0-.8.7-1.5 2.5-1.5s2.5.7 2.5 1.5-.7 1.5-2.5 1.5-2.5.7-2.5 1.5.7 1.5 2.5 1.5 2.5-.7 2.5-1.5" />
                    </svg>
                  </button>
                </div>
              </template>
              <template v-else>
                <button class="finance-primary-btn" type="button" @click="openModal = 'debt'">
                  <span class="finance-primary-btn__full">Add debt</span>
                  <span class="finance-primary-btn__short">Add</span>
                </button>
              </template>
            </div>
          </div>

          <div class="finance-networth-tabs mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Net worth sections">
            <button
              class="finance-chip"
              :class="{ 'finance-chip--active': networthTab === 'investments' }"
              type="button"
              role="tab"
              :aria-selected="networthTab === 'investments'"
              @click="networthTab = 'investments'"
            >
              Investments
            </button>
            <button
              class="finance-chip"
              :class="{ 'finance-chip--active': networthTab === 'debts' }"
              type="button"
              role="tab"
              :aria-selected="networthTab === 'debts'"
              @click="networthTab = 'debts'"
            >
              Debts
            </button>
          </div>
        </section>

        <template v-if="networthTab === 'investments'">
          <div v-if="!portfolioRows.length" class="finance-empty finance-empty--compact">
            <p class="font-semibold">No holdings yet</p>
            <p class="type-caption type-muted mt-1">Add stocks, UITFs, MP2, crypto, or other assets.</p>
            <button class="finance-primary-btn mt-3" type="button" @click="openModal = 'holding'">
              Add holding
            </button>
          </div>
          <template v-else>
            <div class="finance-holding-grid">
              <article
                v-for="row in portfolioRows"
                :key="row.holding.id"
                class="finance-holding-card"
                :class="`finance-holding-card--${row.holding.asset_class || 'other'}`"
              >
                <span class="finance-holding-card__glow" aria-hidden="true"></span>
                <div class="finance-holding-card__top">
                  <span class="finance-holding-card__icon" aria-hidden="true">
                    <FinanceHoldingIcon :asset-class="row.holding.asset_class" />
                  </span>
                  <span class="finance-holding-card__chip">{{ assetClassLabel(row.holding.asset_class) }}</span>
                </div>
                <h3 class="finance-holding-card__name">{{ row.holding.name }}</h3>
                <p class="finance-holding-card__meta">
                  {{ formatInvestNumber(row.units) }} units · ₱{{ formatInvestNumber(row.price) }} / unit
                </p>
                <div class="finance-holding-card__actions">
                  <button
                    class="finance-holding-card__action"
                    type="button"
                    @click="openBuyMore(row.holding.id)"
                  >
                    Buy more
                  </button>
                  <button
                    class="finance-holding-card__action"
                    type="button"
                    @click="openSell(row.holding.id)"
                  >
                    Sell
                  </button>
                  <button
                    class="finance-holding-card__action"
                    type="button"
                    @click="openMarkPrice(row.holding.id)"
                  >
                    Mark
                  </button>
                </div>
                <div class="finance-holding-card__footer">
                  <div>
                    <span class="finance-holding-card__label">Market value</span>
                    <p class="finance-holding-card__value">{{ formatMoney(row.marketValue) }}</p>
                  </div>
                  <div class="text-right">
                    <span class="finance-holding-card__label">Gain</span>
                    <p class="finance-holding-card__gain" :class="gainClass(row.gain)">
                      <template v-if="row.cost > 0">
                        {{ formatSignedMoney(row.gain) }}
                        <span class="finance-holding-card__pct">({{ formatSignedPct(row.gainPct) }})</span>
                      </template>
                      <template v-else>—</template>
                    </p>
                  </div>
                </div>
              </article>
            </div>

            <article class="finance-panel mt-4">
              <h3 class="type-card-title mb-3">Asset allocation</h3>
              <DashboardDonutChart
                :segments="allocationSegments"
                size="lg"
                layout="stack"
                center-label="Assets"
                empty-label="No assets tracked yet."
                :format-value="formatMoney"
              />
              <table v-if="allocationTableRows.length" class="sr-only">
                <caption>Investment allocation percentages</caption>
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col">Value</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in allocationTableRows" :key="`inv-${row.label}`">
                    <td>{{ row.label }}</td>
                    <td>{{ formatMoney(row.value) }}</td>
                    <td>{{ row.pct }}%</td>
                  </tr>
                </tbody>
              </table>
            </article>
          </template>
        </template>

        <template v-else>
          <div v-if="!liabilities.length" class="finance-empty finance-empty--compact">
            <p class="font-semibold">No debts tracked</p>
            <p class="type-caption type-muted mt-1">Add loans or credit cards as cards.</p>
            <button class="finance-primary-btn mt-3" type="button" @click="openModal = 'debt'">
              Add debt
            </button>
          </div>
          <template v-else>
            <div class="finance-debt-grid">
              <article v-for="row in liabilities" :key="row.id" class="finance-debt-card">
                <span class="finance-debt-card__glow" aria-hidden="true"></span>
                <div class="finance-debt-card__top">
                  <span class="finance-debt-card__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <path d="M2 10h20" />
                    </svg>
                  </span>
                  <span class="finance-debt-card__chip">{{ row.apr || 0 }}% APR</span>
                </div>
                <h3 class="finance-debt-card__name">{{ row.name }}</h3>
                <p class="finance-debt-card__meta">Min payment {{ formatMoney(row.min_payment || 0) }}</p>
                <div class="finance-debt-card__footer">
                  <span class="finance-debt-card__label">Balance owed</span>
                  <p class="finance-debt-card__value">{{ formatMoney(row.balance) }}</p>
                </div>
              </article>
            </div>

            <article class="finance-panel mt-4">
              <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 class="type-card-title">Payoff plan</h3>
                  <p class="type-body-sm type-muted">Priority order for eliminating debt.</p>
                </div>
                <div class="finance-chip-group" role="group" aria-label="Debt payoff method">
                  <button
                    class="finance-chip"
                    :class="{ 'finance-chip--active': debtMethod === 'snowball' }"
                    type="button"
                    @click="debtMethod = 'snowball'"
                  >
                    Snowball
                  </button>
                  <button
                    class="finance-chip"
                    :class="{ 'finance-chip--active': debtMethod === 'avalanche' }"
                    type="button"
                    @click="debtMethod = 'avalanche'"
                  >
                    Avalanche
                  </button>
                </div>
              </div>

              <ol v-if="debtPlanRows.length" class="list-decimal space-y-2 pl-5 text-sm">
                <li v-for="row in debtPlanRows" :key="row.liability.id">
                  <span class="font-semibold">{{ row.liability.name }}</span>
                  — {{ formatMoney(row.balance) }} at {{ row.apr }}% APR
                </li>
              </ol>
              <p v-else class="type-body-sm type-muted">Add liabilities to see a payoff plan.</p>
            </article>

            <article class="finance-panel">
              <h3 class="type-card-title mb-1">Apply payment</h3>
              <p class="type-body-sm type-muted mb-4">Record a payment to reduce a debt's balance.</p>
              <form class="finance-form-grid finance-form-grid--3" @submit.prevent="onPayDownLiability">
                <div>
                  <label class="finance-label" for="finance-paydown-debt">Debt</label>
                  <FinanceSelect
                    id="finance-paydown-debt"
                    v-model="paydownForm.id"
                    :options="liabilitySelectOptions"
                    aria-label="Debt"
                    placeholder="Select debt"
                  />
                </div>
                <div>
                  <label class="finance-label" for="finance-paydown-amount">Payment amount</label>
                  <FinanceMoneyInput
                    id="finance-paydown-amount"
                    v-model="paydownForm.amount"
                    required
                  />
                </div>
                <div class="flex items-end">
                  <button
                    class="finance-primary-btn w-full"
                    type="submit"
                    :disabled="isBusy || !paydownForm.id || !paydownForm.amount"
                  >
                    Apply payment
                  </button>
                </div>
              </form>
            </article>
          </template>
        </template>
        </div>
      </template>

      <!-- ── GOALS ─────────────────────────────────────────────────── -->
      <template v-else-if="showGoals">
        <div class="finance-goals space-y-5">
        <section class="finance-hero finance-hero--goals">
          <div class="finance-goals-hero-grid flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="finance-kicker">Save with purpose</p>
              <h1 class="finance-hero-title mt-1">Goals</h1>
              <p class="finance-modal-subtitle finance-goals-hero-sub mt-1">Track your savings progress towards financial milestones.</p>
            </div>
            <button class="finance-primary-btn" type="button" @click="openModal = 'goal'">
              <span class="finance-primary-btn__full">New goal</span>
              <span class="finance-primary-btn__short">New</span>
            </button>
          </div>
        </section>

        <div v-if="!goals.length" class="finance-empty">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mx-auto mb-3 h-10 w-10 opacity-30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
          <p class="font-semibold">No goals yet</p>
          <p class="type-caption type-muted mt-1">Set a target and track your savings journey.</p>
          <button class="finance-primary-btn mt-3" type="button" @click="openModal = 'goal'">
            Create first goal
          </button>
        </div>
        <div v-else class="finance-goal-grid">
          <article v-for="goal in goals" :key="goal.id" class="finance-goal-card">
            <span class="finance-goal-card__glow" aria-hidden="true"></span>
            <div class="finance-goal-card__top">
              <span class="finance-goal-card__badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="8" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span class="finance-goal-card__pct">{{ goalProgressPct(goal) }}%</span>
            </div>
            <h3 class="finance-goal-card__name">{{ goal.name }}</h3>
            <p v-if="goal.due_on" class="finance-goal-card__due">Due {{ goal.due_on }}</p>
            <p v-else class="finance-goal-card__due">No due date</p>

            <div class="finance-goal-card__figures">
              <div>
                <span class="finance-goal-card__label">Saved</span>
                <p class="finance-goal-card__value">{{ formatMoney(goal.current_amount) }}</p>
              </div>
              <div class="text-right">
                <span class="finance-goal-card__label">Target</span>
                <p class="finance-goal-card__value finance-goal-card__value--muted">
                  {{ formatMoney(goal.target_amount) }}
                </p>
              </div>
            </div>
            <p class="finance-goal-card__due mt-2">
              {{ formatMoney(goalRemaining(goal)) }} left to go
            </p>

            <div class="finance-progress">
              <span :style="{ width: `${goalProgressPct(goal)}%` }" />
            </div>

            <form class="finance-goal-card__form" @submit.prevent="onUpdateGoalAmount(goal)">
              <div>
                <label class="finance-label" :for="`goal-current-${goal.id}`">Update saved</label>
                <FinanceMoneyInput
                  :id="`goal-current-${goal.id}`"
                  v-model="goalAmountDrafts[goal.id]"
                  :aria-label="`Current amount for ${goal.name}`"
                />
              </div>
              <button class="finance-goal-card__save" type="submit" :disabled="isBusy">Save</button>
            </form>
          </article>
        </div>
        </div>
      </template>

    </template>

    <FinanceAiPanel :api="api" @toast="emit('toast', $event)" @create-from-proposal="onCreateFromProposal" />

    <!-- ── MODALS ──────────────────────────────────────────────────── -->
    <Teleport to="body">
      <!-- Add / Edit Account -->
      <div
        v-if="openModal === 'account'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-account-title"
          @submit.prevent="onCreateAccount"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Accounts</p>
              <h2 id="modal-account-title" class="finance-modal-title">
                {{ editingAccountId ? 'Edit account' : 'Add account' }}
              </h2>
              <p class="finance-modal-subtitle">
                {{ editingAccountId ? 'Update name, type, or opening balance.' : 'Track a cash, bank, or e-wallet balance.' }}
              </p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Account details</h4>
                  <p class="finance-modal-section__hint">Name the account and set its opening balance.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-account-name">Account name</label>
                  <input
                    id="modal-account-name"
                    v-model="accountForm.name"
                    class="finance-input"
                    type="text"
                    required
                    placeholder="e.g. BPI Savings"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-account-type">Type</label>
                  <FinanceSelect
                    id="modal-account-type"
                    v-model="accountForm.account_type"
                    :options="accountTypeOptions"
                    aria-label="Account type"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-account-opening">Opening balance</label>
                  <FinanceMoneyInput
                    id="modal-account-opening"
                    v-model="accountForm.opening_balance"
                  />
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !accountForm.name.trim()"
            >
              {{ editingAccountId ? 'Save changes' : 'Add account' }}
            </button>
          </footer>
        </form>
      </div>

      <!-- Daily spend limit -->
      <div
        v-if="openModal === 'daily-limit'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-daily-limit-title"
          @submit.prevent="onSaveDailyLimit"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Budget</p>
              <h2 id="modal-daily-limit-title" class="finance-modal-title">Spend limit</h2>
              <p class="finance-modal-subtitle">
                One rule per account — Daily, Weekly (Mon–Sun), or Custom days.
              </p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Account & schedule</h4>
                  <p class="finance-modal-section__hint">Pick the wallet, then when the cap applies.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-daily-limit-account">Account</label>
                  <FinanceSelect
                    id="modal-daily-limit-account"
                    v-model="dailyLimitForm.account_id"
                    :options="accountSelectOptionsWithPlaceholder"
                    aria-label="Account for spend limit"
                    placeholder="Select account"
                  />
                </div>
                <div class="finance-field sm:col-span-2">
                  <p class="finance-label" id="modal-daily-limit-schedule-label">Schedule</p>
                  <div
                    class="finance-chip-group mt-1"
                    role="radiogroup"
                    aria-labelledby="modal-daily-limit-schedule-label"
                  >
                    <button
                      v-for="option in dailyLimitScheduleOptions"
                      :key="option.id"
                      class="finance-chip"
                      :class="{ 'finance-chip--active': dailyLimitForm.schedule === option.id }"
                      type="button"
                      role="radio"
                      :aria-checked="dailyLimitForm.schedule === option.id"
                      @click="setDailyLimitSchedule(option.id)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                  <div v-if="dailyLimitForm.schedule === 'custom_days'" class="mt-3">
                    <p class="finance-label">Days</p>
                    <div class="flex flex-wrap gap-2 mt-1">
                      <button
                        v-for="(label, day) in DAILY_LIMIT_WEEKDAYS"
                        :key="day"
                        class="habit-day-btn"
                        :class="{ 'habit-day-btn--active': dailyLimitForm.target_days.includes(day) }"
                        type="button"
                        :aria-pressed="dailyLimitForm.target_days.includes(day)"
                        @click="toggleDailyLimitDay(day)"
                      >
                        {{ label.slice(0, 1) }}
                      </button>
                    </div>
                  </div>
                  <p v-else-if="dailyLimitForm.schedule === 'weekly'" class="type-caption type-muted mt-2">
                    Counters Mon–Sun expenses from this account, then resets next Monday.
                  </p>
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-daily-limit-amount">
                    {{ dailyLimitForm.schedule === 'weekly' ? 'Limit per week' : 'Limit per day' }}
                  </label>
                  <FinanceMoneyInput
                    id="modal-daily-limit-amount"
                    v-model="dailyLimitForm.amount"
                    min="0.01"
                    required
                  />
                </div>
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-daily-limit-note">Note</label>
                  <input
                    id="modal-daily-limit-note"
                    v-model="dailyLimitForm.note"
                    class="finance-input"
                    type="text"
                    maxlength="120"
                    placeholder="Optional — e.g. weekend allowance"
                  />
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !dailyLimitFormValid"
            >
              Save spend limit
            </button>
          </footer>
        </form>
      </div>

      <!-- Transfer -->
      <div
        v-if="openModal === 'transfer'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-transfer-title"
          @submit.prevent="onCreateTransfer"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Accounts</p>
              <h2 id="modal-transfer-title" class="finance-modal-title">Transfer funds</h2>
              <p class="finance-modal-subtitle">Move money between accounts without affecting cashflow.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Transfer details</h4>
                  <p class="finance-modal-section__hint">Choose source, destination, amount, and date.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field">
                  <label class="finance-label" for="modal-transfer-from">From</label>
                  <FinanceSelect
                    id="modal-transfer-from"
                    v-model="transferForm.from_account_id"
                    :options="accountSelectOptionsWithPlaceholder"
                    aria-label="From account"
                    placeholder="Select account"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-transfer-to">To</label>
                  <FinanceSelect
                    id="modal-transfer-to"
                    v-model="transferForm.to_account_id"
                    :options="accountSelectOptionsWithPlaceholder"
                    aria-label="To account"
                    placeholder="Select account"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-transfer-amount">Amount</label>
                  <FinanceMoneyInput
                    id="modal-transfer-amount"
                    v-model="transferForm.amount"
                    min="0.01"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-transfer-date">Date</label>
                  <FinanceDateInput
                    id="modal-transfer-date"
                    v-model="transferForm.occurred_on"
                    required
                  />
                </div>
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-transfer-note">Note</label>
                  <input
                    id="modal-transfer-note"
                    v-model="transferForm.note"
                    class="finance-input"
                    type="text"
                    maxlength="120"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="
                isBusy ||
                !transferForm.from_account_id ||
                !transferForm.to_account_id ||
                !(Number(transferForm.amount) > 0)
              "
            >
              Transfer
            </button>
          </footer>
        </form>
      </div>

      <!-- Recurring / Subscription -->
      <div
        v-if="openModal === 'recurring'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel finance-modal-panel--wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-recurring-title"
          @submit.prevent="onCreateRecurring"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Subscriptions</p>
              <h2 id="modal-recurring-title" class="finance-modal-title">Add recurring item</h2>
              <p class="finance-modal-subtitle">Schedule a repeating income or expense.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body space-y-4">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Basics</h4>
                  <p class="finance-modal-section__hint">Name, amount, and whether this repeats as income or expense.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--3">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-recurring-name">Name</label>
                  <input
                    id="modal-recurring-name"
                    v-model="recurringForm.name"
                    class="finance-input"
                    type="text"
                    required
                    placeholder="e.g. Netflix"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-recurring-amount">Amount</label>
                  <FinanceMoneyInput
                    id="modal-recurring-amount"
                    v-model="recurringForm.amount"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-recurring-type">Type</label>
                  <FinanceSelect
                    id="modal-recurring-type"
                    v-model="recurringForm.type"
                    :options="recurringTypeOptions"
                    aria-label="Recurring type"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-recurring-cadence">Cadence</label>
                  <FinanceSelect
                    id="modal-recurring-cadence"
                    v-model="recurringForm.cadence"
                    :options="cadenceOptions"
                    aria-label="Cadence"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-recurring-due">Next due</label>
                  <FinanceDateInput
                    id="modal-recurring-due"
                    v-model="recurringForm.next_due"
                  />
                </div>
              </div>
            </section>
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">2</span>
                <div>
                  <h4 class="finance-modal-section__title">Classification</h4>
                  <p class="finance-modal-section__hint">Optional category and account for auto-logged entries.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field">
                  <label class="finance-label" for="modal-recurring-category">Category</label>
                  <FinanceSelect
                    id="modal-recurring-category"
                    v-model="recurringForm.category_id"
                    :options="recurringCategoryOptions"
                    aria-label="Category"
                    placeholder="None"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-recurring-account">Account</label>
                  <FinanceSelect
                    id="modal-recurring-account"
                    v-model="recurringForm.account_id"
                    :options="accountSelectOptionsWithNone"
                    aria-label="Account"
                    placeholder="None"
                  />
                </div>
                <div class="finance-field sm:col-span-2">
                  <label class="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <input v-model="recurringForm.is_subscription" type="checkbox" />
                    Mark as subscription
                  </label>
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !recurringForm.name.trim() || !recurringForm.amount"
            >
              Add recurring item
            </button>
          </footer>
        </form>
      </div>

      <!-- Add Holding -->
      <div
        v-if="openModal === 'holding'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-holding-title"
          @submit.prevent="onCreateHolding"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Investments</p>
              <h2 id="modal-holding-title" class="finance-modal-title">Add holding</h2>
              <p class="finance-modal-subtitle">Track a stock, fund, crypto, or other asset.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Holding details</h4>
                  <p class="finance-modal-section__hint">Set the asset class and initial lot (optional).</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-holding-name">Name</label>
                  <input
                    id="modal-holding-name"
                    v-model="holdingForm.name"
                    class="finance-input"
                    type="text"
                    required
                    placeholder="e.g. AAPL"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-holding-class">Asset class</label>
                  <FinanceSelect
                    id="modal-holding-class"
                    v-model="holdingForm.asset_class"
                    :options="assetClassOptions"
                    aria-label="Asset class"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-holding-units">Units</label>
                  <input
                    id="modal-holding-units"
                    v-model="holdingForm.units"
                    class="finance-input"
                    type="number"
                    min="0"
                    step="any"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-holding-cost">Unit cost</label>
                  <FinanceMoneyInput
                    id="modal-holding-cost"
                    v-model="holdingForm.unit_cost"
                    step="any"
                    placeholder="0.00000000"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-holding-bought">Bought on</label>
                  <FinanceDateInput
                    id="modal-holding-bought"
                    v-model="holdingForm.bought_on"
                  />
                </div>
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-holding-account">Fund from account</label>
                  <FinanceSelect
                    id="modal-holding-account"
                    v-model="holdingForm.account_id"
                    :options="fundAccountOptions"
                    aria-label="Fund from account"
                  />
                  <p v-if="holdingBuyTotalPreview != null && holdingForm.account_id" class="type-caption type-muted mt-1">
                    Debit {{ formatMoney(holdingBuyTotalPreview) }} from selected account
                  </p>
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !holdingForm.name.trim()"
            >
              Add holding
            </button>
          </footer>
        </form>
      </div>

      <!-- Buy more -->
      <div
        v-if="openModal === 'lot'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-lot-title"
          @submit.prevent="onAddLot"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Investments</p>
              <h2 id="modal-lot-title" class="finance-modal-title">Buy more</h2>
              <p class="finance-modal-subtitle">Add another lot to an existing holding.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Purchase</h4>
                  <p class="finance-modal-section__hint">Units and cost for this buy.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-lot-holding">Holding</label>
                  <FinanceSelect
                    id="modal-lot-holding"
                    v-model="lotForm.holding_id"
                    :options="holdingSelectOptions"
                    aria-label="Holding"
                    placeholder="Select holding"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-lot-units">Units</label>
                  <input
                    id="modal-lot-units"
                    v-model="lotForm.units"
                    class="finance-input"
                    type="number"
                    min="0"
                    step="any"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-lot-cost">Unit cost</label>
                  <FinanceMoneyInput
                    id="modal-lot-cost"
                    v-model="lotForm.unit_cost"
                    step="any"
                    placeholder="0.00000000"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-lot-bought">Bought on</label>
                  <FinanceDateInput
                    id="modal-lot-bought"
                    v-model="lotForm.bought_on"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-lot-account">Fund from account</label>
                  <FinanceSelect
                    id="modal-lot-account"
                    v-model="lotForm.account_id"
                    :options="fundAccountOptions"
                    aria-label="Fund from account"
                  />
                </div>
                <p v-if="lotTotalPreview != null" class="type-caption type-muted sm:col-span-2">
                  Total {{ formatMoney(lotTotalPreview) }}
                  <template v-if="lotForm.account_id"> · debit selected account</template>
                </p>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !lotForm.holding_id || !lotForm.units || lotForm.unit_cost === ''"
            >
              Record buy
            </button>
          </footer>
        </form>
      </div>

      <!-- Sell -->
      <div
        v-if="openModal === 'sell'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-sell-title"
          @submit.prevent="onSellUnits"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Investments</p>
              <h2 id="modal-sell-title" class="finance-modal-title">Sell</h2>
              <p class="finance-modal-subtitle">Reduce units (FIFO cost basis) and mark the sell price.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Sale</h4>
                  <p class="finance-modal-section__hint">
                    Available
                    {{ sellForm.holding_id ? formatInvestNumber(sellAvailableUnits) : '—' }}
                    units.
                  </p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-sell-holding">Holding</label>
                  <FinanceSelect
                    id="modal-sell-holding"
                    v-model="sellForm.holding_id"
                    :options="holdingSelectOptions"
                    aria-label="Holding"
                    placeholder="Select holding"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-sell-units">Units</label>
                  <input
                    id="modal-sell-units"
                    v-model="sellForm.units"
                    class="finance-input"
                    type="number"
                    min="0"
                    step="any"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-sell-price">Unit sell price</label>
                  <FinanceMoneyInput
                    id="modal-sell-price"
                    v-model="sellForm.unit_price"
                    step="any"
                    placeholder="0.00000000"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-sell-date">Sold on</label>
                  <FinanceDateInput
                    id="modal-sell-date"
                    v-model="sellForm.sold_on"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-sell-account">Deposit proceeds to</label>
                  <FinanceSelect
                    id="modal-sell-account"
                    v-model="sellForm.account_id"
                    :options="fundAccountOptions"
                    aria-label="Deposit proceeds to account"
                  />
                </div>
                <p v-if="sellTotalPreview != null" class="type-caption type-muted sm:col-span-2">
                  Proceeds {{ formatMoney(sellTotalPreview) }}
                  <template v-if="sellForm.account_id"> · credit selected account</template>
                </p>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="
                isBusy ||
                !sellForm.holding_id ||
                !sellForm.units ||
                sellForm.unit_price === '' ||
                Number(sellForm.units) > sellAvailableUnits + 1e-10
              "
            >
              Record sell
            </button>
          </footer>
        </form>
      </div>

      <!-- Mark Price -->
      <div
        v-if="openModal === 'mark'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-mark-title"
          @submit.prevent="onMarkPrice"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Investments</p>
              <h2 id="modal-mark-title" class="finance-modal-title">Mark price</h2>
              <p class="finance-modal-subtitle">Update the current unit price for a holding.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Price mark</h4>
                  <p class="finance-modal-section__hint">Manual mark — no live market feed.</p>
                </div>
              </div>
              <div class="finance-form-grid">
                <div class="finance-field">
                  <label class="finance-label" for="modal-mark-holding">Holding</label>
                  <FinanceSelect
                    id="modal-mark-holding"
                    v-model="markForm.holding_id"
                    :options="holdingSelectOptions"
                    aria-label="Holding"
                    placeholder="Select holding"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-mark-price">Unit price</label>
                  <FinanceMoneyInput
                    id="modal-mark-price"
                    v-model="markForm.unit_price"
                    step="any"
                    placeholder="0.00000000"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-mark-date">Date</label>
                  <FinanceDateInput
                    id="modal-mark-date"
                    v-model="markForm.marked_on"
                  />
                </div>
                <div v-if="markPreview" class="finance-mark-preview sm:col-span-full">
                  <p class="finance-mark-preview__label">Preview at this mark</p>
                  <div class="finance-mark-preview__grid">
                    <div>
                      <span class="finance-holding-card__label">Market value</span>
                      <p class="finance-mark-preview__value">{{ formatMoney(markPreview.marketValue) }}</p>
                    </div>
                    <div class="text-right">
                      <span class="finance-holding-card__label">Gain</span>
                      <p class="finance-mark-preview__value" :class="gainClass(markPreview.gain)">
                        <template v-if="markPreview.cost > 0">
                          {{ formatSignedMoney(markPreview.gain) }}
                          <span>({{ formatSignedPct(markPreview.gainPct) }})</span>
                        </template>
                        <template v-else>—</template>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !markForm.holding_id || markForm.unit_price === ''"
            >
              Update price
            </button>
          </footer>
        </form>
      </div>

      <!-- Add Dividend -->
      <div
        v-if="openModal === 'dividend'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-dividend-title"
          @submit.prevent="onAddDividend"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Investments</p>
              <h2 id="modal-dividend-title" class="finance-modal-title">Add dividend</h2>
              <p class="finance-modal-subtitle">Record a dividend or interest payment received.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Dividend details</h4>
                  <p class="finance-modal-section__hint">Cash received from a holding.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-div-holding">Holding</label>
                  <FinanceSelect
                    id="modal-div-holding"
                    v-model="dividendForm.holding_id"
                    :options="holdingSelectOptions"
                    aria-label="Holding"
                    placeholder="Select holding"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-div-amount">Amount</label>
                  <FinanceMoneyInput
                    id="modal-div-amount"
                    v-model="dividendForm.amount"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-div-date">Paid on</label>
                  <FinanceDateInput
                    id="modal-div-date"
                    v-model="dividendForm.paid_on"
                  />
                </div>
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-div-note">Note</label>
                  <input
                    id="modal-div-note"
                    v-model="dividendForm.note"
                    class="finance-input"
                    type="text"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !dividendForm.holding_id || !dividendForm.amount"
            >
              Record dividend
            </button>
          </footer>
        </form>
      </div>

      <!-- Create Goal -->
      <div
        v-if="openModal === 'goal'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-goal-title"
          @submit.prevent="onCreateGoal"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Goals</p>
              <h2 id="modal-goal-title" class="finance-modal-title">New savings goal</h2>
              <p class="finance-modal-subtitle">Define a target to save towards.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Goal details</h4>
                  <p class="finance-modal-section__hint">Target amount, starting balance, and optional due date.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-goal-name">Goal name</label>
                  <input
                    id="modal-goal-name"
                    v-model="goalForm.name"
                    class="finance-input"
                    type="text"
                    required
                    placeholder="e.g. Emergency fund"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-goal-target">Target amount</label>
                  <FinanceMoneyInput
                    id="modal-goal-target"
                    v-model="goalForm.target_amount"
                    required
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-goal-current">Starting amount</label>
                  <FinanceMoneyInput
                    id="modal-goal-current"
                    v-model="goalForm.current_amount"
                  />
                </div>
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-goal-due">Due date</label>
                  <FinanceDateInput
                    id="modal-goal-due"
                    v-model="goalForm.due_on"
                  />
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !goalForm.name.trim() || !goalForm.target_amount"
            >
              Create goal
            </button>
          </footer>
        </form>
      </div>

      <!-- Add Debt -->
      <div
        v-if="openModal === 'debt'"
        class="finance-modal-backdrop"
        @click.self="closeModal"
      >
        <form
          class="finance-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-debt-title"
          @submit.prevent="onCreateLiability"
        >
          <div class="finance-modal-handle" aria-hidden="true"></div>
          <header class="finance-modal-header">
            <div>
              <p class="finance-kicker">Debts</p>
              <h2 id="modal-debt-title" class="finance-modal-title">Add debt</h2>
              <p class="finance-modal-subtitle">Track a loan or credit card balance.</p>
            </div>
            <button class="finance-modal-close" type="button" aria-label="Close modal" @click="closeModal">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div class="finance-modal-body">
            <section class="finance-modal-section">
              <div class="finance-modal-section__head">
                <span class="finance-modal-step">1</span>
                <div>
                  <h4 class="finance-modal-section__title">Debt details</h4>
                  <p class="finance-modal-section__hint">Balance, APR, and minimum payment.</p>
                </div>
              </div>
              <div class="finance-form-grid finance-form-grid--2">
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-debt-name">Debt name</label>
                  <input
                    id="modal-debt-name"
                    v-model="liabilityForm.name"
                    class="finance-input"
                    type="text"
                    required
                    placeholder="e.g. Credit card"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-debt-balance">Balance</label>
                  <FinanceMoneyInput
                    id="modal-debt-balance"
                    v-model="liabilityForm.balance"
                  />
                </div>
                <div class="finance-field">
                  <label class="finance-label" for="modal-debt-apr">APR %</label>
                  <input
                    id="modal-debt-apr"
                    v-model="liabilityForm.apr"
                    class="finance-input"
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                  />
                </div>
                <div class="finance-field sm:col-span-2">
                  <label class="finance-label" for="modal-debt-min">Min payment</label>
                  <FinanceMoneyInput
                    id="modal-debt-min"
                    v-model="liabilityForm.min_payment"
                  />
                </div>
              </div>
            </section>
          </div>
          <footer class="finance-modal-footer">
            <button class="finance-modal-secondary" type="button" @click="closeModal">Cancel</button>
            <button
              class="finance-primary-btn disabled:opacity-50"
              type="submit"
              :disabled="isBusy || !liabilityForm.name.trim()"
            >
              Add debt
            </button>
          </footer>
        </form>
      </div>
    </Teleport>
  </div>
</template>
