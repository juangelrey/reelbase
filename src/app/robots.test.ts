import { describe, expect, it } from "vitest";
import robots from "./robots";

function rulesOf() {
  const { rules } = robots();
  return Array.isArray(rules) ? rules : [rules];
}

describe("robots", () => {
  it("keeps AI training crawlers off every page", () => {
    const rule = rulesOf().find(({ userAgent }) => Array.isArray(userAgent) && userAgent.includes("meta-externalagent"));
    expect(rule?.disallow).toBe("/");
    expect(rule?.userAgent).toEqual(expect.arrayContaining(["GPTBot", "ClaudeBot", "CCBot"]));
  });

  it("leaves crawlers that fetch for a person's question alone", () => {
    const named = rulesOf().flatMap(({ userAgent }) => userAgent ?? []);
    expect(named).not.toContain("ChatGPT-User");
    expect(named).not.toContain("PerplexityBot");
  });

  it("keeps every other crawler off the pages that render per request", () => {
    const rule = rulesOf().find(({ userAgent }) => userAgent === "*");
    expect(rule?.disallow).toEqual(["/?", "/search", "/region"]);
  });

  it("leaves the plain home page and the detail pages open to other crawlers", () => {
    const rule = rulesOf().find(({ userAgent }) => userAgent === "*");
    const blocked = [rule?.disallow ?? []].flat();
    for (const path of ["/", "/title/603-the-matrix", "/tv/1399-game-of-thrones", "/person/6384-keanu-reeves"]) {
      expect(blocked.some((prefix) => path.startsWith(prefix))).toBe(false);
    }
  });
});
