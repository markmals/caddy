import type * as occt from "@roonieone/occt-native";

import { measure, ShapeType, shapes, topology } from "@roonieone/occt-native";

import type { Axis } from "../geometry/axis.ts";
import type { BoundingBox } from "../geometry/bounding-box.ts";
import type { Plane } from "../geometry/plane.ts";
import type { IntersectOptions, ShapeOperand, ShapeOptions, TouchOptions } from "./shape.ts";

import { InvalidShapeError } from "../errors.ts";
import { Vector } from "../geometry/vector.ts";
import { booleanOperation, inheritAttributes, uniqueShapes } from "./boolean.ts";
import { fromVec3 } from "./conversions.ts";
import { CenterOf } from "./enums.ts";
import { native } from "./kernel.ts";
import { unionCurves } from "./mixin1d.ts";
import { Mixin3D } from "./mixin3d.ts";
import { nativeDimension } from "./native-topology.ts";
import {
    castShape,
    makeComposite,
    registerCompositeFactory,
    registerShapeConstructor,
} from "./registry.ts";
import { ShapeList } from "./shape-list.ts";
import { Shape } from "./shape.ts";

/** build123d's `TOLERANCE`, the fuzzy value of compound addition. */
const TOLERANCE = 1e-6;

/** Which mass integral build123d's compound centre uses, by the (common) child type. */
const CENTER_PROPERTY: Partial<Record<occt.ShapeType, "linear" | "surface" | "volume">> = {
    [ShapeType.Edge]: "linear",
    [ShapeType.Wire]: "linear",
    [ShapeType.Face]: "surface",
    [ShapeType.Shell]: "surface",
    [ShapeType.Solid]: "volume",
    [ShapeType.CompSolid]: "volume",
    [ShapeType.Compound]: "volume",
};

/** Where a compound is built from: a native shape, or the shapes it groups. */
export type CompoundSource = occt.Shape | Iterable<Shape>;

/** Options of {@link Compound#unwrap}. */
export interface UnwrapOptions {
    /** Strip every nesting level down to the single shape inside; defaults to true. */
    readonly fully?: boolean;
}

/** Options of {@link Compound#doChildrenIntersect}. */
export interface ChildIntersectionOptions {
    /** Test the compound itself against its children as well; defaults to false. */
    readonly includeParent?: boolean;
    /** Shared volume that still counts as not intersecting; defaults to 1e-5. */
    readonly tolerance?: number;
}

/** What {@link Compound#doChildrenIntersect} found. */
export interface ChildIntersection {
    /** Whether a pair shares more volume than the tolerance allows. */
    readonly intersect: boolean;
    /** The first intersecting pair, or `undefined` when none was found. */
    readonly shapes: readonly [Shape, Shape] | undefined;
    /** Volume that pair shares; zero when none was found. */
    readonly volume: number;
}

function compoundOf(source: CompoundSource): occt.Shape {
    if (Symbol.iterator in source) {
        return topology.makeCompound(Array.from(source as Iterable<Shape>, shape => shape.wrapped));
    }
    return source as occt.Shape;
}

/** A group of shapes of any kind held as one (build123d `Compound`). */
export class Compound extends Mixin3D implements Iterable<Shape> {
    static override readonly order: number = 4;

    /** Wrap a native compound (or any native shape), or group `shapes` into a new compound. */
    constructor(source: CompoundSource = [], options: ShapeOptions = {}) {
        super(compoundOf(source), options);
    }

    /** The common dimension of the top-level shapes; undefined when they differ. */
    override get dimension(): number | undefined {
        return nativeDimension(this.wrapped);
    }

    /** Total volume of the solids and shells directly inside this compound and its child compounds. */
    get volume(): number {
        let types = new Set<occt.ShapeType>([ShapeType.Solid, ShapeType.Shell]);
        return this.compounds()
            .flatMap(compound => topology.childShapes(compound.wrapped))
            .filter(child => types.has(shapes.shapeType(child)))
            .reduce((total, child) => total + castShape(child).volume, 0);
    }

    /** Number of direct children. */
    get length(): number {
        return topology.childShapes(this.wrapped).length;
    }

    /** The direct children. */
    *[Symbol.iterator](): Iterator<Shape> {
        for (let child of topology.childShapes(this.wrapped)) {
            yield castShape(child);
        }
    }

    /**
     * Centre of mass (default) or bounding box centre. The centre of mass integrates over edges,
     * faces or volumes according to the children's common type, as build123d does.
     */
    override center(centerOf: CenterOf = CenterOf.Mass): Vector {
        if (centerOf === CenterOf.Geometry) {
            throw new InvalidShapeError("Center of GEOMETRY is not supported for this object");
        }
        if (centerOf === CenterOf.BoundingBox) {
            return this.boundingBox().center();
        }
        let kind = CENTER_PROPERTY[this.#unwrappedShapeType()];
        if (kind === undefined) {
            throw new InvalidShapeError("Cannot compute the centre of mass of vertices");
        }
        let properties = native("Center of mass", () => measure.massProperties(this.wrapped, kind));
        return fromVec3(properties.centerOfMass);
    }

    /**
     * The type the centre of mass integrates over: a compound takes its children's common type,
     * while a composite wrapping a single face, shell or solid takes that shape's own type.
     */
    #unwrappedShapeType(): occt.ShapeType {
        let own = shapes.shapeType(this.wrapped);
        if (own !== ShapeType.Compound) {
            return own;
        }
        let types = new Set(
            topology.childShapes(this.wrapped).map(child => shapes.shapeType(child)),
        );
        let [only] = types;
        return types.size === 1 && only !== undefined ? only : ShapeType.Compound;
    }

    /** The compounds directly inside this one, followed by this compound itself. */
    override compounds(): ShapeList<Compound> {
        let children = [...this].filter(child => child instanceof Compound);
        return new ShapeList([...children, this]);
    }

    /**
     * The direct children of exactly `type` in this compound and its child compounds (build123d
     * `get_type`); unlike `solids()` and friends it does not look inside other shapes.
     */
    getType<T extends Shape>(type: abstract new (...args: never[]) => T): T[] {
        return this.compounds().flatMap(compound =>
            [...compound].filter((child): child is T => child.constructor === type),
        );
    }

    /**
     * The first pair of nested shapes that share more volume than `tolerance` allows (build123d
     * `do_children_intersect`). The compound itself is only tested with `includeParent`; pairs
     * are checked by their bounding boxes first, because a real intersection is expensive.
     */
    doChildrenIntersect(options: ChildIntersectionOptions = {}): ChildIntersection {
        let tolerance = options.tolerance ?? 1e-5;
        let children = [...nested(this)];
        if (options.includeParent !== true) {
            children.shift();
        }
        let boxes = children.map(child => child.boundingBox());
        for (let first = 0; first < children.length; first += 1) {
            for (let second = first + 1; second < children.length; second += 1) {
                if (!(boxes[first] as BoundingBox).intersects(boxes[second] as BoundingBox)) {
                    continue;
                }
                let one = children[first] as Shape;
                let other = children[second] as Shape;
                let common = one.intersect(other);
                let volume =
                    common === undefined
                        ? 0
                        : common.solids().reduce((total, solid) => total + solid.volume, 0);
                if (volume > tolerance) {
                    return { intersect: true, shapes: [one, other], volume };
                }
            }
        }
        return { intersect: false, shapes: undefined, volume: 0 };
    }

    /**
     * Strip compounds holding a single shape: the innermost shape with `fully`, otherwise the
     * innermost single-child compound.
     */
    unwrap(options: UnwrapOptions = {}): Shape {
        let fully = options.fully ?? true;
        let children = [...this];
        let [single] = children;
        if (children.length !== 1 || single === undefined) {
            return this;
        }
        inheritAttributes(single, this);
        if (single instanceof Compound) {
            let unwrapped = single.unwrap(options);
            return inheritAttributes(fully ? unwrapped : this.withWrapped(unwrapped.wrapped), this);
        }
        return fully ? single : this;
    }

    /**
     * build123d `Compound.__add__`: fuse the top-level shapes of this compound and the operands
     * (fuzzy 1e-6), returning a composite of this compound's dimension unless the fuse leaves a
     * compound. A compound of curves joins into wires instead.
     */
    override union(...others: ShapeOperand[]): Shape {
        if (this.dimension === 1) {
            let sum = unionCurves(this, others);
            return sum.shapeType === "Edge" ? makeComposite([sum], 1) : sum;
        }
        let brought = additionOperandsOf(others);
        if (brought.length === 0) {
            return this;
        }
        let summands = [...this.getTopLevelShapes(), ...brought];
        let [first, ...rest] = summands;
        if (first === undefined || rest.length === 0) {
            return makeComposite(summands.slice(0, 1), this.dimension);
        }
        inheritAttributes(first, this);
        let result = booleanOperation(this, [first], rest, { kind: "fuse", fuzzyValue: TOLERANCE });
        return result instanceof Compound ? result : makeComposite([result], this.dimension);
    }

    /** build123d `Compound.__sub__`: as `Shape#subtract`, always returning a composite. */
    override subtract(...others: ShapeOperand[]): Compound {
        return this.#asComposite(super.subtract(...others));
    }

    /** build123d `Compound.__and__`: as `Shape#intersect`, but empty rather than `undefined`. */
    override intersect(...others: (ShapeOperand | Axis | Plane)[]): Compound;
    override intersect(
        ...args: [...others: (ShapeOperand | Axis | Plane)[], options: IntersectOptions]
    ): Compound;
    override intersect(...args: (ShapeOperand | Axis | Plane | IntersectOptions)[]): Compound {
        if (this.length === 0) {
            throw new InvalidShapeError("Cannot intersect shape with empty compound");
        }
        let intersection = super.intersect(
            ...(args as [...(ShapeOperand | Axis | Plane)[], IntersectOptions]),
        );
        return intersection === undefined ? new Compound() : this.#asComposite(intersection);
    }

    /** `shape` as a compound (a composite of its dimension), carrying this one's attributes. */
    #asComposite(shape: Shape): Compound {
        let composite = shape instanceof Compound ? shape : (makeComposite([shape]) as Compound);
        return inheritAttributes(composite, this);
    }

    /**
     * build123d `Compound._intersect`: every child intersected with `other` (or each of its
     * children, when it is a compound), without duplicates.
     */
    override intersectWith(other: Shape, options: IntersectOptions = {}): Shape[] | undefined {
        let mine = [...this];
        if (mine.length === 0) {
            return undefined;
        }
        let theirs = other instanceof Compound ? [...other] : [other];
        let results = mine.flatMap(element =>
            theirs.flatMap(operand => element.intersectWith(operand, options) ?? []),
        );
        let unique = uniqueShapes(results);
        return unique.length > 0 ? unique : undefined;
    }

    /** build123d `Compound.touch`: the contacts of every element, without duplicates. */
    override touch(other: Shape, options: TouchOptions = {}): ShapeList<Shape> {
        return new ShapeList<Shape>(
            uniqueShapes([...this].flatMap(element => [...element.touch(other, options)])),
        );
    }
}

/** The top-level shapes of the operands, unvalidated: compounds add shapes of any dimension. */
function additionOperandsOf(operands: readonly ShapeOperand[]): Shape[] {
    return operands
        .flatMap(operand => (operand instanceof Shape ? [operand] : [...operand]))
        .flatMap(shape => [...shape.getTopLevelShapes()]);
}

/** A compound and everything inside it, outermost first (build123d's pre-order assembly walk). */
function* nested(shape: Shape): Generator<Shape> {
    yield shape;
    if (shape instanceof Compound) {
        for (let child of shape) {
            yield* nested(child);
        }
    }
}

registerShapeConstructor(ShapeType.Compound, wrapped => new Compound(wrapped));
registerShapeConstructor(ShapeType.CompSolid, wrapped => new Compound(wrapped));
registerCompositeFactory(undefined, pieces => new Compound(pieces));
