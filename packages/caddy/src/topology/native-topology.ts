/**
 * Helpers on raw native shapes, shared by the shape classes and the boolean machinery
 * (build123d's `get_top_level_topods_shapes`, `topods_dim` and `unwrap_topods_compound`).
 */

import type * as occt from "@roonieone/occt-native";

import { ShapeType, shapes, topology } from "@roonieone/occt-native";

/**
 * The non-compound shapes directly inside `native`, descending through nested compounds; a
 * non-compound shape is its own only member. Nested compounds are visited last-in first-out,
 * as build123d's stack-based walk does.
 */
export function topLevelNativeShapes(native: occt.Shape): occt.Shape[] {
    let found: occt.Shape[] = [];
    let stack = [native];
    for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
        if (shapes.shapeType(current) !== ShapeType.Compound) {
            found.push(current);
            continue;
        }
        for (let child of topology.childShapes(current)) {
            if (shapes.shapeType(child) === ShapeType.Compound) {
                stack.push(child);
            } else {
                found.push(child);
            }
        }
    }
    return found;
}

/** Topological dimension: 0 vertex, 1 edge/wire, 2 face/shell, 3 solid, or a compound's common one. */
export function nativeDimension(native: occt.Shape): number | undefined {
    switch (shapes.shapeType(native)) {
        case ShapeType.Vertex:
            return 0;
        case ShapeType.Edge:
        case ShapeType.Wire:
            return 1;
        case ShapeType.Face:
        case ShapeType.Shell:
            return 2;
        case ShapeType.Solid:
            return 3;
        case ShapeType.Compound: {
            let dimensions = new Set(topLevelNativeShapes(native).map(nativeDimension));
            let [only] = dimensions;
            return dimensions.size === 1 ? only : undefined;
        }
        default:
            return undefined;
    }
}

/**
 * Strip compounds holding a single shape. With `fully`, the innermost non-compound shape is
 * returned; otherwise the innermost single-child compound is kept.
 */
export function unwrapNativeCompound(compound: occt.Shape, fully = true): occt.Shape {
    let children = topology.childShapes(compound);
    let [single] = children;
    if (children.length !== 1 || single === undefined) {
        return compound;
    }
    if (shapes.shapeType(single) === ShapeType.Compound) {
        return unwrapNativeCompound(single, fully);
    }
    return fully ? single : compound;
}
