import { describe, expect, test } from "vite-plus/test";

import { GeometryError } from "../../../src/errors.ts";
import { Face } from "../../../src/topology/index.ts";
import { GORDON_TOLERANCE, interiorPointNetwork, sinusoidalNetwork } from "./shapes.ts";

describe("Face.makeGordonSurface", () => {
    test("rejects a point in the middle of the profile list", () => {
        let { profiles, guides } = interiorPointNetwork();
        expect(() =>
            Face.makeGordonSurface(profiles, guides, { tolerance: GORDON_TOLERANCE }),
        ).toThrow(GeometryError);
    });

    test("needs at least two profiles", () => {
        let { profiles, guides } = sinusoidalNetwork();
        expect(() => Face.makeGordonSurface([], guides)).toThrow(GeometryError);
        expect(() => Face.makeGordonSurface(profiles.slice(0, 1), guides)).toThrow(GeometryError);
    });

    test("needs at least two guides", () => {
        let { profiles, guides } = sinusoidalNetwork();
        expect(() => Face.makeGordonSurface(profiles, [])).toThrow(GeometryError);
        expect(() => Face.makeGordonSurface(profiles, guides.slice(0, 1))).toThrow(GeometryError);
    });
});
