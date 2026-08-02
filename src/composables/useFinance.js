import { computed, ref, watch } from 'vue'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { ASSET_CLASS_COLORS, assetClassLabel } from '../lib/financeAssetClasses'
import {
  formatInvestNumber,
  formatMoney,
  monthBounds,
  monthKeyFromDate,
  shiftMonthKey,
} from './useBudget.js'

export {
  formatInvestNumber,
  formatMoney,
  monthBounds,
  monthKeyFromDate,
  shiftMonthKey,
}

const DEFAULT_BUDGET_CATEGORIES = [
  { name: 'Food', kind: 'expense', color: '#f97316', monthly_limit: 8000, icon: 'food' },
  { name: 'Transport', kind: 'expense', color: '#3b82f6', monthly_limit: 3000, icon: 'transport' },
  { name: 'Bills', kind: 'expense', color: '#8b5cf6', monthly_limit: 5000, icon: 'bills' },
  { name: 'Shopping', kind: 'expense', color: '#ec4899', monthly_limit: 4000, icon: 'shopping' },
  { name: 'Salary', kind: 'income', color: '#22c55e', monthly_limit: null, icon: 'salary' },
  { name: 'Other', kind: 'expense', color: '#64748b', monthly_limit: null, icon: 'other' },
]

const DEFAULT_ACCOUNTS = [
  { name: 'Cash', account_type: 'cash', opening_balance: 0, color: '#16a34a', position: 0 },
  { name: 'Bank', account_type: 'bank', opening_balance: 0, color: '#1e40af', position: 1 },
  { name: 'GCash', account_type: 'ewallet', opening_balance: 0, color: '#007dfe', position: 2 },
  { name: 'Maya', account_type: 'ewallet', opening_balance: 0, color: '#06b6d4', position: 3 },
]

function normalizeTransactionType(type) {
  if (type === 'income' || type === 'expense' || type === 'transfer') return type
  return 'expense'
}

function txDelta(type, amount) {
  const value = Number(amount) || 0
  if (type === 'income') return value
  if (type === 'expense' || type === 'transfer') return -value
  return 0
}

function advanceDueDate(isoDate, cadence) {
  const [year, month, day] = String(isoDate).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (cadence === 'weekly') date.setDate(date.getDate() + 7)
  else if (cadence === 'yearly') date.setFullYear(date.getFullYear() + 1)
  else date.setMonth(date.getMonth() + 1)
  return localDateKey(date)
}

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Local Mon–Sun week bounds as YYYY-MM-DD keys. */
function localWeekBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = start.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + mondayOffset)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return { start: localDateKey(start), end: localDateKey(end) }
}

function normalizeDailyLimitSchedule(value) {
  if (value === 'custom_days' || value === 'weekly') return value
  return 'daily'
}

function totalUnitsForLots(lotRows, holdingId) {
  return lotRows
    .filter((row) => row.holding_id === holdingId)
    .reduce((sum, row) => sum + (Number(row.units) || 0), 0)
}

function totalCostForLots(lotRows, holdingId) {
  return lotRows
    .filter((row) => row.holding_id === holdingId)
    .reduce((sum, row) => sum + (Number(row.units) || 0) * (Number(row.unit_cost) || 0), 0)
}

function latestPriceForMarks(markRows, holdingId, asOfDate = null, lotRows = []) {
  let marks = markRows.filter((row) => row.holding_id === holdingId)
  if (asOfDate) marks = marks.filter((row) => row.marked_on <= asOfDate)
  marks.sort((a, b) => String(b.marked_on).localeCompare(String(a.marked_on)))
  if (marks.length) return Number(marks[0].unit_price) || 0
  const units = totalUnitsForLots(lotRows, holdingId)
  if (!units) return 0
  return totalCostForLots(lotRows, holdingId) / units
}

/** Newton-method XIRR for dated cashflows ({ date, amount }). */
export function xirr(cashflows, guess = 0.1) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) return null

  const sorted = [...cashflows].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const t0 = new Date(sorted[0].date).getTime()
  const flows = sorted.map((cf) => ({
    amount: Number(cf.amount) || 0,
    years: (new Date(cf.date).getTime() - t0) / (365.25 * 86400000),
  }))

  let rate = guess
  for (let i = 0; i < 50; i += 1) {
    let npv = 0
    let dnpv = 0
    for (const flow of flows) {
      const base = 1 + rate
      if (base <= 0) {
        rate = guess
        break
      }
      const disc = base ** flow.years
      npv += flow.amount / disc
      dnpv -= (flow.years * flow.amount) / (disc * base)
    }
    if (Math.abs(dnpv) < 1e-10) return null
    const next = rate - npv / dnpv
    if (Math.abs(next - rate) < 1e-7) return next
    rate = next
  }
  return null
}

export function useFinance(user) {
  const categories = ref([])
  const transactions = ref([])
  const accounts = ref([])
  const recurring = ref([])
  const envelopes = ref([])
  const holdings = ref([])
  const lots = ref([])
  const priceMarks = ref([])
  const dividends = ref([])
  const liabilities = ref([])
  const goals = ref([])
  const allTxLite = ref([])
  const dailyLimits = ref([])

  const isLoading = ref(false)
  const errorMessage = ref('')
  const selectedMonth = ref(monthKeyFromDate())
  const filterType = ref('all')
  const filterCategoryId = ref('all')
  const filterSearch = ref('')
  const filterDateFrom = ref('')
  const filterDateTo = ref('')

  const userId = computed(() => user.value?.id)

  const expenseCategories = computed(() =>
    categories.value.filter((item) => item.kind === 'expense').sort((a, b) => a.name.localeCompare(b.name)),
  )

  const incomeCategories = computed(() =>
    categories.value.filter((item) => item.kind === 'income').sort((a, b) => a.name.localeCompare(b.name)),
  )

  const activeAccounts = computed(() =>
    accounts.value.filter((item) => !item.is_archived).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  )

  const accountBalances = computed(() => {
    const map = {}
    for (const account of accounts.value) {
      map[account.id] = Number(account.opening_balance) || 0
    }
    for (const row of allTxLite.value) {
      if (!row.account_id || map[row.account_id] == null) continue
      map[row.account_id] += txDelta(row.type, row.amount)
    }
    return map
  })

  const monthTransactions = computed(() => {
    let rows = [...transactions.value]
    if (filterType.value !== 'all') {
      rows = rows.filter((row) => row.type === filterType.value)
    }
    if (filterCategoryId.value !== 'all') {
      rows = rows.filter((row) => row.category_id === filterCategoryId.value)
    }
    const from = String(filterDateFrom.value || '').trim()
    const to = String(filterDateTo.value || '').trim()
    if (from && to) {
      const start = from <= to ? from : to
      const end = from <= to ? to : from
      rows = rows.filter((row) => {
        const on = String(row.occurred_on)
        return on >= start && on <= end
      })
    } else if (from) {
      rows = rows.filter((row) => String(row.occurred_on) === from)
    }
    const query = filterSearch.value.trim().toLowerCase()
    if (query) {
      rows = rows.filter((row) => String(row.note || '').toLowerCase().includes(query))
    }
    return rows.sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)))
  })

  const monthSummary = computed(() => {
    let income = 0
    let expense = 0
    for (const row of transactions.value) {
      if (row.transfer_pair_id || row.type === 'transfer') continue
      const amount = Number(row.amount) || 0
      if (row.type === 'income') income += amount
      else if (row.type === 'expense') expense += amount
    }
    return {
      income,
      expense,
      net: income - expense,
    }
  })

  const categoryProgress = computed(() =>
    categories.value
      .map((category) => {
        const spent = transactions.value
          .filter((row) => row.category_id === category.id && row.type === 'expense')
          .reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
        const limit = category.monthly_limit != null ? Number(category.monthly_limit) : null
        const remaining = limit != null ? limit - spent : null
        const pct = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0
        const over = limit != null && spent > limit
        return {
          category,
          spent,
          limit,
          remaining,
          pct,
          over,
        }
      })
      .filter((row) => row.limit != null || row.spent > 0)
      .sort((a, b) => b.spent - a.spent),
  )

  const overLimitCategories = computed(() => categoryProgress.value.filter((row) => row.over))

  /** Recurring spend caps per account — today or this Mon–Sun week when schedule applies. */
  const dailyLimitProgress = computed(() => {
    const today = localDateKey()
    const todayDow = new Date().getDay()
    const { start: weekStart, end: weekEnd } = localWeekBounds()
    const accountById = Object.fromEntries(accounts.value.map((a) => [a.id, a]))
    return dailyLimits.value
      .map((limit) => {
        const accountId = limit.account_id
        const account = accountById[accountId]
        const cap = Number(limit.amount) || 0
        const schedule = normalizeDailyLimitSchedule(limit.schedule)
        const targetDays = Array.isArray(limit.target_days)
          ? limit.target_days.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
          : []
        const isWeekly = schedule === 'weekly'
        const appliesToday =
          isWeekly ||
          schedule === 'daily' ||
          (schedule === 'custom_days' && targetDays.includes(todayDow))

        let spent = 0
        if (appliesToday) {
          for (const row of allTxLite.value) {
            if (row.type !== 'expense') continue
            if (row.account_id !== accountId) continue
            if (isWeekly) {
              if (row.occurred_on < weekStart || row.occurred_on > weekEnd) continue
            } else if (row.occurred_on !== today) {
              continue
            }
            spent += Number(row.amount) || 0
          }
        }

        const remaining = cap - spent
        const pct = appliesToday && cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        let scheduleLabel = 'Every day'
        if (isWeekly) scheduleLabel = 'This week'
        else if (schedule === 'custom_days') {
          scheduleLabel = targetDays.length
            ? targetDays
                .slice()
                .sort((a, b) => a - b)
                .map((d) => dayLabels[d])
                .join(', ')
            : 'Custom days'
        }

        return {
          id: limit.id,
          account_id: accountId,
          schedule,
          target_days: targetDays,
          note: limit.note,
          accountName: account?.name || 'Account',
          accountColor: account?.color || '#0f766e',
          scheduleLabel,
          appliesToday,
          isWeekly,
          spent,
          limit: cap,
          remaining,
          pct,
          over: appliesToday && spent > cap,
        }
      })
      .sort((a, b) => {
        if (a.appliesToday !== b.appliesToday) return a.appliesToday ? -1 : 1
        return (a.accountName || '').localeCompare(b.accountName || '')
      })
  })

  const spendDonutSegments = computed(() =>
    expenseCategories.value
      .map((category) => {
        const value = transactions.value
          .filter((row) => row.category_id === category.id && row.type === 'expense')
          .reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
        return {
          label: category.name,
          value: Math.round(value * 100) / 100,
          color: category.color || '#ef4444',
        }
      })
      .filter((segment) => segment.value > 0),
  )

  const incomeExpenseBars = computed(() => [
    {
      label: 'Income',
      value: Math.round(monthSummary.value.income * 100) / 100,
      color: '#22c55e',
    },
    {
      label: 'Expense',
      value: Math.round(monthSummary.value.expense * 100) / 100,
      color: '#ef4444',
    },
  ])

  const envelopeRows = computed(() => {
    const monthKey = selectedMonth.value
    const monthEnvelopes = envelopes.value.filter((row) => row.month_key === monthKey)
    return monthEnvelopes
      .map((envelope) => {
        const category = categories.value.find((item) => item.id === envelope.category_id)
        const spent = transactions.value
          .filter((row) => row.category_id === envelope.category_id && row.type === 'expense')
          .reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
        const allocated = Number(envelope.allocated_amount) || 0
        return {
          envelope,
          category,
          allocated,
          spent,
          remaining: allocated - spent,
        }
      })
      .sort((a, b) => b.allocated - a.allocated)
  })

  const envelopeAllocatedTotal = computed(() =>
    envelopeRows.value.reduce((sum, row) => sum + row.allocated, 0),
  )

  const envelopeUnallocated = computed(() => monthSummary.value.income - envelopeAllocatedTotal.value)

  const portfolioRows = computed(() =>
    holdings.value
      .map((holding) => {
        const units = totalUnitsForLots(lots.value, holding.id)
        const cost = totalCostForLots(lots.value, holding.id)
        const price = latestPriceForMarks(priceMarks.value, holding.id, null, lots.value)
        const marketValue = units * price
        const gain = marketValue - cost
        const gainPct = cost > 0 ? (gain / cost) * 100 : 0
        return {
          holding,
          units,
          cost,
          price,
          marketValue,
          gain,
          gainPct,
        }
      })
      .filter((row) => row.units > 0 || row.cost > 0)
      .sort((a, b) => b.marketValue - a.marketValue),
  )

  const cashAssets = computed(() =>
    Object.values(accountBalances.value).reduce((sum, value) => sum + (Number(value) || 0), 0),
  )

  const investValue = computed(() =>
    portfolioRows.value.reduce((sum, row) => sum + row.marketValue, 0),
  )

  const investedCost = computed(() => portfolioRows.value.reduce((sum, row) => sum + row.cost, 0))

  const liabilitiesTotal = computed(() =>
    liabilities.value.reduce((sum, row) => sum + (Number(row.balance) || 0), 0),
  )

  const netWorth = computed(() => cashAssets.value + investValue.value - liabilitiesTotal.value)

  const unrealizedGain = computed(() => investValue.value - investedCost.value)

  const allocationSegments = computed(() => {
    const segments = []
    if (cashAssets.value > 0) {
      segments.push({
        label: 'Cash',
        value: Math.round(cashAssets.value * 100) / 100,
        color: '#1e40af',
      })
    }

    const byClass = {}
    for (const row of portfolioRows.value) {
      const key = row.holding.asset_class || 'other'
      byClass[key] = (byClass[key] || 0) + row.marketValue
    }

    for (const [assetClass, value] of Object.entries(byClass)) {
      if (value <= 0) continue
      segments.push({
        label: assetClassLabel(assetClass),
        value: Math.round(value * 100) / 100,
        color: ASSET_CLASS_COLORS[assetClass] || ASSET_CLASS_COLORS.other,
      })
    }

    return segments
  })

  const netWorthTrend = computed(() => {
    const points = []
    for (let delta = -5; delta <= 0; delta += 1) {
      const monthKey = shiftMonthKey(selectedMonth.value, delta)
      const { end } = monthBounds(monthKey)

      let cash = 0
      for (const account of accounts.value) {
        let balance = Number(account.opening_balance) || 0
        for (const row of allTxLite.value) {
          if (row.account_id !== account.id) continue
          if (row.occurred_on > end) continue
          balance += txDelta(row.type, row.amount)
        }
        cash += balance
      }

      let invest = 0
      for (const holding of holdings.value) {
        const units = totalUnitsForLots(lots.value, holding.id)
        const price = latestPriceForMarks(priceMarks.value, holding.id, end, lots.value)
        invest += units * price
      }

      points.push({
        monthKey,
        label: monthKey,
        netWorth: cash + invest - liabilitiesTotal.value,
        cashAssets: cash,
        investValue: invest,
      })
    }
    return points
  })

  async function ensureDefaultCategories() {
    if (!userId.value || categories.value.length) return

    const rows = DEFAULT_BUDGET_CATEGORIES.map((item) => ({
      user_id: userId.value,
      ...item,
    }))

    const { data, error } = await supabase.from('budget_categories').insert(rows).select()
    if (error) {
      errorMessage.value = error.message
      return
    }
    categories.value = data ?? []
  }

  async function ensureDefaultAccounts() {
    if (!userId.value || accounts.value.length) return

    const rows = DEFAULT_ACCOUNTS.map((item) => ({
      user_id: userId.value,
      ...item,
    }))

    const { data, error } = await supabase.from('finance_accounts').insert(rows).select()
    if (error) {
      errorMessage.value = error.message
      return
    }
    accounts.value = data ?? []
  }

  async function fetchFinance() {
    if (!userId.value || !isSupabaseConfigured) {
      categories.value = []
      transactions.value = []
      accounts.value = []
      recurring.value = []
      envelopes.value = []
      holdings.value = []
      lots.value = []
      priceMarks.value = []
      dividends.value = []
      liabilities.value = []
      goals.value = []
      allTxLite.value = []
      dailyLimits.value = []
      return
    }

    isLoading.value = true
    errorMessage.value = ''

    const { start, end } = monthBounds(selectedMonth.value)
    const monthKey = selectedMonth.value

    const [
      categoryResult,
      transactionResult,
      accountResult,
      recurringResult,
      envelopeResult,
      holdingResult,
      lotResult,
      markResult,
      dividendResult,
      liabilityResult,
      goalResult,
      txLiteResult,
      dailyLimitsResult,
    ] = await Promise.all([
      supabase.from('budget_categories').select('*').eq('user_id', userId.value).order('name'),
      supabase
        .from('budget_transactions')
        .select('*')
        .eq('user_id', userId.value)
        .gte('occurred_on', start)
        .lte('occurred_on', end)
        .order('occurred_on', { ascending: false }),
      supabase.from('finance_accounts').select('*').eq('user_id', userId.value).order('position'),
      supabase.from('finance_recurring').select('*').eq('user_id', userId.value).order('next_due'),
      supabase.from('finance_envelopes').select('*').eq('user_id', userId.value).eq('month_key', monthKey),
      supabase.from('finance_holdings').select('*').eq('user_id', userId.value).order('name'),
      supabase.from('finance_lots').select('*').eq('user_id', userId.value).order('bought_on', { ascending: false }),
      supabase.from('finance_price_marks').select('*').eq('user_id', userId.value).order('marked_on', { ascending: false }),
      supabase.from('finance_dividends').select('*').eq('user_id', userId.value).order('paid_on', { ascending: false }),
      supabase.from('finance_liabilities').select('*').eq('user_id', userId.value).order('balance', { ascending: false }),
      supabase.from('finance_goals').select('*').eq('user_id', userId.value).order('due_on'),
      supabase
        .from('budget_transactions')
        .select('amount, type, account_id, occurred_on')
        .eq('user_id', userId.value)
        .gte('occurred_on', (() => {
          const d = new Date()
          d.setFullYear(d.getFullYear() - 2)
          return localDateKey(d)
        })()),
      supabase
        .from('finance_daily_limits')
        .select('*')
        .eq('user_id', userId.value)
        .order('created_at', { ascending: false })
        .limit(90),
    ])

    const firstError =
      categoryResult.error ||
      transactionResult.error ||
      accountResult.error ||
      recurringResult.error ||
      envelopeResult.error ||
      holdingResult.error ||
      lotResult.error ||
      markResult.error ||
      dividendResult.error ||
      liabilityResult.error ||
      goalResult.error ||
      txLiteResult.error ||
      dailyLimitsResult.error

    if (firstError) {
      errorMessage.value = firstError.message || 'Failed to load finance data.'
      isLoading.value = false
      return
    }

    categories.value = categoryResult.data ?? []
    transactions.value = transactionResult.data ?? []
    accounts.value = accountResult.data ?? []
    recurring.value = recurringResult.data ?? []
    envelopes.value = envelopeResult.data ?? []
    holdings.value = holdingResult.data ?? []
    lots.value = lotResult.data ?? []
    priceMarks.value = markResult.data ?? []
    dividends.value = dividendResult.data ?? []
    liabilities.value = liabilityResult.data ?? []
    goals.value = goalResult.data ?? []
    allTxLite.value = txLiteResult.data ?? []
    dailyLimits.value = dailyLimitsResult.data ?? []

    await ensureDefaultCategories()
    await ensureDefaultAccounts()
    isLoading.value = false
  }

  async function upsertDailyLimit(payload) {
    if (!userId.value) return false
    errorMessage.value = ''

    const account_id = payload.account_id
    const amount = Number(payload.amount)
    const schedule = normalizeDailyLimitSchedule(payload.schedule)
    const target_days =
      schedule === 'custom_days'
        ? [...new Set((payload.target_days || []).map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))].sort(
            (a, b) => a - b,
          )
        : []

    if (!account_id) {
      errorMessage.value = 'Choose which account this limit applies to.'
      return false
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errorMessage.value = 'Enter a spend limit greater than zero.'
      return false
    }
    if (schedule === 'custom_days' && !target_days.length) {
      errorMessage.value = 'Pick at least one weekday for a custom schedule.'
      return false
    }

    const row = {
      user_id: userId.value,
      account_id,
      amount,
      schedule,
      target_days,
      note: payload.note?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('finance_daily_limits')
      .upsert(row, { onConflict: 'user_id,account_id' })
      .select('*')
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    if (data) {
      const rest = dailyLimits.value.filter((item) => item.account_id !== data.account_id)
      dailyLimits.value = [data, ...rest]
    }
    return true
  }

  async function deleteDailyLimit(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { error } = await supabase
      .from('finance_daily_limits')
      .delete()
      .eq('id', id)
      .eq('user_id', userId.value)

    if (error) {
      errorMessage.value = error.message
      return false
    }

    dailyLimits.value = dailyLimits.value.filter((item) => item.id !== id)
    return true
  }

  const fetchBudget = fetchFinance

  async function createCategory(payload) {
    if (!userId.value || !payload.name?.trim()) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('budget_categories')
      .insert({
        user_id: userId.value,
        name: payload.name.trim(),
        kind: payload.kind === 'income' ? 'income' : 'expense',
        color: payload.color || '#6366f1',
        icon: payload.icon || 'other',
        monthly_limit: payload.monthly_limit ? Number(payload.monthly_limit) : null,
      })
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    categories.value = [...categories.value, data]
    return true
  }

  async function updateCategory(id, payload) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('budget_categories')
      .update({
        name: payload.name?.trim(),
        kind: payload.kind === 'income' ? 'income' : 'expense',
        color: payload.color,
        icon: payload.icon || 'other',
        monthly_limit: payload.monthly_limit ? Number(payload.monthly_limit) : null,
      })
      .eq('id', id)
      .eq('user_id', userId.value)
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    categories.value = categories.value.map((item) => (item.id === id ? data : item))
    return true
  }

  async function deleteCategory(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const inUse = transactions.value.some((row) => row.category_id === id)
    if (inUse) {
      errorMessage.value = 'Delete or reassign transactions in this category first.'
      return false
    }

    const { error } = await supabase.from('budget_categories').delete().eq('id', id).eq('user_id', userId.value)
    if (error) {
      errorMessage.value = error.message
      return false
    }

    categories.value = categories.value.filter((item) => item.id !== id)
    if (filterCategoryId.value === id) filterCategoryId.value = 'all'
    return true
  }

  function syncTxLiteRow(row) {
    if (!row?.account_id) return
    const idx = allTxLite.value.findIndex(
      (item) =>
        item.account_id === row.account_id &&
        item.occurred_on === row.occurred_on &&
        item.amount === row.amount &&
        item.type === row.type,
    )
    if (idx >= 0) {
      allTxLite.value = allTxLite.value.map((item, i) => (i === idx ? { ...item, ...row } : item))
    } else {
      allTxLite.value = [
        { amount: row.amount, type: row.type, account_id: row.account_id, occurred_on: row.occurred_on },
        ...allTxLite.value,
      ]
    }
  }

  function removeTxLiteForTransaction(row) {
    if (!row?.account_id) return
    allTxLite.value = allTxLite.value.filter(
      (item) =>
        !(
          item.account_id === row.account_id &&
          item.occurred_on === row.occurred_on &&
          Number(item.amount) === Number(row.amount) &&
          item.type === row.type
        ),
    )
  }

  async function createTransaction(payload) {
    if (!userId.value || !payload.category_id || !payload.amount) return false
    errorMessage.value = ''

    const amount = Number(payload.amount)
    if (!(amount > 0)) {
      errorMessage.value = 'Amount must be greater than zero.'
      return false
    }

    const insertRow = {
      user_id: userId.value,
      category_id: payload.category_id,
      amount,
      type: normalizeTransactionType(payload.type),
      note: payload.note?.trim() || null,
      occurred_on: payload.occurred_on || localDateKey(),
    }
    if (payload.account_id) insertRow.account_id = payload.account_id

    const { data, error } = await supabase.from('budget_transactions').insert(insertRow).select().single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    const { start, end } = monthBounds(selectedMonth.value)
    if (data.occurred_on >= start && data.occurred_on <= end) {
      transactions.value = [data, ...transactions.value]
    }
    syncTxLiteRow(data)
    return true
  }

  async function createTransfer(payload) {
    if (!userId.value) return false
    errorMessage.value = ''

    const amount = Number(payload.amount)
    const fromId = payload.from_account_id
    const toId = payload.to_account_id
    if (!(amount > 0)) {
      errorMessage.value = 'Amount must be greater than zero.'
      return false
    }
    if (!fromId || !toId || fromId === toId) {
      errorMessage.value = 'Choose two different accounts.'
      return false
    }

    const pairId = crypto.randomUUID()
    const occurredOn = payload.occurred_on || localDateKey()
    const note = payload.note?.trim() || 'Transfer'

    const rows = [
      {
        user_id: userId.value,
        category_id: null,
        amount,
        type: 'transfer',
        note: `${note} →`,
        occurred_on: occurredOn,
        account_id: fromId,
        transfer_pair_id: pairId,
      },
      {
        user_id: userId.value,
        category_id: null,
        amount,
        type: 'income',
        note: `${note} ←`,
        occurred_on: occurredOn,
        account_id: toId,
        transfer_pair_id: pairId,
      },
    ]

    const { data, error } = await supabase.from('budget_transactions').insert(rows).select()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    const { start, end } = monthBounds(selectedMonth.value)
    const inMonth = (data || []).filter((row) => row.occurred_on >= start && row.occurred_on <= end)
    if (inMonth.length) {
      transactions.value = [...inMonth, ...transactions.value]
    }
    for (const row of data || []) syncTxLiteRow(row)
    return true
  }

  async function updateTransaction(id, payload) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const amount = Number(payload.amount)
    if (!(amount > 0)) {
      errorMessage.value = 'Amount must be greater than zero.'
      return false
    }

    const existing = transactions.value.find((row) => row.id === id)
    if (existing) removeTxLiteForTransaction(existing)

    const updateRow = {
      category_id: payload.category_id,
      amount,
      type: normalizeTransactionType(payload.type),
      note: payload.note?.trim() || null,
      occurred_on: payload.occurred_on,
      account_id: payload.account_id || null,
    }

    const { data, error } = await supabase
      .from('budget_transactions')
      .update(updateRow)
      .eq('id', id)
      .eq('user_id', userId.value)
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      if (existing) syncTxLiteRow(existing)
      return false
    }

    const { start, end } = monthBounds(selectedMonth.value)
    if (data.occurred_on >= start && data.occurred_on <= end) {
      transactions.value = transactions.value.map((row) => (row.id === id ? data : row))
    } else {
      transactions.value = transactions.value.filter((row) => row.id !== id)
    }
    syncTxLiteRow(data)
    return true
  }

  async function deleteTransaction(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const existing = transactions.value.find((row) => row.id === id)

    const { error } = await supabase.from('budget_transactions').delete().eq('id', id).eq('user_id', userId.value)
    if (error) {
      errorMessage.value = error.message
      return false
    }

    if (existing) removeTxLiteForTransaction(existing)
    transactions.value = transactions.value.filter((row) => row.id !== id)
    return true
  }

  async function createAccount(payload) {
    if (!userId.value || !payload.name?.trim()) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('finance_accounts')
      .insert({
        user_id: userId.value,
        name: payload.name.trim(),
        account_type: payload.account_type || 'other',
        opening_balance: Number(payload.opening_balance) || 0,
        currency: payload.currency || 'PHP',
        color: payload.color || '#1e40af',
        position: payload.position ?? accounts.value.length,
        is_archived: false,
      })
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    accounts.value = [...accounts.value, data]
    return true
  }

  async function updateAccount(id, payload) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const patch = {}
    if (payload.name != null) patch.name = String(payload.name).trim()
    if (payload.account_type != null) patch.account_type = payload.account_type
    if (payload.opening_balance != null && payload.opening_balance !== '') {
      patch.opening_balance = Number(payload.opening_balance)
    }
    if (payload.currency != null) patch.currency = payload.currency
    if (payload.color != null) patch.color = payload.color
    if (payload.position != null) patch.position = payload.position
    if (payload.is_archived != null) patch.is_archived = payload.is_archived

    if (!Object.keys(patch).length) return false

    const { data, error } = await supabase
      .from('finance_accounts')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId.value)
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    accounts.value = accounts.value.map((item) => (item.id === id ? data : item))
    return true
  }

  async function deleteAccount(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const inUse =
      transactions.value.some((row) => row.account_id === id) ||
      allTxLite.value.some((row) => row.account_id === id) ||
      recurring.value.some((row) => row.account_id === id)

    if (inUse) {
      errorMessage.value = 'Remove or reassign transactions linked to this account first.'
      return false
    }

    const { error } = await supabase.from('finance_accounts').delete().eq('id', id).eq('user_id', userId.value)
    if (error) {
      errorMessage.value = error.message
      return false
    }

    accounts.value = accounts.value.filter((item) => item.id !== id)
    return true
  }

  async function createRecurring(payload) {
    if (!userId.value || !payload.name?.trim() || !payload.amount) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('finance_recurring')
      .insert({
        user_id: userId.value,
        name: payload.name.trim(),
        amount: Number(payload.amount),
        type: payload.type === 'income' ? 'income' : 'expense',
        category_id: payload.category_id || null,
        account_id: payload.account_id || null,
        cadence: payload.cadence || 'monthly',
        next_due: payload.next_due || localDateKey(),
        is_active: payload.is_active !== false,
        is_subscription: Boolean(payload.is_subscription),
      })
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    recurring.value = [...recurring.value, data]
    return true
  }

  async function updateRecurring(id, payload) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('finance_recurring')
      .update({
        name: payload.name?.trim(),
        amount: payload.amount != null ? Number(payload.amount) : undefined,
        type: payload.type === 'income' ? 'income' : 'expense',
        category_id: payload.category_id,
        account_id: payload.account_id,
        cadence: payload.cadence,
        next_due: payload.next_due,
        is_active: payload.is_active,
        is_subscription: payload.is_subscription,
      })
      .eq('id', id)
      .eq('user_id', userId.value)
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    recurring.value = recurring.value.map((item) => (item.id === id ? data : item))
    return true
  }

  async function deleteRecurring(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { error } = await supabase.from('finance_recurring').delete().eq('id', id).eq('user_id', userId.value)
    if (error) {
      errorMessage.value = error.message
      return false
    }

    recurring.value = recurring.value.filter((item) => item.id !== id)
    return true
  }

  async function postRecurring(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const item = recurring.value.find((row) => row.id === id)
    if (!item) {
      errorMessage.value = 'Recurring item not found.'
      return false
    }
    if (!item.category_id) {
      errorMessage.value = 'Assign a category before posting.'
      return false
    }

    const ok = await createTransaction({
      category_id: item.category_id,
      amount: item.amount,
      type: item.type,
      account_id: item.account_id,
      note: item.name,
      occurred_on: item.next_due,
    })
    if (!ok) return false

    const nextDue = advanceDueDate(item.next_due, item.cadence || 'monthly')
    return updateRecurring(id, { next_due: nextDue })
  }

  async function upsertEnvelope(monthKey, categoryId, amount) {
    if (!userId.value || !monthKey || !categoryId) return false
    errorMessage.value = ''

    const allocated = Math.max(0, Number(amount) || 0)
    const { data, error } = await supabase
      .from('finance_envelopes')
      .upsert(
        {
          user_id: userId.value,
          month_key: monthKey,
          category_id: categoryId,
          allocated_amount: allocated,
        },
        { onConflict: 'user_id,month_key,category_id' },
      )
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    const others = envelopes.value.filter(
      (row) => !(row.month_key === monthKey && row.category_id === categoryId),
    )
    envelopes.value = [...others, data]
    return true
  }

  async function createGoal(payload) {
    if (!userId.value || !payload.name?.trim() || !payload.target_amount) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('finance_goals')
      .insert({
        user_id: userId.value,
        name: payload.name.trim(),
        target_amount: Number(payload.target_amount),
        current_amount: Number(payload.current_amount) || 0,
        due_on: payload.due_on || null,
        color: payload.color || '#059669',
      })
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    goals.value = [...goals.value, data]
    return true
  }

  async function updateGoal(id, payload) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('finance_goals')
      .update({
        name: payload.name?.trim(),
        target_amount: payload.target_amount != null ? Number(payload.target_amount) : undefined,
        current_amount: payload.current_amount != null ? Number(payload.current_amount) : undefined,
        due_on: payload.due_on,
        color: payload.color,
      })
      .eq('id', id)
      .eq('user_id', userId.value)
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    goals.value = goals.value.map((item) => (item.id === id ? data : item))
    return true
  }

  async function deleteGoal(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { error } = await supabase.from('finance_goals').delete().eq('id', id).eq('user_id', userId.value)
    if (error) {
      errorMessage.value = error.message
      return false
    }

    goals.value = goals.value.filter((item) => item.id !== id)
    return true
  }

  async function createLiability(payload) {
    if (!userId.value || !payload.name?.trim()) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('finance_liabilities')
      .insert({
        user_id: userId.value,
        name: payload.name.trim(),
        balance: Number(payload.balance) || 0,
        apr: Number(payload.apr) || 0,
        min_payment: Number(payload.min_payment) || 0,
        notes: payload.notes?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    liabilities.value = [...liabilities.value, data]
    return true
  }

  async function updateLiability(id, payload) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('finance_liabilities')
      .update({
        name: payload.name?.trim(),
        balance: payload.balance != null ? Number(payload.balance) : undefined,
        apr: payload.apr != null ? Number(payload.apr) : undefined,
        min_payment: payload.min_payment != null ? Number(payload.min_payment) : undefined,
        notes: payload.notes?.trim() || null,
      })
      .eq('id', id)
      .eq('user_id', userId.value)
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    liabilities.value = liabilities.value.map((item) => (item.id === id ? data : item))
    return true
  }

  async function deleteLiability(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { error } = await supabase.from('finance_liabilities').delete().eq('id', id).eq('user_id', userId.value)
    if (error) {
      errorMessage.value = error.message
      return false
    }

    liabilities.value = liabilities.value.filter((item) => item.id !== id)
    return true
  }

  function debtPlan(method = 'snowball') {
    const rows = liabilities.value.map((item, index) => ({
      liability: item,
      balance: Number(item.balance) || 0,
      apr: Number(item.apr) || 0,
      minPayment: Number(item.min_payment) || 0,
      originalIndex: index,
    }))

    if (method === 'avalanche') {
      rows.sort((a, b) => b.apr - a.apr || a.balance - b.balance)
    } else {
      rows.sort((a, b) => a.balance - b.balance || b.apr - a.apr)
    }

    return rows.map((row, order) => ({
      ...row,
      payoffOrder: order + 1,
      method,
    }))
  }

  async function ensureInvestmentsCategory(kind) {
    const normalized = kind === 'income' ? 'income' : 'expense'
    const existing = categories.value.find(
      (row) => row.kind === normalized && String(row.name).toLowerCase() === 'investments',
    )
    if (existing) return existing

    const ok = await createCategory({
      name: 'Investments',
      kind: normalized,
      color: normalized === 'income' ? '#0d9488' : '#0f766e',
      icon: 'other',
      monthly_limit: null,
    })
    if (!ok) return null

    return (
      categories.value.find(
        (row) => row.kind === normalized && String(row.name).toLowerCase() === 'investments',
      ) || null
    )
  }

  async function createHolding(payload) {
    if (!userId.value || !payload.name?.trim()) return false
    errorMessage.value = ''

    const { data: holding, error } = await supabase
      .from('finance_holdings')
      .insert({
        user_id: userId.value,
        name: payload.name.trim(),
        symbol: payload.symbol?.trim() || null,
        asset_class: payload.asset_class || 'stock',
        currency: payload.currency || 'PHP',
        notes: payload.notes?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    holdings.value = [...holdings.value, holding]

    if (payload.lot && Number(payload.lot.units) > 0) {
      const lotOk = await addLot(holding.id, {
        ...payload.lot,
        account_id: payload.lot.account_id || payload.account_id || null,
      })
      if (!lotOk) return false
    }

    return true
  }

  async function addLot(holdingId, payload) {
    if (!userId.value || !holdingId) return false
    errorMessage.value = ''

    const units = Number(payload.units)
    if (!(units > 0)) {
      errorMessage.value = 'Units must be greater than zero.'
      return false
    }

    const unitCost = Number(payload.unit_cost) || 0
    const boughtOn = payload.bought_on || localDateKey()

    const { data, error } = await supabase
      .from('finance_lots')
      .insert({
        user_id: userId.value,
        holding_id: holdingId,
        bought_on: boughtOn,
        units,
        unit_cost: unitCost,
      })
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    lots.value = [data, ...lots.value]

    const accountId = payload.account_id || null
    if (accountId) {
      const total = units * unitCost
      if (total > 0) {
        const category = await ensureInvestmentsCategory('expense')
        if (!category) {
          errorMessage.value =
            errorMessage.value || 'Lot saved, but could not create Investments expense category.'
          return false
        }
        const holding = holdings.value.find((row) => row.id === holdingId)
        const txOk = await createTransaction({
          category_id: category.id,
          amount: total,
          type: 'expense',
          account_id: accountId,
          occurred_on: boughtOn,
          note: `Buy ${holding?.name || 'holding'}`,
        })
        if (!txOk) {
          errorMessage.value =
            errorMessage.value || 'Lot saved, but funding expense could not be recorded.'
          return false
        }
      }
    }

    return true
  }

  async function sellUnits(holdingId, payload) {
    if (!userId.value || !holdingId) return false
    errorMessage.value = ''

    const unitsToSell = Number(payload.units)
    const unitPrice = Number(payload.unit_price)
    const soldOn = payload.sold_on || localDateKey()

    if (!(unitsToSell > 0)) {
      errorMessage.value = 'Units must be greater than zero.'
      return false
    }
    if (!(unitPrice >= 0)) {
      errorMessage.value = 'Sell price must be zero or greater.'
      return false
    }

    const available = totalUnitsForLots(lots.value, holdingId)
    if (unitsToSell > available + 1e-10) {
      errorMessage.value = 'Cannot sell more units than you hold.'
      return false
    }

    const ordered = lots.value
      .filter((row) => row.holding_id === holdingId)
      .slice()
      .sort((a, b) => {
        const byDate = String(a.bought_on).localeCompare(String(b.bought_on))
        if (byDate) return byDate
        return String(a.created_at || '').localeCompare(String(b.created_at || ''))
      })

    let remaining = unitsToSell
    const nextLots = lots.value.slice()

    for (const lot of ordered) {
      if (remaining <= 1e-12) break
      const lotUnits = Number(lot.units) || 0
      if (!(lotUnits > 0)) continue

      if (lotUnits <= remaining + 1e-12) {
        const { error } = await supabase
          .from('finance_lots')
          .delete()
          .eq('id', lot.id)
          .eq('user_id', userId.value)
        if (error) {
          errorMessage.value = error.message
          return false
        }
        const idx = nextLots.findIndex((row) => row.id === lot.id)
        if (idx >= 0) nextLots.splice(idx, 1)
        remaining = Math.max(0, remaining - lotUnits)
      } else {
        const newUnits = lotUnits - remaining
        const { data, error } = await supabase
          .from('finance_lots')
          .update({ units: newUnits })
          .eq('id', lot.id)
          .eq('user_id', userId.value)
          .select()
          .single()
        if (error) {
          errorMessage.value = error.message
          return false
        }
        const idx = nextLots.findIndex((row) => row.id === lot.id)
        if (idx >= 0) nextLots[idx] = data
        remaining = 0
      }
    }

    lots.value = nextLots

    const markOk = await markPrice(holdingId, {
      unit_price: unitPrice,
      marked_on: soldOn,
    })
    if (!markOk) return false

    const accountId = payload.account_id || null
    if (accountId) {
      const proceeds = unitsToSell * unitPrice
      if (proceeds > 0) {
        const category = await ensureInvestmentsCategory('income')
        if (!category) {
          errorMessage.value =
            errorMessage.value || 'Sale saved, but could not create Investments income category.'
          return false
        }
        const holding = holdings.value.find((row) => row.id === holdingId)
        const txOk = await createTransaction({
          category_id: category.id,
          amount: proceeds,
          type: 'income',
          account_id: accountId,
          occurred_on: soldOn,
          note: `Sell ${holding?.name || 'holding'}`,
        })
        if (!txOk) {
          errorMessage.value =
            errorMessage.value || 'Sale saved, but proceeds income could not be recorded.'
          return false
        }
      }
    }

    return true
  }

  async function markPrice(holdingId, payload) {
    if (!userId.value || !holdingId) return false
    errorMessage.value = ''

    const markedOn = payload.marked_on || localDateKey()
    const unitPrice = Number(payload.unit_price)
    if (!(unitPrice >= 0)) {
      errorMessage.value = 'Price must be zero or greater.'
      return false
    }

    const { data, error } = await supabase
      .from('finance_price_marks')
      .upsert(
        {
          user_id: userId.value,
          holding_id: holdingId,
          marked_on: markedOn,
          unit_price: unitPrice,
        },
        { onConflict: 'holding_id,marked_on' },
      )
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    const others = priceMarks.value.filter(
      (row) => !(row.holding_id === holdingId && row.marked_on === markedOn),
    )
    priceMarks.value = [data, ...others]
    return true
  }

  async function addDividend(holdingId, payload) {
    if (!userId.value || !holdingId || !payload.amount) return false
    errorMessage.value = ''

    const amount = Number(payload.amount)
    if (!(amount > 0)) {
      errorMessage.value = 'Dividend amount must be greater than zero.'
      return false
    }

    const { data, error } = await supabase
      .from('finance_dividends')
      .insert({
        user_id: userId.value,
        holding_id: holdingId,
        paid_on: payload.paid_on || localDateKey(),
        amount,
        note: payload.note?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      errorMessage.value = error.message
      return false
    }

    dividends.value = [data, ...dividends.value]
    return true
  }

  async function deleteHolding(id) {
    if (!userId.value || !id) return false
    errorMessage.value = ''

    const { error } = await supabase.from('finance_holdings').delete().eq('id', id).eq('user_id', userId.value)
    if (error) {
      errorMessage.value = error.message
      return false
    }

    holdings.value = holdings.value.filter((item) => item.id !== id)
    lots.value = lots.value.filter((item) => item.holding_id !== id)
    priceMarks.value = priceMarks.value.filter((item) => item.holding_id !== id)
    dividends.value = dividends.value.filter((item) => item.holding_id !== id)
    return true
  }

  function categoryById(id) {
    return categories.value.find((item) => item.id === id) || null
  }

  function accountById(id) {
    return accounts.value.find((item) => item.id === id) || null
  }

  function exportCsv() {
    const headers = ['Date', 'Type', 'Category', 'Account', 'Amount', 'Note']
    const lines = [headers.join(',')]

    for (const row of monthTransactions.value) {
      const category = categoryById(row.category_id)
      const account = row.account_id ? accountById(row.account_id) : null
      lines.push(
        [
          csvEscape(row.occurred_on),
          csvEscape(row.type),
          csvEscape(category?.name || ''),
          csvEscape(account?.name || ''),
          csvEscape(row.amount),
          csvEscape(row.note || ''),
        ].join(','),
      )
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `transactions-${selectedMonth.value}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  watch(
    userId,
    (id) => {
      if (id) fetchFinance()
      else {
        categories.value = []
        transactions.value = []
        accounts.value = []
        recurring.value = []
        envelopes.value = []
        holdings.value = []
        lots.value = []
        priceMarks.value = []
        dividends.value = []
        liabilities.value = []
        goals.value = []
        allTxLite.value = []
        dailyLimits.value = []
      }
    },
    { immediate: true },
  )

  watch(selectedMonth, () => {
    if (userId.value) fetchFinance()
  })

  return {
    categories,
    transactions,
    accounts,
    recurring,
    envelopes,
    holdings,
    lots,
    priceMarks,
    dividends,
    liabilities,
    goals,
    allTxLite,
    dailyLimits,
    isLoading,
    errorMessage,
    selectedMonth,
    filterType,
    filterCategoryId,
    filterSearch,
    filterDateFrom,
    filterDateTo,
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
    envelopeRows,
    envelopeAllocatedTotal,
    envelopeUnallocated,
    portfolioRows,
    cashAssets,
    investValue,
    investedCost,
    liabilitiesTotal,
    netWorth,
    unrealizedGain,
    allocationSegments,
    netWorthTrend,
    fetchFinance,
    fetchBudget,
    createCategory,
    updateCategory,
    deleteCategory,
    upsertDailyLimit,
    deleteDailyLimit,
    createTransaction,
    createTransfer,
    updateTransaction,
    deleteTransaction,
    createAccount,
    updateAccount,
    deleteAccount,
    createRecurring,
    updateRecurring,
    deleteRecurring,
    postRecurring,
    upsertEnvelope,
    createGoal,
    updateGoal,
    deleteGoal,
    createLiability,
    updateLiability,
    deleteLiability,
    debtPlan,
    createHolding,
    addLot,
    sellUnits,
    markPrice,
    addDividend,
    deleteHolding,
    exportCsv,
    categoryById,
    accountById,
  }
}
