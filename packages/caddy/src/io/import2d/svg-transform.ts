/**
 * The 2D affine transforms of an SVG document.
 *
 * Matrices are stored the way SVG writes them, `matrix(a b c d e f)`, mapping a point to
 * `(a x + c y + e, b x + d y + f)`. A transform list composes left to right, so the leftmost
 * function is applied last, and a child's matrix is its parent's matrix times its own.
 */

import type { LengthContext } from "./svg-length.ts";

import { ImportError } from "../../errors.ts";
import { parseAngle, parseLength } from "./svg-length.ts";

export interface Point2D {
    readonly x: number;
    readonly y: number;
}

export interface Matrix2D {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
}

export const IDENTITY: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const FUNCTION = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

/** `outer` applied after `inner`. */
export function multiply(outer: Matrix2D, inner: Matrix2D): Matrix2D {
    return {
        a: outer.a * inner.a + outer.c * inner.b,
        b: outer.b * inner.a + outer.d * inner.b,
        c: outer.a * inner.c + outer.c * inner.d,
        d: outer.b * inner.c + outer.d * inner.d,
        e: outer.a * inner.e + outer.c * inner.f + outer.e,
        f: outer.b * inner.e + outer.d * inner.f + outer.f,
    };
}

export function apply(matrix: Matrix2D, point: Point2D): Point2D {
    return {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
}

export function determinant(matrix: Matrix2D): number {
    return matrix.a * matrix.d - matrix.b * matrix.c;
}

export function isIdentity(matrix: Matrix2D): boolean {
    let { a, b, c, d, e, f } = matrix;
    return a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0;
}

/** Parses a `transform` attribute; an unreadable function makes the whole document invalid. */
export function parseTransform(text: string, context: LengthContext): Matrix2D {
    let matrix = IDENTITY;
    for (let match of text.matchAll(FUNCTION)) {
        let name = match[1] ?? "";
        let values = (match[2] ?? "").split(/[\s,]+/).filter(part => part.length > 0);
        matrix = multiply(matrix, transformFunction(name, values, context));
    }
    return matrix;
}

function transformFunction(name: string, values: string[], context: LengthContext): Matrix2D {
    switch (name) {
        case "matrix":
            return matrixOf(numbers(name, values, 6, context));
        case "translate":
            return translation(numbers(name, values, values.length === 1 ? 1 : 2, context));
        case "scale":
            return scaling(numbers(name, values, values.length === 1 ? 1 : 2, context));
        case "rotate":
            return rotation(name, values, context);
        case "skewX":
            return { ...IDENTITY, c: Math.tan(angle(name, values)) };
        case "skewY":
            return { ...IDENTITY, b: Math.tan(angle(name, values)) };
        default:
            throw new ImportError(`unsupported SVG transform ${name}()`);
    }
}

function matrixOf(values: number[]): Matrix2D {
    let [a, b, c, d, e, f] = values as [number, number, number, number, number, number];
    return { a, b, c, d, e, f };
}

function translation(values: number[]): Matrix2D {
    let [x, y] = values;
    return { ...IDENTITY, e: x ?? 0, f: y ?? 0 };
}

function scaling(values: number[]): Matrix2D {
    let [x, y] = values;
    return { ...IDENTITY, a: x ?? 1, d: y ?? x ?? 1 };
}

/** `rotate(angle)` turns about the origin, `rotate(angle cx cy)` about the given centre. */
function rotation(name: string, values: string[], context: LengthContext): Matrix2D {
    let radians = angle(name, values);
    let turn: Matrix2D = {
        a: Math.cos(radians),
        b: Math.sin(radians),
        c: -Math.sin(radians),
        d: Math.cos(radians),
        e: 0,
        f: 0,
    };
    if (values.length === 1) return turn;
    let [centerX, centerY] = numbers(name, values.slice(1), 2, context);
    let center: Point2D = { x: centerX ?? 0, y: centerY ?? 0 };
    return multiply(multiply({ ...IDENTITY, e: center.x, f: center.y }, turn), {
        ...IDENTITY,
        e: -center.x,
        f: -center.y,
    });
}

function angle(name: string, values: string[]): number {
    let first = values[0];
    if (first === undefined) throw new ImportError(`SVG transform ${name}() needs an angle`);
    return parseAngle(first);
}

function numbers(
    name: string,
    values: string[],
    expected: number,
    context: LengthContext,
): number[] {
    if (values.length < expected) {
        throw new ImportError(`SVG transform ${name}() needs ${expected} values`);
    }
    return values.slice(0, expected).map(value => {
        let length = parseLength(value, 0, context);
        if (length === undefined) {
            throw new ImportError(`SVG transform ${name}() has a non-numeric value ${value}`);
        }
        return length;
    });
}
