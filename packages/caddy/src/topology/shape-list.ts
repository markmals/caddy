import type { VectorLike } from "../geometry/vector.ts";
import type { Compound } from "./compound.ts";
import type { Edge } from "./edge.ts";
import type { GeomType, SortBy } from "./enums.ts";
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

/** Options of {@link ShapeList#filterBy}. */
export interface FilterOptions {
    /** Keep the shapes that do not match instead. */
    readonly reverse?: boolean;
    /** Angular tolerance in degrees for axis and plane filters. */
    readonly tolerance?: number;
}

/** What {@link ShapeList#sortBy} and {@link ShapeList#groupBy} order by. */
export type SortCriterion<T extends Shape> = ((shape: T) => GroupKey) | Axis | SortBy | CurveLike;

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
 * `-` {@link difference}, `|` {@link filterBy}, `<<`/`>>` `groupBy(...).first`/`.last`.
 * Set-like operations treat shapes as equal when they are the same OCCT shape (`isSame`).
 */
export class ShapeList<T extends Shape = Shape> extends Array<T> {
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
    center(): Vector {
        if (this.length === 0) {
            return new Vector();
        }
        let total = this.reduce((sum, shape) => sum.add(shape.center()), new Vector());
        return total.divide(this.length);
    }

    vertices(): ShapeList<Vertex> {
        return new ShapeList(this.flatMap(shape => [...shape.vertices()]));
    }

    edges(): ShapeList<Edge> {
        return new ShapeList(this.flatMap(shape => [...shape.edges()]));
    }

    wires(): ShapeList<Wire> {
        return new ShapeList(this.flatMap(shape => [...shape.wires()]));
    }

    faces(): ShapeList<Face> {
        return new ShapeList(this.flatMap(shape => [...shape.faces()]));
    }

    shells(): ShapeList<Shell> {
        return new ShapeList(this.flatMap(shape => [...shape.shells()]));
    }

    solids(): ShapeList<Solid> {
        return new ShapeList(this.flatMap(shape => [...shape.solids()]));
    }

    compounds(): ShapeList<Compound> {
        return new ShapeList(this.flatMap(shape => [...shape.compounds()]));
    }

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

    /**
     * Keep the shapes matching `filter` (build123d `filter_by`, `|`): a predicate; a geometry
     * type; an axis, matching planar faces whose normal and lines whose direction are parallel
     * to it; or a plane, matching planar faces, edges and wires lying parallel to it.
     */
    filterBy(filter: ShapeFilter<T> | GeomType, options: FilterOptions = {}): ShapeList<T> {
        let predicate = filterPredicate(filter, options.tolerance ?? 1e-5);
        let reverse = options.reverse ?? false;
        return new ShapeList(this.filter(shape => predicate(shape) !== reverse));
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
            let position = plane.toLocalCoords(shape.center()).z;
            let aboveMinimum = includeMinimum ? minimum <= position : minimum < position;
            let belowMaximum = includeMaximum ? position <= maximum : position < maximum;
            return aboveMinimum && belowMaximum;
        });
        return new ShapeList(within).sortBy(axis);
    }

    /**
     * Sort by position along an axis (default Z), by a measure, by position along a curve, or by
     * a key function (build123d `sort_by`). Sorting by radius, area or volume drops shapes
     * without that measure.
     */
    sortBy(criterion: SortCriterion<T> = Axis.Z, reverse = false): ShapeList<T> {
        let key = this.#sortKey(criterion);
        let keyed = this.flatMap(shape => {
            let value = key(shape);
            return value === undefined ? [] : [{ shape, value }];
        });
        keyed.sort((a, b) => {
            let order = a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
            return reverse ? -order : order;
        });
        return new ShapeList(keyed.map(entry => entry.shape));
    }

    /** Sort by the minimal distance to `other` (build123d `sort_by_distance`). */
    sortByDistance(other: Shape | VectorLike, reverse = false): ShapeList<T> {
        return this.sortBy(shape => shape.distanceTo(other), reverse);
    }

    /**
     * Group by position along an axis (default Z), a measure, position along a curve or a key
     * function, with numeric keys rounded to `tolDigits` decimals (build123d `group_by`).
     */
    groupBy(criterion: SortCriterion<T> = Axis.Z, options: GroupOptions = {}): GroupBy<T> {
        let tolDigits = options.tolDigits ?? 6;
        let key = this.#sortKey(criterion);
        let keyOf = (shape: T): GroupKey => roundedKey(key(shape), tolDigits);
        return new GroupBy(keyOf, this, options.reverse ?? false);
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
