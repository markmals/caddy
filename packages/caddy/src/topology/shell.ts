import type * as occt from "@roonieone/occt-native";

import { measure, query, ShapeType } from "@roonieone/occt-native";

import type { ShapeOptions } from "./shape.ts";

import { Vector } from "../geometry/vector.ts";
import { fromVec3 } from "./conversions.ts";
import { native } from "./kernel.ts";
import { Mixin2D } from "./mixin2d.ts";
import { registerShapeConstructor } from "./registry.ts";

/** Faces joined along shared edges (build123d `Shell`). */
export class Shell extends Mixin2D {
    static override readonly order: number = 2.5;

    constructor(wrapped: occt.Shape, options: ShapeOptions = {}) {
        super(wrapped, options);
    }

    /**
     * Volume enclosed by a closed shell; 0 for an open one. build123d first rebuilds a solid
     * from a manifold shell (ShapeFix_Solid); this integrates the closed shell directly, which
     * agrees for consistently oriented shells.
     */
    get volume(): number {
        if (!query.isClosed(this.wrapped)) {
            return 0;
        }
        return native("Volume", () => measure.massProperties(this.wrapped, "volume").mass);
    }

    /**
     * build123d's shell centre: the centre of mass of its edges (`LinearProperties`), not of
     * its surface.
     */
    center(): Vector {
        let properties = native("Center of mass", () =>
            measure.massProperties(this.wrapped, "linear"),
        );
        return fromVec3(properties.centerOfMass);
    }
}

registerShapeConstructor(ShapeType.Shell, wrapped => new Shell(wrapped));
