/**
 * Tolerances for differential tests against the pinned build123d 0.13.0 / OCCT 8.0.1 oracle.
 *
 * Every comparison helper in `oracle.ts` applies the same rule:
 *
 *     |actual - expected| <= tolerance * max(1, |expected|)
 *
 * i.e. the tolerance is absolute for values near zero (where relative error is
 * meaningless — OCCT happily returns 1e-17 for an exact zero centre of mass) and
 * relative for larger magnitudes (where a model in millimetres must not be held
 * to the same absolute slack as one in metres).
 *
 * Pick the loosest constant that still describes the computation under test; a
 * test that needs something looser than `APPROXIMATION_TOLERANCE` is reporting a
 * real divergence, not a tolerance problem.
 */

/** Pure float64 arithmetic replayed in TypeScript: only operation-order ULPs differ. */
export const EXACT_TOLERANCE = 1e-12;

/** OCCT `Precision::Confusion()` = 1e-7, the modeller's own "same point" threshold. */
export const LINEAR_TOLERANCE = 1e-7;

/** OCCT `Precision::Angular()` = 1e-12, for radians and for direction cosines. */
export const ANGULAR_TOLERANCE = 1e-12;

/** Euler angles recovered from a rotation matrix lose roughly half the mantissa near gimbal poses. */
export const ORIENTATION_TOLERANCE = 1e-9;

/** `GProp` integrates volume/area/centre of mass by quadrature, so agreement is ~1e-9 relative. */
export const MASS_TOLERANCE = 1e-9;

/** OCCT `Precision::Approximation()` = 1e-6, the slack of fitted geometry (BSpline fits, offsets). */
export const APPROXIMATION_TOLERANCE = 1e-6;
