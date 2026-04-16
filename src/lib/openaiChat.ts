type ChatCompletionRole = 'system' | 'user' | 'assistant'

type ChatCompletionMessage = {
  role: ChatCompletionRole
  content: string
}

type ChatCompletionRequest = {
  model: string
  messages: ChatCompletionMessage[]
  temperature?: number
  max_tokens?: number
}

const LOCAL_DEV_OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined

async function parseErrorMessage(response: Response) {
  const body = await response.json().catch(() => null)
  return body?.error?.message || `OpenAI error ${response.status}`
}

async function fetchViaProxy(payload: ChatCompletionRequest) {
  return fetch('/api/openai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

async function fetchDirectFromBrowser(payload: ChatCompletionRequest) {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LOCAL_DEV_OPENAI_KEY}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function requestOpenAIChatCompletion(payload: ChatCompletionRequest) {
  let response: Response

  try {
    response = await fetchViaProxy(payload)
  } catch (error) {
    if (!import.meta.env.DEV || !LOCAL_DEV_OPENAI_KEY) {
      throw error instanceof Error ? error : new Error('AI endpoint unavailable')
    }
    response = await fetchDirectFromBrowser(payload)
  }

  if (response.status === 404 && import.meta.env.DEV && LOCAL_DEV_OPENAI_KEY) {
    response = await fetchDirectFromBrowser(payload)
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json()
}
