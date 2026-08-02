import { computed, ref } from 'vue'
import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.ready
}

export function useWebPush() {
  const isSupported = computed(
    () =>
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window,
  )
  const permission = ref(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  const isSubscribed = ref(false)
  const isBusy = ref(false)
  const errorMessage = ref('')

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

  const statusLabel = computed(() => {
    if (!isSupported.value) return 'Not supported on this browser'
    if (!vapidPublicKey) return 'VAPID public key missing'
    if (permission.value === 'denied') return 'Blocked in browser settings'
    if (isSubscribed.value) return 'Enabled on this device'
    return 'Off on this device'
  })

  async function refreshSubscriptionState() {
    errorMessage.value = ''
    if (!isSupported.value) {
      isSubscribed.value = false
      return
    }
    permission.value = Notification.permission
    try {
      const registration = await getRegistration()
      const existing = await registration?.pushManager?.getSubscription()
      isSubscribed.value = Boolean(existing)
    } catch {
      isSubscribed.value = false
    }
  }

  async function subscribe() {
    errorMessage.value = ''
    if (!isSupported.value) {
      errorMessage.value = 'Web Push is not supported here.'
      return false
    }
    if (!vapidPublicKey) {
      errorMessage.value = 'Missing VITE_VAPID_PUBLIC_KEY.'
      return false
    }

    isBusy.value = true
    try {
      const result = await Notification.requestPermission()
      permission.value = result
      if (result !== 'granted') {
        errorMessage.value = 'Notification permission was not granted.'
        return false
      }

      const registration = await getRegistration()
      if (!registration?.pushManager) {
        errorMessage.value = 'Service worker is not ready yet. Open the installed app and try again.'
        return false
      }

      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }

      const token = await getAccessToken()
      if (!token) {
        errorMessage.value = 'Sign in required.'
        return false
      }

      const response = await fetch('/api/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'subscribe',
          ...subscription.toJSON(),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        errorMessage.value = payload.error || 'Could not save subscription.'
        return false
      }

      isSubscribed.value = true
      return true
    } catch (error) {
      errorMessage.value = error.message || 'Subscribe failed.'
      return false
    } finally {
      isBusy.value = false
    }
  }

  async function unsubscribe() {
    errorMessage.value = ''
    isBusy.value = true
    try {
      const registration = await getRegistration()
      const subscription = await registration?.pushManager?.getSubscription()
      if (subscription) {
        const token = await getAccessToken()
        if (token) {
          await fetch('/api/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action: 'unsubscribe', endpoint: subscription.endpoint }),
          })
        }
        await subscription.unsubscribe()
      }
      isSubscribed.value = false
      return true
    } catch (error) {
      errorMessage.value = error.message || 'Unsubscribe failed.'
      return false
    } finally {
      isBusy.value = false
    }
  }

  return {
    isSupported,
    permission,
    isSubscribed,
    isBusy,
    errorMessage,
    statusLabel,
    refreshSubscriptionState,
    subscribe,
    unsubscribe,
  }
}
