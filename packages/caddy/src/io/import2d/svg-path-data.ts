/**
 * The `d` attribute of an SVG path, turned into segments.
 *
 * Implicit repeats (`M 0 0 1 1` is a move then a line), smooth continuations and the unseparated
 * flag digits of the arc command are all part of the grammar, so the numbers are read with a
 * cursor rather than split up front.
 */

import type { SvgSegment } from "./svg-segments.ts";
import type { Point2D } from "./svg-transform.ts";

import { ImportError } from "../../errors.ts";
import { arcFromEndpoints } from "./svg-arc.ts";

const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";

interface Cursor {
    readonly text: string;
    index: number;
}

interface PathState {
    current: Point2D;
    /** Where the current subpath began, which is where `Z` returns to. */
    subpathStart: Point2D;
    /** Control point of the previous curve, for the smooth commands to reflect. */
    control: Point2D | undefined;
    controlKind: "cubic" | "quadratic" | undefined;
}

/** Reads a path; an unknown command or a missing coordinate rejects the whole document. */
export function parsePathData(data: string): SvgSegment[] {
    let cursor: Cursor = { text: data, index: 0 };
    let segments: SvgSegment[] = [];
    let state: PathState = {
        current: { x: 0, y: 0 },
        subpathStart: { x: 0, y: 0 },
        control: undefined,
        controlKind: undefined,
    };
    let command: string | undefined;
    skipSeparators(cursor);
    while (cursor.index < cursor.text.length) {
        let next = cursor.text[cursor.index] ?? "";
        if (COMMANDS.includes(next)) {
            command = next;
            cursor.index += 1;
        } else if (command === undefined) {
            throw new ImportError(`SVG path data must start with a command, got ${next}`);
        } else if (command === "M") {
            command = "L";
        } else if (command === "m") {
            command = "l";
        }
        appendCommand(command, cursor, state, segments);
        skipSeparators(cursor);
    }
    return segments;
}

function appendCommand(
    command: string,
    cursor: Cursor,
    state: PathState,
    segments: SvgSegment[],
): void {
    let relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
        case "M":
            return appendMove(cursor, state, segments, relative);
        case "L":
            return appendLine(point(cursor, state, relative), state, segments);
        case "H":
            return appendLine(
                { x: coordinate(cursor, relative ? state.current.x : 0), y: state.current.y },
                state,
                segments,
            );
        case "V":
            return appendLine(
                { x: state.current.x, y: coordinate(cursor, relative ? state.current.y : 0) },
                state,
                segments,
            );
        case "C":
            return appendCubic(
                point(cursor, state, relative),
                point(cursor, state, relative),
                point(cursor, state, relative),
                state,
                segments,
            );
        case "S":
            return appendCubic(
                reflection(state, "cubic"),
                point(cursor, state, relative),
                point(cursor, state, relative),
                state,
                segments,
            );
        case "Q":
            return appendQuadratic(
                point(cursor, state, relative),
                point(cursor, state, relative),
                state,
                segments,
            );
        case "T":
            return appendQuadratic(
                reflection(state, "quadratic"),
                point(cursor, state, relative),
                state,
                segments,
            );
        case "A":
            return appendArc(cursor, state, segments, relative);
        case "Z":
            segments.push({ kind: "close", start: state.current, end: state.subpathStart });
            state.current = state.subpathStart;
            state.control = undefined;
            state.controlKind = undefined;
            return;
        default:
            throw new ImportError(`unsupported SVG path command ${command}`);
    }
}

function appendMove(
    cursor: Cursor,
    state: PathState,
    segments: SvgSegment[],
    relative: boolean,
): void {
    let target = point(cursor, state, relative);
    segments.push({ kind: "move", end: target });
    state.current = target;
    state.subpathStart = target;
    state.control = undefined;
    state.controlKind = undefined;
}

function appendLine(target: Point2D, state: PathState, segments: SvgSegment[]): void {
    segments.push({ kind: "line", start: state.current, end: target });
    state.current = target;
    state.control = undefined;
    state.controlKind = undefined;
}

function appendCubic(
    control1: Point2D,
    control2: Point2D,
    target: Point2D,
    state: PathState,
    segments: SvgSegment[],
): void {
    segments.push({ kind: "cubic", start: state.current, control1, control2, end: target });
    state.current = target;
    state.control = control2;
    state.controlKind = "cubic";
}

function appendQuadratic(
    control: Point2D,
    target: Point2D,
    state: PathState,
    segments: SvgSegment[],
): void {
    segments.push({ kind: "quadratic", start: state.current, control, end: target });
    state.current = target;
    state.control = control;
    state.controlKind = "quadratic";
}

function appendArc(
    cursor: Cursor,
    state: PathState,
    segments: SvgSegment[],
    relative: boolean,
): void {
    let majorRadius = Math.abs(coordinate(cursor, 0));
    let minorRadius = Math.abs(coordinate(cursor, 0));
    let rotation = coordinate(cursor, 0);
    let largeArc = flag(cursor);
    let sweep = flag(cursor);
    let target = point(cursor, state, relative);
    segments.push(
        arcFromEndpoints(
            state.current,
            majorRadius,
            minorRadius,
            rotation,
            largeArc,
            sweep,
            target,
        ),
    );
    state.current = target;
    state.control = undefined;
    state.controlKind = undefined;
}

/** `S` and `T` mirror the previous control point; after anything else the current point stands in. */
function reflection(state: PathState, kind: "cubic" | "quadratic"): Point2D {
    if (state.control === undefined || state.controlKind !== kind) return state.current;
    return {
        x: 2 * state.current.x - state.control.x,
        y: 2 * state.current.y - state.control.y,
    };
}

function point(cursor: Cursor, state: PathState, relative: boolean): Point2D {
    return {
        x: coordinate(cursor, relative ? state.current.x : 0),
        y: coordinate(cursor, relative ? state.current.y : 0),
    };
}

function coordinate(cursor: Cursor, origin: number): number {
    skipSeparators(cursor);
    let match = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(cursor.text.slice(cursor.index));
    if (match === null) {
        throw new ImportError(`expected a number in SVG path data at offset ${cursor.index}`);
    }
    cursor.index += match[0].length;
    return origin + Number.parseFloat(match[0]);
}

/** The arc flags are single digits that may run straight into the next number. */
function flag(cursor: Cursor): boolean {
    skipSeparators(cursor);
    let digit = cursor.text[cursor.index];
    if (digit !== "0" && digit !== "1") {
        throw new ImportError(`expected an SVG arc flag at offset ${cursor.index}, got ${digit}`);
    }
    cursor.index += 1;
    return digit === "1";
}

function skipSeparators(cursor: Cursor): void {
    while (/[\s,]/.test(cursor.text[cursor.index] ?? "")) cursor.index += 1;
}
