/** A triangle solved from any three of its sides and angles (build123d `Triangle`). */

import type { SketchPlacement } from "../base.ts";
import type { PartialTriangle } from "../triangle-solver.ts";

import { makeWirePolygon } from "../../curves/wire-makers.ts";
import { Axis } from "../../geometry/axis.ts";
import { DEG2RAD, RAD2DEG } from "../../geometry/constants.ts";
import { Pos } from "../../geometry/location.ts";
import { Vector } from "../../geometry/vector.ts";
import { Face } from "../../topology/face.ts";
import { BaseSketchObject } from "../base-object.ts";
import { placedFaces } from "../base.ts";
import { solveTriangle } from "../triangle-solver.ts";

/** Sides `a`, `b`, `c` and the angles `A`, `B`, `C` opposite them, in degrees. */
export interface TriangleOptions extends SketchPlacement, PartialTriangle {}

/**
 * Side `a` runs along the X axis from the origin; the solved triangle is then centred on the
 * mean of its three corners, which is what build123d does before any alignment.
 */
export class Triangle extends BaseSketchObject {
    /** Side opposite angle A. */
    readonly a: number;
    /** Side opposite angle B. */
    readonly b: number;
    /** Side opposite angle C. */
    readonly c: number;
    /** Angle opposite side a, in degrees. */
    readonly A: number;
    /** Angle opposite side b, in degrees. */
    readonly B: number;
    /** Angle opposite side c, in degrees. */
    readonly C: number;

    constructor(options: TriangleOptions = {}) {
        let solved = solveTriangle({
            ...(options.a === undefined ? {} : { a: options.a }),
            ...(options.b === undefined ? {} : { b: options.b }),
            ...(options.c === undefined ? {} : { c: options.c }),
            ...(options.A === undefined ? {} : { A: options.A * DEG2RAD }),
            ...(options.B === undefined ? {} : { B: options.B * DEG2RAD }),
            ...(options.C === undefined ? {} : { C: options.C * DEG2RAD }),
        });
        let angleB = solved.B * RAD2DEG;
        let corners = [
            new Vector(),
            new Vector(solved.a, 0),
            new Vector(solved.c, 0).rotate(Axis.Z, angleB),
        ];
        let centroid = corners.reduce((total, corner) => total.add(corner), new Vector()).divide(3);
        let face = new Face(makeWirePolygon(corners)).moved(new Pos(centroid.negate()));
        super(placedFaces(face, { align: null, ...options }));
        this.a = solved.a;
        this.b = solved.b;
        this.c = solved.c;
        this.A = solved.A * RAD2DEG;
        this.B = angleB;
        this.C = solved.C * RAD2DEG;
    }
}
