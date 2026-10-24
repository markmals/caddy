import type { OracleCases } from "./support.ts";

import { expectClose, fixtureRecord } from "../../../../../reference/build123d/oracle.ts";
import {
    EXACT_TOLERANCE,
    LINEAR_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import {
    CM,
    FT,
    G,
    G_PER_LB,
    IN,
    KG,
    LB,
    M,
    MC,
    MM,
    THOU,
    UNITS_PER_KILOGRAM,
    UNITS_PER_METER,
} from "../../../src/index.ts";

/** Fixture key to constant; the Python side emits the same lower-case keys. */
const SCALARS: Record<string, number> = {
    mc: MC,
    mm: MM,
    cm: CM,
    m: M,
    in: IN,
    ft: FT,
    thou: THOU,
    g: G,
    kg: KG,
    g_per_lb: G_PER_LB,
    lb: LB,
};

/** The length and mass unit constants. */
export const unitsCases: OracleCases = {
    "units/constants": expected => {
        for (let [key, value] of Object.entries(SCALARS)) {
            expectClose(expected, key, value, EXACT_TOLERANCE);
        }
        let lengths = fixtureRecord(expected, "units_per_meter");
        for (let [symbol, value] of Object.entries(UNITS_PER_METER)) {
            expectClose(lengths, symbol, value, LINEAR_TOLERANCE);
        }
        let masses = fixtureRecord(expected, "units_per_kilogram");
        for (let [symbol, value] of Object.entries(UNITS_PER_KILOGRAM)) {
            expectClose(masses, symbol, value, LINEAR_TOLERANCE);
        }
    },
};
