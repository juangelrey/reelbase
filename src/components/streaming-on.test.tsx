import { render, screen } from "@testing-library/react";
import { StreamingOn } from "./streaming-on";
import type { Provider } from "@/lib/catalog/providers";

/** Part of a region's top 12, in TMDB's display order, as `listProviders` returns them. */
const PROVIDERS: Provider[] = [
  { id: 8, name: "Netflix", logoUrl: undefined },
  { id: 9, name: "Amazon Prime Video", logoUrl: undefined },
  { id: 337, name: "Disney Plus", logoUrl: undefined },
  { id: 15, name: "Hulu", logoUrl: undefined },
];

describe("StreamingOn", () => {
  it("names the services that apply in TMDB's display order, not id order", () => {
    render(<StreamingOn providers={PROVIDERS} selected={[8, 15, 337]} />);
    expect(screen.getByText(/^Streaming on:/)).toHaveTextContent("Streaming on: Netflix, Disney Plus, Hulu Change");
  });

  it("names one service alone", () => {
    render(<StreamingOn providers={PROVIDERS} selected={[9]} />);
    expect(screen.getByText(/^Streaming on:/)).toHaveTextContent("Streaming on: Amazon Prime Video Change");
  });

  it("says Any service when none applies", () => {
    render(<StreamingOn providers={PROVIDERS} selected={[]} />);
    expect(screen.getByText(/^Streaming on:/)).toHaveTextContent("Streaming on: Any service Change");
  });

  it("links Change to Settings", () => {
    render(<StreamingOn providers={PROVIDERS} selected={[8]} />);
    expect(screen.getByRole("link", { name: "Change" })).toHaveAttribute("href", "/settings");
  });
});
