import { describe, expect, it } from "vitest";

import { companionReportedAddresses } from "./server-addresses.js";

describe("companionReportedAddresses", () => {
  it("reports external IPv4 addresses and the macOS local hostname", () => {
    expect(
      companionReportedAddresses({
        hostname: "Marcos-Mac-Studio",
        interfaces: {
          en1: [
            {
              address: "192.168.178.79",
              family: "IPv4",
              internal: false,
              mac: "00:00:00:00:00:00",
              netmask: "255.255.255.0",
              cidr: "192.168.178.79/24"
            }
          ],
          utun9: [
            {
              address: "100.103.221.106",
              family: "IPv4",
              internal: false,
              mac: "00:00:00:00:00:00",
              netmask: "255.255.255.255",
              cidr: "100.103.221.106/32"
            }
          ],
          lo0: [
            {
              address: "127.0.0.1",
              family: "IPv4",
              internal: true,
              mac: "00:00:00:00:00:00",
              netmask: "255.0.0.0",
              cidr: "127.0.0.1/8"
            }
          ],
          en0: [
            {
              address: "fe80::1",
              family: "IPv6",
              internal: false,
              mac: "00:00:00:00:00:00",
              netmask: "ffff:ffff:ffff:ffff::",
              cidr: "fe80::1/64",
              scopeid: 1
            }
          ]
        },
        platform: "darwin",
        port: 48620
      })
    ).toEqual([
      "192.168.178.79:48620",
      "100.103.221.106:48620",
      "Marcos-Mac-Studio.local:48620"
    ]);
  });

  it("does not append a local hostname on Linux", () => {
    expect(
      companionReportedAddresses({
        hostname: "workstation",
        interfaces: {},
        platform: "linux",
        port: 48620
      })
    ).toEqual([]);
  });

  it("limits the result to 16 addresses", () => {
    const interfaces = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `en${index}`,
        [
          {
            address: `192.0.2.${index + 1}`,
            family: "IPv4" as const,
            internal: false,
            mac: "00:00:00:00:00:00",
            netmask: "255.255.255.0",
            cidr: `192.0.2.${index + 1}/24`
          }
        ]
      ])
    );

    expect(
      companionReportedAddresses({
        hostname: "workstation",
        interfaces,
        platform: "linux",
        port: 48620
      })
    ).toHaveLength(16);
  });

  it("does not duplicate the .local suffix", () => {
    expect(
      companionReportedAddresses({
        hostname: "foo.local",
        interfaces: {},
        platform: "darwin",
        port: 48620
      })
    ).toEqual(["foo.local:48620"]);
  });
});
