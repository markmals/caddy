import type * as occt from "@roonieone/occt-native";

import { construct, measure, query, ShapeType, shapes } from "@roonieone/occt-native";

import type { Face } from "./face.ts";
import type { ShapeOptions } from "./shape.ts";

import { InvalidShapeError } from "../errors.ts";
import { Vector } from "../geometry/vector.ts";
import { fromVec3 } from "./conversions.ts";
import { native } from "./kernel.ts";
import { Mixin2D } from "./mixin2d.ts";
import { registerShapeConstructor } from "./registry.ts";

/** Faces joined along shared edges (build123d `Shell`). */
export class Shell extends Mixin2D {
    static override readonly order: number = 2.5;

    /** Wrap a native shell. */
    constructor(wrapped: occt.Shape, options?: ShapeOptions);
    /** The shell `faces` sew into, or the one-face shell of a single face. */
    constructor(faces: Face | Iterable<Face>, options?: ShapeOptions);
    constructor(source: occt.Shape | Face | Iterable<Face>, options: ShapeOptions = {}) {
        super(shellOf(source), options);
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

/** build123d `Shell(faces)`: a single face is wrapped, several are sewn together. */
function shellOf(source: occt.Shape | Face | Iterable<Face>): occt.Shape {
    if (!(Symbol.iterator in source) && !("shapeType" in source)) {
        return source;
    }
    let faces = "shapeType" in source ? [source] : [...(source as Iterable<Face>)];
    if (faces.length === 0) {
        throw new InvalidShapeError("Cannot create a Shell without faces");
    }
    let sewn = native("Shell construction", () =>
        construct.sewFaces(faces.map(face => face.wrapped)),
    );
    if (shapes.shapeType(sewn) !== ShapeType.Shell) {
        throw new InvalidShapeError("The faces given do not sew into a single shell");
    }
    return sewn;
}
