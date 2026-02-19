import { AzureOpenAI } from "openai";
import {
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_DEPLOYMENT_NAME,
    AZURE_OPEN_AI_MODEL_NAME,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_API_KEY,
} from "@env";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export async function sendChatMessage(messages: ChatMessage[]) {
    const endpoint = AZURE_OPENAI_ENDPOINT;
    const apiKey = AZURE_OPENAI_API_KEY;
    const apiVersion = AZURE_OPENAI_API_VERSION;
    const deployment = AZURE_OPENAI_DEPLOYMENT_NAME;

    const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

    const result = await client.chat.completions.create({
        messages: messages,
        model: AZURE_OPEN_AI_MODEL_NAME,
        max_completion_tokens: 50000
    });

    return result;
}

// main().catch((err) => {
//     console.error("The sample encountered an error:", err);
// });