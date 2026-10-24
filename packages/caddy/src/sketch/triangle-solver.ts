/**
 * Solves a triangle from any three of its six sides and angles, as the `trianglesolver` package
 * build123d's `Triangle` relies on does. Angles are in radians; sides and angles with the same
 * letter are opposite each other.
 */

import { GeometryError } from "../errors.ts";

export interface TriangleParts {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly A: number;
    readonly B: number;
    readonly C: number;
}

/** Any three of the six measures; the rest are solved for. */
export type PartialTriangle = Partial<TriangleParts>;

function aaas(D: number, E: number, F: number, f: number): [number, number, number] {
    return [(f * Math.sin(D)) / Math.sin(F), (f * Math.sin(E)) / Math.sin(F), f];
}

function sss(d: number, e: number, f: number): TriangleParts {
    if (d + e <= f || e + f <= d || f + d <= e) {
        throw new GeometryError("No triangle has these side lengths");
    }
    let F = Math.acos((d * d + e * e - f * f) / (2 * d * e));
    let E = Math.acos((d * d + f * f - e * e) / (2 * d * f));
    return { a: d, b: e, c: f, A: Math.PI - F - E, B: E, C: F };
}

function sas(d: number, e: number, F: number): TriangleParts {
    return sss(d, e, Math.sqrt(d * d + e * e - 2 * d * e * Math.cos(F)));
}

/** Two sides and an angle not between them; ambiguous descriptions are rejected. */
function ssa(d: number, e: number, D: number): TriangleParts {
    let sinE = (Math.sin(D) * e) / d;
    let E: number;
    if (Math.abs(sinE - 1) < 1e-9) {
        E = Math.PI / 2;
    } else {
        if (sinE > 1) throw new GeometryError("No such triangle");
        let acute = Math.asin(sinE);
        let obtuse = Math.PI - acute;
        let acuteValid = Math.PI - D - acute > 0 && Math.PI - D - acute < Math.PI;
        let obtuseValid = Math.PI - D - obtuse > 0 && Math.PI - D - obtuse < Math.PI;
        if (acuteValid && obtuseValid) {
            throw new GeometryError("Two different triangles fit this description");
        }
        if (!acuteValid && !obtuseValid) throw new GeometryError("No such triangle");
        E = acuteValid ? acute : obtuse;
    }
    let F = Math.PI - D - E;
    let [e2, f2] = aaas(E, F, D, d);
    return { a: d, b: e2, c: f2, A: D, B: E, C: F };
}

type SideName = "a" | "b" | "c";

/** Rotates a solution whose letters were permuted back into a/b/c order. */
function relabel(solved: TriangleParts, order: readonly [SideName, SideName, SideName]) {
    let sides: Record<SideName, number> = { a: 0, b: 0, c: 0 };
    let angles: Record<Uppercase<SideName>, number> = { A: 0, B: 0, C: 0 };
    let lengths = [solved.a, solved.b, solved.c];
    let radians = [solved.A, solved.B, solved.C];
    order.forEach((name, index) => {
        sides[name] = lengths[index]!;
        angles[name.toUpperCase() as Uppercase<SideName>] = radians[index]!;
    });
    return { ...sides, ...angles };
}

function thirdAngle(given: PartialTriangle): { A: number; B: number; C: number } {
    let { A, B, C } = given;
    if (A === undefined) A = Math.PI - (B ?? 0) - (C ?? 0);
    else if (B === undefined) B = Math.PI - A - (C ?? 0);
    else C = Math.PI - A - B;
    if (A <= 0 || (B ?? 0) <= 0 || (C ?? 0) <= 0) {
        throw new GeometryError("No such triangle");
    }
    return { A, B: B ?? 0, C: C ?? 0 };
}

/** Two sides and the angle between or beside them. */
function solveTwoSides(given: PartialTriangle): TriangleParts {
    let { a, b, c, A, B, C } = given;
    if (a !== undefined && A !== undefined && b !== undefined) return ssa(a, b, A);
    if (a !== undefined && A !== undefined && c !== undefined) {
        return relabel(ssa(a, c, A), ["a", "c", "b"]);
    }
    if (b !== undefined && B !== undefined && a !== undefined) {
        return relabel(ssa(b, a, B), ["b", "a", "c"]);
    }
    if (b !== undefined && B !== undefined && c !== undefined) {
        return relabel(ssa(b, c, B), ["b", "c", "a"]);
    }
    if (c !== undefined && C !== undefined && a !== undefined) {
        return relabel(ssa(c, a, C), ["c", "a", "b"]);
    }
    if (c !== undefined && C !== undefined && b !== undefined) {
        return relabel(ssa(c, b, C), ["c", "b", "a"]);
    }
    if (a !== undefined && b !== undefined && C !== undefined) return sas(a, b, C);
    if (b !== undefined && c !== undefined && A !== undefined) {
        return relabel(sas(b, c, A), ["b", "c", "a"]);
    }
    if (c !== undefined && a !== undefined && B !== undefined) {
        return relabel(sas(c, a, B), ["c", "a", "b"]);
    }
    throw new GeometryError("No such triangle");
}

/** One side and two angles. */
function solveOneSide(given: PartialTriangle): TriangleParts {
    let { A, B, C } = thirdAngle(given);
    if (given.c !== undefined) {
        let [a, b, c] = aaas(A, B, C, given.c);
        return { a, b, c, A, B, C };
    }
    if (given.a !== undefined) {
        let [b, c, a] = aaas(B, C, A, given.a);
        return { a, b, c, A, B, C };
    }
    let [c, a, b] = aaas(C, A, B, given.b ?? 0);
    return { a, b, c, A, B, C };
}

/** Completes a triangle from exactly three measures, at least one of them a side. */
export function solveTriangle(given: PartialTriangle): TriangleParts {
    let measures = [given.a, given.b, given.c, given.A, given.B, given.C];
    let sides = [given.a, given.b, given.c].filter(value => value !== undefined);
    if (measures.filter(value => value !== undefined).length !== 3 || sides.length === 0) {
        throw new GeometryError("One length and two other values must be provided");
    }
    if (sides.length === 3) {
        return sss(given.a ?? 0, given.b ?? 0, given.c ?? 0);
    }
    return sides.length === 2 ? solveTwoSides(given) : solveOneSide(given);
}
