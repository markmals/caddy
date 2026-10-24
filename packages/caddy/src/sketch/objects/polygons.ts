/** Straight-sided sketch objects (build123d `Polygon`, `RegularPolygon`, `Trapezoid`). */

import type { Align2DLike } from "../../geometry/enums.ts";
import type { VectorLike } from "../../geometry/vector.ts";
import type { SketchPlacement } from "../base.ts";

import { makeWirePolygon } from "../../curves/wire-makers.ts";
import { GeometryError } from "../../errors.ts";
import { toAlignOffset } from "../../geometry/bounding-box.ts";
import { DEG2RAD } from "../../geometry/constants.ts";
import { Align } from "../../geometry/enums.ts";
import { Vector } from "../../geometry/vector.ts";
import { Face } from "../../topology/face.ts";
import { BaseSketchObject } from "../base-object.ts";
import { CENTERED, alignPair, placedFaces } from "../base.ts";

/** A face bounded by the straight line through every point. */
export class Polygon extends BaseSketchObject {
    constructor(points: readonly VectorLike[], options: SketchPlacement = {}) {
        super(
            placedFaces(new Face(makeWirePolygon(points)), {
                align: [Align.None, Align.None],
                ...options,
            }),
        );
    }
}

export interface RegularPolygonOptions extends SketchPlacement {
    /** Whether `radius` reaches the corners (default) or the middle of each side. */
    readonly majorRadius?: boolean;
}

/**
 * An equilateral polygon. Unlike other sketch objects the rotation is built into the corner
 * angles and the alignment is measured from the corners, as build123d does.
 */
export class RegularPolygon extends BaseSketchObject {
    constructor(radius: number, sideCount: number, options: RegularPolygonOptions = {}) {
        if (sideCount < 3) {
            throw new GeometryError(
                `RegularPolygon must have at least three sides, not ${sideCount}`,
            );
        }
        let rotation = options.rotation ?? 0;
        let circumradius =
            (options.majorRadius ?? true) ? radius : radius / Math.cos(Math.PI / sideCount);
        let corners = regularCorners(circumradius, sideCount, rotation);
        let offset = cornerAlignOffset(corners, options.align ?? CENTERED);
        let placed = corners.map(corner => corner.add(offset));
        super(placedFaces(new Face(makeWirePolygon(placed)), { align: null }));
    }
}

function regularCorners(radius: number, sideCount: number, rotation: number): Vector[] {
    return Array.from({ length: sideCount + 1 }, (_unused, index) => {
        let angle = (index * 2 * Math.PI) / sideCount + rotation * DEG2RAD;
        return new Vector(radius * Math.cos(angle), radius * Math.sin(angle));
    });
}

/** build123d aligns a regular polygon from its corners, with the centre pinned to the origin. */
function cornerAlignOffset(corners: readonly Vector[], align: Align2DLike): Vector {
    let xs = corners.map(corner => corner.x);
    let ys = corners.map(corner => corner.y);
    let minimum = new Vector(Math.min(...xs), Math.min(...ys));
    let maximum = new Vector(Math.max(...xs), Math.max(...ys));
    return toAlignOffset(minimum, maximum, alignPair(align), new Vector());
}

/**
 * A trapezoid of the given width and height whose sides lean in by the interior angles at the
 * bottom-left and bottom-right corners.
 */
export class Trapezoid extends BaseSketchObject {
    constructor(
        width: number,
        height: number,
        leftSideAngle: number,
        options: SketchPlacement & { readonly rightSideAngle?: number } = {},
    ) {
        let rightSideAngle = options.rightSideAngle || leftSideAngle;
        let corners = trapezoidCorners(width, height, leftSideAngle, rightSideAngle);
        super(
            placedFaces(new Face(makeWirePolygon(corners)), {
                align: [Align.Center, Align.Center],
                ...options,
            }),
        );
    }
}

function trapezoidCorners(
    width: number,
    height: number,
    leftSideAngle: number,
    rightSideAngle: number,
): Vector[] {
    let reduction = (angle: number): number =>
        angle === 90 ? 0 : height / Math.tan(angle * DEG2RAD);
    let left = reduction(leftSideAngle);
    let right = reduction(rightSideAngle);
    let topLeft = width / 2 - Math.max(left, 0);
    let bottomLeft = width / 2 + Math.min(left, 0);
    let topRight = width / 2 - Math.max(right, 0);
    let bottomRight = width / 2 + Math.min(right, 0);
    if (bottomLeft + bottomRight < 0) {
        throw new GeometryError("Trapezoid bottom invalid - change angles");
    }
    if (topLeft + topRight < 0) {
        throw new GeometryError("Trapezoid top invalid - change angles");
    }
    return [
        new Vector(-bottomLeft, -height / 2),
        new Vector(bottomRight, -height / 2),
        new Vector(topRight, height / 2),
        new Vector(-topLeft, height / 2),
    ];
}
