import type OpenAI from "openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { ToolMessage } from "@langchain/core/messages/tool";
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
      case "tool":
        return { role: "tool", tool_call_id: (m as ToolMessage).tool_call_id, content } as OpenAI.ChatCompletionToolMessageParam;
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