/** NACA four-digit airfoil profiles (build123d `Airfoil`). */

import type { Edge } from "../../topology/edge.ts";

import { GeometryError } from "../../errors.ts";
import { Vector } from "../../geometry/vector.ts";
import { Wire } from "../../topology/wire.ts";
import { BaseLineObject } from "../base-object.ts";
import { makeLine } from "../edge-makers.ts";
import { makeSpline } from "../spline-makers.ts";

/** Thickness distribution coefficients of the NACA four-digit series. */
const THICKNESS_COEFFICIENTS = [0.2969, -0.126, -0.3516, 0.2843] as const;
const SHARP_TRAILING_EDGE_COEFFICIENT = -0.1036;
const FINITE_TRAILING_EDGE_COEFFICIENT = -0.1015;
/** Decimals build123d rounds coordinates to when it compares points (`GEOM_KEY_DIGITS`). */
const GEOM_KEY_DIGITS = 5;

export interface AirfoilOptions {
    /** Points sampled along each of the upper and lower surfaces; defaults to 50. */
    readonly points?: number;
    /** Leave a gap at the trailing edge and close it with a straight segment. */
    readonly finiteTrailingEdge?: boolean;
}

/** The parameters a NACA four-digit code describes, as fractions of the chord. */
export interface NacaParameters {
    readonly maxCamber: number;
    readonly camberPosition: number;
    readonly thickness: number;
}

/**
 * Parses a NACA four-digit code, which may carry a fractional thickness: the first digit is the
 * maximum camber in percent of chord, the second its position in tenths, the rest the maximum
 * thickness in percent (`"2412"`, `"2213.323"`).
 */
export function parseNaca4(code: string): NacaParameters {
    let digits = code.replace("NACA", "").trim();
    let [whole, fraction] = digits.split(".", 2);
    if (whole === undefined || whole.length < 3 || !/^\d+$/.test(whole)) {
        throw new GeometryError(`"${code}" is not a NACA 4-digit airfoil code`);
    }
    let thickness =
        fraction === undefined
            ? Number(whole.slice(2)) / 100
            : Number(`${Number(whole.slice(2))}.${fraction}`) / 100;
    return {
        maxCamber: Number(whole[0]) / 100,
        camberPosition: Number(whole[1]) / 10,
        thickness,
    };
}

/** The outline of a NACA four-digit airfoil of unit chord, nose at the origin. */
export class Airfoil extends BaseLineObject {
    /** The code the profile was built from. */
    readonly code: string;
    readonly maxCamber: number;
    readonly camberPosition: number;
    readonly thickness: number;
    readonly finiteTrailingEdge: boolean;
    readonly #camberPoints: readonly Vector[];

    constructor(code: string, options: AirfoilOptions = {}) {
        let points = options.points ?? 50;
        let finiteTrailingEdge = options.finiteTrailingEdge ?? false;
        let shape = parseNaca4(code);
        let surface = airfoilSurface(shape, points, finiteTrailingEdge);
        let profile = finiteTrailingEdge
            ? new Wire([surface, makeLine(surface.positionAt(0), surface.positionAt(1))])
            : new Wire([surface]);
        super(profile.wrapped);
        this.code = code;
        this.maxCamber = shape.maxCamber;
        this.camberPosition = shape.camberPosition;
        this.thickness = shape.thickness;
        this.finiteTrailingEdge = finiteTrailingEdge;
        this.#camberPoints = camberLinePoints(shape, points);
    }

    /** The camber line, the curve midway between the upper and lower surfaces. */
    get camberLine(): Edge {
        return makeSpline(this.#camberPoints);
    }
}

/** Chordwise sample positions, packed towards the nose where the curvature is highest. */
function chordPositions(count: number): number[] {
    return Array.from(
        { length: count },
        (_unused, index) => (1 - Math.cos((Math.PI * index) / (count - 1))) / 2,
    );
}

/** Half-thickness of the profile at a chordwise position. */
function halfThickness(thickness: number, x: number, finiteTrailingEdge: boolean): number {
    let [a0, a1, a2, a3] = THICKNESS_COEFFICIENTS;
    let a4 = finiteTrailingEdge
        ? FINITE_TRAILING_EDGE_COEFFICIENT
        : SHARP_TRAILING_EDGE_COEFFICIENT;
    return 5 * thickness * (a0 * Math.sqrt(x) + a1 * x + a2 * x ** 2 + a3 * x ** 3 + a4 * x ** 4);
}

/** Camber height and slope at a chordwise position. */
function camberAt(shape: NacaParameters, x: number): { height: number; slope: number } {
    let { maxCamber: m, camberPosition: p } = shape;
    if (m === 0 || p === 0 || p === 1) {
        return { height: 0, slope: 0 };
    }
    if (x < p) {
        return {
            height: (m / p ** 2) * (2 * p * x - x ** 2),
            slope: ((2 * m) / p ** 2) * (p - x),
        };
    }
    return {
        height: (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x ** 2),
        slope: ((2 * m) / (1 - p) ** 2) * (p - x),
    };
}

function camberLinePoints(shape: NacaParameters, count: number): Vector[] {
    return chordPositions(count).map(x => new Vector(x, camberAt(shape, x).height, 0));
}

/**
 * The profile surface: the upper side from tail to nose followed by the lower side back to the
 * tail, interpolated as one spline (periodic unless the trailing edge is left open).
 */
function airfoilSurface(shape: NacaParameters, count: number, finiteTrailingEdge: boolean): Edge {
    let upper: Vector[] = [];
    let lower: Vector[] = [];
    for (let x of chordPositions(count)) {
        let { height, slope } = camberAt(shape, x);
        let offset = halfThickness(shape.thickness, x, finiteTrailingEdge);
        let angle = Math.atan(slope);
        upper.push(new Vector(x - offset * Math.sin(angle), height + offset * Math.cos(angle), 0));
        lower.push(new Vector(x + offset * Math.sin(angle), height - offset * Math.cos(angle), 0));
    }
    let outline = [...upper].reverse().concat(lower);
    return makeSpline(uniquePoints(outline), { periodic: !finiteTrailingEdge });
}

/**
 * Drops repeated points, which the surfaces share at the nose and tail. Points are compared on
 * build123d's geometry key (five decimals), so a tail the two surfaces reach within rounding is
 * one point rather than two coincident ones the interpolator would reject.
 */
function uniquePoints(points: readonly Vector[]): Vector[] {
    let seen = new Set<string>();
    return points.filter(point => {
        let key = point.rounded(GEOM_KEY_DIGITS).toTuple().join(",");
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
