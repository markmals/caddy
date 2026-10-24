/** Arrow heads and arrows for dimension lines (build123d `ArrowHead`, `Arrow`). */

import type { Edge } from "../topology/edge.ts";
import type { Wire } from "../topology/wire.ts";

import { TangentArc } from "../curves/objects/arcs.ts";
import { Line } from "../curves/objects/lines.ts";
import { Axis } from "../geometry/axis.ts";
import { Pos } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { sweep } from "../operations/sweep.ts";
import { mirror } from "../operations/transform.ts";
import { BaseSketchObject } from "../sketch/base-object.ts";
import { placedFaces } from "../sketch/base.ts";
import { Polygon } from "../sketch/objects/polygons.ts";
import { fillet2D } from "../sketch/operations/fillet-chamfer.ts";
import { makeFace } from "../sketch/operations/make-face.ts";
import { Curve, Sketch } from "../topology/composite.ts";
import { HeadType } from "./enums.ts";

export interface ArrowHeadOptions {
    /** Which outline to draw. Defaults to {@link HeadType.Curved}. */
    readonly headType?: HeadType;
    /** Degrees counter-clockwise the head is turned about its tip. */
    readonly rotation?: number;
}

/**
 * The head of an arrow: a face whose tip sits at the origin and whose tail runs back along -X
 * for `size` (build123d `ArrowHead`).
 */
export class ArrowHead extends BaseSketchObject {
    constructor(size: number, options: ArrowHeadOptions = {}) {
        super(
            placedFaces(arrowHeadSketch(size, options.headType ?? HeadType.Curved), {
                rotation: options.rotation ?? 0,
                align: null,
            }),
        );
    }
}

function arrowHeadSketch(size: number, headType: HeadType): Sketch {
    if (headType === HeadType.Straight) {
        return new Polygon(
            [
                [-size, size / 3],
                [-size, -size / 3],
                [0, 0],
            ],
            { align: null },
        );
    }
    if (headType === HeadType.Filleted) {
        let curved = arrowHeadSketch(size, HeadType.Curved);
        // Every vertex except the tip at the origin, which stays sharp.
        let corners = curved.vertices().filterByPosition(Axis.X, -2 * size, -size / 5);
        return fillet2D(corners, size / 20);
    }
    // One side of the head, mirrored across the X axis to close the outline.
    let side = new TangentArc([0, 0], [-size, size / 3], [-size, size / 6]);
    let tail = new Line(side.positionAt(1), [(-7 * size) / 8, 0]);
    let half = new Curve([side, tail]);
    return makeFace([...half.edges(), ...mirror(half, Plane.XZ).edges()]);
}

export interface ArrowOptions {
    /** Put the head at the start of the shaft rather than at its end. Defaults to `true`. */
    readonly headAtStart?: boolean;
    /** Which outline the head is drawn with. Defaults to {@link HeadType.Curved}. */
    readonly headType?: HeadType;
}

/**
 * An arrow head of `arrowSize` on a shaft of `shaftWidth` drawn along `shaftPath` (build123d
 * `Arrow`). The shaft stops half a head short of the end it points at so the tip is not buried.
 */
export class Arrow extends BaseSketchObject {
    constructor(
        arrowSize: number,
        shaftPath: Edge | Wire,
        shaftWidth: number,
        options: ArrowOptions = {},
    ) {
        let headAtStart = options.headAtStart ?? true;
        let angle = headAtStart ? shaftPath.tangentAngleAt(0) + 180 : shaftPath.tangentAngleAt(1);
        let head = new ArrowHead(arrowSize, {
            rotation: angle,
            ...(options.headType === undefined ? {} : { headType: options.headType }),
        }).moved(new Pos(shaftPath.positionAt(headAtStart ? 0 : 1)));

        let trimAmount = arrowSize / 2 / shaftPath.length;
        let shaft = headAtStart ? shaftPath.trim(trimAmount, 1) : shaftPath.trim(0, 1 - trimAmount);
        let swept = sweep(shaft.perpendicularLine(shaftWidth, 0), shaft);

        super(placedFaces(head.fuse(swept).clean(), { align: null }));
    }
}
