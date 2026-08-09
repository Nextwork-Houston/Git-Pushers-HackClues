/*
Credits to Praneetha

*/

import "dotenv/config";
import { z } from "zod";

// ==========================================
// 1. Zod Schemas
// ==========================================

export const ResearchInputSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  limit: z.number().min(1).max(20).default(10),
});

export const SearchResultItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  snippet: z.string(),
});

export const ResearchOutputSchema = z.object({
  query: z.string(),
  totalResults: z.number(),
  results: z.array(SearchResultItemSchema),
});

export type ResearchInput = z.infer<typeof ResearchInputSchema>;
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// ==========================================
// 2. BrightData Research Module
// ==========================================

export async function researchTechDocs(rawInput: unknown): Promise<ResearchOutput> {
  const { query, limit } = ResearchInputSchema.parse(rawInput);

  const apiKey = process.env.BRIGHT_DATA_API_KEY;
  const zone = process.env.BRIGHT_DATA_ZONE;

  if (!apiKey) {
    throw new Error("Missing BRIGHT_DATA_API_KEY in environment variables.");
  }
  if (!zone) {
    throw new Error("Missing BRIGHT_DATA_ZONE in environment variables.");
  }

  console.log(`\n🔍 [AI Research Agent] Researching: "${query}"...`);

  // BrightData SERP API call with &brd_json=1 enabled for parsing
  const resp = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      zone: zone,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&brd_json=1`,
      format: "raw",
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`BrightData API Error (${resp.status}): ${errorText}`);
  }

  const rawData = await resp.json();

  // Extract organic search results returned by BrightData JSON parser
  const organicResults = rawData.organic || [];

  const formattedResults = organicResults.map((item: Record<string, unknown>) => ({
    title: String(item.title || "No Title"),
    link: String(item.link || item.url || "#"),
    snippet: String(item.description || item.snippet || "No snippet available."),
  }));

  return ResearchOutputSchema.parse({
    query,
    totalResults: formattedResults.length,
    results: formattedResults.slice(0, limit),
  });
}

// ==========================================
// 3. Execution
// ==========================================

async function run() {
  try {
    const research = await researchTechDocs({
      query: process.argv[2]!,
      limit: 5,
    });

    console.log("✅ Research Complete!\n");
    console.log(JSON.stringify(research, null, 2));
  } catch (error) {
    console.error("❌ Research Failed:", error);
  }
}

if (process.argv[1]?.includes("agent/tools/apitool")) void run();