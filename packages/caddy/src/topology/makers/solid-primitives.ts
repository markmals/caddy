/**
 * Solid primitives placed on a base plane (build123d `Solid.make_box` and friends). The shapes
 * grow from the plane's origin along its axes; angles are in degrees, as build123d spells them.
 */

import { primitives } from "@roonieone/occt-native";

import type { BoundingBox } from "../../geometry/bounding-box.ts";
import type { Solid } from "../solid.ts";

import { frameOf } from "../../curves/frame.ts";
import { DEG2RAD } from "../../geometry/constants.ts";
import { Pos } from "../../geometry/location.ts";
import { OrientedBoundBox } from "../../geometry/oriented-bound-box.ts";
import { Plane } from "../../geometry/plane.ts";
import { castSolid } from "./cast.ts";

/** The plane a primitive is built on; defaults to `Plane.XY`. */
export interface PrimitiveOptions {
    readonly plane?: Plane;
}

/** A primitive swept around the plane's Z axis. */
export interface SweptPrimitiveOptions extends PrimitiveOptions {
    /** Arc of the sweep in degrees; defaults to a full turn. */
    readonly angle?: number;
}

export function makeBox(
    length: number,
    width: number,
    height: number,
    options: PrimitiveOptions = {},
): Solid {
    let frame = frameOf(options.plane ?? Plane.XY);
    return castSolid("Solid.makeBox", () => primitives.makeBox(length, width, height, frame));
}

export function makeCone(
    baseRadius: number,
    topRadius: number,
    height: number,
    options: SweptPrimitiveOptions = {},
): Solid {
    let frame = frameOf(options.plane ?? Plane.XY);
    let angle = (options.angle ?? 360) * DEG2RAD;
    return castSolid("Solid.makeCone", () =>
        primitives.makeCone(baseRadius, topRadius, height, frame, angle),
    );
}

export function makeCylinder(
    radius: number,
    height: number,
    options: SweptPrimitiveOptions = {},
): Solid {
    let frame = frameOf(options.plane ?? Plane.XY);
    let angle = (options.angle ?? 360) * DEG2RAD;
    return castSolid("Solid.makeCylinder", () =>
        primitives.makeCylinder(radius, height, frame, angle),
    );
}

/** Latitude is bounded by `angle1`/`angle2` and longitude swept by `angle3`, all in degrees. */
export interface SphereOptions extends PrimitiveOptions {
    readonly angle1?: number;
    readonly angle2?: number;
    readonly angle3?: number;
}

export function makeSphere(radius: number, options: SphereOptions = {}): Solid {
    let frame = frameOf(options.plane ?? Plane.XY);
    let { angle1 = -90, angle2 = 90, angle3 = 360 } = options;
    return castSolid("Solid.makeSphere", () =>
        primitives.makeSphere(radius, frame, angle1 * DEG2RAD, angle2 * DEG2RAD, angle3 * DEG2RAD),
    );
}

/** `startAngle`/`endAngle` bound the minor circle and `majorAngle` sweeps it, all in degrees. */
export interface TorusOptions extends PrimitiveOptions {
    readonly startAngle?: number;
    readonly endAngle?: number;
    readonly majorAngle?: number;
}

export function makeTorus(
    majorRadius: number,
    minorRadius: number,
    options: TorusOptions = {},
): Solid {
    let frame = frameOf(options.plane ?? Plane.XY);
    let { startAngle = 0, endAngle = 360, majorAngle = 360 } = options;
    return castSolid("Solid.makeTorus", () =>
        primitives.makeTorus(
            majorRadius,
            minorRadius,
            frame,
            startAngle * DEG2RAD,
            endAngle * DEG2RAD,
            majorAngle * DEG2RAD,
        ),
    );
}

/** A box of `delta` size whose top face spans `minX`..`maxX` by `minZ`..`maxZ`. */
export function makeWedge(
    deltaX: number,
    deltaY: number,
    deltaZ: number,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    options: PrimitiveOptions = {},
): Solid {
    let frame = frameOf(options.plane ?? Plane.XY);
    return castSolid("Solid.makeWedge", () =>
        primitives.makeWedge(
            deltaX,
            deltaY,
            deltaZ,
            { xmin: minX, zmin: minZ, xmax: maxX, zmax: maxZ },
            frame,
        ),
    );
}

/**
 * A box of the same size and placement as `bounds` (build123d `Solid.from_bounding_box`). An
 * axis-aligned box sits at its minimum corner; an oriented one keeps build123d's placement,
 * which takes the box's own orientation but offsets its origin along the world axes.
 */
export function fromBoundingBox(bounds: BoundingBox | OrientedBoundBox): Solid {
    let size = bounds.size;
    if (bounds instanceof OrientedBoundBox) {
        let plane = Plane.fromLocation(new Pos(size.divide(-2))).moved(bounds.location);
        return makeBox(size.x, size.y, size.z, { plane });
    }
    return makeBox(size.x, size.y, size.z).located(new Pos(bounds.min));
}
