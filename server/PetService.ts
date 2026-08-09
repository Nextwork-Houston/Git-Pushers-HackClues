'use server'

import { ModifyPetSchema, PetSchema, type ModifyPet, type Pet, type PetMood } from './types'
import { createClient, getUser } from './server'

const PET_COLUMNS =
  'id, user_id, name, skin, xp, level, mood, created_at, updated_at'

function parsePet(data: unknown): Pet {
  const pet = PetSchema.safeParse(data)

  if (!pet.success) {
    console.error(`[PET-ERROR] parse: ${pet.error.message}`)
    throw new Error('Could not read the companion record.')
  }

  return pet.data
}

/**
 * Returns the signed-in user's companion.
 *
 * A database trigger provisions one on sign-up and `pets.user_id` is unique,
 * so this normally just reads. The insert covers accounts created before the
 * trigger existed.
 */
export async function getCurrentPet(): Promise<Pet> {
  const user = await getUser()
  const client = await createClient()

  const { data, error } = await client
    .from('pets')
    .select(PET_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error(`[PET-ERROR] fetch: ${error.message}`)
    throw new Error('Could not load your companion.')
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

  return parsePet(created)
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
    console.error(`[PET-ERROR] fetch by id: ${error?.message ?? 'not found'}`)
    throw new Error('Companion not found.')
  }

  return parsePet(data)
}

export async function modifyPetInformation(input: ModifyPet): Promise<Pet> {
  const parsedInput = ModifyPetSchema.safeParse(input)

  if (!parsedInput.success) {
    console.error(`[PET-ERROR] input: ${parsedInput.error.message}`)
    throw new Error('Invalid input passed to modifyPetInformation.')
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
    throw new Error('Could not update your companion.')
  }

  return parsePet(data)
}

/**
 * Adds XP and optionally sets the mood, in a single statement.
 *
 * Read-modify-write from the application would let two replies arriving at
 * once read the same starting value and lose one of the awards, so the
 * increment happens in the database.
 */
export async function awardXp(
  petId: string,
  amount: number,
  mood?: PetMood,
): Promise<Pet> {
  const client = await createClient()

  const { data, error } = await client
    .rpc('award_xp', {
      target_pet: petId,
      amount,
      next_mood: mood ?? null,
    })
    .maybeSingle()

  if (error || !data) {
    console.error(`[PET-ERROR] award xp: ${error?.message}`)
    throw new Error('Could not award experience.')
  }

  return parsePet(data)
}
