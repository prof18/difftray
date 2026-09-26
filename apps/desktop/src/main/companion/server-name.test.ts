import { describe, expect, it, vi } from "vitest";

import {
  companionServerNameForFlavor,
  resolveCompanionServerName
} from "./server-name.js";

describe("companionServerNameForFlavor", () => {
  it.each([
    ["production", "Marco’s Mac Studio"],
    ["alpha", "Marco’s Mac Studio (Alpha)"],
    ["dev", "Marco’s Mac Studio (Dev)"]
  ] as const)("uses the %s flavor suffix", (flavor, expectedName) => {
    expect(companionServerNameForFlavor("Marco’s Mac Studio", flavor)).toBe(expectedName);
  });
});

describe("companion server name", () => {
  it("uses the macOS Computer Name instead of the DHCP hostname", () => {
    const hostname = vi.fn(() => "eb72a6e9.fritz.box");
    const readMacComputerName = vi.fn(() => "Marco’s Mac Studio\n");
    const dependencies = {
      hostname,
      platform: "darwin" as const,
      readMacComputerName
    };

    expect(resolveCompanionServerName(dependencies)).toBe("Marco’s Mac Studio");
    expect(resolveCompanionServerName(dependencies)).toBe("Marco’s Mac Studio");
    expect(readMacComputerName).toHaveBeenCalledTimes(1);
    expect(hostname).not.toHaveBeenCalled();
  });

  it("caches the network hostname fallback when macOS has no readable Computer Name", () => {
    const hostname = vi.fn(() => "fallback.local");
    const readMacComputerName = vi.fn(() => {
      throw new Error("scutil unavailable");
    });
    const dependencies = {
      hostname,
      platform: "darwin" as const,
      readMacComputerName
    };

    expect(resolveCompanionServerName(dependencies)).toBe("fallback.local");
    expect(resolveCompanionServerName(dependencies)).toBe("fallback.local");
    expect(readMacComputerName).toHaveBeenCalledTimes(1);
    expect(hostname).toHaveBeenCalledTimes(1);
  });

  it("uses the platform hostname outside macOS", () => {
    const readMacComputerName = vi.fn(() => "Mac name");

    expect(
      resolveCompanionServerName({
        hostname: () => "workstation",
        platform: "linux",
        readMacComputerName
      })
    ).toBe("workstation");
    expect(readMacComputerName).not.toHaveBeenCalled();
  });
});
