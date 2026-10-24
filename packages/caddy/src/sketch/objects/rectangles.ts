/** Rectangular sketch objects (build123d `Rectangle`, `RectangleRounded`). */

import type { SketchPlacement } from "../base.ts";

import { makeFaceRect } from "../../curves/face-makers.ts";
import { filletFace2D } from "../../curves/fillet-chamfer-2d.ts";
import { GeometryError } from "../../errors.ts";
import { BaseSketchObject } from "../base-object.ts";
import { CENTERED, placedFaces } from "../base.ts";

/** An axis-aligned rectangle. */
export class Rectangle extends BaseSketchObject {
    constructor(width: number, height: number, options: SketchPlacement = {}) {
        super(placedFaces(makeFaceRect(width, height), { align: CENTERED, ...options }));
    }
}

/** A rectangle whose four corners are rounded to the same radius. */
export class RectangleRounded extends BaseSketchObject {
    constructor(width: number, height: number, radius: number, options: SketchPlacement = {}) {
        if (width <= 2 * radius || height <= 2 * radius) {
            throw new GeometryError("width and height must be > 2*radius");
        }
        let base = makeFaceRect(width, height);
        let rounded = filletFace2D(base, radius, base.vertices());
        super(placedFaces(rounded, { align: CENTERED, ...options }));
    }
}
