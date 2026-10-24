import type * as occt from "@roonieone/occt-native";

import { measure, mesh, obb, query, shapes, ShapeType, topology } from "@roonieone/occt-native";

import type { ViewportOptions } from "../drafting/viewport.ts";
import type { Color } from "../geometry/color.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { Joint } from "../joints/joint.ts";
import type { FinishedMaterial } from "../materials/finished.ts";
import type { Material } from "../materials/material.ts";
import type { MeshOptions, Tessellation } from "../mesh/triangulation.ts";
import type { UvMeshOptions, UvTessellation } from "../mesh/uv.ts";
import type { TrimmingTool } from "../operations/split-pieces.ts";
import type { Compound } from "./compound.ts";
import type { Edge } from "./edge.ts";
import type { Convexity, GeomType, ShapeTypeName } from "./enums.ts";
import type { Face } from "./face.ts";
import type { Shell } from "./shell.ts";
import type { Solid } from "./solid.ts";
import type { Vertex } from "./vertex.ts";
import type { Wire } from "./wire.ts";

import { projectToViewport } from "../drafting/viewport.ts";
import { GeometryError, InvalidShapeError, MaterialError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { BoundingBox } from "../geometry/bounding-box.ts";
import { DEG2RAD } from "../geometry/constants.ts";
import { Location } from "../geometry/location.ts";
import { Matrix } from "../geometry/matrix.ts";
import { OrientedBoundBox } from "../geometry/oriented-bound-box.ts";
import { Plane } from "../geometry/plane.ts";
import { Transform } from "../geometry/transform.ts";
import { UNITS_PER_KILOGRAM, UNITS_PER_METER } from "../geometry/units.ts";
import { Vector } from "../geometry/vector.ts";
import { MassUnit, Unit } from "../io/types.ts";
import { resolveMaterial } from "../materials/registry.ts";
import { meshDeflection, tessellationOf } from "../mesh/triangulation.ts";
import { uvTessellationOf } from "../mesh/uv.ts";
import { projectFaces } from "../operations/project-faces.ts";
import { splitPieces } from "../operations/split-pieces.ts";
import {
    additionOperands,
    booleanCut,
    booleanFuse,
    clean,
    intersectShapes,
    subtractionOperands,
} from "./boolean.ts";
import { fromVec3, locationFromMatrix, matrixOf, toVec3 } from "./conversions.ts";
import { CenterOf, Keep, Select } from "./enums.ts";
import { principalInertia } from "./inertia.ts";
import { intersectionOperand } from "./intersection-operand.ts";
import { native } from "./kernel.ts";
import { topLevelNativeShapes } from "./native-topology.ts";
import { castShape, geometryShape } from "./registry.ts";
import { madeBy, recordOf, ShapeHistory } from "./shape-history.ts";
import { exactlyOne, ShapeList } from "./shape-list.ts";

/** Attributes every shape carries besides its geometry. */
export interface ShapeOptions {
    readonly label?: string;
    readonly color?: Color;
}

/** Options for {@link Shape#fuse} (build123d `fuse(glue=, tol=)`). */
export interface FuseOptions {
    /** Glue touching shapes (BOPAlgo_GlueShift): faster for shapes that only share faces. */
    readonly glue?: boolean;
    /** Fuzzy tolerance merging nearly coincident geometry. */
    readonly tol?: number;
}

/** Options for {@link Shape#intersect} and {@link Shape#intersectWith}. */
export interface IntersectOptions {
    /**
     * Also report boundary contacts, where the shapes meet without their interiors overlapping
     * (build123d `include_touched`); only solids produce them.
     */
    readonly includeTouched?: boolean;
    /** Distance below which geometry counts as coincident; defaults to 1e-6. */
    readonly tolerance?: number;
}

/** Options for {@link Shape#touch}. */
export interface TouchOptions {
    /** Distance below which two boundaries count as in contact; defaults to 1e-6. */
    readonly tolerance?: number;
}

/** Options for {@link Shape#boundingBox}. */
export interface BoundingBoxOptions {
    /**
     * Accepted for parity with build123d, which takes it but never applies it; ignored the same
     * way.
     */
    readonly tolerance?: number;
    /** Compute the tight box rather than the cheaper, looser one; defaults to true. */
    readonly optimal?: boolean;
}

/** Units {@link Shape#computeMass} and {@link Shape#mass} report a mass in. */
export interface MassOptions {
    /** Unit the mass comes back in; defaults to grams. */
    readonly massUnit?: MassUnit;
    /** Unit the shape's coordinates are in; defaults to millimetres. */
    readonly lengthUnit?: Unit;
}

/** Options of the sub-shape accessors ({@link Shape#faces}, {@link Shape#edges}, ...). */
export interface SubShapeOptions {
    /**
     * Report only the sub-shapes the operation that made this shape brought in or created
     * (`Select.Last`), or created outright (`Select.New`); defaults to `Select.All`.
     */
    readonly select?: Select;
}

/** Options for {@link Shape#translate} and {@link Shape#rotate}. */
export interface MoveOptions {
    /** Rebuild the geometry itself instead of only moving the shape's location. */
    readonly transform?: boolean;
}

/** Options of {@link Shape#toSplines}. */
export interface ToSplinesOptions {
    /** Largest spline degree the approximation may use; defaults to 3. */
    readonly degree?: number;
    /** How far the splines may stray from the geometry they replace; defaults to 1e-3. */
    readonly tolerance?: number;
    /** Allow rational (weighted) splines; defaults to false. */
    readonly nurbs?: boolean;
}

/** Either side of an algebraic operation: one shape or several. */
export type ShapeOperand = Shape | Iterable<Shape>;

const SHAPE_TYPE_NAMES: Record<occt.ShapeType, ShapeTypeName> = {
    [ShapeType.Compound]: "Compound",
    [ShapeType.CompSolid]: "CompSolid",
    [ShapeType.Solid]: "Solid",
    [ShapeType.Shell]: "Shell",
    [ShapeType.Face]: "Face",
    [ShapeType.Wire]: "Wire",
    [ShapeType.Edge]: "Edge",
    [ShapeType.Vertex]: "Vertex",
    [ShapeType.Shape]: "Compound",
};

/** Which mass integral build123d's `compute_volume` runs per shape type; a vertex has none. */
const MASS_PROPERTY: Partial<Record<occt.ShapeType, "linear" | "surface" | "volume">> = {
    [ShapeType.Edge]: "linear",
    [ShapeType.Wire]: "linear",
    [ShapeType.Face]: "surface",
    [ShapeType.Shell]: "surface",
    [ShapeType.Solid]: "volume",
    [ShapeType.CompSolid]: "volume",
    [ShapeType.Compound]: "volume",
};

/**
 * Base class of every topological shape (build123d `Shape`).
 *
 * A shape wraps one native OCCT shape and is immutable: every operation returns a new shape. The
 * native memory is released when the shape is garbage collected, or immediately with
 * `using shape = ...` / `shape[Symbol.dispose]()`.
 */
export abstract class Shape {
    /** The native OCCT shape. */
    readonly wrapped: occt.Shape;
    /** User-assigned name, carried into exports. */
    label: string;
    /** Display colour, carried into exports; `undefined` when unset. */
    color: Color | undefined;
    /**
     * The shapes this one was extracted through, outermost first: an edge taken from a face of a
     * solid records `[solid, face]`.
     */
    topoPath: readonly Shape[] = [];

    /** Allocated on first use: most shapes never carry a joint. */
    #joints: Map<string, Joint> | undefined;

    /** This shape's own material; `undefined` until one is set or inherited. */
    #material: FinishedMaterial | undefined;

    /**
     * The joints bound to this shape, by label (build123d `Shape.joints`). A joint registers
     * itself here when it is created, and copies of this shape carry rebound copies of it.
     */
    get joints(): Map<string, Joint> {
        this.#joints ??= new Map();
        return this.#joints;
    }

    /**
     * What this shape is made of (build123d `Shape.material`), which is what {@link mass}
     * weighs. A shape with no material of its own takes the nearest one along its
     * {@link topoPath} — the solid a face was taken from, the compound a solid was taken from —
     * and keeps it, so the walk happens once.
     *
     * Assign a catalog name (`"brass"`), a {@link Material} or a {@link FinishedMaterial}, or
     * `undefined` to clear it.
     */
    get material(): FinishedMaterial | undefined {
        if (this.#material === undefined) {
            let ancestor = [...this.topoPath].reverse().find(step => step.#material !== undefined);
            if (ancestor !== undefined) {
                this.#material = ancestor.#material;
            }
        }
        return this.#material;
    }

    set material(value: FinishedMaterial | Material | string | undefined) {
        this.#material = value === undefined ? undefined : resolveMaterial(value);
    }

    /**
     * Rank used by booleans to choose the result class: Vertex 0, Edge 1, Wire 1.5, Face 2,
     * Shell 2.5, Solid 3, Compound (and its composites) 4.
     */
    static readonly order: number = Number.NaN;

    constructor(wrapped: occt.Shape, options: ShapeOptions = {}) {
        this.wrapped = wrapped;
        this.label = options.label ?? "";
        this.color = options.color;
    }

    /** Wrap a native shape in the class matching its type. */
    static cast(nativeShape: occt.Shape): Shape {
        return castShape(nativeShape);
    }

    /**
     * The shape equivalent of a geometry object (build123d `Shape.as_shape`): a vertex for a
     * point or a location, an edge for an axis, a face for a plane. A shape comes back unchanged.
     */
    static asShape(obj: Shape | Vector | Location | Axis | Plane): Shape {
        if (obj instanceof Shape) {
            return obj;
        }
        let shape = geometryShape(obj);
        if (shape === undefined) {
            throw new InvalidShapeError(`A ${obj.constructor.name} has no shape equivalent`);
        }
        return shape;
    }

    /** Volume-weighted mass centre or the mean of bounding-box centres for several shapes. */
    static combinedCenter(objects: Iterable<Shape>, centerOf: CenterOf = CenterOf.Mass): Vector {
        let shapes = [...objects];
        if (shapes.length === 0) {
            throw new InvalidShapeError("Cannot calculate a combined center without shapes");
        }
        if (centerOf === CenterOf.Geometry) {
            throw new InvalidShapeError("CenterOf.GEOMETRY not implemented");
        }
        let weighted = new Vector();
        let total = 0;
        for (let shape of shapes) {
            let mass = centerOf === CenterOf.Mass ? shape.volume : 1;
            let center =
                centerOf === CenterOf.Mass
                    ? shape.center(CenterOf.Mass)
                    : shape.boundingBox().center();
            weighted = weighted.add(center.multiply(mass));
            total += mass;
        }
        return weighted.divide(total);
    }

    /** Topological dimension: 0 for vertices up to 3 for solids; undefined when mixed. */
    abstract get dimension(): number | undefined;

    /** Centre of the shape; the default kind of centre depends on the class. */
    abstract center(centerOf?: CenterOf): Vector;

    /** Volume enclosed by the shape; zero for vertices, curves and faces. */
    abstract get volume(): number;

    /** The outermost shape this one was extracted from (build123d `topo_parent`). */
    get topoParent(): Shape | undefined {
        return this.topoPath[0];
    }

    /** The shape this one was directly extracted from (build123d `topo_owner`). */
    get topoOwner(): Shape | undefined {
        return this.topoPath.at(-1);
    }

    /** build123d's name of the native shape type. */
    get shapeType(): ShapeTypeName {
        return SHAPE_TYPE_NAMES[shapes.shapeType(this.wrapped)];
    }

    /** Geometry kind of an edge or face; `GeomType.Other` for every other shape. */
    get geomType(): GeomType {
        return "OTHER";
    }

    /** True once the native shape has been disposed. */
    get isNull(): boolean {
        return shapes.isDisposed(this.wrapped);
    }

    /** OCCT BRepCheck_Analyzer verdict on the shape and all its sub-shapes. */
    get isValid(): boolean {
        return native("Validity check", () => measure.isValid(this.wrapped));
    }

    /**
     * How the shape this one was selected from sits around it (build123d `Shape.convexity`).
     * Only a vertex, edge or face taken from a larger shape is an element of one; every other
     * shape is the region itself, so the question does not apply.
     */
    get convexity(): Convexity {
        throw new InvalidShapeError(
            `A ${this.constructor.name} has no convexity - only a Vertex, Edge or Face selected from a larger shape does`,
        );
    }

    /** Whether every nondegenerate edge of each top-level shape has exactly two adjacent faces. */
    get isManifold(): boolean {
        let children = topLevelNativeShapes(this.wrapped);
        if (children.length === 0) return false;
        for (let child of children) {
            for (let edge of topology.subShapes(child, ShapeType.Edge)) {
                if (
                    !topology.isDegeneratedEdge(edge) &&
                    topology.ancestors(child, edge, ShapeType.Face).length !== 2
                ) {
                    return false;
                }
            }
        }
        return true;
    }

    /** The shape's placement. */
    get location(): Location {
        return locationFromMatrix(shapes.location(this.wrapped));
    }

    /**
     * Where the shape sits in world coordinates (build123d `global_location`). build123d walks an
     * assembly tree and composes the placement of every ancestor; Caddy models assemblies as
     * nested compounds, where OCCT has already composed a child's placement with its parents', so
     * this is the shape's own location.
     */
    get globalLocation(): Location {
        return this.location;
    }

    get position(): Vector {
        return this.location.position;
    }

    /** Intrinsic XYZ Euler angles of the placement, in degrees. */
    get orientation(): Vector {
        return this.location.orientation;
    }

    /** Total area of the shape's faces. */
    get area(): number {
        return native("Area", () => measure.massProperties(this.wrapped, "surface").mass);
    }

    /** Inertia about the centre of mass, as a 3×3 matrix. */
    get matrixOfInertia(): number[][] {
        let tensor = native(
            "Inertia",
            () => measure.massProperties(this.wrapped, "volume").inertia,
        );
        return [tensor.slice(0, 3), tensor.slice(3, 6), tensor.slice(6, 9)];
    }

    /** First mass moments about the YZ, XZ and XY planes. */
    get staticMoments(): [number, number, number] {
        let properties = native("Static moments", () =>
            measure.massProperties(this.wrapped, "volume"),
        );
        let [x, y, z] = properties.centerOfMass;
        return [properties.mass * x, properties.mass * y, properties.mass * z];
    }

    /** Principal inertia axes and their moments, ordered from largest moment to smallest. */
    get principalProperties(): [Vector, number][] {
        let tensor = native(
            "Inertia",
            () => measure.massProperties(this.wrapped, "volume").inertia,
        );
        return principalInertia(tensor);
    }

    /** Radius of gyration about `axis`, including its offset from the centre of mass. */
    radiusOfGyration(axis: Axis): number {
        let { inertia, centerOfMass, mass } = native("Inertia", () =>
            measure.massProperties(this.wrapped, "volume"),
        );
        let direction = axis.direction;
        let [x, y, z] = direction.toTuple();
        let centralMoment =
            x * (inertia[0]! * x + inertia[1]! * y + inertia[2]! * z) +
            y * (inertia[3]! * x + inertia[4]! * y + inertia[5]! * z) +
            z * (inertia[6]! * x + inertia[7]! * y + inertia[8]! * z);
        let displacement = Vector.from(centerOfMass).sub(axis.position).cross(direction);
        return Math.sqrt(centralMoment / mass + displacement.dot(displacement));
    }

    /**
     * Axis-aligned bounds. build123d accepts a `tolerance` but never applies it, so it is accepted
     * here for parity and ignored the same way. An empty shape yields an all-zero box.
     */
    boundingBox(options: BoundingBoxOptions = {}): BoundingBox {
        let optimal = options.optimal ?? true;
        let bounds = native("Bounding box", () => measure.boundingBox(this.wrapped, optimal));
        if (bounds === undefined) {
            return new BoundingBox([0, 0, 0], [0, 0, 0]);
        }
        return new BoundingBox(bounds.min, bounds.max);
    }

    /**
     * Minimum-volume bounds, free to turn with the shape (build123d `oriented_bounding_box`).
     *
     * The axes OCCT picks are arbitrary and need not be stable between similar shapes.
     */
    orientedBoundingBox(): OrientedBoundBox {
        let bounds = native("Oriented bounding box", () => obb.orientedBoundingBox(this.wrapped));
        if (bounds === undefined) {
            throw new InvalidShapeError("An empty shape has no oriented bounding box");
        }
        return new OrientedBoundBox(bounds);
    }

    // ---- Exploration ----

    /**
     * build123d `Shape._select`: narrow sub-shapes to what the operation that made this shape
     * did. Only a shape an operation produced carries that record.
     */
    protected selected<T extends Shape>(
        found: ShapeList<T>,
        select: Select | undefined,
    ): ShapeList<T> {
        if (select === undefined || select === Select.All) {
            return found;
        }
        let record = recordOf(this);
        if (record === undefined) {
            throw new InvalidShapeError(
                `Select.${select} needs a record of how this shape was made, and this one has ` +
                    "none - it is the result of no recorded operation",
            );
        }
        return new ShapeList(record.narrow([...found], select));
    }

    vertices(options: SubShapeOptions = {}): ShapeList<Vertex> {
        return this.selected(this.subShapes<Vertex>(ShapeType.Vertex), options.select);
    }

    /** Edges of the shape, without degenerate ones such as a sphere's pole seams. */
    edges(options: SubShapeOptions = {}): ShapeList<Edge> {
        let found = new ShapeList(
            this.subShapes<Edge>(ShapeType.Edge).filter(
                edge => !topology.isDegeneratedEdge(edge.wrapped),
            ),
        );
        return this.selected(found, options.select);
    }

    wires(options: SubShapeOptions = {}): ShapeList<Wire> {
        return this.selected(this.subShapes<Wire>(ShapeType.Wire), options.select);
    }

    faces(options: SubShapeOptions = {}): ShapeList<Face> {
        return this.selected(this.subShapes<Face>(ShapeType.Face), options.select);
    }

    /** Faces pierced by an infinite axis, sorted by distance to the axis origin. */
    facesIntersectedByAxis(axis: Axis, tolerance = 1e-4): ShapeList<Face> {
        let frame = { origin: toVec3(axis.position), direction: toVec3(axis.direction) };
        let faces = native("Axis-face intersections", () =>
            query.facesIntersectedByAxis(this.wrapped, frame, tolerance),
        );
        return new ShapeList(
            faces.map(wrapped => {
                let face = castShape(wrapped) as Face;
                face.topoPath = [...this.topoPath, this];
                return face;
            }),
        );
    }

    shells(options: SubShapeOptions = {}): ShapeList<Shell> {
        return this.selected(this.subShapes<Shell>(ShapeType.Shell), options.select);
    }

    solids(options: SubShapeOptions = {}): ShapeList<Solid> {
        return this.selected(this.subShapes<Solid>(ShapeType.Solid), options.select);
    }

    /** Compounds within the shape; only compounds have any. */
    compounds(): ShapeList<Compound> {
        return new ShapeList<Compound>();
    }

    /** The single vertex of the shape; throws unless there is exactly one. */
    vertex(): Vertex {
        return exactlyOne(this.vertices(), "vertex");
    }

    edge(): Edge {
        return exactlyOne(this.edges(), "edge");
    }

    wire(): Wire {
        return exactlyOne(this.wires(), "wire");
    }

    face(): Face {
        return exactlyOne(this.faces(), "face");
    }

    shell(): Shell {
        return exactlyOne(this.shells(), "shell");
    }

    solid(): Solid {
        return exactlyOne(this.solids(), "solid");
    }

    compound(): Compound {
        return exactlyOne(this.compounds(), "compound");
    }

    /** The non-compound shapes at the top of this one, looking through nested compounds. */
    getTopLevelShapes(): ShapeList<Shape> {
        return new ShapeList(topLevelNativeShapes(this.wrapped).map(castShape));
    }

    /** Distinct sub-shapes of `type`, recording this shape in their `topoPath`. */
    protected subShapes<T extends Shape>(type: occt.ShapeType): ShapeList<T> {
        let found = topology.subShapes(this.wrapped, type).map(castShape) as T[];
        for (let shape of found) {
            shape.topoPath = [...this.topoPath, this];
        }
        return new ShapeList(found);
    }

    // ---- Identity ----

    /** Same TShape and location; orientation may differ (OCCT IsSame). */
    isSame(other: Shape): boolean {
        return shapes.isSame(this.wrapped, other.wrapped);
    }

    /** Same TShape, location and orientation (OCCT IsEqual). */
    isEqual(other: Shape): boolean {
        return shapes.isEqual(this.wrapped, other.wrapped);
    }

    /** build123d's `==`: {@link isSame}. */
    equals(other: Shape): boolean {
        return this.isSame(other);
    }

    /** Hash consistent with {@link isSame}. */
    hashCode(): number {
        return shapes.hash(this.wrapped);
    }

    // ---- Placement ----

    /**
     * A copy moved by `location` relative to its current placement, sharing the geometry
     * (build123d `Shape.moved`; `Location * shape`).
     */
    moved(location: Location | Plane): this {
        let relative = location instanceof Plane ? location.location : location;
        return this.withWrapped(shapes.moved(this.wrapped, matrixOf(relative.transform)));
    }

    /** An independent copy placed absolutely at `location` (build123d `Shape.located`). */
    located(location: Location): this {
        let copy = native("Copy", () => shapes.copy(this.wrapped));
        return this.withWrapped(shapes.located(copy, matrixOf(location.transform)));
    }

    /**
     * build123d's `location * shape`: a copy moved by a location or plane, or one copy per
     * location when given several.
     */
    transform(location: Location | Plane): this;
    transform(locations: Iterable<Location | Plane>): this[];
    transform(location: Location | Plane | Iterable<Location | Plane>): this | this[] {
        if (location instanceof Location || location instanceof Plane) {
            return this.moved(location);
        }
        return Array.from(location, each => this.moved(each));
    }

    /** A copy translated by `vector`; with `transform` the geometry itself is rebuilt. */
    translate(vector: VectorLike, options: MoveOptions = {}): this {
        let translation = Transform.fromTranslation(Vector.from(vector));
        return options.transform === true
            ? this.applyTransform(translation)
            : this.moved(new Location(translation));
    }

    /** A copy rotated `angle` degrees about `axis`; with `transform` the geometry is rebuilt. */
    rotate(axis: Axis, angle: number, options: MoveOptions = {}): this {
        let rotation = Transform.fromAxisRotation(axis.position, axis.direction, angle * DEG2RAD);
        return options.transform === true
            ? this.applyTransform(rotation)
            : this.moved(new Location(rotation));
    }

    /**
     * A copy scaled about `about` (default: the shape's location). A uniform factor keeps the
     * geometry types; three factors stretch per axis and may turn curves into splines.
     */
    scale(factor: number | readonly [number, number, number], about?: VectorLike): this {
        let center = about === undefined ? this.location.position : Vector.from(about);
        if (typeof factor === "number") {
            return this.applyTransform(Transform.fromScale(center, factor));
        }
        let [x, y, z] = factor;
        return this.transformGeometry([
            [x, 0, 0, center.x * (1 - x)],
            [0, y, 0, center.y * (1 - y)],
            [0, 0, z, center.z * (1 - z)],
        ]);
    }

    /** A copy mirrored about `mirrorPlane` (default `Plane.XY`). */
    mirror(mirrorPlane: Plane = Plane.XY): this {
        return this.applyTransform(Transform.fromPlaneMirror(mirrorPlane.origin, mirrorPlane.zDir));
    }

    /**
     * A copy with `transform` applied to its geometry, keeping every geometry type
     * (build123d `transform_shape`; BRepBuilderAPI_Transform without copying).
     */
    transformShape(transform: Transform): this {
        let matrix = matrixOf(transform);
        return this.withWrapped(
            native("Transform", () => shapes.transformed(this.wrapped, matrix)),
        );
    }

    /**
     * A copy with a general affine matrix (rows of `[a, b, c, translation]`) applied, allowing
     * stretch and shear; lines and circles may become splines (build123d `transform_geometry`).
     */
    transformGeometry(rows: Matrix | Transform | readonly (readonly number[])[]): this {
        let matrix =
            rows instanceof Matrix
                ? rows.toRows().flat()
                : rows instanceof Transform
                  ? matrixOf(rows)
                  : rows.flat();
        if (matrix.length !== 12) {
            throw new GeometryError("A geometry transform needs three rows of four numbers");
        }
        return this.withWrapped(
            native("General transform", () =>
                shapes.generalTransformed(this.wrapped, matrix, true),
            ),
        );
    }

    /**
     * A copy rotated by `rotate` degrees about X, then Y, then Z (world axes through the origin,
     * applied Z first as build123d composes them) and then translated by `offset`.
     */
    transformed(rotate: VectorLike = [0, 0, 0], offset: VectorLike = [0, 0, 0]): this {
        let angles = Vector.from(rotate).multiply(DEG2RAD);
        let origin = new Vector();
        let composed = Transform.fromTranslation(Vector.from(offset))
            .multiply(Transform.fromAxisRotation(origin, new Vector(1, 0, 0), angles.x))
            .multiply(Transform.fromAxisRotation(origin, new Vector(0, 1, 0), angles.y))
            .multiply(Transform.fromAxisRotation(origin, new Vector(0, 0, 1), angles.z));
        return this.applyTransform(composed);
    }

    /** A copy of the geometry with `transform` applied (build123d `_apply_transform`). */
    protected applyTransform(transform: Transform): this {
        let matrix = matrixOf(transform);
        return this.withWrapped(
            native("Transform", () => shapes.transformed(this.wrapped, matrix, true)),
        );
    }

    /**
     * A shape of this class around `wrapped`, carrying this shape's attributes. Subclasses with
     * extra state override it.
     */
    protected withWrapped(wrapped: occt.Shape): this {
        let constructor = this.constructor as new (
            wrapped: occt.Shape,
            options?: ShapeOptions,
        ) => this;
        let options: ShapeOptions =
            this.color === undefined
                ? { label: this.label }
                : { label: this.label, color: this.color };
        let copy = new constructor(wrapped, options);
        copy.#material = this.#material;
        if (this.#joints !== undefined) {
            for (let joint of this.#joints.values()) {
                joint.rebind(copy);
            }
        }
        return copy;
    }

    // ---- Meshing ----

    /**
     * A copy carrying a triangulation of every face, no finer than `tolerance` (build123d
     * `Shape.mesh`, which triangulates in place). Meshing it again, tessellating it or writing
     * it as STL reuses this triangulation when it is fine enough for what is asked.
     */
    async mesh(tolerance: number, options: MeshOptions = {}): Promise<this> {
        if (this.isNull) {
            throw new InvalidShapeError("Cannot mesh an empty shape");
        }
        let meshed = await mesh.triangulate(this.wrapped, meshDeflection(tolerance, options));
        return this.withWrapped(meshed);
    }

    /**
     * A triangulated approximation of this shape: vertices in world coordinates and the index
     * triples that span them, wound outwards (build123d `Shape.tessellate`).
     */
    async tessellate(tolerance: number, options: MeshOptions = {}): Promise<Tessellation> {
        if (this.isNull) {
            throw new InvalidShapeError("Cannot tessellate an empty shape");
        }
        return tessellationOf(
            await mesh.tessellate(this.wrapped, meshDeflection(tolerance, options)),
        );
    }

    /**
     * {@link tessellate}, plus a normal and a texture coordinate per vertex (build123d
     * `Shape.tessellate_with_uvs`). UVs come from each face's surface parameterisation,
     * normalised into `[0, 1]` and, unless `atlasPacking` is off, packed into one atlas.
     */
    async tessellateWithUvs(
        tolerance: number,
        options: UvMeshOptions = {},
    ): Promise<UvTessellation> {
        if (this.isNull) {
            throw new InvalidShapeError("Cannot tessellate an empty shape");
        }
        let soup = await mesh.tessellateWithUvs(this.wrapped, meshDeflection(tolerance, options));
        return uvTessellationOf(soup, options);
    }

    // ---- Measurement ----

    /** Minimal distance to another shape or a point. */
    distanceTo(other: Shape | VectorLike): number {
        return this.distanceToWithClosestPoints(other)[0];
    }

    /** The closest points on this shape and on `other`. */
    closestPoints(other: Shape | VectorLike): [Vector, Vector] {
        let [, mine, theirs] = this.distanceToWithClosestPoints(other);
        return [mine, theirs];
    }

    /** Minimal distance plus the closest points on this shape and on `other`. */
    distanceToWithClosestPoints(other: Shape | VectorLike): [number, Vector, Vector] {
        let result = native("Distance", () =>
            other instanceof Shape
                ? query.distance(this.wrapped, other.wrapped)
                : query.distanceToPoint(this.wrapped, toVec3(Vector.from(other))),
        );
        return [result.distance, fromVec3(result.pointOnFirst), fromVec3(result.pointOnSecond)];
    }

    /** Minimal distance to another shape (build123d `distance`). */
    distance(other: Shape): number {
        return this.distanceTo(other);
    }

    /** Minimal distances to each of `others`, in order. */
    distances(...others: Shape[]): number[] {
        return others.map(other => this.distanceTo(other));
    }

    /**
     * The measure of the shape in its own dimension (build123d `compute_volume`): the length of a
     * curve, the area of a surface, the volume of a solid or compound, and zero for a vertex.
     * Unlike {@link volume} it does not ask what the shape encloses, only what it measures.
     */
    computeVolume(): number {
        let kind = MASS_PROPERTY[shapes.shapeType(this.wrapped)];
        if (kind === undefined) {
            return 0;
        }
        return native("Volume", () => measure.massProperties(this.wrapped, kind).mass);
    }

    /**
     * What the shape weighs (build123d `compute_mass`): its {@link volume} times the density of
     * its {@link material}, converted into `massUnit` per `lengthUnit` cubed.
     *
     * Anything that encloses no volume — a vertex, a curve, a face, an open shell — weighs
     * nothing, whether or not it has a material. Everything else needs one: without a material
     * there is no density to weigh it with.
     */
    computeMass(options: MassOptions = {}): number {
        let volume = this.volume;
        if (volume === 0) {
            return 0;
        }
        let material = this.material;
        if (material === undefined) {
            throw new MaterialError(
                `Cannot compute the mass of a ${this.shapeType} without a material: its ` +
                    "density is missing",
            );
        }
        let perKilogram = UNITS_PER_KILOGRAM[options.massUnit ?? MassUnit.Gram];
        let perMeter = UNITS_PER_METER[options.lengthUnit ?? Unit.Millimeter];
        return volume * ((material.material.density * perKilogram) / perMeter ** 3);
    }

    /** What the shape weighs; build123d's per-class spelling of {@link computeMass}. */
    mass(options: MassOptions = {}): number {
        return this.computeMass(options);
    }

    // ---- Booleans ----

    /**
     * build123d's `+`: fuse with every top-level shape of the operands. Operands of another
     * dimension are rejected; nothing to add returns this shape.
     */
    union(...others: ShapeOperand[]): Shape {
        let summands = additionOperands(this, others);
        return summands.length === 0 ? this : this.fuse(summands);
    }

    /** build123d's `-`: cut every top-level shape of the operands out of this one. */
    subtract(...others: ShapeOperand[]): Shape {
        let subtrahends = subtractionOperands(this, others);
        return subtrahends.length === 0 ? this : this.cut(subtrahends);
    }

    /**
     * build123d's `&`: the common part of this shape and every operand (each operand narrows
     * the result further), cleaned; `undefined` when nothing is shared.
     */
    intersect(...others: (ShapeOperand | Axis | Plane)[]): Shape | undefined;
    intersect(
        ...args: [...others: (ShapeOperand | Axis | Plane)[], options: IntersectOptions]
    ): Shape | undefined;
    intersect(...args: (ShapeOperand | Axis | Plane | IntersectOptions)[]): Shape | undefined {
        let { operands, options } = intersectArguments(args);
        return intersectShapes(
            this,
            operands.map(other =>
                other instanceof Axis || other instanceof Plane
                    ? intersectionOperand(this, other)
                    : other,
            ),
            options,
        );
    }

    /** Fuse with `toFuse` (build123d `fuse`); the result may be of another class. */
    fuse(toFuse: ShapeOperand, options: FuseOptions = {}): Shape {
        return booleanFuse(this, toFuse instanceof Shape ? [toFuse] : [...toFuse], options);
    }

    /** Cut `toCut` out of this shape (build123d `cut`); the result may be of another class. */
    cut(toCut: ShapeOperand): Shape {
        return booleanCut(this, toCut instanceof Shape ? [toCut] : [...toCut]);
    }

    /**
     * Single-shape intersection, specialised per class (build123d `_intersect`); `intersect`
     * chains it over its operands. The base shape intersects with nothing.
     */
    intersectWith(other: Shape, options: IntersectOptions = {}): Shape[] | undefined {
        void other;
        void options;
        return undefined;
    }

    /**
     * Boundary contacts between this shape and another (build123d `Shape.touch`): where they
     * meet without their interiors overlapping. Only faces, shells, solids and compounds of
     * them have any.
     */
    touch(other: Shape, options: TouchOptions = {}): ShapeList<Shape> {
        void other;
        void options;
        return new ShapeList<Shape>();
    }

    /**
     * Merge faces and edges lying on the same geometry, dropping internal edges. The merge joins
     * the record of the operation that made this shape, so `Select.Last` still answers after it.
     */
    clean(): this {
        let cleaned = clean(this.wrapped);
        let record = recordOf(this);
        if (cleaned.history !== undefined) {
            record?.merge(cleaned.history);
            record ??= new ShapeHistory(cleaned.history);
        }
        let result = this.withWrapped(cleaned.shape);
        return record === undefined ? result : madeBy(result, record);
    }

    /** Attempt ShapeFix_Shape repair on a deep copy, returning this shape if already valid. */
    fix(): this {
        if (this.isValid) return this;
        let copy = native("Copy", () => shapes.copy(this.wrapped));
        return this.withWrapped(native("Fix shape", () => query.fixShape(copy)));
    }

    /**
     * A copy with every curve and surface approximated by B-splines (build123d `to_splines`), for
     * tools and formats that only read spline geometry.
     */
    toSplines(options: ToSplinesOptions = {}): this {
        return this.withWrapped(
            native("Spline approximation", () =>
                shapes.toSplines(
                    this.wrapped,
                    options.degree ?? 3,
                    options.tolerance ?? 1e-3,
                    options.nurbs ?? false,
                ),
            ),
        );
    }

    /**
     * Hidden-line projection onto a viewport at `viewportOrigin`, as visible and hidden edges
     * (build123d `project_to_viewport`).
     */
    projectToViewport(
        viewportOrigin: VectorLike,
        options: ViewportOptions = {},
    ): [visible: ShapeList<Edge>, hidden: ShapeList<Edge>] {
        return projectToViewport(this, viewportOrigin, options);
    }

    /**
     * Cut this shape with a plane, face or shell and keep the selected pieces (build123d
     * `Shape.split`). `Keep.Both` returns `[top, bottom]`.
     */
    split(tool: TrimmingTool, keep: typeof Keep.Both): [ShapeList<Shape>, ShapeList<Shape>];
    split(tool: TrimmingTool, keep?: Keep): ShapeList<Shape>;
    split(
        tool: TrimmingTool,
        keep: Keep = Keep.Top,
    ): ShapeList<Shape> | [ShapeList<Shape>, ShapeList<Shape>] {
        return splitPieces(this, tool, keep);
    }

    /** Lay `faces` along `path` on this shape's surface and project them onto it. */
    projectFaces(faces: Compound | Iterable<Face>, path: Edge | Wire, start = 0): ShapeList<Shape> {
        return projectFaces(this, faces, path, start);
    }

    /** Release the native shape now; any later use throws. */
    [Symbol.dispose](): void {
        shapes.dispose(this.wrapped);
    }

    toString(): string {
        return `${this.constructor.name}(${this.label === "" ? "" : `label=${this.label}`})`;
    }
}

/** Splits `intersect`'s arguments into its operands and the options object they may end with. */
function intersectArguments(args: readonly (ShapeOperand | Axis | Plane | IntersectOptions)[]): {
    operands: (ShapeOperand | Axis | Plane)[];
    options: IntersectOptions;
} {
    let last = args.at(-1);
    let isOptions =
        typeof last === "object" &&
        last !== null &&
        !(last instanceof Shape) &&
        !(last instanceof Axis) &&
        !(last instanceof Plane) &&
        !(Symbol.iterator in last);
    return {
        operands: (isOptions ? args.slice(0, -1) : args) as (ShapeOperand | Axis | Plane)[],
        options: isOptions ? (last as IntersectOptions) : {},
    };
}
