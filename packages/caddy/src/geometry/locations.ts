import type { VectorLike } from "./vector.ts";

import { GeometryError } from "../errors.ts";
import { Axis } from "./axis.ts";
import { Location, Pos } from "./location.ts";
import { Plane } from "./plane.ts";
import { Vector } from "./vector.ts";

/** Anything that names one placement: a location, a plane, an axis, or a point. */
export type LocationLike = Location | Plane | Axis | VectorLike;

/** One placement, or any nesting of iterables of them. */
export type LocationSource = LocationLike | Iterable<LocationSource>;

/**
 * A fixed set of placements (build123d `LocationList`).
 *
 * Collections are iterable, which is how the algebraic API repeats an object over an array:
 * `shape.transform(new GridLocations(10, 10, 2, 3))` returns one moved copy of the shape per
 * location, exactly as build123d's `GridLocations(10, 10, 2, 3) * shape` does.
 */
export abstract class LocationList implements Iterable<Location> {
    readonly locations: readonly Location[];

    protected constructor(locations: readonly Location[]) {
        this.locations = locations;
    }

    get length(): number {
        return this.locations.length;
    }

    [Symbol.iterator](): IterableIterator<Location> {
        return this.locations.values();
    }

    toString(): string {
        return `${this.constructor.name}: ${this.length} locations`;
    }
}

/** The placements of the given points, locations, planes and axes (build123d `Locations`). */
export class Locations extends LocationList {
    constructor(...points: readonly LocationSource[]) {
        super(Array.from(flatten(points), asLocation));
    }
}

/** Flattens the nested iterables build123d's `flatten_sequence` accepts. */
function* flatten(sources: Iterable<LocationSource>): IterableIterator<LocationLike> {
    for (let source of sources) {
        if (isSingle(source)) {
            yield source;
        } else if (isIterable(source)) {
            yield* flatten(source);
        } else {
            throw new GeometryError(`Locations does not accept ${String(source)}`);
        }
    }
}

/**
 * Is this one placement rather than a group of them?
 *
 * A point is an array of numbers, which is itself iterable, so the two are told apart by what the
 * array holds. An empty array is a group: `new Locations([])` places nothing, as in build123d.
 */
function isSingle(source: LocationSource): source is LocationLike {
    if (source instanceof Location || source instanceof Plane || source instanceof Axis) {
        return true;
    }
    if (source instanceof Vector) {
        return true;
    }
    return (
        Array.isArray(source) &&
        source.length > 0 &&
        source.every(entry => typeof entry === "number")
    );
}

function isIterable(source: unknown): source is Iterable<LocationSource> {
    return typeof source === "object" && source !== null && Symbol.iterator in source;
}

function asLocation(point: LocationLike): Location {
    if (point instanceof Location) {
        return point;
    }
    if (point instanceof Plane || point instanceof Axis) {
        return point.location;
    }
    return new Pos(point);
}
