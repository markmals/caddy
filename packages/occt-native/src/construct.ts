// Construction of vertices, edges, wires and faces, and the 2D operations that reshape planar
// faces. Angles are in radians.

import type { Recorded } from "./history.ts";
import type { Frame, Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { frameArray } from "./types.ts";

/** Corner transition of a 2D offset (OCCT GeomAbs_JoinType). */
export type JoinType = "arc" | "tangent" | "intersection";

export interface SplineOptions {
    /** Either two end tangents, or one per point. */
    readonly tangents?: readonly Vec3[];
    /** Disables individual tangents; defaults to all enabled. */
    readonly tangentFlags?: readonly boolean[];
    /** Curve parameter at each point (one more than the points when periodic). */
    readonly parameters?: readonly number[];
    readonly periodic?: boolean;
    /** Scale each tangent to the derivative of the interpolated curve. */
    readonly scale?: boolean;
    readonly tolerance?: number;
}

export interface SplineApproxOptions {
    readonly tolerance?: number;
    /** Three variational smoothing weights; omitted for a plain approximation. */
    readonly smoothing?: readonly [number, number, number];
    readonly minDegree?: number;
    readonly maxDegree?: number;
}

export interface BsplineOptions {
    readonly weights?: readonly number[];
    readonly periodic?: boolean;
}

export interface HelixOptions {
    readonly pitch: number;
    readonly height: number;
    readonly radius: number;
    readonly center?: Vec3;
    readonly normal?: Vec3;
    /** Half-angle of the cone the helix wraps; zero gives a cylindrical helix. */
    readonly coneAngle?: number;
    readonly leftHand?: boolean;
}

interface ConstructAddon {
    makeVertex(point: Float64Array): Shape;
    makeAxisEdge(axis: Float64Array): Shape;
    makeLineEdge(start: Float64Array, end: Float64Array): Shape;
    makeCircleEdge(
        frame: Float64Array,
        radius: number,
        startAngle: number,
        endAngle: number,
        counterClockwise: boolean,
    ): Shape;
    makeEllipseEdge(
        frame: Float64Array,
        xRadius: number,
        yRadius: number,
        startAngle: number,
        endAngle: number,
        counterClockwise: boolean,
    ): Shape;
    makeParabolaEdge(
        frame: Float64Array,
        focalLength: number,
        startAngle: number,
        endAngle: number,
        counterClockwise: boolean,
    ): Shape;
    makeHyperbolaEdge(
        frame: Float64Array,
        xRadius: number,
        yRadius: number,
        startAngle: number,
        endAngle: number,
        counterClockwise: boolean,
    ): Shape;
    constrainedArcs2TanRad(
        edges: readonly Shape[],
        qualifiers: Float64Array,
        points: Float64Array,
        radius: number,
    ): Shape[][];
    constrainedArcs2TanOn(
        edges: readonly Shape[],
        qualifiers: Float64Array,
        points: Float64Array,
        centerOn: Shape,
    ): Shape[][];
    constrainedArcs3Tan(edges: readonly Shape[], qualifiers: Float64Array): Shape[][];
    constrainedCirclesTanCen(
        edges: readonly Shape[],
        qualifiers: Float64Array,
        points: Float64Array,
        center: Float64Array,
    ): Shape[];
    constrainedCirclesTanOnRad(
        edges: readonly Shape[],
        qualifiers: Float64Array,
        points: Float64Array,
        centerOn: Shape,
        radius: number,
    ): Shape[];
    constrainedLines2Tan(
        edges: readonly Shape[],
        qualifiers: Float64Array,
        points: Float64Array,
    ): Shape[];
    constrainedLinesTanOblique(
        edges: readonly Shape[],
        qualifiers: Float64Array,
        reference: Float64Array,
        angle: number,
    ): Shape[];
    makeThreePointArc(start: Float64Array, middle: Float64Array, end: Float64Array): Shape;
    makeTangentArc(start: Float64Array, tangent: Float64Array, end: Float64Array): Shape;
    makeSplineEdge(
        points: Float64Array,
        tangents: Float64Array,
        tangentFlags: Float64Array,
        parameters: Float64Array,
        periodic: boolean,
        scale: boolean,
        tolerance: number,
    ): Shape;
    makeSplineApproxEdge(
        points: Float64Array,
        tolerance: number,
        smoothing: Float64Array,
        minDegree: number,
        maxDegree: number,
    ): Shape;
    makeBezierEdge(points: Float64Array, weights: Float64Array): Shape;
    makeBsplineEdge(
        points: Float64Array,
        knots: Float64Array,
        degree: number,
        weights: Float64Array,
        periodic: boolean,
    ): Shape;
    makeHelixEdge(
        pitch: number,
        height: number,
        radius: number,
        center: Float64Array,
        normal: Float64Array,
        coneAngle: number,
        leftHand: boolean,
    ): Shape;
    trimEdgeByParam(edge: Shape, first: number, last: number): Shape;
    reverseEdgeCurve(edge: Shape, first: number, last: number): Shape;
    makePolygonWire(points: Float64Array, close: boolean): Shape;
    makeWire(edges: readonly Shape[]): Shape;
    connectEdgesToWires(edges: readonly Shape[], tolerance: number): Shape[];
    makeFace(outer: Shape, inner: readonly Shape[]): Shape;
    makeRectFace(frame: Float64Array, width: number, height: number): Shape;
    makeSurfaceFace(
        edges: readonly Shape[],
        surfacePoints: Float64Array,
        interiorWires: readonly Shape[],
    ): Shape;
    filletFace2d(face: Shape, vertices: readonly Shape[], radius: number): Recorded;
    chamferFace2d(
        face: Shape,
        firstEdges: readonly Shape[],
        secondEdges: readonly Shape[],
        distance: number,
        distance2: number,
    ): Recorded;
    offsetWire2d(wire: Shape, distance: number, kind: JoinType, openResult: boolean): Shape;
    stitchWires(first: Shape, second: Shape): Shape;
    fixWireframe(shape: Shape, precision: number, maxTolerance: number): Shape;
    makePlaneFace(frame: Float64Array): Shape;
    sewFaces(faces: readonly Shape[]): Shape;
    makeSolidFromShell(shell: Shape): Shape;
}

function native(): ConstructAddon {
    return addon<ConstructAddon>();
}

function coordinates(points: readonly Vec3[]): Float64Array {
    let flat = new Float64Array(points.length * 3);
    points.forEach((point, index) => flat.set(point, index * 3));
    return flat;
}

function numbers(values: readonly number[] | undefined): Float64Array {
    return Float64Array.from(values ?? []);
}

export function makeVertex(point: Vec3): Shape {
    return native().makeVertex(Float64Array.from(point));
}

/** The unbounded line along `axis`, given as `[ox, oy, oz, dx, dy, dz]`. */
export function makeAxisEdge(axis: readonly number[]): Shape {
    return native().makeAxisEdge(Float64Array.from(axis));
}

export function makeLineEdge(start: Vec3, end: Vec3): Shape {
    return native().makeLineEdge(Float64Array.from(start), Float64Array.from(end));
}

/**
 * Circle or circular arc centred on the frame's origin. Equal start and end angles give the full
 * circle; otherwise the arc is swept from `startAngle` to `endAngle`, reversed when not
 * counter-clockwise.
 */
export function makeCircleEdge(
    frame: Frame,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterClockwise: boolean,
): Shape {
    return native().makeCircleEdge(
        frameArray(frame),
        radius,
        startAngle,
        endAngle,
        counterClockwise,
    );
}

/** Ellipse or elliptical arc; the radii may be given in either order. */
export function makeEllipseEdge(
    frame: Frame,
    xRadius: number,
    yRadius: number,
    startAngle: number,
    endAngle: number,
    counterClockwise: boolean,
): Shape {
    return native().makeEllipseEdge(
        frameArray(frame),
        xRadius,
        yRadius,
        startAngle,
        endAngle,
        counterClockwise,
    );
}

/** Parabolic arc with its vertex at the frame's origin, opening along the frame's X axis. */
export function makeParabolaEdge(
    frame: Frame,
    focalLength: number,
    startAngle: number,
    endAngle: number,
    counterClockwise: boolean,
): Shape {
    return native().makeParabolaEdge(
        frameArray(frame),
        focalLength,
        startAngle,
        endAngle,
        counterClockwise,
    );
}

/** Hyperbolic arc centred on the frame's origin; the radii may be given in either order. */
export function makeHyperbolaEdge(
    frame: Frame,
    xRadius: number,
    yRadius: number,
    startAngle: number,
    endAngle: number,
    counterClockwise: boolean,
): Shape {
    return native().makeHyperbolaEdge(
        frameArray(frame),
        xRadius,
        yRadius,
        startAngle,
        endAngle,
        counterClockwise,
    );
}

/**
 * Tangency targets of the 2D constraint solvers: planar edges to touch, each with a qualifier
 * (0 unqualified, 1 enclosing, 2 enclosed, 3 outside), and points to pass through. Edges always
 * come before points, matching the order the solvers expect.
 */
export interface TangencyTargets {
    readonly edges: readonly Shape[];
    readonly qualifiers: readonly number[];
    /** Flat `[x, y, ...]` coordinates of the point targets. */
    readonly points: readonly number[];
}

function targetArgs(targets: TangencyTargets): [readonly Shape[], Float64Array, Float64Array] {
    return [
        targets.edges,
        Float64Array.from(targets.qualifiers),
        Float64Array.from(targets.points),
    ];
}

/**
 * Arcs of `radius` tangent to two targets. Each solution is returned as its `[minor, major]` arc
 * pair between the two contact points.
 */
export function constrainedArcs2TanRad(targets: TangencyTargets, radius: number): Shape[][] {
    return native().constrainedArcs2TanRad(...targetArgs(targets), radius);
}

/** Arcs tangent to two targets whose centre lies on `centerOn`, as `[minor, major]` pairs. */
export function constrainedArcs2TanOn(targets: TangencyTargets, centerOn: Shape): Shape[][] {
    return native().constrainedArcs2TanOn(...targetArgs(targets), centerOn);
}

/**
 * Arcs tangent to three curves, as `[minor, major]` pairs running between the contacts on the
 * first two curves.
 */
export function constrainedArcs3Tan(targets: TangencyTargets): Shape[][] {
    return native().constrainedArcs3Tan(targets.edges, Float64Array.from(targets.qualifiers));
}

/** Closed circles centred on `center` and tangent to a single target. */
export function constrainedCirclesTanCen(
    targets: TangencyTargets,
    center: readonly [number, number],
): Shape[] {
    return native().constrainedCirclesTanCen(...targetArgs(targets), Float64Array.from(center));
}

/** Closed circles of `radius` tangent to a single target with their centre on `centerOn`. */
export function constrainedCirclesTanOnRad(
    targets: TangencyTargets,
    centerOn: Shape,
    radius: number,
): Shape[] {
    return native().constrainedCirclesTanOnRad(...targetArgs(targets), centerOn, radius);
}

/** Lines tangent to a curve and to a second curve or through a point, trimmed between contacts. */
export function constrainedLines2Tan(targets: TangencyTargets): Shape[] {
    return native().constrainedLines2Tan(...targetArgs(targets));
}

/**
 * Lines tangent to a curve at `angle` radians from the reference line `[x, y, dx, dy]`, trimmed
 * between the contact point and the reference line.
 */
export function constrainedLinesTanOblique(
    targets: TangencyTargets,
    reference: readonly [number, number, number, number],
    angle: number,
): Shape[] {
    return native().constrainedLinesTanOblique(
        targets.edges,
        Float64Array.from(targets.qualifiers),
        Float64Array.from(reference),
        angle,
    );
}

export function makeThreePointArc(start: Vec3, middle: Vec3, end: Vec3): Shape {
    return native().makeThreePointArc(
        Float64Array.from(start),
        Float64Array.from(middle),
        Float64Array.from(end),
    );
}

export function makeTangentArc(start: Vec3, tangent: Vec3, end: Vec3): Shape {
    return native().makeTangentArc(
        Float64Array.from(start),
        Float64Array.from(tangent),
        Float64Array.from(end),
    );
}

/** Interpolating B-spline through every point. */
export function makeSplineEdge(points: readonly Vec3[], options: SplineOptions = {}): Shape {
    return native().makeSplineEdge(
        coordinates(points),
        coordinates(options.tangents ?? []),
        Float64Array.from(options.tangentFlags ?? [], flag => (flag ? 1 : 0)),
        numbers(options.parameters),
        options.periodic ?? false,
        options.scale ?? true,
        options.tolerance ?? 1e-6,
    );
}

/** Approximating B-spline near the points, within `tolerance`. */
export function makeSplineApproxEdge(
    points: readonly Vec3[],
    options: SplineApproxOptions = {},
): Shape {
    return native().makeSplineApproxEdge(
        coordinates(points),
        options.tolerance ?? 1e-3,
        numbers(options.smoothing),
        options.minDegree ?? 1,
        options.maxDegree ?? 6,
    );
}

/** Bezier curve through its control points, rational when weights are given. */
export function makeBezierEdge(points: readonly Vec3[], weights?: readonly number[]): Shape {
    return native().makeBezierEdge(coordinates(points), numbers(weights));
}

/** Exact B-spline from control points and a knot sequence (repeats become multiplicities). */
export function makeBsplineEdge(
    points: readonly Vec3[],
    knots: readonly number[],
    degree: number,
    options: BsplineOptions = {},
): Shape {
    return native().makeBsplineEdge(
        coordinates(points),
        numbers(knots),
        degree,
        numbers(options.weights),
        options.periodic ?? false,
    );
}

export function makeHelixEdge(options: HelixOptions): Shape {
    return native().makeHelixEdge(
        options.pitch,
        options.height,
        options.radius,
        Float64Array.from(options.center ?? [0, 0, 0]),
        Float64Array.from(options.normal ?? [0, 0, 1]),
        options.coneAngle ?? 0,
        options.leftHand ?? false,
    );
}

/** The part of an edge between two curve parameters. */
export function trimEdgeByParam(edge: Shape, first: number, last: number): Shape {
    return native().trimEdgeByParam(edge, first, last);
}

/** The same edge geometry running the other way, rebuilt rather than only flagged reversed. */
export function reverseEdgeCurve(edge: Shape, first: number, last: number): Shape {
    return native().reverseEdgeCurve(edge, first, last);
}

export function makePolygonWire(points: readonly Vec3[], close: boolean): Shape {
    return native().makePolygonWire(coordinates(points), close);
}

export function makeWire(edges: readonly Shape[]): Shape {
    return native().makeWire(edges);
}

/** Chains edges into as many connected wires as they form. */
export function connectEdgesToWires(edges: readonly Shape[], tolerance = 1e-9): Shape[] {
    return native().connectEdgesToWires(edges, tolerance);
}

/** Planar face bounded by `outer`, with `inner` wires as holes. */
export function makeFace(outer: Shape, inner: readonly Shape[] = []): Shape {
    return native().makeFace(outer, inner);
}

/** Rectangular patch of `plane`, centred on its origin: `width` along X, `height` along Y. */
export function makeRectFace(plane: Frame, width: number, height: number): Shape {
    return native().makeRectFace(frameArray(plane), width, height);
}

/** Possibly non-planar face filling `edges`, pulled towards `surfacePoints`. */
export function makeSurfaceFace(
    edges: readonly Shape[],
    surfacePoints: readonly Vec3[] = [],
    interiorWires: readonly Shape[] = [],
): Shape {
    return native().makeSurfaceFace(edges, coordinates(surfacePoints), interiorWires);
}

/** Rounds the listed corners of a planar face, with the record of what it did to its sub-shapes. */
export function filletFace2d(face: Shape, vertices: readonly Shape[], radius: number): Recorded {
    return native().filletFace2d(face, vertices, radius);
}

/**
 * Cuts the corners of a planar face between paired edges: `distance` back along each edge of
 * `firstEdges` and `distance2` along the matching edge of `secondEdges`. Comes with the record of
 * what the cut did to the face's sub-shapes.
 */
export function chamferFace2d(
    face: Shape,
    firstEdges: readonly Shape[],
    secondEdges: readonly Shape[],
    distance: number,
    distance2: number,
): Recorded {
    return native().chamferFace2d(face, firstEdges, secondEdges, distance, distance2);
}

/** Offsets a planar wire; the result is a wire, or a compound of them. */
export function offsetWire2d(
    wire: Shape,
    distance: number,
    kind: JoinType = "arc",
    openResult = false,
): Shape {
    return native().offsetWire2d(wire, distance, kind, openResult);
}

/** The unbounded planar face of `plane`. */
export function makePlaneFace(plane: Frame): Shape {
    return native().makePlaneFace(frameArray(plane));
}

/** Sews faces along their shared edges; a shell when they all connect. */
export function sewFaces(faces: readonly Shape[]): Shape {
    return native().sewFaces(faces);
}

/** The solid bounded by `shell`, with its faces oriented outwards. */
export function makeSolidFromShell(shell: Shape): Shape {
    return native().makeSolidFromShell(shell);
}

/** A wire holding the edges of both wires; they must meet at a shared end. */
export function stitchWires(first: Shape, second: Shape): Shape {
    return native().stitchWires(first, second);
}

/** Drops edges shorter than `precision` from a wire and closes the gaps they leave. */
export function fixWireframe(shape: Shape, precision: number, maxTolerance = 1e-6): Shape {
    return native().fixWireframe(shape, precision, maxTolerance);
}
