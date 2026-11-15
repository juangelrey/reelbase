import { SERVICES_COOKIE, parseSavedServices, savedServicesCookie, toggleSavedService } from "./saved-services";

describe("parseSavedServices", () => {
  it("reads comma-separated TMDB provider ids", () => {
    expect(SERVICES_COOKIE).toBe("reelbase-services");
    expect(parseSavedServices("8,337,1899")).toEqual([8, 337, 1899]);
  });

  it("gives no saved services for a missing or empty cookie", () => {
    expect(parseSavedServices(undefined)).toEqual([]);
    expect(parseSavedServices("")).toEqual([]);
  });

  it("drops non-numeric entries and keeps the rest", () => {
    expect(parseSavedServices("8,abc,337")).toEqual([8, 337]);
    expect(parseSavedServices("8,,337,")).toEqual([8, 337]);
    expect(parseSavedServices("8, 9,1e3,-2,3.5,0x10,0,337")).toEqual([8, 337]);
  });

  it("gives no saved services when nothing in it is an id", () => {
    expect(parseSavedServices("netflix")).toEqual([]);
    expect(parseSavedServices(",,,")).toEqual([]);
    expect(parseSavedServices("99999999999999999999")).toEqual([]);
  });

  it("returns the ids ascending, each once, whatever order the cookie holds", () => {
    expect(parseSavedServices("337,8,337,15,8")).toEqual([8, 15, 337]);
  });
});

describe("savedServicesCookie", () => {
  it("writes the ids ascending, each once, for a year, SameSite=Lax, on path /", () => {
    expect(savedServicesCookie([337, 8, 15, 8])).toBe("reelbase-services=8,15,337; Max-Age=31536000; Path=/; SameSite=Lax");
  });

  it("round-trips through parseSavedServices", () => {
    const value = savedServicesCookie([1899, 8]).split(";")[0].split("=")[1];
    expect(parseSavedServices(value)).toEqual([8, 1899]);
  });

  it("expires the cookie when no service is saved", () => {
    expect(savedServicesCookie([])).toBe("reelbase-services=; Max-Age=0; Path=/; SameSite=Lax");
  });
});

describe("toggleSavedService", () => {
  it("adds an unsaved id and removes a saved one, keeping ids the region does not list", () => {
    expect(toggleSavedService([8, 2000], 337)).toEqual([8, 337, 2000]);
    expect(toggleSavedService([8, 337, 2000], 8)).toEqual([337, 2000]);
  });
});
