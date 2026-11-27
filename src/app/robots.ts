import type { MetadataRoute } from "next";

/**
 * Crawlers that gather pages to train AI models. They bring no visitors, and one of them
 * (`meta-externalagent`) walked the whole catalog at 30 requests a minute, each a function run.
 * Crawlers that fetch a page for a person's question (`ChatGPT-User`, `PerplexityBot`) are left out.
 */
export const AI_TRAINING_CRAWLERS = [
  "meta-externalagent",
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Bytespider",
  "Amazonbot",
] as const;

/**
 * Paths no crawler should follow: each renders per request and has no end of variants. `/?` is the home page
 * with any browse filter, sort or page; the plain home page stays open. `/region` only sets a cookie and redirects.
 */
export const UNCACHED_PATHS = ["/?", "/search", "/region"] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...AI_TRAINING_CRAWLERS], disallow: "/" },
      { userAgent: "*", disallow: [...UNCACHED_PATHS] },
    ],
  };
}
