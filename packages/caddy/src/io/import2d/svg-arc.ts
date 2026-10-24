/**
 * Arc construction, ported from `svgelements`' `Arc`.
 *
 * SVG writes an arc as its endpoints plus radii and flags; `svgelements` converts that to a
 * centre, the points at parameters 0 and a quarter turn, and a signed sweep. The conversion
 * follows the SVG implementation notes, including the correction for radii too small to reach.
 */

import type { ArcSegment } from "./svg-segments.ts";
import type { Point2D } from "./svg-transform.ts";

import { samePoint } from "./svg-segments.ts";

const TAU = 2 * Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;

/** The `A` command: an arc of `(majorRadius, minorRadius)` turned by `rotation` degrees. */
export function arcFromEndpoints(
    start: Point2D,
    majorRadius: number,
    minorRadius: number,
    rotation: number,
    largeArc: boolean,
    sweep: boolean,
    end: Point2D,
): ArcSegment {
    if (samePoint(start, end) || majorRadius === 0 || minorRadius === 0) {
        return { kind: "arc", start, end, center: start, prx: start, pry: start, sweep: 0 };
    }
    let cosr = Math.cos(rotation * RADIANS_PER_DEGREE);
    let sinr = Math.sin(rotation * RADIANS_PER_DEGREE);
    let dx = (start.x - end.x) / 2;
    let dy = (start.y - end.y) / 2;
    let primeX = cosr * dx + sinr * dy;
    let primeY = -sinr * dx + cosr * dy;

    let [radiusX, radiusY] = enlargedToReach(majorRadius, minorRadius, primeX, primeY);
    let numerator = radiusX ** 2 * primeY ** 2 + radiusY ** 2 * primeX ** 2;
    let scale = Math.sqrt(Math.abs((radiusX ** 2 * radiusY ** 2 - numerator) / numerator));
    if (largeArc === sweep) scale = -scale;
    let centerPrimeX = (scale * radiusX * primeY) / radiusY;
    let centerPrimeY = (-scale * radiusY * primeX) / radiusX;
    let center: Point2D = {
        x: cosr * centerPrimeX - sinr * centerPrimeY + (start.x + end.x) / 2,
        y: sinr * centerPrimeX + cosr * centerPrimeY + (start.y + end.y) / 2,
    };

    return {
        kind: "arc",
        start,
        end,
        center,
        prx: rotated(center, { x: center.x + radiusX, y: center.y }, cosr, sinr),
        pry: rotated(center, { x: center.x, y: center.y + radiusY }, cosr, sinr),
        sweep:
            sweptAngle(
                { x: primeX - centerPrimeX, y: primeY - centerPrimeY },
                { x: -primeX - centerPrimeX, y: -primeY - centerPrimeY },
                radiusX,
                radiusY,
                sweep,
            ) * RADIANS_PER_DEGREE,
    };
}

/**
 * The quarter-turn arc of a rounded rectangle's corner, which `svgelements` builds from the two
 * endpoints alone: the centre is whichever of the two corner candidates turns the right way.
 */
export function arcFromCorner(
    start: Point2D,
    end: Point2D,
    majorRadius: number,
    minorRadius: number,
    scooped: boolean,
): ArcSegment {
    let sweep = scooped ? -TAU / 4 : TAU / 4;
    let candidate: Point2D = { x: start.x, y: end.y };
    let clockwise = orientation(start, candidate, end) === 1;
    if (scooped) clockwise = !clockwise;
    let center = clockwise ? candidate : { x: end.x, y: start.y };
    return {
        kind: "arc",
        start,
        end,
        center,
        prx: { x: center.x + majorRadius, y: center.y },
        pry: { x: center.x, y: center.y + minorRadius },
        sweep,
    };
}

/** An ellipse whose radii cannot span the two endpoints is scaled up until it just can. */
function enlargedToReach(
    majorRadius: number,
    minorRadius: number,
    primeX: number,
    primeY: number,
): [number, number] {
    let reach = primeX ** 2 / majorRadius ** 2 + primeY ** 2 / minorRadius ** 2;
    if (reach <= 1) return [majorRadius, minorRadius];
    let correction = Math.sqrt(reach);
    return [majorRadius * correction, minorRadius * correction];
}

/** Signed angle between the two radius vectors, in degrees, resolved by the sweep flag. */
function sweptAngle(
    from: Point2D,
    to: Point2D,
    radiusX: number,
    radiusY: number,
    sweep: boolean,
): number {
    let start = { x: from.x / radiusX, y: from.y / radiusY };
    let end = { x: to.x / radiusX, y: to.y / radiusY };
    let norm = Math.sqrt((start.x ** 2 + start.y ** 2) * (end.x ** 2 + end.y ** 2));
    let cosine = Math.min(1, Math.max(-1, (start.x * end.x + start.y * end.y) / norm));
    let delta = Math.acos(cosine) / RADIANS_PER_DEGREE;
    if (start.x * end.y - start.y * end.x < 0) delta = -delta;
    delta = ((delta % 360) + 360) % 360;
    return sweep ? delta : delta - 360;
}

function rotated(center: Point2D, point: Point2D, cosr: number, sinr: number): Point2D {
    let offsetX = point.x - center.x;
    let offsetY = point.y - center.y;
    return {
        x: center.x + cosr * offsetX - sinr * offsetY,
        y: center.y + sinr * offsetX + cosr * offsetY,
    };
}

/** Which way the three points turn: 1 clockwise in SVG's y-down frame, 2 the other way. */
function orientation(first: Point2D, second: Point2D, third: Point2D): 0 | 1 | 2 {
    let value =
        (second.y - first.y) * (third.x - second.x) - (second.x - first.x) * (third.y - second.y);
    if (value === 0) return 0;
    return value > 0 ? 1 : 2;
}
