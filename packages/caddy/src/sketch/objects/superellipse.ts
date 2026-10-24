/** A superellipse: a rounded rectangle whose corner sharpness follows an exponent
 * (build123d `Superellipse`). */

import type { SketchPlacement } from "../base.ts";

import { makeEllipse, makeLine } from "../../curves/edge-makers.ts";
import { makeSpline } from "../../curves/spline-makers.ts";
import { GeometryError } from "../../errors.ts";
import { Plane } from "../../geometry/plane.ts";
import { Vector } from "../../geometry/vector.ts";
import { Edge } from "../../topology/edge.ts";
import { Face } from "../../topology/face.ts";
import { Wire } from "../../topology/wire.ts";
import { BaseSketchObject } from "../base-object.ts";
import { CENTERED, placedFaces } from "../base.ts";

export interface SuperellipseOptions extends SketchPlacement {
    /** Exponent of the curve: 1 is a diamond, 2 an ellipse, higher values squarer. */
    readonly order?: number;
    /** Samples used for the spline of the general case. */
    readonly pointCount?: number;
}

export class Superellipse extends BaseSketchObject {
    constructor(width: number, height: number, options: SuperellipseOptions = {}) {
        let order = options.order ?? 4;
        if (order <= 0) {
            throw new GeometryError("Order must be greater than zero.");
        }
        let topRight = quadrant(width, height, order, options.pointCount ?? 16);
        let topLeft = topRight.mirror(Plane.YZ).reversed();
        let perimeter = [
            topRight,
            topLeft,
            topLeft.mirror(Plane.XZ).reversed(),
            topRight.mirror(Plane.XZ).reversed(),
        ];
        super(placedFaces(new Face(new Wire(perimeter)), { align: CENTERED, ...options }));
    }
}

/** The quarter running from `(width/2, 0)` to `(0, height/2)`. */
function quadrant(width: number, height: number, order: number, pointCount: number): Edge {
    if (order === 1) {
        return makeLine([width / 2, 0, 0], [0, height / 2, 0]);
    }
    if (order === 2) {
        return makeEllipse(width / 2, height / 2, { startAngle: 0, endAngle: 90 });
    }
    let points = [new Vector(width / 2, 0)];
    for (let index = 1; index < pointCount - 1; index++) {
        let angle = (index * Math.PI) / pointCount / 2;
        points.push(
            new Vector(
                (Math.abs(Math.cos(angle)) ** (2 / order) * width * Math.sign(Math.cos(angle))) / 2,
                (Math.abs(Math.sin(angle)) ** (2 / order) * height * Math.sign(Math.sin(angle))) /
                    2,
            ),
        );
    }
    points.push(new Vector(0, height / 2));
    return makeSpline(points);
}
