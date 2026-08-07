import type OpenAI from "openai";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

export function toOpenAIMessages(messages: BaseMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);

    switch (m._getType()) {
      case "human":
        return { role: "user", content } as OpenAI.ChatCompletionUserMessageParam;
      case "ai":
        return { role: "assistant", content } as OpenAI.ChatCompletionAssistantMessageParam;
      case "system":
        return { role: "system", content } as OpenAI.ChatCompletionSystemMessageParam;
      default:
        // tool messages, function messages, etc. — handle explicitly if you use them
        return { role: "user", content } as OpenAI.ChatCompletionUserMessageParam;
    }
  });
}


export function toOpenAITools(tools: StructuredToolInterface[]): OpenAI.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema as Record<string, unknown>
    },
  }));
}