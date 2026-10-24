import { query, ShapeType, topology } from "@roonieone/occt-native";

import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { Shape } from "./shape.ts";

import { InvalidShapeError } from "../errors.ts";
import { Vector } from "../geometry/vector.ts";
import { fromVec3 } from "./conversions.ts";
import { Convexity } from "./enums.ts";
import { native } from "./kernel.ts";
import { castShape } from "./registry.ts";

/** Samples taken along an edge when classifying the crease between two faces. */
const DIHEDRAL_SAMPLES = 7;
/** Normals closer than this in direction make a smooth join rather than a crease. */
const SIN_TOLERANCE = 1e-4;
/** Below this a derivative is treated as degenerate, as at a cone's apex. */
const DEGENERATE = 1e-12;

/**
 * The kind the samples agree on: `Smooth` when none of them turns, the single turning kind when
 * they all turn the same way, and `Saddle` when they disagree.
 */
export function combineConvexity(kinds: readonly Convexity[]): Convexity | undefined {
    if (kinds.length === 0) return undefined;
    let turning = new Set(kinds.filter(kind => kind !== Convexity.Smooth));
    if (turning.size === 0) return Convexity.Smooth;
    if (turning.size === 1) return [...turning][0];
    return Convexity.Saddle;
}

/** The faces of the shape the edge was selected from that meet along it. */
export function connectedFaces(edge: Shape): Face[] {
    let parent = edge.topoParent;
    if (parent === undefined) {
        throw new InvalidShapeError(
            "This edge was not selected from a shape, so it has no connected faces",
        );
    }
    return topology
        .ancestors(parent.wrapped, edge.wrapped, ShapeType.Face)
        .map(wrapped => castShape(wrapped) as Face);
}

/**
 * Classify the crease between two faces along their shared edge (build123d
 * `_dihedral_convexity`): the direction leading from the edge into the second face dips behind
 * the first face's tangent plane at a convex crease and rises above it at a concave one.
 */
export function dihedralConvexity(edge: Edge, first: Face, second: Face): Convexity {
    let { first: start, last: end } = query.curveInfo(edge.wrapped);
    let reversedInSecond = native("Edge orientation", () =>
        query.edgeIsReversedInFace(second.wrapped, edge.wrapped),
    );
    let kinds: Convexity[] = [];
    for (let sample = 0; sample < DIHEDRAL_SAMPLES; sample++) {
        let parameter = start + ((end - start) * (sample + 0.5)) / DIHEDRAL_SAMPLES;
        let kind = creaseAt(edge, first, second, parameter, reversedInSecond);
        if (kind !== undefined) kinds.push(kind);
    }
    let convexity = combineConvexity(kinds);
    if (convexity === undefined) {
        throw new InvalidShapeError("The faces are degenerate along this edge");
    }
    return convexity;
}

function creaseAt(
    edge: Edge,
    first: Face,
    second: Face,
    parameter: number,
    reversedInSecond: boolean,
): Convexity | undefined {
    let tangent = fromVec3(query.curveDerivative(edge.wrapped, parameter, 1));
    let firstNormal = faceNormalAlong(edge, first, parameter);
    let secondNormal = faceNormalAlong(edge, second, parameter);
    if (
        tangent.length < DEGENERATE ||
        firstNormal.length < DEGENERATE ||
        secondNormal.length < DEGENERATE
    ) {
        return undefined;
    }
    tangent = tangent.normalized();
    firstNormal = firstNormal.normalized();
    secondNormal = secondNormal.normalized();
    if (firstNormal.cross(secondNormal).length < SIN_TOLERANCE) {
        return Convexity.Smooth;
    }
    let along = reversedInSecond ? tangent.multiply(-1) : tangent;
    let intoSecond = secondNormal.cross(along);
    return intoSecond.dot(firstNormal) < 0 ? Convexity.Convex : Convexity.Concave;
}

/** The face's outward normal where the edge crosses it at `parameter`. */
function faceNormalAlong(edge: Edge, face: Face, parameter: number): Vector {
    let { point } = native("Edge on face", () =>
        query.pcurveDerivative(edge.wrapped, face.wrapped, parameter),
    );
    return fromVec3(query.faceNormal(face.wrapped, point[0], point[1]).normal);
}

/**
 * How the material behind a face sits against it (build123d `Face.convexity`): the principal
 * curvatures sampled over the face, signed towards its outward normal.
 */
export function surfaceConvexity(face: Face, tolerance: number): Convexity {
    let bounds = query.uvBounds(face.wrapped);
    let fractions = [0.15, 0.5, 0.85];
    let kinds: Convexity[] = [];
    for (let uFraction of fractions) {
        for (let vFraction of fractions) {
            let u = bounds.uMin + (bounds.uMax - bounds.uMin) * uFraction;
            let v = bounds.vMin + (bounds.vMax - bounds.vMin) * vFraction;
            let kind = curvatureKind(face, u, v, tolerance);
            if (kind === Convexity.Saddle) return Convexity.Saddle;
            if (kind !== undefined) kinds.push(kind);
        }
    }
    let convexity = combineConvexity(kinds);
    if (convexity === undefined) {
        throw new InvalidShapeError("The surface is degenerate everywhere it was sampled");
    }
    return convexity;
}

function curvatureKind(face: Face, u: number, v: number, tolerance: number): Convexity | undefined {
    let curvature = native("Surface curvature", () => query.surfaceCurvature(face.wrapped, u, v));
    if (curvature === undefined) return undefined;
    let outward = fromVec3(query.faceNormal(face.wrapped, u, v).normal);
    if (outward.length < DEGENERATE) return undefined;

    let sign = fromVec3(curvature.normal).dot(outward.normalized()) > 0 ? 1 : -1;
    let [low, high] = [sign * curvature.min, sign * curvature.max].sort((a, b) => a - b) as [
        number,
        number,
    ];
    let bendsAway = low < -tolerance;
    let bendsInto = high > tolerance;
    if (bendsAway && bendsInto) return Convexity.Saddle;
    if (bendsAway) return Convexity.Convex;
    return bendsInto ? Convexity.Concave : Convexity.Smooth;
}
