/** Slot sketch objects: a centre line thickened sideways (build123d `Slot*`). */

import type { VectorLike } from "../../geometry/vector.ts";
import type { Edge } from "../../topology/edge.ts";
import type { SketchPlacement } from "../base.ts";

import { makeLine } from "../../curves/edge-makers.ts";
import { offset2D } from "../../curves/offset-2d.ts";
import { combineWires } from "../../curves/wire-makers.ts";
import { GeometryError } from "../../errors.ts";
import { Vector } from "../../geometry/vector.ts";
import { Face } from "../../topology/face.ts";
import { Wire } from "../../topology/wire.ts";
import { BaseSketchObject } from "../base-object.ts";
import { CENTERED, placedFaces } from "../base.ts";
import { Circle } from "./circles.ts";

/** Thickens a centre line to `height`, capping the open ends with semicircles. */
function slotFace(centerLine: Wire, height: number): Face {
    let outline = offset2D(centerLine, height / 2);
    return new Face(outline instanceof Wire ? outline : new Wire(outline));
}

/** A straight centre line of `length` centred on the origin, split at its middle. */
function straightCenterLine(length: number): Wire {
    return new Wire([
        makeLine([-length / 2, 0, 0], [0, 0, 0]),
        makeLine([0, 0, 0], [length / 2, 0, 0]),
    ]);
}

/** A slot following an arbitrary arc or line. */
export class SlotArc extends BaseSketchObject {
    constructor(arc: Edge | Wire, height: number, options: { readonly rotation?: number } = {}) {
        let centerLine = arc instanceof Wire ? arc : new Wire(arc);
        super(placedFaces(slotFace(centerLine, height), { align: null, ...options }));
    }
}

/** A slot whose centre line runs from `point` through `center` to the mirror of `point`. */
export class SlotCenterPoint extends BaseSketchObject {
    constructor(
        center: VectorLike,
        point: VectorLike,
        height: number,
        options: { readonly rotation?: number } = {},
    ) {
        let middle = Vector.from(center);
        let end = Vector.from(point);
        let half = end.sub(middle);
        if (half.length <= 0) {
            throw new GeometryError(
                "Distance between center and point must be greater than 0 " +
                    `Got: distance = ${half.length} (computed)`,
            );
        }
        let combined = combineWires([makeLine(end, middle), makeLine(middle, middle.sub(half))]);
        let centerLine = combined[0];
        if (centerLine === undefined) {
            throw new GeometryError("Slot center line is not connected");
        }
        super(placedFaces(slotFace(centerLine, height), { align: null, ...options }));
    }
}

/** A slot whose two end circles are `centerSeparation` apart. */
export class SlotCenterToCenter extends BaseSketchObject {
    constructor(
        centerSeparation: number,
        height: number,
        options: { readonly rotation?: number } = {},
    ) {
        if (centerSeparation < 0) {
            throw new GeometryError(`Requires center_separation > 0. Got: ${centerSeparation}`);
        }
        let face =
            centerSeparation > 0
                ? slotFace(straightCenterLine(centerSeparation), height)
                : new Circle(height / 2).face();
        super(placedFaces(face, { align: null, ...options }));
    }
}

/** A slot `width` long overall, including its two rounded ends. */
export class SlotOverall extends BaseSketchObject {
    constructor(width: number, height: number, options: SketchPlacement = {}) {
        if (width < height) {
            throw new GeometryError(
                `Slot requires that width > height. Got: width=${width}, height=${height}`,
            );
        }
        let face =
            width > height
                ? slotFace(straightCenterLine(width - height), height)
                : new Circle(width / 2).face();
        super(placedFaces(face, { align: CENTERED, ...options }));
    }
}
