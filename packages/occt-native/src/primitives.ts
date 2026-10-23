// Solid primitives placed in a local frame. Angles are in radians.

import type { Frame, Shape } from "./types.ts";

import { addon } from "./addon.ts";
import { WORLD_FRAME, frameArray } from "./types.ts";

interface PrimitivesAddon {
    makeBox(frame: Float64Array, dx: number, dy: number, dz: number): Shape;
    makeCylinder(frame: Float64Array, radius: number, height: number, angle: number): Shape;
    makeCone(
        frame: Float64Array,
        baseRadius: number,
        topRadius: number,
        height: number,
        angle: number,
    ): Shape;
    makeSphere(
        frame: Float64Array,
        radius: number,
        angle1: number,
        angle2: number,
        angle3: number,
    ): Shape;
    makeTorus(
        frame: Float64Array,
        majorRadius: number,
        minorRadius: number,
        angle1: number,
        angle2: number,
        angle: number,
    ): Shape;
    makeWedge(
        frame: Float64Array,
        dx: number,
        dy: number,
        dz: number,
        xmin: number,
        zmin: number,
        xmax: number,
        zmax: number,
    ): Shape;
}

function native(): PrimitivesAddon {
    return addon<PrimitivesAddon>();
}

const FULL_TURN = 2 * Math.PI;

/** Box with one corner at the frame origin, extending along +X, +Y and +Z of the frame. */
export function makeBox(dx: number, dy: number, dz: number, frame: Frame = WORLD_FRAME): Shape {
    return native().makeBox(frameArray(frame), dx, dy, dz);
}

/** Cylinder on the frame's Z axis from z = 0 to `height`; `angle` sweeps from the frame's X axis. */
export function makeCylinder(
    radius: number,
    height: number,
    frame: Frame = WORLD_FRAME,
    angle = FULL_TURN,
): Shape {
    return native().makeCylinder(frameArray(frame), radius, height, angle);
}

export function makeCone(
    baseRadius: number,
    topRadius: number,
    height: number,
    frame: Frame = WORLD_FRAME,
    angle = FULL_TURN,
): Shape {
    return native().makeCone(frameArray(frame), baseRadius, topRadius, height, angle);
}

/** Sphere at the frame origin; `angle1`/`angle2` bound the latitude, `angle3` the longitude. */
export function makeSphere(
    radius: number,
    frame: Frame = WORLD_FRAME,
    angle1 = -Math.PI / 2,
    angle2 = Math.PI / 2,
    angle3 = FULL_TURN,
): Shape {
    return native().makeSphere(frameArray(frame), radius, angle1, angle2, angle3);
}

/** Torus around the frame's Z axis; `angle1`/`angle2` bound the minor circle, `angle` the sweep. */
export function makeTorus(
    majorRadius: number,
    minorRadius: number,
    frame: Frame = WORLD_FRAME,
    angle1 = 0,
    angle2 = FULL_TURN,
    angle = FULL_TURN,
): Shape {
    return native().makeTorus(frameArray(frame), majorRadius, minorRadius, angle1, angle2, angle);
}

/** OCCT wedge: a box whose top face (at y = dy) spans [xmin, xmax] x [zmin, zmax]. */
export function makeWedge(
    dx: number,
    dy: number,
    dz: number,
    top: { xmin: number; zmin: number; xmax: number; zmax: number },
    frame: Frame = WORLD_FRAME,
): Shape {
    return native().makeWedge(
        frameArray(frame),
        dx,
        dy,
        dz,
        top.xmin,
        top.zmin,
        top.xmax,
        top.zmax,
    );
}
