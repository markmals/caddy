/**
 * Conforming a single planar edge to a curved surface, the step `Face#wrap` is built from
 * (build123d `Mixin2D._wrap_edge` and `Edge._extend_spline`).
 */

import { wrap } from "@roonieone/occt-native";

import type { Location } from "../geometry/location.ts";
import type { Face } from "./face.ts";
import type { AxisIntersection } from "./helpers/axis-intersections.ts";

import { castEdge } from "../curves/cast.ts";
import { makeLine } from "../curves/edge-makers.ts";
import { makeSpline } from "../curves/spline-makers.ts";
import { GeometryError, InvalidShapeError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { Edge } from "./edge.ts";
import { CenterOf, GeomType } from "./enums.ts";

/** How far the adaptive refinement subdivides the edge before giving up. */
const MAX_REFINEMENTS = 10;

/** Options of {@link Face#wrap}. */
export interface WrapOptions {
    /** How much the wrapped edges may differ in length from the planar ones; defaults to 0.001. */
    readonly tolerance?: number;
    /**
     * How far beyond their ends the first and last edge of a closed wire are extended so that they
     * cross; defaults to 0.1 of their length.
     */
    readonly extensionFactor?: number;
}

/** Options of {@link extendSplineOnSurface}. */
export interface ExtendSplineOptions {
    /** Extend the start of the spline instead of its end; defaults to false. */
    readonly atStart?: boolean;
    /** How far beyond the end to extend, as a fraction of the spline's length; defaults to 0.1. */
    readonly extensionFactor?: number;
}

/**
 * `planarEdge`, defined on the XY plane, laid onto `surface` from `surfaceLocation`. The edge is
 * walked in ever finer steps, each one following the surface's curvature, until the wrapped length
 * matches the planar one; the resulting spline is then projected onto the surface itself.
 */
export function wrapEdgeOnSurface(
    surface: Face,
    planarEdge: Edge,
    surfaceLocation: Location,
    options: WrapOptions = {},
): Edge {
    let tolerance = options.tolerance ?? 0.001;
    let walk = new SurfaceWalk(surface, surfaceLocation, tolerance);
    let start = walk.startOf(planarEdge, options);

    let subdivisions = 3;
    let wrapped: Edge | undefined;
    let lengthError = Number.POSITIVE_INFINITY;
    for (
        let refinement = 0;
        lengthError > tolerance && refinement < MAX_REFINEMENTS;
        refinement++
    ) {
        let points = [start[0]];
        let current = start;
        let steps = subdivisions + (planarEdge.isClosed ? 0 : 1);
        for (let division = 1; division < steps; division++) {
            let from = planarEdge.positionAt((division - 1) / subdivisions);
            let to = planarEdge.positionAt(division / subdivisions);
            current = walk.step(current, to.sub(from));
            points.push(current[0]);
        }
        wrapped = makeSpline(points, { periodic: planarEdge.isClosed });
        lengthError = Math.abs(planarEdge.length - wrapped.length);
        subdivisions *= 2;
    }

    if (wrapped === undefined || lengthError > tolerance) {
        throw new GeometryError(
            `Length error of ${lengthError.toFixed(6)} exceeds tolerance ${tolerance}`,
        );
    }
    if (!wrapped.isValid) {
        throw new GeometryError("Wrapped edge is invalid");
    }
    return projectEdgeOnSurface(surface, wrapped);
}

/** `edge`'s curve projected along the normals of `surface`, which snaps it onto the surface. */
export function projectEdgeOnSurface(surface: Face, edge: Edge): Edge {
    return castEdge("Face.wrap", () => wrap.projectEdgeOnFace(edge.wrapped, surface.wrapped));
}

/**
 * A spline lying on `surface` continued past one of its ends, keeping its shape by reusing its
 * control points and end tangents, and snapped back onto the surface.
 */
export function extendSplineOnSurface(
    surface: Face,
    spline: Edge,
    options: ExtendSplineOptions = {},
): Edge {
    if (spline.geomType !== GeomType.Bspline) {
        throw new InvalidShapeError("Only splines can be extended along a surface");
    }
    let atStart = options.atStart ?? false;
    let factor = options.extensionFactor ?? 0.1;
    let poles = wrap.edgeSplinePoles(spline.wrapped).map(pole => Vector.from(pole));
    let beyond = spline.positionAt(atStart ? -factor : 1 + factor);
    let points = atStart ? [beyond, ...poles] : [...poles, beyond];
    let ends = atStart ? [-factor, 1] : [0, 1 + factor];
    let extended = makeSpline(points, { tangents: ends.map(end => spline.tangentAt(end)) });
    return projectEdgeOnSurface(surface, extended);
}

/** Walks across a surface, following its normal from one point to the next. */
class SurfaceWalk {
    readonly #surface: Face;
    readonly #center: Vector;
    readonly #xDirection: Vector;
    readonly #location: Location;
    readonly #tolerance: number;

    constructor(surface: Face, location: Location, tolerance: number) {
        this.#surface = surface;
        this.#center = surface.getCenter(CenterOf.BoundingBox);
        this.#xDirection = location.xAxis.direction;
        this.#location = location;
        this.#tolerance = tolerance;
    }

    /**
     * Where the edge begins on the surface: the given location when the edge starts at the origin,
     * otherwise the end of a construction line wrapped from the origin to the edge's start.
     */
    startOf(planarEdge: Edge, options: WrapOptions): AxisIntersection {
        let startPoint = planarEdge.positionAt(0);
        if (startPoint.length <= this.#tolerance) {
            return [this.#location.position, this.#location.zAxis.direction];
        }
        let toStart = wrapEdgeOnSurface(
            this.#surface,
            makeLine(new Vector(), startPoint),
            this.#location,
            options,
        );
        let onSurface = toStart.positionAt(1);
        return [onSurface, this.#hit(onSurface, onSurface.sub(this.#center))[1]];
    }

    /** The point `offset` away from `from` in the surface frame there, back on the surface. */
    step(from: AxisIntersection, offset: Vector): AxisIntersection {
        let [point, normal] = from;
        let frame = new Plane({ origin: point, xDir: this.#xDirection, zDir: normal });
        let target = frame.fromLocalCoords(offset);
        return this.#hit(target, target.sub(this.#center));
    }

    /** Where the ray from `point` pierces the surface, with the normal there. */
    #hit(point: Vector, direction: Vector): AxisIntersection {
        let axis = new Axis(point, direction);
        let faces = this.#surface.facesIntersectedByAxis(axis).toSortedByDistance(point);
        let nearest = faces[0];
        let hits = nearest === undefined ? [] : nearest.findIntersectionPoints(axis);
        let closest = hits.reduce<AxisIntersection | undefined>(
            (best, hit) =>
                best === undefined || hit[0].sub(point).length < best[0].sub(point).length
                    ? hit
                    : best,
            undefined,
        );
        if (closest === undefined) {
            throw new GeometryError(
                "wrapping over surface boundary, try a different surface location",
            );
        }
        return closest;
    }
}
