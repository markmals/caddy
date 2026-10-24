import type { Align2DLike } from "./enums.ts";

import { GeometryError } from "../errors.ts";
import { Axis } from "./axis.ts";
import { toAlignOffset } from "./bounding-box.ts";
import { Align } from "./enums.ts";
import { Location } from "./location.ts";
import { LocationList } from "./locations.ts";
import { Vector } from "./vector.ts";

/** Options of {@link GridLocations} and {@link HexLocations}. */
export interface ArrayAlignOptions {
    /** Where the array sits relative to the origin; defaults to centred on both axes. */
    readonly align?: Align2DLike;
}

/** Options of {@link HexLocations}. */
export interface HexLocationsOptions extends ArrayAlignOptions {
    /** Read `radius` as the distance to a vertex instead of to a side. Defaults to `false`. */
    readonly majorRadius?: boolean;
}

/** Options of {@link PolarLocations}. */
export interface PolarLocationsOptions {
    /** Angle of the first point from the +X axis, in degrees. Defaults to 0. */
    readonly startAngle?: number;
    /** How far the array sweeps from `startAngle`, in degrees. Defaults to a full turn. */
    readonly angularRange?: number;
    /** Turn each placement to follow the arc. Defaults to `true`. */
    readonly rotate?: boolean;
    /** Sample `startAngle + angularRange` as the last point. Defaults to `false`. */
    readonly endpoint?: boolean;
}

const CENTERED: Align2DLike = [Align.Center, Align.Center];

/** A rectangular array of placements (build123d `GridLocations`). */
export class GridLocations extends LocationList {
    /** Distance from the first placement to the last, per axis. */
    readonly size: Vector;
    /** The array's bottom left corner. */
    readonly min: Vector;
    /** The array's top right corner. */
    readonly max: Vector;

    constructor(
        xSpacing: number,
        ySpacing: number,
        xCount: number,
        yCount: number,
        options: ArrayAlignOptions = {},
    ) {
        requireCount(xCount, "xCount");
        requireCount(yCount, "yCount");

        let size = new Vector(xSpacing * (xCount - 1), ySpacing * (yCount - 1));
        let offset = toAlignOffset([0, 0], size, options.align ?? CENTERED);
        let placements: Location[] = [];
        for (let column = 0; column < xCount; column += 1) {
            for (let row = 0; row < yCount; row += 1) {
                placements.push(
                    Location.fromPosition(offset.add([column * xSpacing, row * ySpacing])),
                );
            }
        }

        super(placements);
        this.size = size;
        this.min = offset;
        this.max = offset.add(size);
    }
}

/**
 * A hexagonal array of placements (build123d `HexLocations`).
 *
 * Columns are half a row apart, so every placement is equidistant from its six neighbours. For an
 * array of circles, use the circle radius plus half the gap between circles.
 */
export class HexLocations extends LocationList {
    /** Radius of the inscribed circle: the distance from a centre to a side. */
    readonly apothem: number;
    /** Distance across the hexagon through its centre, from vertex to vertex. */
    readonly diagonal: number;

    constructor(radius: number, xCount: number, yCount: number, options: HexLocationsOptions = {}) {
        let major = options.majorRadius === true;
        let diagonal = major ? 2 * radius : (4 * radius) / Math.sqrt(3);
        let xSpacing = (3 * diagonal) / 4;
        let ySpacing = (diagonal * Math.sqrt(3)) / 2;
        if (xSpacing <= 0 || ySpacing <= 0) {
            throw new GeometryError(`Spacing and count must be > 0, got radius ${radius}`);
        }
        requireCount(xCount, "xCount");
        requireCount(yCount, "yCount");

        // Odd columns sit half a row higher, which is what interlocks the hexagons.
        let points: Vector[] = [];
        for (let column = 0; column < xCount; column += 2) {
            for (let row = 0; row < yCount; row += 1) {
                points.push(new Vector(xSpacing * column, ySpacing * row + ySpacing / 2));
            }
        }
        for (let column = 1; column < xCount; column += 2) {
            for (let row = 0; row < yCount; row += 1) {
                points.push(new Vector(xSpacing * column, ySpacing * row + ySpacing));
            }
        }

        let xValues = points.map(point => point.x);
        let yValues = points.map(point => point.y);
        let corner = new Vector(Math.min(...xValues), Math.min(...yValues));
        let size = new Vector(Math.max(...xValues) - corner.x, Math.max(...yValues) - corner.y);
        let offset = toAlignOffset([0, 0], size, options.align ?? CENTERED).sub(corner);

        super(points.map(point => Location.fromPosition(point.add(offset))));
        this.apothem = major ? radius * Math.cos(Math.PI / 6) : radius;
        this.diagonal = diagonal;
    }
}

/** Placements spaced around a circle (build123d `PolarLocations`). */
export class PolarLocations extends LocationList {
    constructor(radius: number, count: number, options: PolarLocationsOptions = {}) {
        requireCount(count, "count");
        let startAngle = options.startAngle ?? 0;
        let angularRange = options.angularRange ?? 360;
        let endpoint = options.endpoint === true;
        let step = count === 1 ? 0 : angularRange / (count - (endpoint ? 1 : 0));
        let rotate = options.rotate !== false;

        let placements: Location[] = [];
        for (let index = 0; index < count; index += 1) {
            let angle = startAngle + step * index;
            placements.push(
                Location.fromAxisAngle(
                    new Vector(radius, 0).rotate(Axis.Z, angle),
                    [0, 0, 1],
                    rotate ? angle : 0,
                ),
            );
        }
        super(placements);
    }
}

function requireCount(count: number, name: string): void {
    if (!Number.isInteger(count) || count < 1) {
        throw new GeometryError(`${name} must be a whole number of at least 1, got ${count}`);
    }
}
