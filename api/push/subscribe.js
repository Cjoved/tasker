import { requireUser } from '../../lib/server/authRequest.js'

function readSubscription(body) {
  const endpoint = String(body?.endpoint || '').trim()
  const p256dh = String(body?.keys?.p256dh || body?.p256dh || '').trim()
  const auth = String(body?.keys?.auth || body?.auth || '').trim()

  if (!endpoint || !p256dh || !auth) {
    const error = new Error('Invalid push subscription')
    error.status = 400
    throw error
  }

  return { endpoint, p256dh, auth }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { client, user } = await requireUser(req)
    const { endpoint, p256dh, auth } = readSubscription(req.body || {})
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)

    const { error } = await client.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

    if (error) throw error

    return res.status(200).json({ ok: true })
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({ error: error.message || 'Subscribe failed' })
  }
}
