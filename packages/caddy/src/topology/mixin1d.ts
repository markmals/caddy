import type * as occt from "@roonieone/occt-native";

import {
    construct,
    isOcctError,
    measure,
    Orientation,
    query,
    shapes,
    surfaces,
} from "@roonieone/occt-native";

import type { Offset2DOptions } from "../curves/offset-2d.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { ProjectToShapeOptions } from "../operations/project-to-shape.ts";
import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { IntersectOptions, ShapeOperand } from "./shape.ts";
import type { Wire } from "./wire.ts";

import { offset2D } from "../curves/offset-2d.ts";
import { GeometryError, InvalidShapeError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Location } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import {
    projectEdgeToShape,
    projectLineOntoFace,
    projectWireToShape,
} from "../operations/project-to-shape.ts";
import { booleanPieces, expandShapes } from "./boolean.ts";
import { commonPlane } from "./common-plane.ts";
import { fromVec3, locationFromMatrix, toVec3 } from "./conversions.ts";
import { connectedFaces, dihedralConvexity } from "./convexity.ts";
import { CenterOf, Convexity, FrameMethod, PositionMode } from "./enums.ts";
import { native } from "./kernel.ts";
import { nativeDimension, topLevelNativeShapes } from "./native-topology.ts";
import { castShape } from "./registry.ts";
import { madeBy, recordOf } from "./shape-history.ts";
import { ShapeList } from "./shape-list.ts";
import { Shape } from "./shape.ts";
import { joinRecord } from "./wire-record.ts";

/** build123d's `TOLERANCE`: how far a line may deviate from a shared plane. */
const COMMON_PLANE_TOLERANCE = 1e-6;

/** Options of {@link Mixin1D#locationAt}. */
export interface LocationAtOptions {
    /** How the frame is built; defaults to {@link FrameMethod.Frenet}. */
    readonly frameMethod?: FrameMethod;
    /** Direction the frame's X axis aims at, instead of the curve's natural normal. */
    readonly xDir?: VectorLike;
}

/** Options of {@link Mixin1D#commonPlane}. */
export interface CommonPlaneOptions {
    /** How far the lines may deviate from the plane; defaults to 1e-6. */
    readonly tolerance?: number;
}

/** Options of {@link Mixin1D#curvatureComb}. */
export interface CurvatureCombOptions {
    /** How many points along the curve are sampled; defaults to 100. */
    readonly count?: number;
    /** Length of the tooth at the sharpest sample; defaults to a tenth of the curve's extent. */
    readonly maxToothSize?: number;
}

/** Where a position along an edge or wire lands: an edge, its curve parameter and direction. */
export interface CurvePosition {
    /** The edge (for an edge, the edge itself) whose curve holds the position. */
    readonly edge: Shape;
    /** The OCCT parameter on that edge's curve. */
    readonly parameter: number;
    /** Whether that edge runs forward. */
    readonly forward: boolean;
}

/**
 * Shared behaviour of edges and wires (build123d `Mixin1D`): length, centres, and positions,
 * tangents and derivatives along the curve.
 */
export abstract class Mixin1D extends Shape {
    get dimension(): number {
        return 1;
    }

    /** One-dimensional shapes enclose no volume. */
    get volume(): number {
        return 0;
    }

    /** Whether the start and end points coincide. */
    get isClosed(): boolean {
        return query.isClosed(this.wrapped);
    }

    /** Whether the shape runs along its curve (forward orientation) rather than against it. */
    get isForward(): boolean {
        return shapes.orientation(this.wrapped) === Orientation.Forward;
    }

    /**
     * How the shape this edge was selected from sits around it (build123d `Mixin1D.convexity`):
     * the dihedral angle of the crease between the two faces meeting along it, sampled over its
     * length. A seam edge, with the same face on both sides, is `Smooth`.
     */
    override get convexity(): Convexity {
        let faces = connectedFaces(this);
        if (faces.length === 1) {
            let seam = native("Seam check", () =>
                query.isSeamEdge(this.wrapped, faces[0]!.wrapped),
            );
            if (seam) return Convexity.Smooth;
            throw new InvalidShapeError(
                "This edge lies on one face only, so there is no crease to classify - convexity needs an edge shared by two faces",
            );
        }
        if (faces.length !== 2) {
            throw new InvalidShapeError(
                `${faces.length} faces meet at this edge - convexity needs exactly two`,
            );
        }
        return dihedralConvexity(this as unknown as Edge, faces[0]!, faces[1]!);
    }

    /**
     * The plane containing this shape and every line given, or `undefined` when they do not
     * share one (build123d `Mixin1D.common_plane`). Coaxial lines lie in infinitely many
     * planes; one of them is returned.
     */
    commonPlane(
        ...args: [...lines: (Mixin1D | undefined)[], options: CommonPlaneOptions]
    ): Plane | undefined;
    commonPlane(...lines: (Mixin1D | undefined)[]): Plane | undefined;
    commonPlane(...args: (Mixin1D | undefined | CommonPlaneOptions)[]): Plane | undefined {
        let last = args.at(-1);
        let options =
            last === undefined || last instanceof Shape ? undefined : (last as CommonPlaneOptions);
        let lines = (options === undefined ? args : args.slice(0, -1)) as (Mixin1D | undefined)[];
        return commonPlane(
            [this, ...lines].filter(line => line !== undefined),
            options?.tolerance ?? COMMON_PLANE_TOLERANCE,
        );
    }

    /** Whether this is a concave edge of the shape it was selected from. */
    get isInterior(): boolean {
        return this.convexity === Convexity.Concave;
    }

    get length(): number {
        return native("Length", () => measure.massProperties(this.wrapped, "linear").mass);
    }

    /**
     * Radius of the underlying circle; for a wire, the radius of its first edge (build123d puts
     * `radius` on `Mixin1D`).
     */
    get radius(): number {
        if (this.shapeType === "Wire") {
            return this.edges().first.radius;
        }
        let conic = query.curveConic(this.wrapped);
        if (conic?.kind !== "circle") {
            throw new InvalidShapeError("Shape could not be reduced to a circle");
        }
        return conic.radius;
    }

    /**
     * The normal of the plane this line lies in (build123d `Mixin1D.normal`): the axis direction
     * of a circle or an ellipse, otherwise the normal of the plane OCCT fits to the curve.
     */
    normal(): Vector {
        let conic = query.curveConic(this.wrapped);
        if (conic !== undefined) {
            return fromVec3(conic.axis);
        }
        let normal = native("Normal", () => surfaces.shapePlaneNormal(this.wrapped));
        if (normal === undefined) {
            throw new GeometryError("Normal not defined");
        }
        return fromVec3(normal);
    }

    /** Map a position along the shape to an edge and its OCCT curve parameter. */
    abstract curvePosition(position: number, mode?: PositionMode): CurvePosition;

    /** Normalized position (0 at the start, 1 at the end) of a point lying on the shape. */
    abstract paramAtPoint(point: VectorLike): number;

    /**
     * Centre by `centerOf`: the midpoint along the curve (`Geometry`, the default), the centre
     * of mass, or the bounding box centre.
     */
    center(centerOf: CenterOf = CenterOf.Geometry): Vector {
        if (centerOf === CenterOf.Geometry) {
            return this.positionAt(0.5);
        }
        if (centerOf === CenterOf.Mass) {
            let properties = native("Center of mass", () =>
                measure.massProperties(this.wrapped, "linear"),
            );
            return fromVec3(properties.centerOfMass);
        }
        return this.boundingBox().center();
    }

    /**
     * The point at `position`: a normalized parameter (0 start, 1 end) or, with
     * `PositionMode.Length`, a distance along the shape (build123d `@`).
     */
    positionAt(position: number, mode: PositionMode = PositionMode.Parameter): Vector {
        let { edge, parameter } = this.curvePosition(position, mode);
        return fromVec3(query.curveValue(edge.wrapped, parameter));
    }

    /** Points at each of `positions`. */
    positions(positions: Iterable<number>, mode: PositionMode = PositionMode.Parameter): Vector[] {
        return Array.from(positions, position => this.positionAt(position, mode));
    }

    /** Unit tangent at a position or at a point on the shape, in the shape's direction (`%`). */
    tangentAt(
        position: number | VectorLike = 0.5,
        mode: PositionMode = PositionMode.Parameter,
    ): Vector {
        return this.derivativeAt(position, 1, mode).normalized();
    }
    /** Frenet or corrected moving frame at a curve position. */
    locationAt(
        distance: number,
        positionMode: PositionMode = PositionMode.Parameter,
        options: LocationAtOptions = {},
    ): Location {
        let frameMethod = options.frameMethod ?? FrameMethod.Frenet;
        let xDir = options.xDir;
        let reverseDistance = this.isForward
            ? distance
            : positionMode === PositionMode.Parameter
              ? 1 - distance
              : this.length - distance;
        let correctedWire = frameMethod === FrameMethod.Corrected && this.shapeType === "Wire";
        let position = this.curvePosition(distance, positionMode);
        let parameter = correctedWire
            ? // `correctedWire` checked shapeType, so this is a Wire.
              (this as unknown as Wire).paramAt(reverseDistance / this.length)
            : position.parameter;
        let wrapped = correctedWire ? this.wrapped : position.edge.wrapped;
        let matrix = native("Curve location", () =>
            query.curveFrame(
                wrapped,
                parameter,
                frameMethod === FrameMethod.Corrected,
                xDir === undefined ? undefined : toVec3(Vector.from(xDir)),
            ),
        );
        let location = locationFromMatrix(matrix);
        return this.isForward ? location : location.negate();
    }

    /** Locations at each of `distances`, each one as {@link locationAt} builds it. */
    locations(
        distances: Iterable<number>,
        mode: PositionMode = PositionMode.Parameter,
        options: LocationAtOptions = {},
    ): Location[] {
        return Array.from(distances, distance => this.locationAt(distance, mode, options));
    }

    /**
     * The angle of the tangent at `position`, measured in `plane` from its X direction and
     * wrapped into [0, 360) degrees (build123d `tangent_angle_at`).
     */
    tangentAngleAt(
        position = 0.5,
        mode: PositionMode = PositionMode.Parameter,
        plane: Plane = Plane.XY,
    ): number {
        let tangent = this.tangentAt(position, mode);
        return (plane.xDir.getSignedAngle(tangent, plane.zDir) + 360) % 360;
    }

    /**
     * A line of `length` in `plane`, centred on the point at `uValue` and square to the curve
     * there (build123d `perpendicular_line`).
     */
    perpendicularLine(length: number, uValue: number, plane: Plane = Plane.XY): Edge {
        let start = this.positionAt(uValue);
        let local = new Plane({ origin: start, xDir: this.tangentAt(uValue), zDir: plane.zDir });
        let reach = local.yDir.multiply(length / 2);
        return lineEdge(start.add(reach), start.sub(reach));
    }

    /**
     * A curvature comb: short lines raised off the curve whose length is proportional to the
     * curvature there and whose direction carries its sign (build123d `curvature_comb`). Reading
     * the comb shows how fair the curve is and where its continuity breaks.
     *
     * Only curves lying in Plane.XY have one, because the sign of the curvature is read against
     * +Z. Straight stretches raise no tooth at all, so the comb is usually shorter than `count`.
     */
    curvatureComb(options: CurvatureCombOptions = {}): ShapeList<Edge> {
        let count = options.count ?? 100;
        let plane = this.commonPlane();
        if (plane === undefined || Math.abs(Math.abs(plane.zDir.z) - 1) > TOLERANCE) {
            throw new GeometryError("A curvature comb only works for curves on Plane.XY");
        }
        // A closed curve would raise the same tooth at 0 and at 1, so the last sample is dropped.
        let step = this.isClosed ? 1 / count : count > 1 ? 1 / (count - 1) : 0;
        let samples = Array.from({ length: count }, (_, index) => this.#curvature(index * step));
        let steepest = Math.max(TOLERANCE, ...samples.map(sample => Math.abs(sample.curvature)));
        let bounds = this.boundingBox();
        let extent = Math.max(...bounds.max.sub(bounds.min).toTuple());
        let scale = (options.maxToothSize ?? extent / 10) / steepest;
        return new ShapeList(
            samples.flatMap(sample => {
                let length = scale * sample.curvature;
                if (Math.abs(length) < TOLERANCE) return [];
                let anchor = this.positionAt(sample.position);
                let outwards = sample.tangent.normalized().cross(new Vector(0, 0, 1));
                return [lineEdge(anchor, anchor.add(outwards.multiply(length)))];
            }),
        );
    }

    /** Signed curvature at a normalized position, with the tangent it was measured from. */
    #curvature(position: number): { position: number; tangent: Vector; curvature: number } {
        let tangent = this.derivativeAt(position, 1);
        let cross = tangent.cross(this.derivativeAt(position, 2));
        let magnitude = cross.length / (tangent.length ** 3 + TOLERANCE);
        return { position, tangent, curvature: cross.z >= 0 ? magnitude : -magnitude };
    }

    /**
     * The `order`-th derivative of the curve at a position or at a point on the shape. Odd
     * derivatives follow the shape's direction.
     */
    derivativeAt(
        position: number | VectorLike,
        order = 2,
        mode: PositionMode = PositionMode.Parameter,
    ): Vector {
        let located =
            typeof position === "number"
                ? this.curvePosition(position, mode)
                : this.#curvePositionOfPoint(Vector.from(position));
        let derivative = fromVec3(
            query.curveDerivative(located.edge.wrapped, located.parameter, order),
        );
        if (derivative.length === 0) {
            return new Vector(0, 0, 0);
        }
        let followsShape =
            this.shapeType === "Wire" ? located.forward === this.isForward : this.isForward;
        return order % 2 === 1 && !followsShape ? derivative.negate() : derivative;
    }

    /** For a point: the closest edge (for a wire) and the curve position of the point on it. */
    #curvePositionOfPoint(point: Vector): CurvePosition {
        let closest = this.shapeType === "Wire" ? closestEdge(this.edges(), point) : this;
        return closest.curvePosition(closest.paramAtPoint(point));
    }

    /** The start of the shape, honouring its orientation. */
    startPoint(): Vector {
        let info = query.curveInfo(this.wrapped);
        let parameter = this.isForward ? info.first : info.last;
        return fromVec3(query.curveValue(this.wrapped, parameter));
    }

    /** The end of the shape, honouring its orientation. */
    endPoint(): Vector {
        let info = query.curveInfo(this.wrapped);
        let parameter = this.isForward ? info.last : info.first;
        return fromVec3(query.curveValue(this.wrapped, parameter));
    }

    /** Common finds collinear overlaps; Section adds crossing vertices. */
    override intersectWith(other: Shape, options: IntersectOptions = {}): Shape[] | undefined {
        let tolerance = options.tolerance ?? 1e-6;
        let results: Shape[];
        switch (other.shapeType) {
            case "Edge":
            case "Wire": {
                let common = expandShapes(booleanPieces(this, [this], [other], "common"));
                let section = booleanPieces(this, [this], [other], "section").filter(
                    shape => shape.shapeType === "Vertex",
                );
                results = [...common, ...section];
                break;
            }
            case "Vertex":
                results = this.distanceTo(other) <= tolerance ? [other] : [];
                break;
            default:
                results = other.intersectWith(this, options) ?? [];
        }
        return results.length > 0 ? results : undefined;
    }

    /**
     * build123d's `+` for curves: join the edges into one wire when they connect, otherwise fuse;
     * a single resulting edge is returned as an Edge.
     */
    override union(...others: ShapeOperand[]): Shape {
        return unionCurves(this, others);
    }

    /** Offsets this planar line sideways by `distance` (build123d `offset_2d`). */
    offset2D(distance: number, options?: Offset2DOptions): Edge | Wire {
        return offset2D(this as unknown as Edge | Wire, distance, options);
    }

    /**
     * Project this line onto `face` along `direction` (build123d `Mixin1D.project`). By default
     * only the curve closest to the original comes back.
     */
    project(
        face: Face,
        direction: VectorLike,
        options: { readonly closest?: boolean } = {},
    ): Edge | Wire | ShapeList<Edge | Wire> {
        return projectLineOntoFace(this as unknown as Edge | Wire, face, direction, options);
    }

    /**
     * Project this line onto the surfaces of `target`, along a direction or through a centre
     * (build123d `Edge.project_to_shape` / `Wire.project_to_shape`). An edge yields the edges of
     * the projected wires; a wire yields the wires themselves.
     */
    projectToShape(
        target: Shape,
        options: ProjectToShapeOptions,
    ): ShapeList<Edge> | ShapeList<Wire> {
        let line = this as unknown as Edge | Wire;
        return line.shapeType === "Edge"
            ? projectEdgeToShape(line as Edge, target, options)
            : projectWireToShape(line as Wire, target, options);
    }
}

/** A straight edge, built without importing the edge makers (which import this module). */
function lineEdge(start: Vector, end: Vector): Edge {
    let wrapped = native("Line", () => construct.makeLineEdge(toVec3(start), toVec3(end)));
    return castShape(wrapped) as Edge;
}

/** The first of `edges` nearest to `point`. */
function closestEdge(edges: readonly Edge[], point: Vector): Mixin1D {
    let [first] = edges;
    if (first === undefined) {
        throw new InvalidShapeError("A wire without edges has no closest edge");
    }
    let best = { edge: first, distance: first.distanceTo(point) };
    for (let edge of edges.slice(1)) {
        let distance = edge.distanceTo(point);
        if (distance < best.distance) {
            best = { edge, distance };
        }
    }
    return best.edge;
}

/** The native top-level shapes of every operand. */
function nativeOperands(operands: readonly ShapeOperand[]): occt.Shape[] {
    return operands
        .flatMap(operand => ("wrapped" in operand ? [operand as Shape] : [...operand]))
        .flatMap(shape => topLevelNativeShapes(shape.wrapped));
}

/**
 * build123d `Mixin1D.__add__`, shared by edges, wires and curves. A join keeps the record of what
 * it did to the edges it was given (build123d `_joined_wire`), so that `Select.Last` answers for
 * it; the fuse it falls back to keeps its own.
 */
export function unionCurves(self: Shape, operands: readonly ShapeOperand[]): Shape {
    let summands = nativeOperands(operands);
    if (summands.length === 0) {
        return self;
    }
    if (!summands.every(summand => nativeDimension(summand) === 1)) {
        throw new InvalidShapeError("Only shapes with the same dimension can be added");
    }
    let pieces = summands.map(castShape);
    let edges = [...self.edges(), ...pieces.flatMap(piece => [...piece.edges()])];
    let joined: Shape | undefined;
    try {
        joined = castShape(construct.makeWire(edges.map(edge => edge.wrapped)));
    } catch (error) {
        if (!isOcctError(error)) {
            throw error;
        }
    }
    let assembled =
        joined === undefined
            ? self.fuse(pieces)
            : madeBy(joined, joinRecord(edges, joined.edges(), [self.wrapped], summands));
    let sum = assembled.clean();
    if (sum.edges().length !== 1) {
        return sum;
    }
    let only = sum.edge();
    let record = recordOf(sum);
    return record === undefined ? only : madeBy(only, record);
}
