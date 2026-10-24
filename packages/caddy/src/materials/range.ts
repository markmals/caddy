/**
 * The band a material property is quoted as: real engineering data spreads with temper, product
 * form and process, so the catalog carries a closed `[min, max]` range rather than one number.
 *
 * Ported from bd_materials 0.2.5 (`core.py`), Copyright 2026 Bernhard Walter, licensed under the
 * Apache License 2.0.
 */

import { MaterialError } from "../errors.ts";

/** A closed `[min, max]` band of typical values for one property. */
export class Range {
    readonly min: number;
    readonly max: number;

    constructor(min: number, max: number) {
        if (min > max) {
            throw new MaterialError(`Range min ${min} > max ${max}`);
        }
        this.min = min;
        this.max = max;
    }

    /**
     * The band sampled at `position`: 0 gives `min`, 1 gives `max`, and values outside `[0, 1]`
     * extrapolate. Explicit about *where* in the band a value is taken, because the band makes no
     * claim that its midpoint is the right choice.
     */
    valueAt(position: number): number {
        return this.min + position * (this.max - this.min);
    }
}

/**
 * The property does not apply to this material — a thermoplastic elastomer has no yield strength.
 * Distinct from a property being absent, which means the catalog has no value for it.
 */
export const NOT_SUITABLE = new Range(Number.NaN, Number.NaN);

/** Whether `range` is {@link NOT_SUITABLE}, the "does not apply" sentinel. */
export function isNotSuitable(range: Range): boolean {
    return Number.isNaN(range.min);
}
