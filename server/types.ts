import { z } from 'zod'

export const PetSchema = z.object({
  id: z.uuid().describe('ID of the Pet'),
  user_id: z.uuid().describe('The account that owns this Pet'),
  pet_name: z.string().describe('Name of the Pet'),
  xp: z.int32().describe('The xp of the Pet'),
  spritesheet_url: z.string().describe('The URL that links to the spritesheet.'),
  mood: z.string().describe('The mood of the Pet'),
  created_at: z.coerce.date().describe('The timestamp that the pet was created at'),
  updated_at: z.coerce.date().describe('The timestamp that the pet was last updated.'),
})

export type Pet = z.infer<typeof PetSchema>

export const ModifyPetSchema = z.object({
  id: z.uuid().describe('ID of the Pet you want to modify.'),
  pet_name: z.string().min(1).max(40).optional(),
  xp: z.int32().min(0).optional(),
  spritesheet_url: z.string().optional(),
  mood: z.string().max(40).optional(),
})

export type ModifyPet = z.infer<typeof ModifyPetSchema>

export const MessageContentSchema = z.object({
  content: z.string().describe('The actual content'),
  type: z.string().describe('The type of content (text, prompt, tool_result, …).'),
})

export const ConversationMessageSchema = z.object({
  id: z.uuid().describe('The ID of the specific conversation message.'),
  role: z
    .enum(['user', 'assistant', 'system'])
    .describe('Who sent the message.'),
  type: z.string().describe('The type of message.'),
  created_at: z.coerce.date().describe('The timestamp the message was sent.'),
  usage: z
    .object({
      input_tokens: z.uint32(),
      output_tokens: z.uint32(),
    })
    .optional()
    .describe('Token usage, when the message came from a model.'),
  content: z.array(MessageContentSchema).min(1),
})

export type ConversationMessage = z.infer<typeof ConversationMessageSchema>

export const ConversationSchema = z.object({
  pet_id: z.uuid().describe('The Pet this conversation history belongs to.'),
  user_id: z.uuid().describe('The account that owns this conversation.'),
  messages: z.array(ConversationMessageSchema).describe('Message history'),
})

export type Conversation = z.infer<typeof ConversationSchema>

/** Pulls the plain text out of a stored message. */
export function messageText(message: ConversationMessage): string {
  return message.content
    .map((part) => part.content)
    .join('\n')
    .trim()
}
