import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
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

beforeEach(() => {
  flags.killSwitches = {};
  localStorage.clear();
  vi.mocked(notFound).mockClear();
});

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
