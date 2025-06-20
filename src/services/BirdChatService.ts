import { AZURE_OPENAI_RESOURCE_NAME, AZURE_OPENAI_DEPLOYMENT_NAME, AZURE_OPENAI_API_VERSION, AZURE_OPENAI_API_KEY } from '@env';

const endpoint = `https://${AZURE_OPENAI_RESOURCE_NAME}.openai.azure.com/openai/deployments/${AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function sendBirdChatMessage(messages: ChatMessage[]): Promise<ChatMessage> {
  if (!AZURE_OPENAI_RESOURCE_NAME || !AZURE_OPENAI_DEPLOYMENT_NAME || !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_API_VERSION) {
    throw new Error('Missing Azure OpenAI configuration. Check environment variables.');
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_OPENAI_API_KEY,
    },
    body: JSON.stringify({
      messages,
      max_completion_tokens: 500,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure OpenAI error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice?.message) {
    throw new Error('No response from Azure OpenAI');
  }
  console.log(`BirdChatService.sendBirdChatMessage\n\t"${data.choices[0].message.content}"`);
  return { role: choice.message.role, content: choice.message.content };
}