// The record an operation keeps of what it did to its inputs' sub-shapes (BRepTools_History).

import type { Shape } from "./types.ts";

import { addon } from "./addon.ts";

declare const HISTORY_BRAND: unique symbol;

/**
 * An OCCT `BRepTools_History` owned by JavaScript. Opaque: pass it back to this package's
 * functions. Native memory is released when the object is garbage collected.
 */
export interface History {
    readonly [HISTORY_BRAND]: true;
}

/** A shape and the record of the operation that made it. */
export interface Recorded {
    readonly shape: Shape;
    readonly history: History;
}

/** How a sub-shape of a result descends from the inputs, as `classify` reports it. */
export const Descent = {
    /** The operation brought the sub-shape in or made it (build123d `Select.LAST`). */
    Last: 1,
    /** No input held the sub-shape in any form (build123d `Select.NEW`). */
    New: 2,
} as const;
export type Descent = (typeof Descent)[keyof typeof Descent];

interface HistoryAddon {
    historyEmpty(): History;
    historyMerge(target: History, later: History): void;
    historyAddModified(record: History, before: Shape, after: Shape): void;
    historyClassify(
        record: History,
        before: readonly Shape[],
        brought: readonly Shape[],
        candidates: readonly Shape[],
    ): Float64Array;
}

function native(): HistoryAddon {
    return addon<HistoryAddon>();
}

/** The record of an operation that changed nothing. */
export function empty(): History {
    return native().historyEmpty();
}

/** Extends `target` in place with the record of the operation that came after it. */
export function merge(target: History, later: History): void {
    native().historyMerge(target, later);
}

/**
 * Records that `before` was rebuilt into `after`, for what an algorithm did but does not say.
 * Sub-shape kinds the record does not track (wires, shells, compounds) are ignored.
 */
export function addModified(record: History, before: Shape, after: Shape): void {
    native().historyAddModified(record, before, after);
}

/**
 * A {@link Descent} bit set per candidate sub-shape of a result, given the inputs that were
 * already there (`before`) and those the operation brought in (`brought`).
 */
export function classify(
    record: History,
    before: readonly Shape[],
    brought: readonly Shape[],
    candidates: readonly Shape[],
): Float64Array {
    return native().historyClassify(record, before, brought, candidates);
}
