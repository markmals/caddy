/**
 * Unit constants (build123d `build_constants.py`).
 *
 * Lengths are expressed in millimetres and masses in grams, Caddy's internal units, so a
 * dimension can be written in any unit: `new Box(2 * IN, 1 * IN, 3 * MM)`.
 */

/** One micrometre. */
export const MC = 0.001;

/** One millimetre — the internal length unit, so this is 1 by definition. */
export const MM = 1;

export const CM = 10 * MM;

export const M = 1000 * MM;

export const IN = 25.4 * MM;

export const FT = 12 * IN;

/** One thou (mil): a thousandth of an inch. */
export const THOU = IN / 1000;

/** One gram — the internal mass unit, so this is 1 by definition. */
export const G = 1;

export const KG = 1000 * G;

export const G_PER_LB = 453.59237;

export const LB = G_PER_LB * G;

/**
 * How many of each length unit fit in one metre, keyed by the symbols of `Unit`.
 *
 * Used to rescale an imported model whose file records a different unit.
 */
export const UNITS_PER_METER = {
    µm: M / MC,
    mm: M / MM,
    cm: M / CM,
    m: 1,
    in: M / IN,
    ft: M / FT,
} as const;

/** How many of each mass unit fit in one kilogram, keyed by build123d's unit symbols. */
export const UNITS_PER_KILOGRAM = {
    g: KG / G,
    kg: 1,
    lb: KG / LB,
} as const;
