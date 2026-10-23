/** Linear tolerance used throughout build123d (`build123d.geometry.TOLERANCE`). */
export const TOLERANCE = 1e-6;

export const DEG2RAD = Math.PI / 180;

export const RAD2DEG = 180 / Math.PI;

/**
 * Default tolerance for `equals()`.
 *
 * build123d compares geometry by rounding each coordinate to {@link TOLERANCE}'s exponent minus
 * one (5 decimal places) and comparing exactly. An absolute tolerance of 1e-5 agrees with that
 * everywhere except within half an ulp of a rounding boundary.
 */
export const GEOM_TOLERANCE = 1e-5;

/** `gp::Resolution()`, the smallest magnitude OCCT treats as non-null. */
export const RESOLUTION = Number.MIN_VALUE * 2 ** 52;
