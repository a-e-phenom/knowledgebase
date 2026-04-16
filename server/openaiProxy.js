const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

export function missingApiKeyErrorBody() {
  return {
    error: {
      message: 'Missing OPENAI_API_KEY on the server.',
    },
  }
}

export function proxyRequestFailedErrorBody() {
  return {
    error: {
      message: 'OpenAI proxy request failed.',
    },
  }
}

export async function forwardOpenAIChatCompletion(payload) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return {
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify(missingApiKeyErrorBody()),
    }
  }

  const upstream = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  return {
    status: upstream.status,
    contentType: upstream.headers.get('content-type') || 'application/json',
    body: await upstream.text(),
  }
}
