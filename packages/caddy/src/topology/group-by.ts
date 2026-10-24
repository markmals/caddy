import type { Shape } from "./shape.ts";

import { GeomType } from "./enums.ts";
import { ShapeList } from "./shape-list.ts";

/** A group key: numbers sort numerically, strings by code point. */
export type GroupKey = number | string;

/**
 * build123d sorts enum keys by their definition order rather than their names; geometry types
 * are the enum keys shapes are grouped by.
 */
const GEOM_TYPE_ORDER = new Map<string, number>(
    Object.values(GeomType).map((value, index) => [value, index]),
);

function compareKeys(first: GroupKey, second: GroupKey): number {
    let a = typeof first === "string" ? (GEOM_TYPE_ORDER.get(first) ?? first) : first;
    let b = typeof second === "string" ? (GEOM_TYPE_ORDER.get(second) ?? second) : second;
    if (a < b) return -1;
    return a > b ? 1 : 0;
}

/**
 * Shapes grouped by a key and ordered by it (build123d `GroupBy`): groups are reached by index,
 * by key ({@link group}) or by member ({@link groupFor}).
 */
export class GroupBy<T extends Shape = Shape> implements Iterable<ShapeList<T>> {
    readonly groups: readonly ShapeList<T>[];
    readonly #keys: readonly GroupKey[];
    readonly #keyOf: (shape: T) => GroupKey;

    constructor(keyOf: (shape: T) => GroupKey, shapes: Iterable<T>, reverse = false) {
        this.#keyOf = keyOf;
        let keyed = Array.from(shapes, shape => ({ shape, key: keyOf(shape) }));
        keyed.sort((a, b) => (reverse ? compareKeys(b.key, a.key) : compareKeys(a.key, b.key)));
        let groups: ShapeList<T>[] = [];
        let keys: GroupKey[] = [];
        for (let { shape, key } of keyed) {
            if (keys.length > 0 && keys.at(-1) === key) {
                groups.at(-1)?.push(shape);
            } else {
                keys.push(key);
                groups.push(new ShapeList([shape]));
            }
        }
        this.groups = groups;
        this.#keys = keys;
    }

    get length(): number {
        return this.groups.length;
    }

    /** The group with the smallest key (build123d `<<`). */
    get first(): ShapeList<T> {
        return this.at(0);
    }

    /** The group with the largest key (build123d `>>`). */
    get last(): ShapeList<T> {
        return this.at(-1);
    }

    /** The group at `index`; negative indices count from the end. */
    at(index: number): ShapeList<T> {
        let found = this.groups.at(index);
        if (found === undefined) {
            throw new RangeError(`Group index ${index} out of range for ${this.length} groups`);
        }
        return found;
    }

    /** The group whose key is `key`. */
    group(key: GroupKey): ShapeList<T> {
        let index = this.#keys.indexOf(key);
        if (index === -1) {
            throw new RangeError(`No group has the key ${String(key)}`);
        }
        return this.at(index);
    }

    /** The group `shape` falls in. */
    groupFor(shape: T): ShapeList<T> {
        return this.group(this.#keyOf(shape));
    }

    [Symbol.iterator](): Iterator<ShapeList<T>> {
        return this.groups[Symbol.iterator]();
    }
}
