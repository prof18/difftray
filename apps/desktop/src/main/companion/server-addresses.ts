import type os from "node:os";

export const MAX_REPORTED_ADDRESSES = 16;

export function companionReportedAddresses(input: {
  readonly hostname: string;
  readonly interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>;
  readonly platform: NodeJS.Platform;
  readonly port: number;
}): readonly string[] {
  const addresses = new Set<string>();

  for (const networkInterfaces of Object.values(input.interfaces)) {
    for (const networkInterface of networkInterfaces ?? []) {
      if (networkInterface.family === "IPv4" && !networkInterface.internal) {
        addresses.add(`${networkInterface.address}:${String(input.port)}`);
      }
    }
  }

  if (input.platform === "darwin" && input.hostname.length > 0) {
    const hostname = input.hostname.endsWith(".local")
      ? input.hostname
      : `${input.hostname}.local`;
    addresses.add(`${hostname}:${String(input.port)}`);
  }

  return [...addresses].slice(0, MAX_REPORTED_ADDRESSES);
}
