import type * as occt from "@roonieone/occt-native";

import { construct, query, ShapeType, topology } from "@roonieone/occt-native";

import type { ArcOptions } from "../curves/edge-makers.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { CurvePosition } from "./mixin1d.ts";
import type { ShapeOptions } from "./shape.ts";
import type { Vertex } from "./vertex.ts";

import { makeConvexHull } from "../curves/convex-hull.ts";
import { chamferWire2D, filletWire2D } from "../curves/fillet-chamfer-2d.ts";
import {
    combineWires,
    makeWireCircle,
    makeWireEllipse,
    makeWirePolygon,
    makeWireRect,
} from "../curves/wire-makers.ts";
import { GeometryError, InvalidShapeError } from "../errors.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { toVec3 } from "./conversions.ts";
import { Edge } from "./edge.ts";
import { PositionMode } from "./enums.ts";
import { native } from "./kernel.ts";
import { Mixin1D } from "./mixin1d.ts";
import { registerShapeConstructor } from "./registry.ts";
import { ShapeList } from "./shape-list.ts";
import { Shape } from "./shape.ts";

/** build123d's `TOLERANCE`. */
const TOLERANCE = 1e-6;

/** Options of the {@link Wire} constructor. */
export interface WireOptions extends ShapeOptions {
    /** Order the edges end to start before joining them (slow for many edges). */
    readonly sequenced?: boolean;
}

/** Where a wire is built from: a native wire, a single 1D shape, or edges to join. */
export type WireSource = occt.Shape | Shape | Iterable<Edge>;

function isIterable(value: object): value is Iterable<Edge> {
    return Symbol.iterator in value;
}

/** A chain of connected edges (build123d `Wire`). */
export class Wire extends Mixin1D {
    static override readonly order: number = 1.5;

    /**
     * Wrap a native wire, rewrap a wire, or join an edge, a curve's edges, or a list of edges
     * into a wire (BRepBuilderAPI_MakeWire).
     */
    constructor(source: WireSource, options: WireOptions = {}) {
        super(wireOf(source, options.sequenced ?? false), options);
    }

    /** The edges in connection order (BRepTools_WireExplorer). */
    override edges(): ShapeList<Edge> {
        let edges = query.wireEdges(this.wrapped).map(wrapped => new Edge(wrapped));
        for (let edge of edges) {
            edge.topoPath = [...this.topoPath, this];
        }
        return new ShapeList(edges);
    }

    /** Radius of the first edge's circle. */
    get radius(): number {
        return this.edges().first.radius;
    }

    curvePosition(position: number, mode: PositionMode = PositionMode.Parameter): CurvePosition {
        let forward = this.isForward;
        let distance =
            mode === PositionMode.Parameter
                ? (forward ? position : 1 - position) * this.length
                : forward
                  ? position
                  : this.length - position;

        let edges = this.edges();
        let lengths = edges.map(edge => edge.length);
        let cumulative: number[] = [];
        let total = 0;
        for (let length of lengths) {
            total += length;
            cumulative.push(total);
        }

        let index: number;
        let local: number;
        if (distance <= 0) {
            index = 0;
            local = 0;
        } else if (distance >= total) {
            index = edges.length - 1;
            local = lengths[index] ?? 0;
        } else {
            index = cumulative.findIndex(sum => sum > distance);
            local = distance - (index > 0 ? (cumulative[index - 1] ?? 0) : 0);
        }

        let target = edges.at(index);
        if (target === undefined) {
            throw new InvalidShapeError("A wire without edges has no positions");
        }
        let targetLength = lengths[index] ?? 0;
        let fraction = targetLength === 0 ? 0 : local / targetLength;

        let targetForward = target.isForward;
        if (!targetForward) {
            fraction = 1 - fraction;
        }
        return { edge: target, parameter: target.paramAt(fraction), forward: targetForward };
    }

    /** OCCT BRepAdaptor_CompCurve parameter at a normalized arc-length position. */
    paramAt(position: number): number {
        let info = query.curveInfo(this.wrapped);
        return query.curveParameterAtLength(this.wrapped, info.length * position, info.first);
    }

    /**
     * Normalized position along the whole wire (0 start, 1 end) of a point on it (build123d
     * `Wire.param_at_point`).
     */
    paramAtPoint(point: VectorLike): number {
        let target = Vector.from(point);
        let separation = this.distanceTo(target);
        if (Math.abs(separation) > TOLERANCE) {
            throw new GeometryError(
                `point (${target.toTuple().join(", ")}) is ${separation} from wire`,
            );
        }
        let closest = query.wireClosestEdge(this.wrapped, toVec3(target));
        let [first, last] = query.edgeRange(closest.edge);
        let parameter = closest.parameter;
        let period = query.curveInfo(closest.edge).period;
        if (period !== undefined) {
            let offset = (parameter - first) % period;
            parameter = (offset < 0 ? offset + period : offset) + first;
        }
        let closestEdge = new Edge(closest.edge);
        let [from, to] = closestEdge.isForward ? [first, parameter] : [parameter, last];
        let distance = query.curveLengthBetween(closest.edge, from, to);

        for (let wrapped of query.wireEdges(this.wrapped)) {
            if (topology.isDegeneratedEdge(wrapped)) {
                continue;
            }
            if (new Edge(wrapped).isEqual(closestEdge)) {
                break;
            }
            distance += query.curveInfo(wrapped).length;
        }
        return distance / this.length;
    }

    /** A circle on `plane` as a one-edge wire. */
    static makeCircle(radius: number, plane?: Plane): Wire {
        return makeWireCircle(radius, plane);
    }

    /** An ellipse on `plane`; an arc is closed with a chord unless `closed` is false. */
    static makeEllipse(
        xRadius: number,
        yRadius: number,
        options?: ArcOptions & { readonly closed?: boolean },
    ): Wire {
        return makeWireEllipse(xRadius, yRadius, options);
    }

    /** Straight segments through the points, closed back to the first unless told not to. */
    static makePolygon(points: readonly VectorLike[], close = true): Wire {
        return makeWirePolygon(points, close);
    }

    /** A rectangle centred on the plane's origin. */
    static makeRect(width: number, height: number, plane?: Plane): Wire {
        return makeWireRect(width, height, plane);
    }

    /** Chains loose edges and wires into as many connected wires as they form. */
    static combine(parts: Iterable<Edge | Wire>, tolerance?: number): ShapeList<Wire> {
        return new ShapeList(combineWires(parts, tolerance));
    }

    /** The shortest wire enclosing every edge, in the XY plane. */
    static makeConvexHull(edges: Iterable<Edge>, tolerance?: number): Wire {
        return makeConvexHull(edges, tolerance);
    }

    /** Rounds the listed corners of this closed planar wire. */
    fillet2D(radius: number, vertices: Iterable<Vertex>): Wire {
        return filletWire2D(this, radius, vertices);
    }

    /** Cuts the listed corners of this closed planar wire. */
    chamfer2D(
        distance: number,
        distance2: number,
        vertices: Iterable<Vertex>,
        reference?: Edge,
    ): Wire {
        return chamferWire2D(this, distance, distance2, vertices, reference);
    }
}

/** The native wire a {@link WireSource} stands for. */
function wireOf(source: WireSource, sequenced: boolean): occt.Shape {
    if (source instanceof Wire) {
        return source.wrapped;
    }
    if (source instanceof Edge) {
        return joinEdges([source], false);
    }
    if (source instanceof Shape) {
        return joinEdges(source.edges(), sequenced);
    }
    if (isIterable(source)) {
        return joinEdges([...source], sequenced);
    }
    return source;
}

/** build123d `Wire._make_wire`. */
function joinEdges(edges: readonly Edge[], sequenced: boolean): occt.Shape {
    if (edges.length === 0) {
        throw new InvalidShapeError("Wire is empty");
    }
    let ordered = sequenced ? sequence(edges) : edges;
    return native("Wire construction", () => construct.makeWire(ordered.map(edge => edge.wrapped)));
}

/** Each next edge is the unplaced one whose nearer end is closest to the end of the chain. */
function sequence(edges: readonly Edge[]): Edge[] {
    let [start, ...unplaced] = edges;
    if (start === undefined) {
        return [];
    }
    let placed = [start];
    while (unplaced.length > 0) {
        let end = new Wire(placed).positionAt(1);
        let gap = (edge: Edge): number =>
            Math.min(end.sub(edge.positionAt(0)).length, end.sub(edge.positionAt(1)).length);
        let nextIndex = 0;
        unplaced.forEach((edge, index) => {
            let current = unplaced[nextIndex];
            if (current !== undefined && gap(edge) < gap(current)) {
                nextIndex = index;
            }
        });
        placed.push(...unplaced.splice(nextIndex, 1));
    }
    return placed;
}

registerShapeConstructor(ShapeType.Wire, wrapped => new Wire(wrapped));
