/** Faces built on an explicit surface: Bézier, fitted, ruled and filled patches. */

import { query, surfaces } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Edge } from "./edge.ts";
import type { Shell } from "./shell.ts";

import { castFace } from "../curves/cast.ts";
import { ContinuityLevel } from "../curves/enums.ts";
import { GeometryError, InvalidShapeError } from "../errors.ts";
import { Vector } from "../geometry/vector.ts";
import { Face } from "./face.ts";
import { native } from "./kernel.ts";
import { Shape } from "./shape.ts";
import { Wire } from "./wire.ts";

/** OCCT's hard limit on the degree of a Bézier surface. */
const MAX_CONTROL_POINTS = 25;

/** How strongly a patch is tied to its support face (OCCT GeomAbs_Shape order). */
const CONTINUITY_ORDERS: Record<ContinuityLevel, surfaces.Continuity> = {
    [ContinuityLevel.C0]: surfaces.Continuity.Position,
    [ContinuityLevel.C1]: surfaces.Continuity.Tangent,
    [ContinuityLevel.C2]: surfaces.Continuity.Curvature,
};

/** Options of {@link Face.makeBezierSurface}. */
export interface BezierSurfaceOptions {
    /** One weight per control point, in the same layout. */
    readonly weights?: readonly (readonly number[])[];
}

/** Options of {@link Face.makeSurfaceFromArrayOfPoints}. */
export interface FittedSurfaceOptions {
    /** How far the surface may stray from the points; defaults to 1e-2. */
    readonly tolerance?: number;
    /** Three variational smoothing weights; omitted for a plain approximation. */
    readonly smoothing?: readonly [number, number, number];
    /** Lowest spline degree, honoured only without smoothing; defaults to 1. */
    readonly minDegree?: number;
    /**
     * Highest spline degree; defaults to 3, and is raised to 6 under smoothing, the lowest
     * degree OCCT's C2 Jacobi basis accepts.
     */
    readonly maxDegree?: number;
}

/** A patch boundary edge and the face the patch stays continuous with along it. */
export interface PatchEdgeConstraint {
    readonly edge: Edge;
    readonly support: Face;
    readonly continuity: ContinuityLevel;
}

/** Options of {@link Face.makeSurfacePatch}. */
export interface SurfacePatchOptions {
    /** Boundary edges whose adjacent faces constrain the patch's continuity. */
    readonly edgeFaceConstraints?: Iterable<PatchEdgeConstraint>;
    /** Boundary edges without an adjacent face. */
    readonly edgeConstraints?: Iterable<Edge>;
    /** Points the patch is pulled through. */
    readonly pointConstraints?: readonly VectorLike[];
}

function controlGrid(points: readonly (readonly VectorLike[])[]): Vector[][] {
    return points.map(row => row.map(point => Vector.from(point)));
}

/** Bézier surface through a grid of control points (build123d `Face.make_bezier_surface`). */
export function makeBezierSurface(
    points: readonly (readonly VectorLike[])[],
    options: BezierSurfaceOptions = {},
): Face {
    let rows = controlGrid(points);
    let columns = rows[0]?.length ?? 0;
    if (rows.length < 2 || columns < 2) {
        throw new GeometryError("At least two control points must be provided (start, end)");
    }
    if (rows.length > MAX_CONTROL_POINTS || columns > MAX_CONTROL_POINTS) {
        throw new GeometryError(`The maximum number of control points is ${MAX_CONTROL_POINTS}`);
    }
    let weights = options.weights ?? [];
    if (
        weights.length > 0 &&
        (weights.length !== rows.length || (weights[0]?.length ?? 0) !== columns)
    ) {
        throw new GeometryError("A weight must be provided for each control point");
    }
    return castFace("Face.makeBezierSurface", () =>
        surfaces.makeBezierSurfaceFace(
            rows.map(row => row.map(point => point.toTuple())),
            weights,
        ),
    );
}

/**
 * B-spline surface approximating a grid of points (build123d
 * `Face.make_surface_from_array_of_points`). The first index runs along V, the second along U.
 */
export function makeSurfaceFromArrayOfPoints(
    points: readonly (readonly VectorLike[])[],
    options: FittedSurfaceOptions = {},
): Face {
    let rows = controlGrid(points);
    let smoothing = options.smoothing;
    let maxDegree = options.maxDegree ?? 3;
    return castFace("Face.makeSurfaceFromArrayOfPoints", () =>
        surfaces.makeApproxSurfaceFace(
            rows.map(row => row.map(point => point.toTuple())),
            {
                tolerance: options.tolerance ?? 1e-2,
                ...(smoothing === undefined
                    ? { minDegree: options.minDegree ?? 1, maxDegree }
                    : { smoothing, maxDegree: Math.max(maxDegree, 6) }),
            },
        ),
    );
}

/**
 * Ruled surface between two curves (build123d `Face.make_surface_from_curves`): a face between
 * two edges, or a shell between two wires with matching edge counts.
 */
export function makeSurfaceFromCurves(first: Edge, second: Edge): Face;
export function makeSurfaceFromCurves(first: Wire, second: Wire): Shell;
export function makeSurfaceFromCurves(first: Edge | Wire, second: Edge | Wire): Face | Shell {
    if (first instanceof Wire !== second instanceof Wire) {
        throw new InvalidShapeError(
            "Both curves must be of the same type (both Edge or both Wire).",
        );
    }
    let make =
        first instanceof Wire
            ? () => surfaces.makeRuledShell(first.wrapped, second.wrapped)
            : () => surfaces.makeRuledFace(first.wrapped, second.wrapped);
    return Shape.cast(native("Face.makeSurfaceFromCurves", make)) as Face | Shell;
}

/**
 * Possibly non-planar patch bounded by the constraint edges, held to the continuity of their
 * support faces and pulled through the point constraints (build123d `Face.make_surface_patch`).
 */
export function makeSurfacePatch(options: SurfacePatchOptions = {}): Face {
    let constraints = [...(options.edgeFaceConstraints ?? [])].map(constraint => {
        // OCCT reads the edge's curve on the support face and dereferences a missing one, so a
        // constraint whose edge is not part of its support would crash the process.
        if (!constraint.support.edges.some(edge => edge.isSame(constraint.edge))) {
            throw new GeometryError("A patch constraint edge must be an edge of its support face");
        }
        return {
            edge: constraint.edge.wrapped,
            support: constraint.support.wrapped,
            continuity: CONTINUITY_ORDERS[constraint.continuity],
        };
    });
    let freeEdges = [...(options.edgeConstraints ?? [])].map(edge => edge.wrapped);
    let points = (options.pointConstraints ?? []).map(point => Vector.from(point).toTuple());
    let patch = castFace("Face.makeSurfacePatch", () =>
        surfaces.makeFilledPatch(constraints, freeEdges, points),
    ).fix();
    if (!patch.isValid) {
        throw new GeometryError("Non planar face is invalid");
    }
    return patch;
}

/**
 * The face's boundary drawn in its own parameter space (build123d `Face.uv_face`): a planar face
 * on the XY plane whose X is the surface's U parameter and Y its V parameter.
 */
export function uvFace(face: Face): Face {
    let flatten = (wire: Wire): Wire =>
        new Wire(
            query
                .wireEdges(wire.wrapped)
                .map(edge =>
                    Shape.cast(
                        native("Face.uvFace", () =>
                            surfaces.makeParameterSpaceEdge(edge, face.wrapped),
                        ),
                    ),
                ) as Edge[],
        );
    return new Face(
        flatten(face.outerWire),
        face.innerWires.map(wire => flatten(wire)),
    );
}
