import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Provider } from "@/lib/catalog/providers";
import { MyServices } from "./my-services";

const LOGO = (path: string) => `https://image.tmdb.org/t/p/w92/${path}.jpg`;

const SERVICES: Provider[] = [
  { id: 8, name: "Netflix", logoUrl: LOGO("netflix") },
  { id: 337, name: "Disney Plus", logoUrl: LOGO("disney") },
  { id: 1899, name: "Max", logoUrl: undefined },
];

/** The value the browser now holds for `reelbase-services`, or undefined when it holds none. */
function savedCookie() {
  return document.cookie
    .split("; ")
    .find((pair) => pair.startsWith("reelbase-services="))
    ?.slice("reelbase-services=".length);
}

afterEach(() => {
  document.cookie = "reelbase-services=; Max-Age=0; Path=/";
});

describe("MyServices", () => {
  it("shows a checkbox per service, in the order given, named by the service", () => {
    render(<MyServices services={SERVICES} saved={[]} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((box) => box.getAttribute("value"))).toEqual(["8", "337", "1899"]);
    for (const { name } of SERVICES) expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
  });

  it("shows each service's logo beside its name", () => {
    render(<MyServices services={SERVICES} saved={[]} />);
    // Hidden from the accessibility tree, since the name beside it already names the checkbox.
    const logos = screen.getAllByRole("img", { hidden: true });
    expect(logos.map((img) => img.getAttribute("src"))).toEqual([LOGO("netflix"), LOGO("disney")]);
    expect(screen.getByText("Max")).toBeInTheDocument();
  });

  it("ticks the saved services", () => {
    render(<MyServices services={SERVICES} saved={[337, 2000]} />);
    expect(screen.getByRole("checkbox", { name: "Disney Plus" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Netflix" })).not.toBeChecked();
  });

  it("saves a ticked service at once, with no Save button", async () => {
    render(<MyServices services={SERVICES} saved={[]} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Max" }));
    expect(screen.getByRole("checkbox", { name: "Max" })).toBeChecked();
    expect(savedCookie()).toBe("1899");
    await userEvent.click(screen.getByRole("checkbox", { name: "Netflix" }));
    expect(savedCookie()).toBe("8,1899");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps saved services the region does not list when another is toggled", async () => {
    render(<MyServices services={SERVICES} saved={[8, 2000]} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Disney Plus" }));
    expect(savedCookie()).toBe("8,337,2000");
    await userEvent.click(screen.getByRole("checkbox", { name: "Netflix" }));
    expect(screen.getByRole("checkbox", { name: "Netflix" })).not.toBeChecked();
    expect(savedCookie()).toBe("337,2000");
  });

  it("clears the cookie when the last service is unticked", async () => {
    render(<MyServices services={SERVICES} saved={[8]} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Netflix" }));
    expect(savedCookie()).toBeUndefined();
  });

  it("credits JustWatch with the list", () => {
    render(<MyServices services={SERVICES} saved={[]} />);
    expect(screen.getByRole("link", { name: "Streaming data by JustWatch" })).toHaveAttribute("href", "https://www.justwatch.com/");
  });

  it("says so when the region lists no services", () => {
    render(<MyServices services={[]} saved={[8]} />);
    expect(screen.getByText("No streaming services listed for this region.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
