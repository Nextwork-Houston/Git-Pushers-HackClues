import "dotenv/config";

import { OpenAI } from "openai";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { loadMcpTools } from "@langchain/mcp-adapters";
import { toOpenAIMessages, toOpenAITools } from "./util";
import { z } from "zod";

import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
    StateGraph,
    StateSchema,
    MessagesValue,
    START,
    END,
    type GraphNode
} from "@langchain/langgraph";
import { ToolMessage } from "@langchain/core/messages/tool";

const instruction = `You are a coding assistant with access to the Ponytail tool.

Ponytail should be used for coding-related tasks when it can provide useful assistance.

Coding-related tasks include:
- Writing code
- Reviewing code
- Debugging errors
- Refactoring existing code
- Choosing libraries or technologies
- Designing APIs or software architectures
- Any other programming-related task

Use Ponytail when it improves your ability to complete these tasks.
Do not use Ponytail for simple explanations, general programming concepts, or tasks that can be answered without external assistance.

Always analyze the output from Ponytail before responding.`

const modelURL = "https://api.aimlapi.com/v1";
const MODEL_KEY = process.env.MLAI_API_KEY!

const aiModel = new OpenAI({
    baseURL: modelURL,
    apiKey: MODEL_KEY
});

const ponytailTransport = new StdioClientTransport({
    command: "node",
    args: ["agent/ponytail/ponytail-mcp/index.js"]
});

const ponytailClient = new Client({ name: "Ponytail Client", version: "1.0.0"});
await ponytailClient.connect(ponytailTransport);

const tools = await loadMcpTools("ponytail", ponytailClient);
const openAITools = toOpenAITools(tools);

const AgentState = new StateSchema({
    messages: MessagesValue,
    model: z.string().describe("The AI model specification")
})

const callModel: GraphNode<typeof AgentState> = async (state) => {

    console.log("Callin model...");

    const response = await aiModel.chat.completions.create({
        model: state.model,
        messages: toOpenAIMessages(state.messages),
        tools: openAITools
    });

    const message = response.choices[0].message;

    return {
        messages: [
            new AIMessage({
                content: message.content ?? "",
                tool_calls: message.tool_calls?.filter((tc) => tc.type === "function")
                .map((tc) => ({
                    id: tc.id,
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments)
                })),
            })
        ]
    };
}

const callWithTools: GraphNode<typeof AgentState> = async (state) => {

    console.log("Executing tools...")

    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

    const results: ToolMessage[] = [];

    for (const call of lastMessage.tool_calls ?? [])
    {
        const tool = tools.find((t)=> t.name === call.name)
        if(!tool) continue;

        const result = await tool.invoke(call.args);

        results.push(
            new ToolMessage({
                tool_call_id: call.id!,
                content: typeof result === "string" ? result : JSON.stringify(result)
            })
        );
    }

    return { messages: results }
}


function shouldContinueCallingModel(state: typeof AgentState.State)
{
    console.log("Determining where the workflow should go...");

    const last = state.messages[state.messages.length - 1] as AIMessage;
    return (last.tool_calls ?? []).length > 0 ? "tools" : END;
}


const graph = new StateGraph(AgentState)
    .addNode("callModel", callModel)
    .addNode("tools", callWithTools)
    
    .addEdge(START, "callModel")
    .addEdge("tools", "callModel")

    .addConditionalEdges("callModel", shouldContinueCallingModel)
    .compile();


const query = process.argv[2] ??  "Write a basic REST api."

const res = await graph.invoke({ messages: [new SystemMessage(instruction), new HumanMessage(query)], model: "gpt-3.5-turbo" });

console.log(res);