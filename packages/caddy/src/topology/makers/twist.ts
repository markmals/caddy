/**
 * build123d `Solid.extrude_linear_with_rotation`: a twisted prism, swept along a straight spine
 * while following a helical auxiliary spine that does the turning.
 */

import type * as occt from "@roonieone/occt-native";

import { booleans, features } from "@roonieone/occt-native";

import type { VectorLike } from "../../geometry/vector.ts";
import type { Solid } from "../solid.ts";

import { GeometryError } from "../../errors.ts";
import { Vector } from "../../geometry/vector.ts";
import { Edge } from "../edge.ts";
import { Face } from "../face.ts";
import { unwrapNativeCompound } from "../native-topology.ts";
import { Wire } from "../wire.ts";
import { castSolid } from "./cast.ts";

export interface TwistOptions {
    /** Holes in the section; build123d only reads them when the section is a wire. */
    readonly innerWires?: Iterable<Wire>;
}

/** Extrude `section` along `normal` from `center` while turning it `angle` degrees. */
export function extrudeLinearWithRotation(
    section: Face | Wire,
    center: VectorLike,
    normal: VectorLike,
    angle: number,
    options: TwistOptions = {},
): Solid {
    if (!Number.isFinite(angle) || angle === 0) {
        throw new GeometryError("Rotation angle must be nonzero and finite");
    }
    let origin = Vector.from(center);
    let direction = Vector.from(normal);
    if (direction.length === 0) {
        throw new GeometryError("Extrusion direction must be nonzero");
    }
    let outer = section instanceof Face ? section.outerWire() : section;
    let inner = section instanceof Face ? section.innerWires() : [...(options.innerWires ?? [])];

    let spine = new Wire([Edge.makeLine(origin, origin.add(direction))]).wrapped;
    let pitch = (360 / angle) * direction.length;
    let helix = Edge.makeHelix(pitch, direction.length, 1, { center: origin, normal: direction });
    let auxiliary = new Wire([helix]).wrapped;

    return castSolid("Solid.extrudeLinearWithRotation", () => {
        let twist = (wire: Wire): occt.Shape =>
            features.sweep(spine, [wire.wrapped], {
                auxiliary,
                auxiliaryCurvilinear: false,
                solid: true,
            });
        let solid = twist(outer);
        if (inner.length === 0) {
            return solid;
        }
        return unwrapNativeCompound(booleans.cut([solid], inner.map(twist)));
    });
}
