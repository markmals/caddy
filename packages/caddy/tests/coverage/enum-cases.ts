import { expect } from "vite-plus/test";

import type { OracleCases } from "../topology/oracle/support.ts";

import {
    expectNumbersClose,
    fixtureRecord,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import { EXACT_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { PAGE_SIZES, PageSize, PrecisionMode } from "../../src/io/index.ts";
import { Convexity } from "../../src/topology/index.ts";

/** build123d names its enum members in SCREAMING_CASE; Caddy's are the PascalCase of those. */
function memberNames(members: Readonly<Record<string, string | number>>): string[] {
    return Object.keys(members).map(name => name.toUpperCase());
}

export const enumCases: OracleCases = {
    "enums/convexity": expected => {
        expect(memberNames(Convexity), "member names").toEqual(fixtureValue(expected, "names"));
        // Upstream `Convexity` is an `auto()` enum, so its numbers mean nothing beyond being
        // distinct; Caddy uses the member names as the values, as for every other ported enum.
        expect(Object.values(Convexity), "member values").toEqual(fixtureValue(expected, "names"));
    },
    "enums/page-size": expected => {
        expect(memberNames(PageSize), "member names").toEqual(fixtureValue(expected, "names"));
        expect(Object.values(PageSize), "member values").toEqual(fixtureValue(expected, "names"));
        let sizes = fixtureRecord(expected, "sizes");
        for (let size of Object.values(PageSize)) {
            expectNumbersClose(sizes, size, PAGE_SIZES[size], EXACT_TOLERANCE);
        }
    },
    "enums/precision-mode": expected => {
        expect(memberNames(PrecisionMode), "member names").toEqual(fixtureValue(expected, "names"));
        // These values are OCCT's own `write.precision.mode` codes, so they are the API.
        expect(Object.values(PrecisionMode), "member values").toEqual(
            fixtureValue(expected, "values"),
        );
    },
};
