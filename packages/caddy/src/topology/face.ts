import type * as occt from "@roonieone/occt-native";

import { construct, measure, query, ShapeType } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { ExtrudeOptions } from "../operations/solids.ts";
import type { Part } from "./composite.ts";
import type { Edge } from "./edge.ts";
import type { Shape, ShapeOptions } from "./shape.ts";
import type { Vertex } from "./vertex.ts";

import { makeFaceRect, makeSurface } from "../curves/face-makers.ts";
import { chamferFace2D, filletFace2D } from "../curves/fillet-chamfer-2d.ts";
import { frameOf } from "../curves/frame.ts";
import { InvalidShapeError } from "../errors.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { projectFaceToShape } from "../operations/project-faces.ts";
import { extrude } from "../operations/solids.ts";
import { fromVec3, toVec3 } from "./conversions.ts";
import { surfaceConvexity } from "./convexity.ts";
import { CenterOf, Convexity, GeomType } from "./enums.ts";
import { native } from "./kernel.ts";
import { Mixin2D } from "./mixin2d.ts";
import { registerShapeConstructor } from "./registry.ts";
import { ShapeList } from "./shape-list.ts";
import { Wire } from "./wire.ts";

/** build123d's `TOLERANCE`. */
const TOLERANCE = 1e-6;

const SURFACE_GEOM_TYPES: Record<query.SurfaceType, GeomType> = {
    [query.SurfaceType.Plane]: GeomType.Plane,
    [query.SurfaceType.Cylinder]: GeomType.Cylinder,
    [query.SurfaceType.Cone]: GeomType.Cone,
    [query.SurfaceType.Sphere]: GeomType.Sphere,
    [query.SurfaceType.Torus]: GeomType.Torus,
    [query.SurfaceType.BezierSurface]: GeomType.Bezier,
    [query.SurfaceType.BSplineSurface]: GeomType.Bspline,
    [query.SurfaceType.SurfaceOfRevolution]: GeomType.Revolution,
    [query.SurfaceType.SurfaceOfExtrusion]: GeomType.Extrusion,
    [query.SurfaceType.OffsetSurface]: GeomType.Offset,
    [query.SurfaceType.OtherSurface]: GeomType.Other,
};

/** A bounded piece of a surface (build123d `Face`). */
export class Face extends Mixin2D {
    static override readonly order: number = 2;

    /** The plane the face was created on, when a constructor recorded one (used by extrusion). */
    createdOn: Plane | undefined = undefined;

    /** Wrap a native face. */
    constructor(wrapped: occt.Shape, options?: ShapeOptions);
    /** The unbounded planar face of `plane` (build123d `Face(Plane)`). */
    constructor(plane: Plane, options?: ShapeOptions);
    /** A planar face bounded by a closed outer wire, with closed inner wires as holes. */
    constructor(outerWire: Wire, innerWires?: Iterable<Wire>, options?: ShapeOptions);
    constructor(
        source: occt.Shape | Plane | Wire,
        second: Iterable<Wire> | ShapeOptions = [],
        third: ShapeOptions = {},
    ) {
        if (source instanceof Wire) {
            let inner = Symbol.iterator in second ? [...(second as Iterable<Wire>)] : [];
            super(faceFromWires(source, inner), third);
            return;
        }
        let options = Symbol.iterator in second ? {} : (second as ShapeOptions);
        if (source instanceof Plane) {
            super(
                native("Plane face construction", () => construct.makePlaneFace(frameOf(source))),
                options,
            );
            this.createdOn = source;
            return;
        }
        super(source, options);
    }

    override get geomType(): GeomType {
        return SURFACE_GEOM_TYPES[query.surfaceType(this.wrapped)];
    }

    /** Faces enclose no volume. */
    get volume(): number {
        return 0;
    }

    /** The face's plane when it is planar, even if its geometry type is not `Plane`. */
    get isPlanar(): Plane | undefined {
        let frame = query.facePlane(this.wrapped);
        if (frame === undefined) {
            return undefined;
        }
        return new Plane({ origin: frame.origin, xDir: frame.xDirection, zDir: frame.zDirection });
    }

    /**
     * How the material behind this face sits against it (build123d `Face.convexity`): read from
     * the surface's principal curvatures against its outward normal, sampled over the face.
     */
    override get convexity(): Convexity {
        return surfaceConvexity(this, TOLERANCE);
    }

    /** Whether this face curves away from the material behind it. */
    get isCircularConvex(): boolean {
        return this.convexity === Convexity.Convex;
    }

    /** Whether this face curves into the material behind it. */
    get isCircularConcave(): boolean {
        return this.convexity === Convexity.Concave;
    }

    /** The edges this face meets itself along, as a cylinder does at its seam. */
    get seams(): ShapeList<Edge> {
        return new ShapeList(
            this.edges().filter(edge =>
                native("Seam check", () => query.isSeamEdge(edge.wrapped, this.wrapped)),
            ),
        );
    }

    /**
     * Centre by `centerOf`: for `Geometry` (default), the centre of mass of a planar face or the
     * point at the middle of a curved face's parameter range; or the centre of mass; or the
     * bounding box centre.
     */
    center(centerOf: CenterOf = CenterOf.Geometry): Vector {
        if (centerOf === CenterOf.Mass || (centerOf === CenterOf.Geometry && this.isPlanar)) {
            let properties = native("Center of mass", () =>
                measure.massProperties(this.wrapped, "surface"),
            );
            return fromVec3(properties.centerOfMass);
        }
        if (centerOf === CenterOf.BoundingBox) {
            return this.boundingBox().center();
        }
        let bounds = query.uvBounds(this.wrapped);
        let u = 0.5 * (bounds.uMin + bounds.uMax);
        let v = 0.5 * (bounds.vMin + bounds.vMax);
        return fromVec3(query.faceNormal(this.wrapped, u, v).point);
    }

    /** The point at normalized surface coordinates `(u, v)`, each in [0, 1]. */
    positionAt(u: number, v: number): Vector {
        let [uValue, vValue] = this.#surfaceParameters(u, v);
        return fromVec3(query.faceNormal(this.wrapped, uValue, vValue).point);
    }

    /** Unit normal at the face's parameter-space centre. */
    normalAt(): Vector;
    /** Unit normal where `surfacePoint` projects onto the face's surface. */
    normalAt(surfacePoint: VectorLike): Vector;
    /** Unit normal at normalized surface coordinates `(u, v)`, each in [0, 1]. */
    normalAt(u: number, v: number): Vector;
    normalAt(first?: VectorLike | number, v?: number): Vector {
        let parameters: readonly [number, number];
        if (typeof first === "number") {
            if (v === undefined) {
                throw new InvalidShapeError("Both u & v values must be specified");
            }
            parameters = this.#surfaceParameters(first, v);
        } else if (first === undefined) {
            parameters = this.#surfaceParameters(0.5, 0.5);
        } else {
            parameters = query.projectPointOnFace(this.wrapped, toVec3(Vector.from(first)));
        }
        let [uValue, vValue] = parameters;
        return fromVec3(query.faceNormal(this.wrapped, uValue, vValue).normal).normalized();
    }

    #surfaceParameters(u: number, v: number): readonly [number, number] {
        let bounds = query.uvBounds(this.wrapped);
        return [
            bounds.uMin + u * (bounds.uMax - bounds.uMin),
            bounds.vMin + v * (bounds.vMax - bounds.vMin),
        ];
    }

    /** The boundary wire (BRepTools::OuterWire). */
    outerWire(): Wire {
        let outer = new Wire(native("Outer wire", () => query.outerWire(this.wrapped)));
        outer.topoPath = [...this.topoPath, this];
        return outer;
    }

    /** The wires bounding the face's holes. */
    innerWires(): ShapeList<Wire> {
        let outer = this.outerWire();
        return new ShapeList(this.wires().filter(wire => !wire.isSame(outer)));
    }

    /**
     * The outer wire; build123d warns when the face has holes, and so does this
     * (build123d `Face.wire`).
     */
    override wire(): Wire {
        if (this.innerWires().length > 0) {
            process.emitWarning("Found holes, returning outer_wire");
        }
        return this.outerWire();
    }

    /** Whether `point` lies on the face within `tolerance`, boundary included. */
    isInside(point: VectorLike, tolerance = 1e-6): boolean {
        let target = toVec3(Vector.from(point));
        return native("Point classification", () =>
            query.classifyPoint(this.wrapped, target, tolerance),
        ).onFace;
    }

    /** Whether this planar face lies in `plane`. */
    isCoplanar(plane: Plane): boolean {
        let bounds = query.uvBounds(this.wrapped);
        let { point, normal } = query.faceNormal(this.wrapped, bounds.uMin, bounds.vMin);
        return (
            plane.contains(fromVec3(point)) &&
            1 - Math.abs(plane.zDir.dot(fromVec3(normal))) < TOLERANCE
        );
    }

    /** Extrude this face along its normal, or by `options.dir` (build123d algebraic extrusion). */
    extrude(amount?: number, options: ExtrudeOptions = {}): Part {
        return extrude(this, amount, options);
    }

    /** A rectangle centred on the plane's origin. */
    static makeRect(width: number, height: number, plane?: Plane): Face {
        return makeFaceRect(width, height, plane);
    }

    /**
     * A possibly non-planar face filling `exterior`, pulled towards `surfacePoints` and
     * pierced by `interiorWires`.
     */
    static makeSurface(
        exterior: Wire | Iterable<Edge>,
        surfacePoints?: readonly VectorLike[],
        interiorWires?: Iterable<Wire>,
    ): Face {
        return makeSurface(exterior, surfacePoints, interiorWires);
    }

    /** Rounds the listed corners of this planar face. */
    fillet2D(radius: number, vertices: Iterable<Vertex>): Face {
        return filletFace2D(this, radius, vertices);
    }

    /** Cuts the listed corners of this planar face. */
    chamfer2D(
        distance: number,
        distance2: number,
        vertices: Iterable<Vertex>,
        reference?: Edge,
    ): Face {
        return chamferFace2D(this, distance, distance2, vertices, reference);
    }

    /**
     * Project this face onto the surfaces of `target` along `direction` (build123d
     * `Face.project_to_shape`). Faces come back for a face target and shells for anything
     * thicker, ordered away from this face; a shell holding one face is returned as that face.
     */
    projectToShape(target: Shape, direction: VectorLike): ShapeList<Shape> {
        return projectFaceToShape(this, target, direction);
    }

    protected override withWrapped(wrapped: occt.Shape): this {
        let copy = super.withWrapped(wrapped);
        copy.createdOn = this.createdOn;
        return copy;
    }
}

/** build123d `Face(outer_wire, inner_wires)`: closed wires only. */
function faceFromWires(outer: Wire, inner: readonly Wire[]): occt.Shape {
    if (![outer, ...inner].every(wire => query.isClosed(wire.wrapped))) {
        throw new InvalidShapeError("Face can only be created with closed wires");
    }
    return native("Face construction", () =>
        construct.makeFace(
            outer.wrapped,
            inner.map(wire => wire.wrapped),
        ),
    );
}

registerShapeConstructor(ShapeType.Face, wrapped => new Face(wrapped));
