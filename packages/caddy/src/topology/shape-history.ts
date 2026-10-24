/**
 * The record of how a shape was made (build123d `ShapeHistory` and `Shape._made_by`): what the
 * operation did to the sub-shapes of the inputs that were already there and of the ones it
 * brought in. `Select.LAST` and `Select.NEW` are read off it.
 *
 * The record belongs to the operation, not to the geometry, so it is kept beside the shapes
 * rather than on them: a shape stays immutable, and a copy of one carries no claim about an
 * operation it was not the result of.
 */

import type * as occt from "@roonieone/occt-native";

import { history } from "@roonieone/occt-native";

import type { Shape } from "./shape.ts";

import { Select } from "./enums.ts";

const RECORDS = new WeakMap<Shape, ShapeHistory>();

export class ShapeHistory {
    /** The inputs that were already there: the arguments of a boolean. */
    readonly before: readonly occt.Shape[];
    /** The inputs the operation brought in: the tools of a boolean. */
    readonly brought: readonly occt.Shape[];

    readonly #record: occt.History;

    constructor(
        record: occt.History,
        before: readonly occt.Shape[] = [],
        brought: readonly occt.Shape[] = [],
    ) {
        this.#record = record;
        this.before = before;
        this.brought = brought;
    }

    /**
     * A record of an operation OCCT keeps none of its own: the caller notes what it did with
     * {@link addModified} (build123d's bare `ShapeHistory()`).
     */
    static empty(
        before: readonly occt.Shape[] = [],
        brought: readonly occt.Shape[] = [],
    ): ShapeHistory {
        return new ShapeHistory(history.empty(), before, brought);
    }

    /**
     * Notes that `before` was rebuilt into `after` (build123d `ShapeHistory.add_modified`), for
     * what an operation did but has no record of. Untracked kinds are ignored.
     */
    addModified(before: occt.Shape, after: occt.Shape): void {
        history.addModified(this.#record, before, after);
    }

    /** Extends the record with the operation that came after it, such as the clean of a fuse. */
    merge(later: occt.History | ShapeHistory): void {
        history.merge(this.#record, later instanceof ShapeHistory ? later.#record : later);
    }

    /**
     * The same record read against other inputs: a compound's `+` fuses one of its pieces
     * against the rest, but everything the compound held was there before.
     */
    withInputs(before: readonly occt.Shape[], brought: readonly occt.Shape[]): ShapeHistory {
        return new ShapeHistory(this.#record, before, brought);
    }

    /** Those of `candidates` the operation brought in or created, or created outright. */
    narrow<T extends Shape>(
        candidates: readonly T[],
        select: typeof Select.Last | typeof Select.New,
    ): T[] {
        let wanted = select === Select.Last ? history.Descent.Last : history.Descent.New;
        let flags = history.classify(
            this.#record,
            this.before,
            this.brought,
            candidates.map(candidate => candidate.wrapped),
        );
        return candidates.filter((_, index) => ((flags[index] ?? 0) & wanted) !== 0);
    }
}

/** build123d `Shape._made_by`: note how `shape` was made, as it is created. */
export function madeBy<T extends Shape>(shape: T, record: ShapeHistory): T {
    RECORDS.set(shape, record);
    return shape;
}

/** How `shape` was made, if it is the result of an operation that keeps a record. */
export function recordOf(shape: Shape): ShapeHistory | undefined {
    return RECORDS.get(shape);
}
