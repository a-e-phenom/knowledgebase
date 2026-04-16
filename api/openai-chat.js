import { forwardOpenAIChatCompletion, proxyRequestFailedErrorBody } from '../server/openaiProxy.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed.' } })
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const result = await forwardOpenAIChatCompletion(payload)
    res.setHeader('Content-Type', result.contentType)
    return res.status(result.status).send(result.body)
  } catch {
    return res.status(500).json(proxyRequestFailedErrorBody())
  }
}
