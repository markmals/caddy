import type * as occt from "@roonieone/occt-native";

import { construct, ShapeType, topology } from "@roonieone/occt-native";

import type { Transform } from "../geometry/transform.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { Convexity } from "./enums.ts";
import type { Face } from "./face.ts";
import type { IntersectOptions, ShapeOptions, SubShapeOptions } from "./shape.ts";

import { InvalidShapeError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { Location } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { fromVec3, toVec3 } from "./conversions.ts";
import { native } from "./kernel.ts";
import { registerShapeConstructor } from "./registry.ts";
import { ShapeList } from "./shape-list.ts";
import { Shape } from "./shape.ts";
import { cornerConvexity, creaseConvexity } from "./vertex-convexity.ts";

function isNativeShape(value: unknown): value is occt.Shape {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Vector)
    );
}

/** A point of the topology: the ends of edges and the corners of faces (build123d `Vertex`). */
export class Vertex extends Shape {
    static override readonly order: number = 0;

    /** A vertex at the origin. */
    constructor();
    /** Wrap a native vertex. */
    constructor(wrapped: occt.Shape, options?: ShapeOptions);
    /** A vertex at `(x, y, z)`; missing coordinates are 0. */
    constructor(x: number, y?: number, z?: number);
    /** A vertex at a point. */
    constructor(point: VectorLike);
    constructor(
        first: occt.Shape | VectorLike | number = 0,
        second: ShapeOptions | number = 0,
        z = 0,
    ) {
        if (isNativeShape(first)) {
            super(first, typeof second === "object" ? second : {});
            return;
        }
        let point =
            typeof first === "number"
                ? new Vector(first, typeof second === "number" ? second : 0, z)
                : Vector.from(first);
        super(native("Vertex construction", () => construct.makeVertex(toVec3(point))));
    }

    /** Vertices are 0D: extrusion only ever raises a dimension, so it cannot build one. */
    static extrude(): never {
        throw new InvalidShapeError("Vertices can't be created by extrusion");
    }

    get dimension(): number {
        return 0;
    }

    get volume(): number {
        return 0;
    }

    /**
     * How the shape this vertex was selected from sits around it (build123d
     * `Vertex.convexity`): a corner of the face it was taken through, or the creases meeting at
     * it when it came straight off a solid or shell.
     */
    override get convexity(): Convexity {
        let face = [...this.topoPath].reverse().find(step => step.shapeType === "Face");
        return face === undefined ? creaseConvexity(this) : cornerConvexity(this, face as Face);
    }

    /** The vertex's point, including its location. */
    #point(): Vector {
        return fromVec3(topology.vertexPoint(this.wrapped));
    }

    get x(): number {
        return this.#point().x;
    }

    get y(): number {
        return this.#point().y;
    }

    get z(): number {
        return this.#point().z;
    }

    /** The centre of a vertex is its point. */
    center(): Vector {
        return this.#point();
    }

    /** The coordinates `[x, y, z]` (build123d iterates a vertex as its coordinates). */
    toArray(): [number, number, number] {
        return this.#point().toTuple();
    }

    /** A new vertex offset by a vertex or vector (build123d `Vertex + other`). */
    add(other: Vertex | VectorLike): Vertex {
        let offset = other instanceof Vertex ? other.#point() : Vector.from(other);
        return new Vertex(this.#point().add(offset));
    }

    /** A new vertex offset by minus a vertex or vector (build123d `Vertex - other`). */
    sub(other: Vertex | VectorLike): Vertex {
        let offset = other instanceof Vertex ? other.#point() : Vector.from(other);
        return new Vertex(this.#point().sub(offset));
    }

    /** A new vertex at the transformed point. */
    override transformShape(transform: Transform): this {
        return new Vertex(transform.apply(this.#point())) as this;
    }

    override vertex(): Vertex {
        return this;
    }

    override vertices(options: SubShapeOptions = {}): ShapeList<Vertex> {
        return this.selected(new ShapeList<Vertex>([this]), options.select);
    }

    /** build123d's `Vertex & other` is not supported: vertices cannot be intersected. */
    override intersect(): never {
        throw new InvalidShapeError("Vertices can't be intersected");
    }

    /**
     * The vertex itself when it lies on/in `other` within `tolerance` (build123d
     * `Vertex._intersect`); otherwise `undefined`.
     */
    override intersectWith(
        other: Shape | VectorLike | Location | Axis | Plane,
        options: IntersectOptions = {},
    ): Shape[] | undefined {
        let tolerance = options.tolerance ?? 1e-6;
        if (other instanceof Axis) {
            return axisContains(other, this.#point()) ? [this] : undefined;
        }
        if (other instanceof Plane) {
            return other.contains(this.#point(), tolerance) ? [this] : undefined;
        }
        let target =
            other instanceof Location
                ? new Vertex(other.position)
                : other instanceof Shape
                  ? other
                  : new Vertex(other);
        if (target instanceof Vertex) {
            return this.distanceTo(target) <= tolerance ? [this] : undefined;
        }
        return target.intersectWith(this, options);
    }

    override toString(): string {
        let [x, y, z] = this.toArray();
        return `Vertex(${x}, ${y}, ${z})`;
    }
}

/** build123d `Axis._intersect_vector`: the point equals its projection onto the line. */
function axisContains(axis: Axis, point: Vector): boolean {
    let along = point.sub(axis.position).dot(axis.direction);
    return axis.direction.multiply(along).add(axis.position).equals(point);
}

registerShapeConstructor(ShapeType.Vertex, wrapped => new Vertex(wrapped));
