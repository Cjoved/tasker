import { requireUser } from '../../lib/server/authRequest.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { client, user } = await requireUser(req)
    const endpoint = String(req.body?.endpoint || '').trim()
    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint required' })
    }

    const { error } = await client
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)

    if (error) throw error

    return res.status(200).json({ ok: true })
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({ error: error.message || 'Unsubscribe failed' })
  }
}
