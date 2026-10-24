import type { Shape as NativeShape } from "@roonieone/occt-native";

import { features, measure } from "@roonieone/occt-native";

import type { Shape } from "../topology/shape.ts";

import { GeometryError, InvalidShapeError } from "../errors.ts";
import { Edge } from "../topology/edge.ts";

export interface MaxFilletOptions {
    /** How close the answer must be to the true maximum; defaults to 0.1 as in build123d. */
    readonly tolerance?: number;
    /** Halvings of the search window before giving up; defaults to 10 as in build123d. */
    readonly maxIterations?: number;
}

/**
 * build123d `Mixin3D.max_fillet`: the largest radius the given edges still round cleanly,
 * found by bisecting between zero and twice the bounding-box diagonal.
 */
export function maxFillet(
    solid: Shape,
    edgeList: Edge | Iterable<Edge>,
    options: MaxFilletOptions = {},
): number {
    let edges = (edgeList instanceof Edge ? [edgeList] : [...edgeList]).map(edge => edge.wrapped);
    if (edges.length === 0) throw new InvalidShapeError("At least one solid edge is required");
    if (!solid.isValid) throw new InvalidShapeError("Invalid Shape");

    let tolerance = options.tolerance ?? 0.1;
    let maxIterations = options.maxIterations ?? 10;
    if (!(tolerance > 0)) throw new GeometryError("Fillet search tolerance must be positive");

    let search = (low: number, high: number, iteration: number): number => {
        if (iteration === maxIterations) {
            throw new GeometryError(
                `Failed to find the max fillet within ${tolerance} in ${maxIterations} iterations`,
            );
        }
        let middle = (low + high) / 2;
        if (!rounds(solid.wrapped, edges, middle)) return search(low, middle, iteration + 1);
        if (middle - low <= tolerance) return middle;
        return search(middle, high, iteration + 1);
    };
    return search(0, 2 * solid.boundingBox().diagonal, 0);
}

/** A radius works when OCCT builds a fillet at all and the result survives BRepCheck. */
function rounds(solid: NativeShape, edges: readonly NativeShape[], radius: number): boolean {
    try {
        return measure.isValid(features.fillet(solid, edges, radius).shape);
    } catch {
        return false;
    }
}
