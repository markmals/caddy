import type * as occt from "@roonieone/occt-native";

import {
    construct,
    isOcctError,
    measure,
    Orientation,
    query,
    shapes,
} from "@roonieone/occt-native";

import type { Offset2DOptions } from "../curves/offset-2d.ts";
import type { Plane } from "../geometry/plane.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { ProjectToShapeOptions } from "../operations/project-to-shape.ts";
import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { ShapeList } from "./shape-list.ts";
import type { IntersectOptions, ShapeOperand } from "./shape.ts";
import type { Wire } from "./wire.ts";

import { offset2D } from "../curves/offset-2d.ts";
import { InvalidShapeError } from "../errors.ts";
import { Location } from "../geometry/location.ts";
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
import { Shape } from "./shape.ts";

/** build123d's `TOLERANCE`: how far a line may deviate from a shared plane. */
const COMMON_PLANE_TOLERANCE = 1e-6;

/** Options of {@link Mixin1D#commonPlane}. */
export interface CommonPlaneOptions {
    /** How far the lines may deviate from the plane; defaults to 1e-6. */
    readonly tolerance?: number;
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

    /** Radius of the underlying circle (of the first edge, for a wire). */
    abstract get radius(): number;

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
        frameMethod: FrameMethod = FrameMethod.Frenet,
        xDir?: VectorLike,
    ): Location {
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

/** build123d `Mixin1D.__add__`, shared by edges, wires and curves. */
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
    let sum: Shape;
    try {
        sum = castShape(construct.makeWire(edges.map(edge => edge.wrapped)));
    } catch (error) {
        if (!isOcctError(error)) {
            throw error;
        }
        sum = self.fuse(pieces);
    }
    sum = sum.clean();
    return sum.edges().length === 1 ? sum.edge() : sum;
}
