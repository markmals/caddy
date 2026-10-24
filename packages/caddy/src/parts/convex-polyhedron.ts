import type { Shape as NativeShape } from "@roonieone/occt-native";

import { features } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";
import type { PartPlacement } from "./base.ts";
import type { Triangle } from "./convex-hull.ts";

import { makeWirePolygon } from "../curves/wire-makers.ts";
import { NativeKernelError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Align, Vector } from "../geometry/index.ts";
import { Face } from "../topology/face.ts";
import { Shape } from "../topology/shape.ts";
import { Vertex } from "../topology/vertex.ts";
import { BasePartObject } from "./base.ts";
import { convexHull } from "./convex-hull.ts";

/** The convex hull of a set of points, as a solid (build123d `ConvexPolyhedron`). */
export class ConvexPolyhedron extends BasePartObject {
    readonly points: Vector[];

    constructor(points: Iterable<VectorLike | Vertex>, options: PartPlacement = {}) {
        let corners = distinct(
            [...points].map(point => (point instanceof Vertex ? point.center : Vector.from(point))),
        );
        let hull = convexHull(corners);
        super(() => hullSolid(corners, hull), { ...options, align: options.align ?? Align.None });
        this.points = corners;
    }
}

function distinct(points: readonly Vector[]): Vector[] {
    let unique: Vector[] = [];
    for (let point of points) {
        if (unique.every(other => other.sub(point).length > TOLERANCE)) unique.push(point);
    }
    return unique;
}

/** build123d sews the hull triangles into a solid and cleans away the triangulation. */
function hullSolid(points: readonly Vector[], hull: readonly Triangle[]): NativeShape {
    let faces = hull.map(
        triangle => new Face(makeWirePolygon(triangle.map(corner => points[corner]!))),
    );
    try {
        let solid = Shape.cast(features.sewSolid(faces.map(face => face.wrapped)));
        return solid.clean().wrapped;
    } catch (cause) {
        throw new NativeKernelError("Could not build a solid from the convex hull", { cause });
    }
}
