import { init, type LDClient } from "@launchdarkly/node-server-sdk";
import { isFlagOn, isMarqueeHome } from "./flags";

vi.mock("@launchdarkly/node-server-sdk", () => ({ init: vi.fn() }));

const VISITOR = { kind: "user", key: "visitor", anonymous: true };

const store = globalThis as typeof globalThis & { launchDarkly?: Promise<LDClient> };

/** Makes `init` return a fake client whose flags answer from `flags`, or with the default when absent. */
function fakeClient({
  flags = {},
  initializes = true,
}: { flags?: Record<string, boolean>; initializes?: boolean } = {}) {
  const boolVariation = vi.fn(async (key: string, _context: unknown, fallback: boolean) =>
    key in flags ? flags[key] : fallback,
  );
  const waitForInitialization = vi.fn(() =>
    initializes ? Promise.resolve() : Promise.reject(new Error("timed out")),
  );
  vi.mocked(init).mockReturnValue({ boolVariation, waitForInitialization } as unknown as LDClient);
  return { boolVariation, waitForInitialization };
}

beforeEach(() => {
  delete store.launchDarkly;
  vi.mocked(init).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete store.launchDarkly;
});

describe("isMarqueeHome", () => {
  it("is off when no LaunchDarkly SDK key is set", async () => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "");
    expect(await isMarqueeHome()).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("asks LaunchDarkly for marquee-home with false as the default", async () => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "sdk-key");
    const { boolVariation } = fakeClient();
    expect(await isMarqueeHome()).toBe(false);
    expect(boolVariation).toHaveBeenCalledWith("marquee-home", VISITOR, false);
  });
});

describe("isFlagOn", () => {
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["only whitespace", "  \t "],
  ])("is on without calling init when the SDK key is %s", async (_label, value) => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", value);
    expect(await isFlagOn("some-feature")).toBe(true);
    expect(init).not.toHaveBeenCalled();
  });

  it("asks LaunchDarkly for the flag for the anonymous visitor with true as the default", async () => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "sdk-key");
    const { boolVariation } = fakeClient();
    await isFlagOn("some-feature");
    expect(init).toHaveBeenCalledWith("sdk-key");
    expect(boolVariation).toHaveBeenCalledWith("some-feature", VISITOR, true);
  });

  it("is off when the flag serves false", async () => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "sdk-key");
    fakeClient({ flags: { "some-feature": false } });
    expect(await isFlagOn("some-feature")).toBe(false);
  });

  it("is on when the flag serves true", async () => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "sdk-key");
    fakeClient({ flags: { "some-feature": true } });
    expect(await isFlagOn("some-feature")).toBe(true);
  });

  it("is on when the flag does not exist", async () => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "sdk-key");
    fakeClient();
    expect(await isFlagOn("missing-feature")).toBe(true);
  });

  it("still resolves, to the default, when initialization times out", async () => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "sdk-key");
    const { waitForInitialization } = fakeClient({ initializes: false });
    expect(await isFlagOn("some-feature")).toBe(true);
    expect(waitForInitialization).toHaveBeenCalledWith({ timeout: 5 });
  });

  it("shares one client with isMarqueeHome, so init runs once", async () => {
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "sdk-key");
    const { boolVariation } = fakeClient();
    await Promise.all([isFlagOn("a"), isFlagOn("b"), isMarqueeHome()]);
    await isFlagOn("c");
    await isMarqueeHome();
    expect(init).toHaveBeenCalledTimes(1);
    expect(boolVariation).toHaveBeenCalledTimes(5);
  });
});
