import { forwardOpenAIChatCompletion, proxyRequestFailedErrorBody } from '../../server/openaiProxy.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Method not allowed.' } }),
    }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Invalid JSON body.' } }),
    }
  }

  try {
    const result = await forwardOpenAIChatCompletion(payload)
    return {
      statusCode: result.status,
      headers: { 'content-type': result.contentType },
      body: result.body,
    }
  } catch {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(proxyRequestFailedErrorBody()),
    }
  }
}
