import type { FixtureCase } from "../../../../../reference/build123d/oracle.ts";
import type { Face, Shape } from "../../../src/topology/index.ts";
import type { OracleCases } from "./support.ts";

import { expectClose } from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Pos } from "../../../src/geometry/index.ts";
import { Face as PlanarFace } from "../../../src/topology/index.ts";
import { box } from "./shapes.ts";
import { expectCount, expectMeasures, expectNames, expectPoints, sortedPoints } from "./support.ts";

/** The `_touch_summary` serializer: sorted class names, the count and sorted centres. */
function expectSummary(expected: FixtureCase, contacts: readonly Shape[]): void {
    expectNames(expected, "classes", contacts.map(contact => contact.constructor.name).sort());
    expectCount(expected, "count", contacts.length);
    expectPoints(expected, "centers", sortedPoints(contacts.map(contact => contact.center)));
}

export const touchCases: OracleCases = {
    "touch/solid-face": expected => {
        let contacts = [...box().touch(box().moved(new Pos(10, 0, 0)))];
        expectSummary(expected, contacts);
        expectMeasures(
            expected,
            "areas",
            contacts
                .filter(contact => contact.shapeType === "Face")
                .map(contact => (contact as Face).area)
                .sort((first, second) => first - second),
        );
    },
    "touch/solid-edge": expected => {
        expectSummary(expected, [...box().touch(box().moved(new Pos(10, 6, 0)))]);
    },
    "touch/solid-vertex": expected => {
        expectSummary(expected, [...box().touch(box().moved(new Pos(10, 6, 4)))]);
    },
    "touch/solid-none": expected => {
        expectCount(expected, "count", box().touch(box().moved(new Pos(20, 0, 0))).length);
    },
    "touch/face-corner": expected => {
        let first = PlanarFace.makeRect(4, 4);
        let second = PlanarFace.makeRect(4, 4).moved(new Pos(4, 4, 0));
        expectSummary(expected, [...first.touch(second)]);
    },
    "touch/intersect-include-touched": expected => {
        let first = box();
        let second = box().moved(new Pos(10, 0, 0));
        let touched = first.intersect(second, { includeTouched: true });
        if (touched === undefined) throw new Error("expected a boundary contact");
        expectClose(expected, "touched_area", touched.area, MASS_TOLERANCE);
    },
};
