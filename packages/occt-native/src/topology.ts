// Topology traversal and compound assembly.

import type { Shape, ShapeType, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { vec3 } from "./types.ts";

interface TopologyAddon {
    subShapes(shape: Shape, type: ShapeType): Shape[];
    childShapes(shape: Shape): Shape[];
    ancestors(root: Shape, subShape: Shape, ancestorType: ShapeType): Shape[];
    makeCompound(shapes: readonly Shape[]): Shape;
    edgeIsDegenerated(edge: Shape): boolean;
    vertexPoint(vertex: Shape): Float64Array;
}

function native(): TopologyAddon {
    return addon<TopologyAddon>();
}

/**
 * Distinct sub-shapes of `type` in OCCT explorer order. A sub-shape reached several times keeps
 * its first position and the orientation of its last occurrence (build123d's convention).
 */
export function subShapes(shape: Shape, type: ShapeType): Shape[] {
    return native().subShapes(shape, type);
}

/** Direct children, with the parent's location and orientation applied. */
export function childShapes(shape: Shape): Shape[] {
    return native().childShapes(shape);
}

/** Shapes of `ancestorType` inside `root` that contain `subShape`. */
export function ancestors(root: Shape, subShape: Shape, ancestorType: ShapeType): Shape[] {
    return native().ancestors(root, subShape, ancestorType);
}

export function makeCompound(shapes: readonly Shape[]): Shape {
    return native().makeCompound(shapes);
}

/** True for collapsed edges such as a sphere's pole seam. */
export function isDegeneratedEdge(edge: Shape): boolean {
    return native().edgeIsDegenerated(edge);
}

export function vertexPoint(vertex: Shape): Vec3 {
    return vec3(native().vertexPoint(vertex));
}
