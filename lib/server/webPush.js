import webpush from 'web-push'

function requireVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:personal-hub@localhost'

  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  return { publicKey, privateKey, subject }
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || ''
}

export async function sendWebPushToSubscriptions(supabase, subscriptions, payload) {
  if (!subscriptions?.length) return { sent: 0, removed: 0, failed: 0 }

  requireVapid()
  const body = JSON.stringify(payload)
  let sent = 0
  let removed = 0
  let failed = 0

  for (const row of subscriptions) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    }

    try {
      await webpush.sendNotification(subscription, body)
      sent += 1
    } catch (error) {
      const status = error?.statusCode || error?.status
      if (status === 404 || status === 410) {
        const { error: deleteError } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', row.endpoint)
        if (!deleteError) removed += 1
        else failed += 1
      } else {
        failed += 1
        console.error('web push send failed', status, error?.message || error)
      }
    }
  }

  return { sent, removed, failed }
}

export async function fetchPushSubscriptions(supabase, userId) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) throw error
  return data ?? []
}
