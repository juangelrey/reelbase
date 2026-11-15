import { NextRequest } from "next/server";
import { GET } from "./route";

/** The kill switches as this request sees them; on unless a test turns one off. */
const flags = vi.hoisted(() => ({ killSwitches: {} as Record<string, boolean> }));

vi.mock("@/lib/flags/flags", () => ({
  isFlagOn: vi.fn(async (key: string) => flags.killSwitches[key] ?? true),
}));

beforeEach(() => {
  flags.killSwitches = {};
});

function get(query: string) {
  return GET(new NextRequest(`http://localhost:3000/region${query}`));
}

const ONE_YEAR = 60 * 60 * 24 * 365;

describe("GET /region", () => {
  it("remembers a valid region for a year and goes home with the browse params, region last, on page 1", async () => {
    const response = await get("?type=tv&genre=18%2C35&sort=rating&page=4&region=GB");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/?type=tv&genre=18,35&sort=rating&region=GB");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^reelbase-region=GB;/);
    expect(cookie).toContain(`Max-Age=${ONE_YEAR}`);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain("Path=/");
  });

  it("carries params it does not know, so later filters ride along", async () => {
    const response = await get("?providers=8%2C337&region=ES");
    expect(response.headers.get("location")).toBe("http://localhost:3000/?providers=8,337&region=ES");
  });

  it.each(["?region=gb", "?region=GBR", "?region=", "?genre=28", "?region=G1"])(
    "sets no cookie and goes home for %s",
    async (query) => {
      const response = await get(query);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("http://localhost:3000/");
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  describe("from Settings", () => {
    it("remembers a valid region with the same cookie and returns to /settings", async () => {
      const response = await get("?region=GB&from=settings");
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("http://localhost:3000/settings");
      const cookie = response.headers.get("set-cookie") ?? "";
      expect(cookie).toMatch(/^reelbase-region=GB;/);
      expect(cookie).toContain(`Max-Age=${ONE_YEAR}`);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).toContain("Path=/");
      expect(cookie).toMatch(/HttpOnly/i);
    });

    it.each(["?region=gb&from=settings", "?region=GBR&from=settings", "?from=settings"])(
      "sets no cookie and returns to /settings for %s",
      async (query) => {
        const response = await get(query);
        expect(response.status).toBe(303);
        expect(response.headers.get("location")).toBe("http://localhost:3000/settings");
        expect(response.headers.get("set-cookie")).toBeNull();
      },
    );

    it("goes home as before while the settings-page flag is off", async () => {
      flags.killSwitches["settings-page"] = false;
      const response = await get("?region=GB&from=settings");
      expect(response.headers.get("location")).toBe("http://localhost:3000/?from=settings&region=GB");
      expect(response.headers.get("set-cookie")).toMatch(/^reelbase-region=GB;/);
    });
  });
});
