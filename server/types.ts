import { z } from 'zod'

/** Mirrors the `avatar_skin` enum. Roisin is `pink`. */
export const AvatarSkinSchema = z.enum(['classic', 'electric', 'dove', 'pink'])
export type AvatarSkin = z.infer<typeof AvatarSkinSchema>

/** Mirrors the `pet_mood` enum. The sprite sheets animate exactly these. */
export const PetMoodSchema = z.enum([
  'idle',
  'happy',
  'sad',
  'angry',
  'curious',
  'thinking',
  'love',
  'confused',
  'celebrate',
])
export type PetMood = z.infer<typeof PetMoodSchema>

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system'])
export type MessageRole = z.infer<typeof MessageRoleSchema>

export const MessageKindSchema = z.enum([
  'text',
  'transcript',
  'builder_prompt',
  'research',
  'tool_result',
  'error',
])
export type MessageKind = z.infer<typeof MessageKindSchema>

export const BuildStatusSchema = z.enum(['pending', 'sent', 'failed'])
export type BuildStatus = z.infer<typeof BuildStatusSchema>

export const PetSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  name: z.string(),
  skin: AvatarSkinSchema,
  xp: z.int32().min(0),
  /** Generated in the database from xp, so it can never disagree with it. */
  level: z.int32().min(1),
  mood: PetMoodSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})

export type Pet = z.infer<typeof PetSchema>

export const ModifyPetSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40).optional(),
  skin: AvatarSkinSchema.optional(),
  mood: PetMoodSchema.optional(),
})

export type ModifyPet = z.infer<typeof ModifyPetSchema>

export const MessageSchema = z.object({
  id: z.uuid(),
  pet_id: z.uuid(),
  user_id: z.uuid(),
  role: MessageRoleSchema,
  kind: MessageKindSchema,
  content: z.string(),
  input_tokens: z.int32().min(0).nullable().optional(),
  output_tokens: z.int32().min(0).nullable().optional(),
  created_at: z.coerce.date(),
})

export type Message = z.infer<typeof MessageSchema>

/** A message about to be written. The database fills in the rest. */
export const NewMessageSchema = z.object({
  role: MessageRoleSchema,
  kind: MessageKindSchema.default('text'),
  content: z.string().trim().min(1).max(20000),
  input_tokens: z.int32().min(0).optional(),
  output_tokens: z.int32().min(0).optional(),
})

export type NewMessage = z.infer<typeof NewMessageSchema>

export const BuildSchema = z.object({
  id: z.uuid(),
  pet_id: z.uuid(),
  user_id: z.uuid(),
  message_id: z.uuid().nullable(),
  request: z.string().nullable(),
  prompt: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string().optional() })).default([]),
  status: BuildStatusSchema,
  error: z.string().nullable(),
  delivered_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
})

export type Build = z.infer<typeof BuildSchema>
