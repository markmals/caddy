/** Round sketch objects (build123d `Circle`, `Ellipse`). */

import { features } from "@roonieone/occt-native";

import type { SketchPlacement } from "../base.ts";

import { castFace } from "../../curves/cast.ts";
import { makeLine } from "../../curves/edge-makers.ts";
import { makeWireCircle, makeWireEllipse } from "../../curves/wire-makers.ts";
import { DEG2RAD } from "../../geometry/constants.ts";
import { Face } from "../../topology/face.ts";
import { BaseSketchObject } from "../base-object.ts";
import { CENTERED, placedFaces } from "../base.ts";

/** The Z axis every sector is swept about. */
const SWEEP_AXIS = { origin: [0, 0, 0], direction: [0, 0, 1] } as const;

/** A sector of a circle, swept counter-clockwise from the X axis. */
function sector(radius: number, arcSize: number): Face {
    let radial = makeLine([radius, 0, 0], [0, 0, 0]);
    return castFace("Circle", () =>
        features.revolve(radial.wrapped, SWEEP_AXIS, arcSize * DEG2RAD),
    );
}

/** A full circle, or a pie sector of `arcSize` degrees starting at the X axis. */
export class Circle extends BaseSketchObject {
    constructor(
        radius: number,
        options: SketchPlacement & { readonly arcSize?: number | undefined } = {},
    ) {
        let arcSize = options.arcSize ?? 360;
        let face = arcSize === 360 ? new Face(makeWireCircle(radius)) : sector(radius, arcSize);
        super(placedFaces(face, { align: CENTERED, ...options }));
    }
}

/** An axis-aligned ellipse. */
export class Ellipse extends BaseSketchObject {
    constructor(xRadius: number, yRadius: number, options: SketchPlacement = {}) {
        super(
            placedFaces(new Face(makeWireEllipse(xRadius, yRadius)), {
                align: CENTERED,
                ...options,
            }),
        );
    }
}
