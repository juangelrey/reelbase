import { act, render, screen, within } from "@testing-library/react";
import { connection } from "next/server";
import { isFlagOn } from "@/lib/flags/flags";
import { OS_LIGHT_QUERY } from "@/lib/theme/theme";
import RootLayout from "./layout";

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

/** The kill switches as this request sees them; on unless a test turns one off. */
const flags = vi.hoisted(() => ({ killSwitches: {} as Record<string, boolean> }));

vi.mock("@/lib/flags/flags", () => ({
  isFlagOn: vi.fn(async (key: string) => flags.killSwitches[key] ?? true),
}));

/** A fake OS colour preference. `change` handlers are kept, so `setPrefersLight` notifies them as the OS would. */
function stubOs({ prefersLight }: { prefersLight: boolean }) {
  const handlers = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === OS_LIGHT_QUERY && prefersLight;
    },
    media: query,
    addEventListener: (_type: "change", handler: () => void) => handlers.add(handler),
    removeEventListener: (_type: "change", handler: () => void) => handlers.delete(handler),
  }));
  return {
    setPrefersLight(value: boolean) {
      prefersLight = value;
      act(() => handlers.forEach((handler) => handler()));
    },
  };
}

/** The layout as Next renders it: the whole document, so <html>, <head> and <body> are React's. */
async function renderLayout() {
  return render(await RootLayout({ children: <p>Page content</p> }), { container: document });
}

beforeEach(() => {
  flags.killSwitches = {};
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.mocked(connection).mockClear();
  vi.mocked(isFlagOn).mockClear();
  stubOs({ prefersLight: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RootLayout", () => {
  it("shows the Settings gear and no theme control in the header when the flag is on", async () => {
    await renderLayout();
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(within(banner).queryByRole("group", { name: "Theme" })).not.toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("shows the theme control and no gear in the header when the flag is off", async () => {
    flags.killSwitches["settings-page"] = false;
    await renderLayout();
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(within(banner).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("reads the flag per request, so turning it off takes effect without a rebuild", async () => {
    const order: string[] = [];
    vi.mocked(connection).mockImplementationOnce(async () => {
      order.push("connection");
    });
    vi.mocked(isFlagOn).mockImplementationOnce(async () => {
      order.push("flag");
      return true;
    });
    await RootLayout({ children: null });
    expect(order).toEqual(["connection", "flag"]);
  });

  it("follows the OS live on System on every page, with the theme control off the header", async () => {
    const os = stubOs({ prefersLight: false });
    await renderLayout();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    os.setPrefersLight(true);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    os.setPrefersLight(false);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});
