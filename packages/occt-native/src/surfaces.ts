// Faces built on an explicit surface rather than on wires, and the analytic queries that read
// the surface a face sits on. Angles are in radians.

import type { Axis, Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { vec3 } from "./types.ts";

/** Continuity a patch keeps with a support face (OCCT GeomAbs_Shape): position, tangent, curvature. */
export const Continuity = { Position: 0, Tangent: 1, Curvature: 2 } as const;
export type Continuity = (typeof Continuity)[keyof typeof Continuity];

/** One boundary edge of a patch, with the face it stays continuous with. */
export interface PatchConstraint {
    readonly edge: Shape;
    readonly support: Shape;
    readonly continuity: Continuity;
}

export interface ApproxSurfaceOptions {
    readonly tolerance?: number;
    /** Three variational smoothing weights; omitted for a plain approximation. */
    readonly smoothing?: readonly [number, number, number];
    readonly minDegree?: number;
    readonly maxDegree?: number;
}

/** The point on a face's surface at `(u, v)` with the surface's two first derivatives there. */
export interface SurfaceDerivatives {
    readonly point: Vec3;
    readonly uTangent: Vec3;
    readonly vTangent: Vec3;
}

interface SurfacesAddon {
    makeBezierSurfaceFace(points: Float64Array, columns: number, weights: Float64Array): Shape;
    makeApproxSurfaceFace(
        points: Float64Array,
        columns: number,
        tolerance: number,
        smoothing: Float64Array,
        minDegree: number,
        maxDegree: number,
    ): Shape;
    makeRuledFace(first: Shape, second: Shape): Shape;
    makeRuledShell(first: Shape, second: Shape): Shape;
    makeFilledPatch(
        supportedEdges: readonly Shape[],
        supportFaces: readonly Shape[],
        continuities: Float64Array,
        freeEdges: readonly Shape[],
        pointConstraints: Float64Array,
    ): Shape;
    addFaceHoles(face: Shape, holeWires: readonly Shape[]): Shape;
    removeFaceHoles(face: Shape, holeWires: readonly Shape[]): Shape;
    faceAxisOfRotation(face: Shape): Float64Array;
    faceSemiAngle(face: Shape): Float64Array;
    faceDerivatives(face: Shape, u: number, v: number): Float64Array;
    makeParameterSpaceEdge(edge: Shape, face: Shape): Shape;
}

function native(): SurfacesAddon {
    return addon<SurfacesAddon>();
}

/** Flattens a rectangular grid of points, returning the coordinates and the column count. */
function grid(points: readonly (readonly Vec3[])[]): {
    readonly flat: Float64Array;
    readonly columns: number;
} {
    let columns = points[0]?.length ?? 0;
    if (points.some(row => row.length !== columns)) {
        throw new RangeError("every row of a surface grid must have the same length");
    }
    let flat = new Float64Array(points.length * columns * 3);
    points.forEach((row, rowIndex) =>
        row.forEach((point, column) => flat.set(point, (rowIndex * columns + column) * 3)),
    );
    return { flat, columns };
}

/** Bézier surface through a grid of control points, optionally weighted. */
export function makeBezierSurfaceFace(
    controlPoints: readonly (readonly Vec3[])[],
    weights: readonly (readonly number[])[] = [],
): Shape {
    let { flat, columns } = grid(controlPoints);
    return native().makeBezierSurfaceFace(flat, columns, Float64Array.from(weights.flat()));
}

/** B-spline surface approximating a grid of points. */
export function makeApproxSurfaceFace(
    points: readonly (readonly Vec3[])[],
    options: ApproxSurfaceOptions = {},
): Shape {
    let { flat, columns } = grid(points);
    return native().makeApproxSurfaceFace(
        flat,
        columns,
        options.tolerance ?? 1e-2,
        Float64Array.from(options.smoothing ?? []),
        options.minDegree ?? 1,
        options.maxDegree ?? 3,
    );
}

/** Ruled face between two edges. */
export function makeRuledFace(first: Shape, second: Shape): Shape {
    return native().makeRuledFace(first, second);
}

/** Ruled shell between two wires with matching edge counts. */
export function makeRuledShell(first: Shape, second: Shape): Shape {
    return native().makeRuledShell(first, second);
}

/**
 * Face patch filling `freeEdges` and the edges of `constraints`, staying continuous with each
 * constraint's support face and passing through `pointConstraints`.
 */
export function makeFilledPatch(
    constraints: readonly PatchConstraint[],
    freeEdges: readonly Shape[],
    pointConstraints: readonly Vec3[],
): Shape {
    return native().makeFilledPatch(
        constraints.map(constraint => constraint.edge),
        constraints.map(constraint => constraint.support),
        Float64Array.from(constraints, constraint => constraint.continuity),
        freeEdges,
        Float64Array.from(pointConstraints.flat()),
    );
}

/** `face` with `holeWires` added as interior boundaries. */
export function addFaceHoles(face: Shape, holeWires: readonly Shape[]): Shape {
    return native().addFaceHoles(face, holeWires);
}

/** `face` with `holeWires` dropped from its boundaries. */
export function removeFaceHoles(face: Shape, holeWires: readonly Shape[]): Shape {
    return native().removeFaceHoles(face, holeWires);
}

/** The axis a surface of revolution turns about, or `undefined` for any other surface. */
export function faceAxisOfRotation(face: Shape): Axis | undefined {
    let values = native().faceAxisOfRotation(face);
    if (values.length === 0) return undefined;
    return { origin: vec3(values, 0), direction: vec3(values, 3) };
}

/** Half-angle at the apex of an untrimmed conical surface, in radians. */
export function faceSemiAngle(face: Shape): number | undefined {
    let [semiAngle] = native().faceSemiAngle(face);
    return semiAngle;
}

export function faceDerivatives(face: Shape, u: number, v: number): SurfaceDerivatives {
    let values = native().faceDerivatives(face, u, v);
    return { point: vec3(values, 0), uTangent: vec3(values, 3), vTangent: vec3(values, 6) };
}

/**
 * The edge's 2D curve on `face`, rebuilt as an edge on the XY plane where X is the surface's U
 * parameter and Y its V parameter.
 */
export function makeParameterSpaceEdge(edge: Shape, face: Shape): Shape {
    return native().makeParameterSpaceEdge(edge, face);
}
