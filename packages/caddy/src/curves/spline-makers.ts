/** Edges from free-form curves and helices (build123d `Edge.make_spline` and friends). */

import { construct } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Edge } from "../topology/edge.ts";

import { GeometryError } from "../errors.ts";
import { DEG2RAD } from "../geometry/constants.ts";
import { Vector } from "../geometry/vector.ts";
import { castEdge } from "./cast.ts";

export interface SplineOptions {
    /** Either a start and end tangent, or one tangent per point. */
    readonly tangents?: readonly VectorLike[];
    readonly periodic?: boolean;
    /** The curve parameter at each point; one more than the points when periodic. */
    readonly parameters?: readonly number[];
    /** Scale the tangents to the derivative of the interpolated curve. */
    readonly scale?: boolean;
    readonly tolerance?: number;
}

export interface SplineApproxOptions {
    readonly tolerance?: number;
    /** Three variational smoothing weights. */
    readonly smoothing?: readonly [number, number, number];
    readonly minDegree?: number;
    readonly maxDegree?: number;
}

export interface BsplineOptions {
    readonly weights?: readonly number[];
    readonly periodic?: boolean;
}

export interface HelixOptions {
    readonly center?: VectorLike;
    readonly normal?: VectorLike;
    /** Apex half-angle in degrees; zero winds the helix around a cylinder. */
    readonly coneAngle?: number;
    readonly leftHand?: boolean;
}

function tuples(points: readonly VectorLike[]): [number, number, number][] {
    return points.map(point => Vector.from(point).toTuple());
}

/** B-spline interpolating every point. */
export function makeSpline(points: readonly VectorLike[], options: SplineOptions = {}): Edge {
    let interpolated = tuples(points);
    let periodic = options.periodic ?? false;
    let parameters = options.parameters ?? [];
    let expected = interpolated.length + (periodic ? 1 : 0);
    if (parameters.length > 0 && parameters.length !== expected) {
        throw new GeometryError(
            "There must be one parameter for each interpolation point (plus one if periodic), " +
                `or none specified. Parameter count: ${parameters.length}, ` +
                `point count: ${interpolated.length}`,
        );
    }
    let tangents = tuples(options.tangents ?? []);
    if (
        tangents.length > 0 &&
        tangents.length !== interpolated.length &&
        !(tangents.length === 2 && interpolated.length !== 2)
    ) {
        throw new GeometryError(
            "There must be one tangent for each interpolation point, or just two end point " +
                `tangents. Tangent count: ${tangents.length}, point count: ${interpolated.length}`,
        );
    }
    return castEdge("Edge.makeSpline", () =>
        construct.makeSplineEdge(interpolated, {
            tangents,
            parameters,
            periodic,
            scale: options.scale ?? true,
            tolerance: options.tolerance ?? 1e-6,
        }),
    );
}

/** B-spline passing within `tolerance` of every point. */
export function makeSplineApprox(
    points: readonly VectorLike[],
    options: SplineApproxOptions = {},
): Edge {
    let approximated = tuples(points);
    let maxDegree = options.maxDegree ?? 6;
    return castEdge("Edge.makeSplineApprox", () =>
        construct.makeSplineApproxEdge(approximated, {
            tolerance: options.tolerance ?? 1e-3,
            ...(options.smoothing === undefined ? {} : { smoothing: options.smoothing }),
            minDegree: options.minDegree ?? 1,
            // The smoothing overload asks OCCT for C2 continuity, whose Jacobi basis needs a
            // work degree of at least 6.
            maxDegree: options.smoothing === undefined ? maxDegree : Math.max(maxDegree, 6),
        }),
    );
}

/** Bezier curve with the given control points, rational when weights are supplied. */
export function makeBezier(
    controlPoints: readonly VectorLike[],
    options: { readonly weights?: readonly number[] } = {},
): Edge {
    let poles = tuples(controlPoints);
    if (poles.length < 2) {
        throw new GeometryError("At least two control points must be provided (start, end)");
    }
    if (poles.length > 25) {
        throw new GeometryError("The maximum number of control points is 25");
    }
    let weights = options.weights ?? [];
    if (weights.length > 0 && weights.length !== poles.length) {
        throw new GeometryError("A weight must be provided for each control point");
    }
    return castEdge("Edge.makeBezier", () => construct.makeBezierEdge(poles, weights));
}

/** Exact B-spline from control points and a knot sequence; repeated knots are multiplicities. */
export function makeBspline(
    controlPoints: readonly VectorLike[],
    knots: readonly number[],
    degree: number,
    options: BsplineOptions = {},
): Edge {
    if (knots.length === 0) {
        throw new GeometryError("B-spline requires at least one knot");
    }
    let poles = tuples(controlPoints);
    return castEdge("Edge.makeBspline", () =>
        construct.makeBsplineEdge(poles, knots, degree, {
            ...(options.weights === undefined ? {} : { weights: options.weights }),
            periodic: options.periodic ?? false,
        }),
    );
}

/**
 * Helix of `pitch` per turn rising to `height` around the axis through `center`. A non-zero
 * `coneAngle` winds it around a cone instead of a cylinder.
 */
export function makeHelix(
    pitch: number,
    height: number,
    radius: number,
    options: HelixOptions = {},
): Edge {
    let center = Vector.from(options.center ?? [0, 0, 0]).toTuple();
    let normal = Vector.from(options.normal ?? [0, 0, 1]).toTuple();
    return castEdge("Edge.makeHelix", () =>
        construct.makeHelixEdge({
            pitch,
            height,
            radius,
            center,
            normal,
            coneAngle: (options.coneAngle ?? 0) * DEG2RAD,
            leftHand: options.leftHand ?? false,
        }),
    );
}
