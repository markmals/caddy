// Geometric queries on existing shapes: curve and surface evaluation, projections, distances
// and point classification.

import type { Axis, Frame, Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { axisArray, vec3 } from "./types.ts";

/** OCCT GeomAbs_CurveType. */
export const CurveType = {
    Line: 0,
    Circle: 1,
    Ellipse: 2,
    Hyperbola: 3,
    Parabola: 4,
    BezierCurve: 5,
    BSplineCurve: 6,
    OffsetCurve: 7,
    OtherCurve: 8,
} as const;
export type CurveType = (typeof CurveType)[keyof typeof CurveType];

/** OCCT GeomAbs_SurfaceType. */
export const SurfaceType = {
    Plane: 0,
    Cylinder: 1,
    Cone: 2,
    Sphere: 3,
    Torus: 4,
    BezierSurface: 5,
    BSplineSurface: 6,
    SurfaceOfRevolution: 7,
    SurfaceOfExtrusion: 8,
    OffsetSurface: 9,
    OtherSurface: 10,
} as const;
export type SurfaceType = (typeof SurfaceType)[keyof typeof SurfaceType];

/** OCCT TopAbs_State. */
export const PointState = { In: 0, Out: 1, On: 2, Unknown: 3 } as const;
export type PointState = (typeof PointState)[keyof typeof PointState];

export interface CurveInfo {
    readonly first: number;
    readonly last: number;
    /** The period of a periodic curve, otherwise `undefined`. */
    readonly period: number | undefined;
    /** Arc length over the whole parameter range (GCPnts_AbscissaPoint::Length). */
    readonly length: number;
}

export interface Conic {
    readonly kind: "circle" | "ellipse";
    readonly center: Vec3;
    /** Circle radius, or the ellipse's major radius. */
    readonly radius: number;
    /** Circle radius, or the ellipse's minor radius. */
    readonly minorRadius: number;
    /** Direction of the curve's own axis, normal to its plane. */
    readonly axis: Vec3;
}

export interface UVBounds {
    readonly uMin: number;
    readonly uMax: number;
    readonly vMin: number;
    readonly vMax: number;
}

export interface Closest {
    readonly distance: number;
    readonly pointOnFirst: Vec3;
    readonly pointOnSecond: Vec3;
}

export interface Classification {
    readonly state: PointState;
    readonly onFace: boolean;
}

/** Principal curvatures of a surface at a parameter pair, against the surface's own normal. */
export interface SurfaceCurvature {
    /** Smallest principal curvature (negative where the surface bends away from `normal`). */
    readonly min: number;
    readonly max: number;
    /** Unit normal `D1U × D1V` at the sampled point. */
    readonly normal: Vec3;
}

/** A pair of closest points, one on each shape (one BRepExtrema_DistShapeShape solution). */
export interface ExtremaSolution {
    readonly onFirst: Vec3;
    readonly onSecond: Vec3;
}

interface QueryAddon {
    curveType(shape: Shape): number;
    curveInfo(shape: Shape): Float64Array;
    curveValue(shape: Shape, parameter: number): Float64Array;
    curveFrame(
        shape: Shape,
        parameter: number,
        corrected: boolean,
        xDirection: Float64Array,
    ): Float64Array;
    curveDerivative(shape: Shape, parameter: number, order: number): Float64Array;
    curveParameterAtLength(shape: Shape, abscissa: number, start: number): number;
    curveLengthBetween(shape: Shape, first: number, last: number): number;
    curveConic(shape: Shape): Float64Array;
    edgeRange(edge: Shape): Float64Array;
    vertexParameterOnEdge(vertex: Shape, edge: Shape): number;
    edgeIsPlanar(edge: Shape, normal: Float64Array, tolerance: number): boolean;
    projectPointOnEdge(edge: Shape, point: Float64Array): number;
    isClosed(shape: Shape): boolean;
    wireEdges(wire: Shape): Shape[];
    wireClosestEdge(wire: Shape, point: Float64Array): [Shape, number];
    surfaceType(face: Shape): number;
    uvBounds(face: Shape): Float64Array;
    faceNormal(face: Shape, u: number, v: number): Float64Array;
    projectPointOnFace(face: Shape, point: Float64Array): Float64Array;
    facePlane(face: Shape): Float64Array;
    outerWire(face: Shape): Shape;
    distance(first: Shape, second: Shape): Float64Array;
    distanceToPoint(shape: Shape, point: Float64Array): Float64Array;
    classifyPoint(shape: Shape, point: Float64Array, tolerance: number): Float64Array;
    fixShape(shape: Shape): Shape;
    facesIntersectedByAxis(shape: Shape, axis: Float64Array, tolerance: number): Shape[];
    surfaceCurvature(face: Shape, u: number, v: number): Float64Array;
    extremaSolutions(first: Shape, second: Shape, deflection: number): Float64Array;
    pcurveRange(edge: Shape, face: Shape): Float64Array;
    pcurveDerivative(edge: Shape, face: Shape, parameter: number): Float64Array;
    vertexParametersOnFace(vertex: Shape, face: Shape): Float64Array;
    classifyUV(face: Shape, u: number, v: number, tolerance: number): number;
    edgeIsReversedInFace(face: Shape, edge: Shape): boolean;
    isSeamEdge(edge: Shape, face: Shape): boolean;
}

function native(): QueryAddon {
    return addon<QueryAddon>();
}

function pointArray(point: Vec3): Float64Array {
    return Float64Array.of(point[0], point[1], point[2]);
}

/** Curve type of an edge or wire (a wire's composite curve is usually `OtherCurve`). */
export function curveType(shape: Shape): CurveType {
    return native().curveType(shape) as CurveType;
}

/** Parameter range, period and length of an edge's or wire's curve adaptor. */
export function curveInfo(shape: Shape): CurveInfo {
    let [first = Number.NaN, last = Number.NaN, period = Number.NaN, length = Number.NaN] =
        native().curveInfo(shape);
    return { first, last, period: Number.isNaN(period) ? undefined : period, length };
}

export function curveValue(shape: Shape, parameter: number): Vec3 {
    return vec3(native().curveValue(shape, parameter));
}

/** Frenet or corrected moving frame, returned as a row-major 3×4 placement matrix. */
export function curveFrame(
    shape: Shape,
    parameter: number,
    corrected = false,
    xDirection?: Vec3,
): readonly number[] {
    return Array.from(
        native().curveFrame(
            shape,
            parameter,
            corrected,
            xDirection === undefined ? new Float64Array() : pointArray(xDirection),
        ),
    );
}

/** The `order`-th derivative of an edge's or wire's curve at `parameter`. */
export function curveDerivative(shape: Shape, parameter: number, order: number): Vec3 {
    return vec3(native().curveDerivative(shape, parameter, order));
}

/** The curve parameter `abscissa` arc length away from parameter `start`. */
export function curveParameterAtLength(shape: Shape, abscissa: number, start: number): number {
    return native().curveParameterAtLength(shape, abscissa, start);
}

export function curveLengthBetween(shape: Shape, first: number, last: number): number {
    return native().curveLengthBetween(shape, first, last);
}

/** Centre, radii and axis of a circular or elliptical curve, otherwise `undefined`. */
export function curveConic(shape: Shape): Conic | undefined {
    let values = native().curveConic(shape);
    if (values.length === 0) return undefined;
    return {
        kind: values[0] === 1 ? "circle" : "ellipse",
        center: vec3(values, 1),
        radius: values[4] ?? Number.NaN,
        minorRadius: values[5] ?? Number.NaN,
        axis: vec3(values, 6),
    };
}

/** The edge's parameter range (BRep_Tool::Range). */
export function edgeRange(edge: Shape): readonly [first: number, last: number] {
    let [first = Number.NaN, last = Number.NaN] = native().edgeRange(edge);
    return [first, last];
}

export function vertexParameterOnEdge(vertex: Shape, edge: Shape): number {
    return native().vertexParameterOnEdge(vertex, edge);
}

/** Curve parameter of the closest projection of `point` onto the edge's 3D curve. */
export function projectPointOnEdge(edge: Shape, point: Vec3): number {
    return native().projectPointOnEdge(edge, pointArray(point));
}

/** Whether the edge's 3D curve lies in a plane with `normal`, within `tolerance`. */
export function edgeIsPlanar(edge: Shape, normal: Vec3, tolerance: number): boolean {
    return native().edgeIsPlanar(edge, pointArray(normal), tolerance);
}

/** BRep_Tool::IsClosed: closed edges/wires, and shells/solids without free edges. */
export function isClosed(shape: Shape): boolean {
    return native().isClosed(shape);
}

/** A wire's edges in connection order (BRepTools_WireExplorer). */
export function wireEdges(wire: Shape): Shape[] {
    return native().wireEdges(wire);
}

/** The wire edge closest to `point`, and the edge parameter of the closest point. */
export function wireClosestEdge(
    wire: Shape,
    point: Vec3,
): { readonly edge: Shape; readonly parameter: number } {
    let [edge, parameter] = native().wireClosestEdge(wire, pointArray(point));
    return { edge, parameter };
}

export function surfaceType(face: Shape): SurfaceType {
    return native().surfaceType(face) as SurfaceType;
}

export function uvBounds(face: Shape): UVBounds {
    let [uMin = Number.NaN, uMax = Number.NaN, vMin = Number.NaN, vMax = Number.NaN] =
        native().uvBounds(face);
    return { uMin, uMax, vMin, vMax };
}

/** Point and orientation-aware (not normalized) normal at surface parameters `(u, v)`. */
export function faceNormal(
    face: Shape,
    u: number,
    v: number,
): { readonly point: Vec3; readonly normal: Vec3 } {
    let values = native().faceNormal(face, u, v);
    return { point: vec3(values, 0), normal: vec3(values, 3) };
}

/** Surface parameters of the closest projection of `point` onto the face's surface. */
export function projectPointOnFace(face: Shape, point: Vec3): readonly [u: number, v: number] {
    let [u = Number.NaN, v = Number.NaN] = native().projectPointOnFace(face, pointArray(point));
    return [u, v];
}

/** The plane of a planar face (right-handed frame), or `undefined` when it is not planar. */
export function facePlane(face: Shape): Frame | undefined {
    let values = native().facePlane(face);
    if (values.length === 0) return undefined;
    return { origin: vec3(values, 0), zDirection: vec3(values, 3), xDirection: vec3(values, 6) };
}

/** The face's outer boundary (BRepTools::OuterWire). */
export function outerWire(face: Shape): Shape {
    return native().outerWire(face);
}

function closest(values: Float64Array): Closest {
    return {
        distance: values[0] ?? Number.NaN,
        pointOnFirst: vec3(values, 1),
        pointOnSecond: vec3(values, 4),
    };
}

/** Minimal distance between two shapes and the first pair of closest points. */
export function distance(first: Shape, second: Shape): Closest {
    return closest(native().distance(first, second));
}

/** Minimal distance from a shape to a point, with the closest points. */
export function distanceToPoint(shape: Shape, point: Vec3): Closest {
    return closest(native().distanceToPoint(shape, pointArray(point)));
}

/** Where `point` lies relative to a solid (or any shape) within `tolerance`. */
export function classifyPoint(shape: Shape, point: Vec3, tolerance: number): Classification {
    let [state = PointState.Unknown, onFace = 0] = native().classifyPoint(
        shape,
        pointArray(point),
        tolerance,
    );
    return { state: state as PointState, onFace: onFace === 1 };
}

/** Attempt OCCT ShapeFix_Shape repairs on a copy of `shape`. */
export function fixShape(shape: Shape): Shape {
    return native().fixShape(shape);
}

/** Faces pierced by an infinite axis, nearest hits first. */
export function facesIntersectedByAxis(shape: Shape, axis: Axis, tolerance = 1e-4): Shape[] {
    return native().facesIntersectedByAxis(shape, axisArray(axis), tolerance);
}

/**
 * Principal curvatures of the face's surface at `(u, v)`, or `undefined` where the surface is
 * degenerate there.
 */
export function surfaceCurvature(face: Shape, u: number, v: number): SurfaceCurvature | undefined {
    let values = native().surfaceCurvature(face, u, v);
    if (values[0] !== 1) {
        return undefined;
    }
    return {
        min: values[1] as number,
        max: values[2] as number,
        normal: vec3(values.subarray(3, 6)),
    };
}

/**
 * Every closest-point solution between two shapes. `deflection` is the precision the extrema
 * algorithm keeps solutions apart with.
 */
export function extremaSolutions(
    first: Shape,
    second: Shape,
    deflection: number,
): ExtremaSolution[] {
    let values = native().extremaSolutions(first, second, deflection);
    let solutions: ExtremaSolution[] = [];
    for (let offset = 0; offset < values.length; offset += 6) {
        solutions.push({
            onFirst: vec3(values.subarray(offset, offset + 3)),
            onSecond: vec3(values.subarray(offset + 3, offset + 6)),
        });
    }
    return solutions;
}

/** Parameter range of the edge's 2D curve in the face's parameter space. */
export function pcurveRange(edge: Shape, face: Shape): readonly [first: number, last: number] {
    let [first, last] = native().pcurveRange(edge, face);
    return [first as number, last as number];
}

/** Point and tangent of the edge's 2D curve on the face, in the face's parameter space. */
export function pcurveDerivative(
    edge: Shape,
    face: Shape,
    parameter: number,
): {
    readonly point: readonly [u: number, v: number];
    readonly tangent: readonly [number, number];
} {
    let [u, v, du, dv] = native().pcurveDerivative(edge, face, parameter);
    return { point: [u as number, v as number], tangent: [du as number, dv as number] };
}

/** The vertex's parameters on the face (BRep_Tool::Parameters). */
export function vertexParametersOnFace(
    vertex: Shape,
    face: Shape,
): readonly [u: number, v: number] {
    let [u, v] = native().vertexParametersOnFace(vertex, face);
    return [u as number, v as number];
}

/** Where a parameter-space point lies relative to the face's boundary (IntTools_FClass2d). */
export function classifyUV(face: Shape, u: number, v: number, tolerance: number): PointState {
    return native().classifyUV(face, u, v, tolerance) as PointState;
}

/** Whether the face's boundary runs along `edge` against the edge's own direction. */
export function edgeIsReversedInFace(face: Shape, edge: Shape): boolean {
    return native().edgeIsReversedInFace(face, edge);
}

/** Whether the face meets itself along `edge`, as a cylinder does at its seam. */
export function isSeamEdge(edge: Shape, face: Shape): boolean {
    return native().isSeamEdge(edge, face);
}
