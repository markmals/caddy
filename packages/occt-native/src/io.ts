// In-memory serialization. File access stays in JavaScript so paths, buffers and streams all
// share one code path.

import type { Shape } from "./types.ts";

import { addon } from "./addon.ts";

interface IoAddon {
    brepWrite(shape: Shape): Uint8Array;
    brepRead(bytes: Uint8Array): Shape;
    stepWrite(shape: Shape): Uint8Array;
    stepRead(bytes: Uint8Array): Shape;
}

function native(): IoAddon {
    return addon<IoAddon>();
}

/** OCCT's native text BREP format: exact, lossless for a single shape. */
export function writeBrep(shape: Shape): Uint8Array {
    return native().brepWrite(shape);
}

export function readBrep(bytes: Uint8Array): Shape {
    return native().brepRead(bytes);
}

/** STEP (OCCT's default AP214 schema), transferring the shape as is. */
export function writeStep(shape: Shape): Uint8Array {
    return native().stepWrite(shape);
}

/** Reads every root of a STEP file into one shape (a compound when there are several). */
export function readStep(bytes: Uint8Array): Shape {
    return native().stepRead(bytes);
}
