import type { Shape } from "../shape.ts";

/**
 * The shapes of `first` that are not in `second` (build123d `delta`).
 *
 * Shapes are matched by the native shape they hold, not by geometry: this answers "which of
 * these objects did that operation leave behind", so two separately built but identical shapes
 * are different shapes here.
 */
export function delta(first: Iterable<Shape>, second: Iterable<Shape>): Shape[] {
    let removed = new Set([...second].map(shape => shape.wrapped));
    return [...first].filter(shape => !removed.has(shape.wrapped));
}
