"use server"

import { createClient, getUser } from "./server";

import { Conversation } from "./types";
import { z } from "zod";


export async function getConversationHistory(PET_ID: string): Promise<z.infer<typeof Conversation>>
{
    const client = await createClient();

    const { data, error } = await client.from("conversations").select("messages").eq("pet_id", PET_ID).maybeSingle();

    if(error || !data)
    {
        console.error(`[CONVERSATION-ERROR]: ${error?.message ?? "NO DATA FETCHED"}`);
        throw new Error("Error fetching conversation history!");
    }

    const conversationHistory = Conversation.safeParse(data);

    if(!conversationHistory.success)
    {
        console.error(`[CONVERSATION-ERROR (PARSE)]: ${conversationHistory.error}`);
        throw new Error("Error parsing conversation data to Conversation schema.");
    }

    return conversationHistory.data;
}

export async function modifyConversationHistory(input: z.infer<typeof Conversation>): Promise<z.infer<typeof Conversation>>
{
    const parsedInput = Conversation.safeParse(input);

    if (!parsedInput.success) {
        console.error(`[CONVERSATION-ERROR]: ${parsedInput.error.message}`);
        throw new Error("Invalid input passed to conversation history modification!");
    }

    const { pet_id, ...updates } = parsedInput.data;

    if (Object.keys(updates).length === 0) {
        throw new Error("No fields provided to update.");
    }

    const user = await getUser();
    const client = await createClient();

    const { data, error } = await client
    .from("conversations")
    .update(updates)
    .eq("pet_id", pet_id)
    .select()
    .maybeSingle();

    if (error || !data) {
        console.error(`[CONVERSATION-ERROR]: ${error?.message}`);
        throw new Error("Something went wrong while modifying conversation in Conversations!");
    }

    const conversation = Conversation.safeParse(data);

    if (!conversation.success) {
        console.error(`[CONVERSATION-ERROR]: ${conversation.error.message}`);
        throw new Error("Something went wrong parsing conversation response to Conversation Schema!");
    }

    return conversation.data;
}