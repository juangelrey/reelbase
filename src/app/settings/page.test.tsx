import { render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import watchProviderRegions from "@/lib/tmdb/fixtures/watch-provider-regions.json";
import watchProvidersMovie from "@/lib/tmdb/fixtures/watch-providers-movie.json";
import watchProvidersTv from "@/lib/tmdb/fixtures/watch-providers-tv.json";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";
import SettingsPage, { dynamic, generateMetadata } from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

/** The kill switches as this request sees them; on unless a test turns one off. */
const flags = vi.hoisted(() => ({ killSwitches: {} as Record<string, boolean> }));

vi.mock("@/lib/flags/flags", () => ({
  isFlagOn: vi.fn(async (key: string) => flags.killSwitches[key] ?? true),
}));

/** What the visitor's request carries: the `reelbase-region` and `reelbase-services` cookies and the `Accept-Language` header. */
const request = vi.hoisted(() => ({
  regionCookie: undefined as string | undefined,
  servicesCookie: undefined as string | undefined,
  acceptLanguage: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = ({ "reelbase-region": request.regionCookie, "reelbase-services": request.servicesCookie } as Record<string, string | undefined>)[name];
      return value === undefined ? undefined : { name, value };
    },
  })),
  headers: vi.fn(async () => new Headers(request.acceptLanguage === undefined ? {} : { "accept-language": request.acceptLanguage })),
}));

beforeEach(() => {
  vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "test-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      const body = ({
        "/3/watch/providers/regions": watchProviderRegions,
        "/3/watch/providers/movie": watchProvidersMovie,
        "/3/watch/providers/tv": watchProvidersTv,
      } as Record<string, unknown>)[new URL(String(input)).pathname];
      return body ? Response.json(body) : Response.json({}, { status: 404 });
    }),
  );
  flags.killSwitches = {};
  request.regionCookie = undefined;
  request.servicesCookie = undefined;
  request.acceptLanguage = undefined;
  localStorage.clear();
  vi.mocked(notFound).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function regionSelect() {
  return screen.getByRole("combobox", { name: "Region" }) as HTMLSelectElement;
}

describe("Settings page", () => {
  it("has the heading Settings and the document title Settings", async () => {
    render(await SettingsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect((await generateMetadata()).title).toBe("Settings");
  });

  it("opens with the Theme section, holding the System / Light / Dark control", async () => {
    render(await SettingsPage());
    const sections = screen.getAllByRole("region");
    expect(sections[0]).toHaveAccessibleName("Theme");
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual(["system", "light", "dark"]);
  });

  it("marks a theme saved before this change, under the same storage key", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  });

  it("is not found when the flag is off", async () => {
    flags.killSwitches["settings-page"] = false;
    await expect(SettingsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders per request, so turning the flag off takes effect without a rebuild", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("Settings page region", () => {
  it("follows Theme with a Region section: TMDB's regions A-Z in a form to /region that returns here", async () => {
    render(await SettingsPage());
    const sections = screen.getAllByRole("region");
    expect(sections[1]).toHaveAccessibleName("Region");
    const form = within(sections[1]).getByRole("form", { name: "Region" });
    expect(form).toHaveAttribute("action", "/region");
    expect(form).toHaveAttribute("method", "get");
    const options = within(form).getAllByRole("option").map((option) => option.textContent);
    expect(options).toHaveLength(watchProviderRegions.results.length);
    expect(options).toEqual([...options].sort((a, b) => a!.localeCompare(b!, "en")));
    const hidden = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).map(({ name, value }) => [name, value]);
    expect(hidden).toEqual([["from", "settings"]]);
    expect(within(form).getByRole("button", { name: "Apply" })).toHaveAttribute("type", "submit");
  });

  it("shows the saved region, including one saved before this change", async () => {
    request.regionCookie = "GB";
    request.acceptLanguage = "es-ES";
    render(await SettingsPage());
    expect(regionSelect().value).toBe("GB");
  });

  it("falls back to the browser language's country, then US", async () => {
    request.acceptLanguage = "es-ES,es;q=0.9";
    render(await SettingsPage());
    expect(regionSelect().value).toBe("ES");
  });

  it("uses US when nothing names a listed region", async () => {
    request.regionCookie = "ZZ";
    request.acceptLanguage = "en-QQ";
    render(await SettingsPage());
    expect(regionSelect().value).toBe("US");
  });
});

describe("Settings page My services", () => {
  function myServices() {
    return screen.getAllByRole("region")[2];
  }

  function checkedIds() {
    return within(myServices())
      .getAllByRole("checkbox")
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => Number(box.getAttribute("value")));
  }

  it("follows Region with a My services section: a checkbox per streaming service of the region, with the JustWatch credit", async () => {
    render(await SettingsPage());
    const sections = screen.getAllByRole("region");
    expect(sections).toHaveLength(3);
    expect(sections[1]).toHaveAccessibleName("Region");
    expect(myServices()).toHaveAccessibleName("My services");
    const boxes = within(myServices()).getAllByRole("checkbox");
    expect(boxes.map((box) => Number(box.getAttribute("value")))).toEqual([8, 9, 350, 337, 15, 2285, 257, 1899, 386, 531, 300, 73]);
    expect(within(myServices()).getByRole("checkbox", { name: "Netflix" })).not.toBeChecked();
    expect(within(myServices()).getByRole("link", { name: "Streaming data by JustWatch" })).toBeInTheDocument();
    expect(within(myServices()).queryByRole("button")).not.toBeInTheDocument();
  });

  it("ticks the services saved in the cookie, so they show after a reload", async () => {
    request.servicesCookie = "337,8";
    render(await SettingsPage());
    expect(checkedIds()).toEqual([8, 337]);
  });

  it("ticks nothing for a malformed cookie", async () => {
    request.servicesCookie = "netflix;disney";
    render(await SettingsPage());
    expect(checkedIds()).toEqual([]);
  });

  it("lists the services of the region that applies, and keeps saved ones it does not list hidden", async () => {
    request.regionCookie = "ES";
    request.servicesCookie = "149,1899";
    render(await SettingsPage());
    const boxes = within(myServices()).getAllByRole("checkbox");
    expect(boxes.map((box) => Number(box.getAttribute("value")))).toEqual([8, 9, 350, 149, 337, 300]);
    expect(within(myServices()).getByRole("checkbox", { name: "Movistar Plus+" })).toBeChecked();
    expect(checkedIds()).toEqual([149]);
  });

  it("says so when the region lists no services", async () => {
    request.regionCookie = "FR";
    render(await SettingsPage());
    expect(within(myServices()).getByText("No streaming services listed for this region.")).toBeInTheDocument();
    expect(within(myServices()).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
