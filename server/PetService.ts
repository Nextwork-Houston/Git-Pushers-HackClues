"use server"

import { createClient, getUser } from "./server";

import { PetSchema, ModifyPetSchema } from "./types";
import { z } from "zod";

export async function getPetInformation(PET_ID: string): Promise<z.infer<typeof PetSchema>>
{
    const user = await getUser();
    const client = await createClient();

    const { data, error } = await client.from("pets").select().eq("id", PET_ID).eq("user_id", user.id).maybeSingle();

    if(error || !data)
    {
        console.error(`[ERROR]: ${error?.message}`);
        throw new Error("Something went wrong while fetching pet from Pets!");
    }

    const pet =  PetSchema.safeParse(data);

    if(!pet.success)
    {
        console.error(`[ERROR]: ${pet.error.message}`);
        throw new Error("Something went wrong parsing pet response to Pet Schema!");
    }

    return pet.data;
}

export async function modifyPetInformation(input: z.infer<typeof ModifyPetSchema>): Promise<z.infer<typeof PetSchema>>
{
    const parsedInput = ModifyPetSchema.safeParse(input);

    if (!parsedInput.success) {
        console.error(`[ERROR]: ${parsedInput.error.message}`);
        throw new Error("Invalid input passed to modifyPetInformation!");
    }

    const { id, ...updates } = parsedInput.data;

    if (Object.keys(updates).length === 0) {
        throw new Error("No fields provided to update.");
    }

    const user = await getUser();
    const client = await createClient();

    const { data, error } = await client
    .from("pets")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

    if (error || !data) {
        console.error(`[ERROR]: ${error?.message}`);
        throw new Error("Something went wrong while modifying pet in Pets!");
    }

    const pet = PetSchema.safeParse(data);

    if (!pet.success) {
        console.error(`[ERROR]: ${pet.error.message}`);
        throw new Error("Something went wrong parsing pet response to Pet Schema!");
    }

    return pet.data;
}