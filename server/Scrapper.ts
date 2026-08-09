import * as cheerio from "cheerio";
import { z } from "zod";

const apiKey = process.env.BRIGHT_DATA_API_KEY!;
const zone = process.env.BRIGHT_DATA_WEB_UNLOCKER!;

const DEPTH_LIMIT = 3;
const PAGE_LIMIT = 1;
const CONCURRENCY = 5;

export const ScrapedPageSchema = z.object({
  url: z.string(),
  depth: z.number(),
  title: z.string(),
  textContent: z.string(),
  links: z.array(z.string()),
});

export const ScrapeResultSchema = z.object({
  seedUrl: z.string(),
  pagesScraped: z.number(),
  pages: z.array(ScrapedPageSchema),
});

const normalizeHost = (hostname: string): string => {
  return hostname.toLowerCase().replace(/^www\./, "");
}

const isSameHost = (a: string, b: string) => {
  try
  {
    return normalizeHost(new URL(a).hostname) === normalizeHost(new URL(b).hostname);
  }
  catch
  {
    return false;
  }
}

const normalizeURL = (raw: string, base?: string) => {
  try {
    const url = new URL(raw, base);

    url.hash = "";

    if (url.pathname.length > 1 && url.pathname.endsWith("/"))
        url.pathname = url.pathname.slice(0, -1);
    
    return url.toString();
  }
  catch
  {
    return null;
  }
}

const fetchPageHTML =  async (url: string) =>
{
  const response = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      zone, url, format: "raw"
    })
  });

  if(!response.ok)
  {
    const err = await response.text();
    throw new Error(`[HTML FETCH ERROR] ${err}`);
  }

  return response.text();
}

const extractLinks = (html: string, baseURL: string) => {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $("a[href]").each((_, e)=> {
    const href = $(e).attr("href");

    if(!(href && !(href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")))) return;
    if (!href || href === "#" || href.trim() === "") return;

    const normalized = normalizeURL(href, baseURL);

    if (normalized && (normalized.startsWith("http://") || normalized.startsWith("https://"))) {
      links.add(normalized);
    }

  });

  return Array.from(links);
}

function extractPageData(html: string): { title: string; textContent: string } {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || "Untitled";

  $("script, style, noscript").remove();
  const textContent = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000); // cap payload size

  return { title, textContent };
}

async function mapWithConcurrency<T,R>( items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>
{
  const results: R[] = [];
  let index = 0;

  async function worker()
  {
    while(index < items.length)
    {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length)}, worker));

  return results;
}

export async function scrapeWebsite(
  seedUrl: string,
  options: { depthLimit?: number; pageLimit?: number; sameHostOnly?: boolean } = {}
): Promise<z.infer<typeof ScrapeResultSchema>> {

  if (!apiKey) throw new Error("Missing BRIGHT_DATA_API_KEY in environment variables.");
  if (!zone) throw new Error("Missing BRIGHT_DATA_ZONE in environment variables.");

  const depthLimit = options.depthLimit ?? DEPTH_LIMIT;
  const pageLimit = options.pageLimit ?? PAGE_LIMIT;
  const sameHostOnly = options.sameHostOnly ?? true;

  const normalizedSeed = normalizeURL(seedUrl);
  if (!normalizedSeed) throw new Error(`Invalid seed URL: ${seedUrl}`);

  const visited = new Set<string>([normalizedSeed]);
  const pages: z.infer<typeof ScrapedPageSchema>[] = [];

  let currentLevel: { url: string; depth: number }[] = [{ url: normalizedSeed, depth: 0 }];

  while (currentLevel.length > 0 && pages.length < pageLimit) {
    const remaining = pageLimit - pages.length;
    const batch = currentLevel.slice(0, remaining);
    const nextLevel: { url: string; depth: number }[] = [];

    await mapWithConcurrency(batch, CONCURRENCY, async ({ url, depth }) => {
      console.log(`  [depth ${depth}] fetching ${url}`);
      try {
        const html = await fetchPageHTML(url);
        const { title, textContent } = extractPageData(html);
        const rawLinks = extractLinks(html, url);
        const filteredLinks = rawLinks.filter((link) => (sameHostOnly ? isSameHost(link, normalizedSeed) : true));

        pages.push({ url, depth, title, textContent, links: filteredLinks });

        if (depth < depthLimit) {
          for (const link of filteredLinks) {
            if (!visited.has(link)) {
              visited.add(link); // sync add — no race across concurrent tasks
              nextLevel.push({ url: link, depth: depth + 1 });
            }
          }
        }
      } catch (err) {
        console.error(`  ⚠️ Failed to scrape ${url}:`, err instanceof Error ? err.message : err);
      }
    });

    currentLevel = nextLevel;
  }

  return ScrapeResultSchema.parse({
    seedUrl: normalizedSeed,
    pagesScraped: pages.length,
    pages,
  });
}