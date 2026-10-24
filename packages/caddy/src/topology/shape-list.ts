import type { VectorLike } from "../geometry/vector.ts";
import type { Compound } from "./compound.ts";
import type { Edge } from "./edge.ts";
import type { SortBy } from "./enums.ts";
import type { Face } from "./face.ts";
import type { GroupKey } from "./group-by.ts";
import type { CurveLike, ShapeFilter } from "./selectors.ts";
import type { Shape } from "./shape.ts";
import type { Shell } from "./shell.ts";
import type { Solid } from "./solid.ts";
import type { Vertex } from "./vertex.ts";
import type { Wire } from "./wire.ts";

import { InvalidShapeError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { expandShapes, uniqueShapes } from "./boolean.ts";
import { GroupBy } from "./group-by.ts";
import {
    axisPositionKey,
    curvePositionKey,
    filterPredicate,
    measureKey,
    roundedKey,
} from "./selectors.ts";

/** Options of {@link ShapeList#filter} when it is given a criterion instead of a predicate. */
export interface FilterOptions {
    /** Keep the shapes that do not match instead. */
    readonly reverse?: boolean;
    /** Angular tolerance in degrees for axis and plane filters. */
    readonly tolerance?: number;
}

/** What {@link ShapeList#groupBy} groups by. */
export type SortCriterion<T extends Shape> = ((shape: T) => GroupKey) | Axis | SortBy | CurveLike;

/**
 * What {@link ShapeList#sort} and {@link ShapeList#toSorted} order by: an `Array#sort`
 * comparator, or one of the CAD criteria.
 */
export type SortOrder<T extends Shape> = ((a: T, b: T) => number) | Axis | SortBy | CurveLike;

/** Options of {@link ShapeList#sort}, {@link ShapeList#toSorted} and friends. */
export interface SortOptions {
    /** Sort from the largest key down. */
    readonly reverse?: boolean;
}

/** Options of {@link ShapeList#groupBy}. */
export interface GroupOptions {
    /** Order the groups from the largest key down. */
    readonly reverse?: boolean;
    /** Keys are rounded to this many decimals before grouping (default 6). */
    readonly tolDigits?: number;
}

function isShape(value: unknown): value is Shape {
    return typeof value === "object" && value !== null && "wrapped" in value;
}

/**
 * An array of shapes with CAD-specific selection (build123d `ShapeList`): filter by direction,
 * plane or geometry type, sort and group by position or measure, and gather sub-shapes.
 *
 * Python operators are named methods: `+` {@link concat}, `&` {@link intersection},
 * `-` {@link difference}, `|` {@link filter}, `<<`/`>>` `groupBy(...).first`/`.last`.
 * Set-like operations treat shapes as equal when they are the same OCCT shape (`isSame`).
 */
export class ShapeList<T extends Shape = Shape> extends Array<T> {
    /**
     * Array methods that may produce non-shapes (`map`, `flatMap`, ...) return plain arrays, as
     * their signatures promise. Methods that only select or reorder shapes ({@link filter},
     * {@link slice}, {@link toSorted}, {@link toReversed}, {@link concat}) return shape lists, as
     * build123d's slicing does.
     */
    static override get [Symbol.species](): ArrayConstructor {
        return Array;
    }

    /** A list of `items`; a number gives an empty list of that length, as `Array` does. */
    constructor(items: Iterable<T> | number = []) {
        if (typeof items === "number") {
            super(items);
            return;
        }
        super();
        for (let item of items) {
            this.push(item);
        }
    }

    get first(): T {
        return this.#item(0);
    }

    get last(): T {
        return this.#item(-1);
    }

    #item(index: number): T {
        let found = this.at(index);
        if (found === undefined) {
            throw new RangeError("ShapeList is empty");
        }
        return found;
    }

    /** A new list with `items` appended: single shapes or collections of shapes (`+`). */
    override concat(...items: (T | Iterable<T> | ConcatArray<T>)[]): ShapeList<T> {
        let result = new ShapeList<T>(this);
        for (let item of items) {
            if (isShape(item)) {
                result.push(item);
            } else {
                result.push(...Array.from(item as ArrayLike<T> | Iterable<T>));
            }
        }
        return result;
    }

    /** The shapes from `start` up to (not including) `end`, as a new list (`list[start:end]`). */
    override slice(start?: number, end?: number): ShapeList<T> {
        return new ShapeList(super.slice(start, end));
    }

    /** The shapes in reverse order, as a new list (`list[::-1]`). */
    override toReversed(): ShapeList<T> {
        return new ShapeList(super.toReversed());
    }

    /** The shapes of this list that `other` also holds (`&`), without duplicates. */
    intersection(other: Iterable<Shape>): ShapeList<T> {
        let others = [...other];
        return new ShapeList(uniqueShapes(this).filter(shape => others.some(o => o.isSame(shape))));
    }

    /** The shapes of this list that `other` does not hold (`-`), without duplicates. */
    difference(other: Iterable<Shape>): ShapeList<T> {
        let others = [...other];
        return new ShapeList(
            uniqueShapes(this).filter(shape => !others.some(o => o.isSame(shape))),
        );
    }

    /** Whether both lists hold the same set of shapes (build123d `==`). */
    equals(other: Iterable<Shape>): boolean {
        let mine = uniqueShapes(this);
        let theirs = uniqueShapes(other);
        return (
            mine.length === theirs.length && mine.every(shape => theirs.some(o => o.isSame(shape)))
        );
    }

    /** Compounds dissolved into their contents, shells into faces and wires into edges. */
    expand(): ShapeList<Shape> {
        return new ShapeList(expandShapes(this));
    }

    /** The average of the shapes' centres; the origin for an empty list. */
    get center(): Vector {
        if (this.length === 0) {
            return new Vector();
        }
        let total = this.reduce((sum, shape) => sum.add(shape.center), new Vector());
        return total.divide(this.length);
    }

    get vertices(): ShapeList<Vertex> {
        return new ShapeList(this.flatMap(shape => [...shape.vertices]));
    }

    get edges(): ShapeList<Edge> {
        return new ShapeList(this.flatMap(shape => [...shape.edges]));
    }

    get wires(): ShapeList<Wire> {
        return new ShapeList(this.flatMap(shape => [...shape.wires]));
    }

    get faces(): ShapeList<Face> {
        return new ShapeList(this.flatMap(shape => [...shape.faces]));
    }

    get shells(): ShapeList<Shell> {
        return new ShapeList(this.flatMap(shape => [...shape.shells]));
    }

    get solids(): ShapeList<Solid> {
        return new ShapeList(this.flatMap(shape => [...shape.solids]));
    }

    get compounds(): ShapeList<Compound> {
        return new ShapeList(this.flatMap(shape => [...shape.compounds]));
    }

    get vertex(): Vertex {
        return exactlyOne(this.vertices, "vertex");
    }

    get edge(): Edge {
        return exactlyOne(this.edges, "edge");
    }

    get wire(): Wire {
        return exactlyOne(this.wires, "wire");
    }

    get face(): Face {
        return exactlyOne(this.faces, "face");
    }

    get shell(): Shell {
        return exactlyOne(this.shells, "shell");
    }

    get solid(): Solid {
        return exactlyOne(this.solids, "solid");
    }

    get compound(): Compound {
        return exactlyOne(this.compounds, "compound");
    }

    /** Keep the shapes `predicate` accepts, narrowing them to `S` (`Array#filter`). */
    override filter<S extends T>(
        predicate: (value: T, index: number, array: T[]) => value is S,
        thisArg?: unknown,
    ): ShapeList<S>;
    /** Keep the shapes `predicate` accepts (`Array#filter`). */
    override filter(
        predicate: (value: T, index: number, array: T[]) => unknown,
        thisArg?: unknown,
    ): ShapeList<T>;
    /**
     * Keep the shapes matching `criterion` (build123d `filter_by`, `|`): a geometry type; an
     * axis, matching planar faces whose normal and lines whose direction are parallel to it; or
     * a plane, matching planar faces, edges and wires lying parallel to it.
     */
    override filter(criterion: ShapeFilter, options?: FilterOptions): ShapeList<T>;
    override filter(
        criterion: ((value: T, index: number, array: T[]) => unknown) | ShapeFilter,
        second?: unknown,
    ): ShapeList<T> {
        if (typeof criterion === "function") {
            return new ShapeList(super.filter(criterion, second));
        }
        let options = (second ?? {}) as FilterOptions;
        let predicate = filterPredicate(criterion, options.tolerance ?? 1e-5);
        let reverse = options.reverse ?? false;
        return new ShapeList(super.filter(shape => predicate(shape) !== reverse));
    }

    /**
     * Shapes whose centres lie between `minimum` and `maximum` along `axis`, sorted along it
     * (build123d `filter_by_position`); `inclusive` says whether each bound is included.
     */
    filterByPosition(
        axis: Axis,
        minimum: number,
        maximum: number,
        inclusive: readonly [boolean, boolean] = [true, true],
    ): ShapeList<T> {
        let plane = Plane.fromAxis(axis);
        let [includeMinimum, includeMaximum] = inclusive;
        let within = this.filter(shape => {
            let position = plane.toLocalCoords(shape.center).z;
            let aboveMinimum = includeMinimum ? minimum <= position : minimum < position;
            let belowMaximum = includeMaximum ? position <= maximum : position < maximum;
            return aboveMinimum && belowMaximum;
        });
        return within.toSorted(axis);
    }

    /**
     * A new list sorted by position along an axis (Z by default, as build123d sorts), by a
     * measure, by position along a curve, or by an `Array#sort` comparator. Sorting by radius,
     * area or volume drops the shapes without that measure.
     */
    override toSorted(order: SortOrder<T> = Axis.Z, options: SortOptions = {}): ShapeList<T> {
        return new ShapeList(this.#ordered(order, options.reverse ?? false));
    }

    /**
     * Sort this list in place and return it (`Array#sort`), by the same orders
     * {@link toSorted} takes. Sorting by a measure drops the shapes without it here too.
     */
    override sort(order: SortOrder<T> = Axis.Z, options: SortOptions = {}): this {
        let sorted = this.#ordered(order, options.reverse ?? false);
        this.length = 0;
        for (let shape of sorted) {
            this.push(shape);
        }
        return this;
    }

    /** A new list sorted by the minimal distance to `other` (build123d `sort_by_distance`). */
    toSortedByDistance(other: Shape | VectorLike, options: SortOptions = {}): ShapeList<T> {
        return new ShapeList(
            this.#orderedByKey(shape => shape.distanceTo(other), options.reverse ?? false),
        );
    }

    /**
     * Group by position along an axis (default Z), a measure, position along a curve or a key
     * function, with numeric keys rounded to `tolDigits` decimals (build123d `group_by`).
     */
    groupBy(criterion: SortCriterion<T> = Axis.Z, options: GroupOptions = {}): GroupBy<T> {
        let tolDigits = options.tolDigits ?? 6;
        let key = this.#sortKey(criterion);
        let keyOf = (shape: T): GroupKey => roundedKey(key(shape), tolDigits);
        return new GroupBy(keyOf, this, { reverse: options.reverse ?? false });
    }

    /** The shapes in the order `order` asks for; a comparator sorts, a criterion keys. */
    #ordered(order: SortOrder<T>, reverse: boolean): T[] {
        if (typeof order === "function") {
            let sorted = [...this].sort(order);
            return reverse ? sorted.reverse() : sorted;
        }
        return this.#orderedByKey(this.#sortKey(order), reverse);
    }

    /** The shapes ordered by `key`, dropping the ones it has no key for. */
    #orderedByKey(key: (shape: T) => GroupKey | undefined, reverse: boolean): T[] {
        let keyed = [...this].flatMap(shape => {
            let value = key(shape);
            return value === undefined ? [] : [{ shape, value }];
        });
        keyed.sort((a, b) => {
            let order = a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
            return reverse ? -order : order;
        });
        return keyed.map(entry => entry.shape);
    }

    #sortKey(criterion: SortCriterion<T>): (shape: T) => GroupKey | undefined {
        if (typeof criterion === "function") {
            return criterion;
        }
        if (criterion instanceof Axis) {
            return axisPositionKey(criterion);
        }
        if (typeof criterion === "string") {
            return measureKey(criterion);
        }
        return curvePositionKey(criterion);
    }
}

/** The only item of `found`; throws unless there is exactly one (build123d's singular getters). */
export function exactlyOne<T>(found: ArrayLike<T>, kind: string): T {
    let only = found[0];
    if (found.length !== 1 || only === undefined) {
        throw new InvalidShapeError(`Expected exactly one ${kind}, found ${found.length}`);
    }
    return only;
}
