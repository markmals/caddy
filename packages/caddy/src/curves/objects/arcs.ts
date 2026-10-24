/** Circular and elliptical curve objects (build123d `CenterArc`, `RadiusArc`, `JernArc`, ...). */

import type { VectorLike } from "../../geometry/vector.ts";

import { GeometryError } from "../../errors.ts";
import { Axis } from "../../geometry/axis.ts";
import { TOLERANCE } from "../../geometry/constants.ts";
import { Plane } from "../../geometry/plane.ts";
import { Vector } from "../../geometry/vector.ts";
import { BaseEdgeObject } from "../base-object.ts";
import { makeCircle, makeEllipse, makeTangentArc, makeThreePointArc } from "../edge-makers.ts";
import { AngularDirection } from "../enums.ts";

/** An arc of `arcSize` degrees starting at `startAngle`, counter-clockwise when positive. */
export class CenterArc extends BaseEdgeObject {
    constructor(center: VectorLike, radius: number, startAngle: number, arcSize: number) {
        let direction =
            arcSize > 0 ? AngularDirection.CounterClockwise : AngularDirection.Clockwise;
        let sweep = (arcSize + 360) % 360;
        let endAngle = startAngle + sweep;
        super(
            makeCircle(radius, {
                plane: Plane.XY.withOrigin(center),
                startAngle: sweep === 360 ? endAngle : startAngle,
                endAngle,
                angularDirection: direction,
            }).wrapped,
        );
    }
}

/** The circular arc running from the first point through the second to the third. */
export class ThreePointArc extends BaseEdgeObject {
    constructor(start: VectorLike, middle: VectorLike, end: VectorLike) {
        super(makeThreePointArc(start, middle, end).wrapped);
    }
}

/**
 * The circular arc between two points whose middle is `sagitta` away from their chord; a
 * positive sagitta bulges to the left of the chord.
 */
export class SagittaArc extends BaseEdgeObject {
    constructor(start: VectorLike, end: VectorLike, sagitta: number) {
        let from = Vector.from(start);
        let to = Vector.from(end);
        let middle = to.add(from).multiply(0.5);
        let bulge = to
            .sub(from)
            .normalized()
            .multiply(Math.abs(sagitta))
            .rotate(Axis.Z, sagitta > 0 ? 90 : -90);
        super(makeThreePointArc(from, middle.add(bulge), to).wrapped);
    }
}

/**
 * The circular arc of the given radius between two points. The shorter of the two possible arcs
 * is taken unless `shortSagitta` is false; a negative radius mirrors the bulge.
 */
export class RadiusArc extends BaseEdgeObject {
    constructor(
        start: VectorLike,
        end: VectorLike,
        radius: number,
        options: { readonly shortSagitta?: boolean } = {},
    ) {
        let from = Vector.from(start);
        let to = Vector.from(end);
        let halfChord = to.sub(from).length / 2;
        let height = radius * radius - halfChord * halfChord;
        if (height < 0) {
            throw new GeometryError("Arc radius is not large enough to reach the end point.");
        }
        let offset = Math.sqrt(height);
        let sagitta =
            (options.shortSagitta ?? true) ? Math.abs(radius) - offset : -Math.abs(radius) - offset;
        super(new SagittaArc(from, to, radius > 0 ? sagitta : -sagitta).wrapped);
    }
}

/** The circular arc between two points that leaves the first along `tangent`. */
export class TangentArc extends BaseEdgeObject {
    constructor(
        start: VectorLike,
        end: VectorLike,
        tangent: VectorLike,
        options: { readonly tangentFromFirst?: boolean } = {},
    ) {
        let direction = Vector.from(tangent).normalized();
        let fromFirst = options.tangentFromFirst ?? true;
        let [from, to] = fromFirst ? [start, end] : [end, start];
        super(makeTangentArc(from, direction, to).wrapped);
    }
}

/**
 * An arc of `arcSize` degrees that leaves `start` along `tangent` and curves by `radius`; a
 * negative `arcSize` curves the other way (build123d `JernArc`).
 */
export class JernArc extends BaseEdgeObject {
    /** Centre of the arc's circle. */
    readonly centerPoint: Vector;
    /** Where the arc ends. */
    readonly endOfArc: Vector;

    constructor(start: VectorLike, tangent: VectorLike, radius: number, arcSize: number) {
        let from = Vector.from(start);
        let direction = Vector.from(tangent).normalized();
        let normal = arcNormal(direction);
        let turn = Math.sign(arcSize) || 1;
        let center = from.add(
            direction.rotate(new Axis(from, normal), turn * 90).multiply(Math.abs(radius)),
        );
        let arc =
            Math.abs(arcSize) >= 360
                ? makeCircle(radius, {
                      plane: new Plane({ origin: center, xDir: from.sub(center), zDir: normal }),
                  })
                : makeTangentArc(
                      from,
                      direction,
                      center.add(from.sub(center).rotate(new Axis(from, normal), arcSize)),
                  );
        super(arc.wrapped);
        this.centerPoint = arc.arcCenter;
        this.endOfArc = arc.positionAt(1);
    }
}

/** The plane an arc leaving `tangent` curves in: the XY plane unless the tangent leaves it. */
function arcNormal(tangent: Vector): Vector {
    let up = new Vector(0, 0, 1);
    if (Math.abs(tangent.dot(up)) <= TOLERANCE) return up;
    let normal = tangent.cross(up);
    return (normal.length <= TOLERANCE ? tangent.cross(new Vector(1, 0, 0)) : normal).normalized();
}

export interface EllipticalCenterArcOptions {
    readonly startAngle?: number;
    readonly arcSize?: number;
    /** Degrees the whole arc is turned about the Z axis before it is moved to the centre. */
    readonly rotation?: number;
}

/** An arc of an axis-aligned ellipse centred on `center`. */
export class EllipticalCenterArc extends BaseEdgeObject {
    constructor(
        center: VectorLike,
        xRadius: number,
        yRadius: number,
        options: EllipticalCenterArcOptions = {},
    ) {
        let startAngle = options.startAngle ?? 0;
        let arcSize = options.arcSize ?? 90;
        let arc = makeEllipse(xRadius, yRadius, {
            startAngle,
            endAngle: startAngle + arcSize,
            angularDirection:
                arcSize >= 0 ? AngularDirection.CounterClockwise : AngularDirection.Clockwise,
        });
        super(arc.rotate(Axis.Z, options.rotation ?? 0).translate(Vector.from(center)).wrapped);
    }
}
