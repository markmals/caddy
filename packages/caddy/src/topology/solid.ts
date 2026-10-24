import type * as occt from "@roonieone/occt-native";

import { construct, features, measure, ShapeType } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Face } from "./face.ts";
import type { ShapeOptions } from "./shape.ts";

import { Vector } from "../geometry/vector.ts";
import { native } from "./kernel.ts";
import { Mixin3D } from "./mixin3d.ts";
import { registerShapeConstructor } from "./registry.ts";
import { Shell } from "./shell.ts";

/** A closed volume bounded by shells (build123d `Solid`). */
export class Solid extends Mixin3D {
    static override readonly order: number = 3;

    /** Wrap a native solid. */
    constructor(wrapped: occt.Shape, options?: ShapeOptions);
    /** The solid bounded by `shell` (build123d `Solid(shell)`). */
    constructor(shell: Shell, options?: ShapeOptions);
    constructor(source: occt.Shape | Shell, options: ShapeOptions = {}) {
        super(
            source instanceof Shell
                ? native("Solid construction", () => construct.makeSolidFromShell(source.wrapped))
                : source,
            options,
        );
    }

    /** Extrude a face by a direction and magnitude (build123d `Solid.extrude`). */
    static extrude(profile: Face, direction: VectorLike): Solid {
        return native(
            "Solid extrusion",
            () => new Solid(features.extrude(profile.wrapped, Vector.from(direction).toTuple())),
        );
    }

    get volume(): number {
        return native("Volume", () => measure.massProperties(this.wrapped, "volume").mass);
    }
}

registerShapeConstructor(ShapeType.Solid, wrapped => new Solid(wrapped));
