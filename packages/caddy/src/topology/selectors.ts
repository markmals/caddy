/**
 * Predicates and sort keys behind `ShapeList#filter`, `#sort`/`#toSorted` and `#groupBy`, ported
 * from build123d's `ShapeList.filter_by`/`sort_by`/`group_by`.
 */

import { query } from "@roonieone/occt-native";

import type { Vector, VectorLike } from "../geometry/vector.ts";
import type { GroupKey } from "./group-by.ts";
import type { Shape } from "./shape.ts";

import { InvalidShapeError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { Plane } from "../geometry/plane.ts";
import { roundTo } from "../geometry/rounding.ts";
import { fromVec3, toVec3 } from "./conversions.ts";
import { GeomType, SortBy } from "./enums.ts";

/** Axis filters compare directions only, so the axis built from a shape sits at the origin. */
const AXIS_ORIGIN: readonly [number, number, number] = [0, 0, 0];

const GEOM_TYPES = new Set<string>(Object.values(GeomType));

/** What `ShapeList#filter` accepts besides a predicate. */
export type ShapeFilter = Axis | Plane | GeomType;

/** An edge or wire, along which shapes can be sorted by their closest position. */
export interface CurveLike {
    closestPoints(other: Shape | VectorLike): [Vector, Vector];
    paramAtPoint(point: VectorLike): number;
}

/** The predicate a filter stands for; `tolerance` is in degrees for axes and planes. */
export function filterPredicate(filter: ShapeFilter, tolerance: number): (shape: Shape) => boolean {
    if (filter instanceof Axis) {
        return shape => {
            let direction = shapeAxisDirection(shape);
            return (
                direction !== undefined &&
                filter.isParallel(new Axis(AXIS_ORIGIN, direction), tolerance)
            );
        };
    }
    if (filter instanceof Plane) {
        return shape => parallelToPlane(shape, filter, tolerance);
    }
    if (!GEOM_TYPES.has(filter)) {
        throw new InvalidShapeError(`Unsupported filter criterion: ${String(filter)}`);
    }
    return shape => shape.geomType === filter;
}

/** Normal of a planar face at its first uv corner. */
function planarFaceNormal(face: Shape): Vector | undefined {
    if (query.facePlane(face.wrapped) === undefined) {
        return undefined;
    }
    let bounds = query.uvBounds(face.wrapped);
    return fromVec3(query.faceNormal(face.wrapped, bounds.uMin, bounds.vMin).normal).normalized();
}

/** The direction an axis filter compares: a planar face's normal or a line's direction. */
function shapeAxisDirection(shape: Shape): Vector | undefined {
    if (shape.shapeType === "Face") {
        return planarFaceNormal(shape);
    }
    if (shape.shapeType === "Edge" && shape.geomType === GeomType.Line) {
        let first = query.curveInfo(shape.wrapped).first;
        return fromVec3(query.curveDerivative(shape.wrapped, first, 1)).normalized();
    }
    return undefined;
}

function parallelToPlane(shape: Shape, plane: Plane, tolerance: number): boolean {
    switch (shape.shapeType) {
        case "Face": {
            let normal = planarFaceNormal(shape);
            let planeAxis = new Axis(plane.origin, plane.zDir);
            return (
                normal !== undefined &&
                planeAxis.isParallel(new Axis(AXIS_ORIGIN, normal), tolerance)
            );
        }
        case "Wire":
            return shape.edges.every(edge => parallelToPlane(edge, plane, tolerance));
        case "Edge":
            return query.edgeIsPlanar(shape.wrapped, toVec3(plane.zDir), tolerance);
        default:
            return false;
    }
}

/** Position of a shape's centre along `axis` (build123d sorts by the local Z of the axis). */
export function axisPositionKey(axis: Axis): (shape: Shape) => number {
    let toAxis = axis.location.inverse().transform;
    return shape => toAxis.apply(shape.center).z;
}

/**
 * A measure as a sort key. Length and radius are `undefined` for shapes that have no such
 * property, which sorting drops and grouping rejects.
 */
export function measureKey(sortBy: SortBy): (shape: Shape) => number | undefined {
    switch (sortBy) {
        case SortBy.Length:
            return shape => measuredProperty(shape, "length");
        case SortBy.Radius:
            return shape => measuredProperty(shape, "radius");
        case SortBy.Area:
            return shape => shape.area;
        case SortBy.Volume:
            return shape => shape.volume;
        case SortBy.Distance:
            return shape => shape.center.length;
        default:
            throw new InvalidShapeError(`Unsupported sort criterion: ${String(sortBy)}`);
    }
}

function measuredProperty(shape: Shape, property: "length" | "radius"): number | undefined {
    if (!(property in shape)) {
        return undefined;
    }
    let value: unknown = (shape as unknown as Record<string, unknown>)[property];
    return typeof value === "number" ? value : undefined;
}

/** Normalized position along `curve` of the point closest to a shape's centre. */
export function curvePositionKey(curve: CurveLike): (shape: Shape) => number {
    return shape => {
        let [onCurve] = curve.closestPoints(shape.center);
        return curve.paramAtPoint(onCurve);
    };
}

/** A group key rounded as build123d rounds them: numbers to `digits` decimals. */
export function roundedKey(value: GroupKey | undefined, digits: number): GroupKey {
    if (value === undefined) {
        throw new InvalidShapeError("Cannot group a shape that lacks the grouping measure");
    }
    return typeof value === "number" ? roundTo(value, digits) : value;
}
