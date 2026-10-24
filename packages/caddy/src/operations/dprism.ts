import { features } from "@roonieone/occt-native";

import { InvalidShapeError, NativeKernelError } from "../errors.ts";
import { DEG2RAD } from "../geometry/index.ts";
import { Face } from "../topology/face.ts";
import { Shape } from "../topology/shape.ts";
import { Wire } from "../topology/wire.ts";

export interface DPrismOptions {
    /** The sketch face the profiles sit on; OCCT infers one when it is omitted. */
    readonly basis?: Face;
    /** Length of the prism; ignored unless `thruAll` is false and no `upToFace` is given. */
    readonly depth?: number;
    /** Draft of the prism walls, in degrees. */
    readonly taper?: number;
    /** Face the prism stops at. */
    readonly upToFace?: Face;
    /** Run the prism through the whole solid; defaults to true, as in build123d. */
    readonly thruAll?: boolean;
    /** Add material rather than removing it; defaults to true. */
    readonly additive?: boolean;
}

/**
 * build123d `Mixin3D.dprism`: grows (or cuts) a tapered prism per bounding profile. Wires are
 * first combined into faces so that a profile with holes makes one prism, not several.
 */
export function dprism(
    base: Shape,
    bounds: Face | Wire | Iterable<Face | Wire>,
    options: DPrismOptions = {},
): Shape {
    let profiles = profileFaces(bounds);
    let settings = {
        ...(options.basis === undefined ? {} : { basis: options.basis.wrapped }),
        ...(options.upToFace === undefined ? {} : { upTo: options.upToFace.wrapped }),
        taperRadians: (options.taper ?? 0) * DEG2RAD,
        additive: options.additive ?? true,
        depth: options.depth ?? 0,
        thruAll: (options.thruAll ?? true) || options.depth === undefined,
    };
    try {
        let shape = base.wrapped;
        for (let profile of profiles) {
            shape = features.dprism(shape, profile.wrapped, settings);
        }
        return Shape.cast(shape);
    } catch (cause) {
        throw new NativeKernelError("Prismatic feature failed", { cause });
    }
}

/** build123d `sort_wires_by_build_order`: the first wire bounds a face, the rest are its holes. */
function profileFaces(bounds: Face | Wire | Iterable<Face | Wire>): Face[] {
    let selection = bounds instanceof Shape ? [bounds] : [...bounds];
    let wires = selection.filter((bound): bound is Wire => bound instanceof Wire);
    if (wires.length === 0) return selection as Face[];
    if (wires.length !== selection.length) {
        throw new InvalidShapeError("Prism bounds must all be faces or all be wires");
    }
    return [...new Face(wires[0]!, wires.slice(1)).faces()];
}
