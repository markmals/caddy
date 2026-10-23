// Process-wide kernel settings.

import { addon } from "./addon.ts";

interface KernelAddon {
    setKernelMessages(enabled: boolean): void;
    occtVersion: string;
}

/** Version of the OCCT libraries the addon was built against. */
export function occtVersion(): string {
    return addon<KernelAddon>().occtVersion;
}

/**
 * OCCT prints translator statistics to stdout by default; the addon starts with that output
 * disabled. Pass `true` to restore it, e.g. while debugging an import.
 */
export function setKernelMessages(enabled: boolean): void {
    addon<KernelAddon>().setKernelMessages(enabled);
}
