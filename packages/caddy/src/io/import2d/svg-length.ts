/**
 * SVG length, angle and number-list parsing.
 *
 * The unit factors are `svgelements`' own (`Length.value`), which build123d's importer relies on:
 * millimetres and centimetres go through a rounded inches-per-millimetre constant, and points and
 * picas ignore the resolution entirely. `import_svg` parses at 25.4 pixels per inch, so one
 * millimetre is one user unit — give or take that constant's last digit.
 */

import { ImportError } from "../../errors.ts";

/** What percentages and physical units resolve against. */
export interface LengthContext {
    /** Pixels per inch; `import_svg` uses 25.4 so that a millimetre is a user unit. */
    readonly ppi: number;
    /** Viewport width, for percentages along x. */
    readonly width: number;
    /** Viewport height, for percentages along y. */
    readonly height: number;
}

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const LENGTH = /^\s*([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)\s*([a-zA-Z%]*)\s*$/;

const INCHES_PER_MILLIMETRE = 0.0393701;
const RADIANS_PER_DEGREE = Math.PI / 180;

/** The length in user units, or `undefined` when the text is not a length at all. */
export function parseLength(
    text: string | undefined,
    relative: number,
    context: LengthContext,
): number | undefined {
    if (text === undefined) return undefined;
    let match = LENGTH.exec(text);
    if (match === null) return undefined;
    let amount = Number.parseFloat(match[1] ?? "");
    switch (match[2]) {
        case "":
        case "px":
            return amount;
        case "%":
            return (amount / 100) * relative;
        case "mm":
            return amount * context.ppi * INCHES_PER_MILLIMETRE;
        case "cm":
            return amount * context.ppi * INCHES_PER_MILLIMETRE * 10;
        case "in":
            return amount * context.ppi;
        case "pt":
            return (amount * 4) / 3;
        case "pc":
            return amount * 16;
        default:
            return undefined;
    }
}

/** Percentages of a box resolve against its diagonal, scaled as SVG 1.1 7.10 prescribes. */
export function diagonalLength(context: LengthContext): number {
    return Math.sqrt(context.width ** 2 + context.height ** 2) / Math.SQRT2;
}

/** An angle in radians; a bare number is degrees, as everywhere in SVG. */
export function parseAngle(text: string): number {
    let match = LENGTH.exec(text);
    if (match === null) throw new ImportError(`${JSON.stringify(text)} is not an angle`);
    let amount = Number.parseFloat(match[1] ?? "");
    switch (match[2]) {
        case "":
        case "deg":
            return amount * RADIANS_PER_DEGREE;
        case "rad":
            return amount;
        case "grad":
            return (amount * Math.PI) / 200;
        case "turn":
            return amount * 2 * Math.PI;
        default:
            throw new ImportError(`${JSON.stringify(text)} is not an angle`);
    }
}

/** Every number in a comma- or space-separated list, as `points` and `viewBox` are written. */
export function parseNumberList(text: string): number[] {
    let numbers: number[] = [];
    for (let match of text.matchAll(NUMBER)) {
        let value = Number.parseFloat(match[0]);
        if (Number.isFinite(value)) numbers.push(value);
    }
    return numbers;
}
