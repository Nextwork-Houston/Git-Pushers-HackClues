'use server'

import { ModifyPetSchema, PetSchema, type ModifyPet, type Pet } from './types'
import { createClient, getUser } from './server'

const PET_COLUMNS = 'id, user_id, pet_name, xp, spritesheet_url, mood, created_at, updated_at'

function parsePet(data: unknown): Pet {
  const pet = PetSchema.safeParse(data)

  if (!pet.success) {
    console.error(`[PET-ERROR] parse: ${pet.error.message}`)
    throw new Error('Something went wrong parsing pet response to Pet Schema!')
  }

  return pet.data
}

export async function getPetInformation(petId: string): Promise<Pet> {
  const user = await getUser()
  const client = await createClient()

  const { data, error } = await client
    .from('pets')
    .select(PET_COLUMNS)
    .eq('id', petId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) {
    console.error(`[PET-ERROR] fetch: ${error?.message ?? 'pet not found'}`)
    throw new Error('Something went wrong while fetching pet from Pets!')
  }

  return parsePet(data)
}

/**
 * Returns the signed-in user's companion.
 *
 * A database trigger provisions a pet on sign-up, so this normally just reads.
 * The insert path covers accounts created before that trigger existed.
 */
export async function getCurrentPet(): Promise<Pet> {
  const user = await getUser()
  const client = await createClient()

  const { data, error } = await client
    .from('pets')
    .select(PET_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(`[PET-ERROR] fetch current: ${error.message}`)
    throw new Error('Something went wrong while fetching your companion!')
  }

  if (data) return parsePet(data)

  const { data: created, error: createError } = await client
    .from('pets')
    .insert({ user_id: user.id })
    .select(PET_COLUMNS)
    .maybeSingle()

  if (createError || !created) {
    console.error(`[PET-ERROR] provision: ${createError?.message}`)
    throw new Error('Could not create your companion.')
  }

  const pet = parsePet(created)

  const { error: conversationError } = await client
    .from('conversations')
    .insert({ pet_id: pet.id, user_id: user.id })

  if (conversationError) {
    console.error(`[PET-ERROR] provision conversation: ${conversationError.message}`)
  }

  return pet
}

export async function modifyPetInformation(input: ModifyPet): Promise<Pet> {
  const parsedInput = ModifyPetSchema.safeParse(input)

  if (!parsedInput.success) {
    console.error(`[PET-ERROR] input: ${parsedInput.error.message}`)
    throw new Error('Invalid input passed to modifyPetInformation!')
  }

  const { id, ...updates } = parsedInput.data

  if (Object.keys(updates).length === 0) {
    throw new Error('No fields provided to update.')
  }

  const user = await getUser()
  const client = await createClient()

  const { data, error } = await client
    .from('pets')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select(PET_COLUMNS)
    .maybeSingle()

  if (error || !data) {
    console.error(`[PET-ERROR] update: ${error?.message}`)
    throw new Error('Something went wrong while modifying pet in Pets!')
  }

  return parsePet(data)
}
