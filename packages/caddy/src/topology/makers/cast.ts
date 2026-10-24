/** Runs a native construction and wraps its result in the matching shape class. */

import type * as occt from "@roonieone/occt-native";

import type { Compound } from "../compound.ts";
import type { Shell } from "../shell.ts";
import type { Solid } from "../solid.ts";
import type { Wire } from "../wire.ts";

import { native } from "../kernel.ts";
import { Shape } from "../shape.ts";

export function castCompound(operation: string, make: () => occt.Shape): Compound {
    return Shape.cast(native(operation, make)) as Compound;
}

export function castSolid(operation: string, make: () => occt.Shape): Solid {
    return Shape.cast(native(operation, make)) as Solid;
}

export function castShell(operation: string, make: () => occt.Shape): Shell {
    return Shape.cast(native(operation, make)) as Shell;
}

export function castWire(operation: string, make: () => occt.Shape): Wire {
    return Shape.cast(native(operation, make)) as Wire;
}
