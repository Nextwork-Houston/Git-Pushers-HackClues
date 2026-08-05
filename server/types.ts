import { z } from "zod";

export const PetSchema = z.object({
        id: z.uuid().describe("ID of the Pet"),
        pet_name: z.string().describe("Name of the Pet"),
        xp: z.int32().describe("The xp of the Pet"),
        spritesheet_url: z.string().describe("The URL that links to the spritesheet."),
        mood: z.string().describe("The mood of the Pet"),
        created_at: z.coerce.date().describe("The timestamp that the pet was created at"),
        updated_at: z.coerce.date().describe("The timestamp that the pet was last updated.")
})

export const ModifyPetSchema = z.object({
    id: z.uuid().describe("ID of the Pet you want to modify."),
    pet_name: z.string().optional().describe("The updated value of the pet name."),
    xp: z.int32().optional().describe("The updated value of the pet's XP"),
    spritesheet_url: z.string().optional().describe("The updated value of the pet's spritesheet_url."),
    mood: z.string().optional().describe("The updated value of the pet's mood."),
    updated_at: z.coerce.date().optional().describe("The current timestamp when you are sending the request")
})

export const ConversationMessage = z.object({
    id: z.uuid().describe("The ID of the specific conversation message."),
    role: z.string().describe("Describes whether the person who sent the message is the user or the pet."),
    type: z.string().describe("The type of message."),
    created_at: z.coerce.date().describe("The timestamp the message was sent."),
    usage: z.object({
        input_tokens: z.uint32().describe("How many tokens were received in."),
        output_tokens: z.uint32().describe("How many tokens were sent out.")
    }).describe("Usage data regarding tokens."),
    content: z.array(
        z.object({
            content: z.string().describe("The actual content"),
            type: z.string().describe("The type of content specified (such as text, pdf, etc).")
        }).describe("An individual content object")
    ).describe("An array of content within the said message.")
});

export const Conversation = z.object({
    pet_id: z.uuid().describe("The ID of the Pet related to the conversation history."),
    messages: z.array(ConversationMessage).describe("Message History")
})
