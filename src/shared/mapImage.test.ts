import { describe, expect, it } from "vitest";
import { mapImageRequestAttempts } from "./mapImage";

describe("map image request fallback", () => {
  it("retries a rejected full-size image at progressively safer dimensions", () => {
    const attempts = mapImageRequestAttempts(
      "https://services.arcgisonline.com/export?size=4096%2C2048&format=jpg",
    ).map((value) => new URL(value).searchParams.get("size"));
    expect(attempts).toEqual(["4096,2048", "3072,1536", "2048,1024"]);
  });
});
