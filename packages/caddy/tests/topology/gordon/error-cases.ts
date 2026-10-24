import { expect } from "vite-plus/test";

import type { OracleCases } from "../oracle/support.ts";

import { fixtureString } from "../../../../../reference/build123d/oracle.ts";

export const errorCases: OracleCases = {
    "errors/invalid-network": expected => {
        // build123d refuses an `Edge()` with no wrapped shape. Caddy's `Edge` always wraps a real
        // shape, so an empty edge cannot reach `makeGordonSurface` at all — the same
        // unrepresentable-null divergence `topology/boolean/common-empty` records.
        expect(fixtureString(expected, "empty_profile")).toBe("ValueError");
        expect(fixtureString(expected, "empty_guide")).toBe("ValueError");

        // A point anywhere but at the ends of a profile or guide list.
        expect(fixtureString(expected, "interior_point_profile")).toBe("ValueError");

        // ocp_gordon's own `InvalidInputError` for a network with nothing to interpolate.
        expect(fixtureString(expected, "no_profiles")).toBe("InvalidInputError");
        expect(fixtureString(expected, "single_profile")).toBe("InvalidInputError");
        expect(fixtureString(expected, "no_guides")).toBe("InvalidInputError");
        expect(fixtureString(expected, "single_guide")).toBe("InvalidInputError");
    },
};
