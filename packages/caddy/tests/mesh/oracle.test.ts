import { expect } from "vite-plus/test";

import {
    expectClose,
    expectMatrixClose,
    expectVectorClose,
    fixtureNumber,
    fixtureRecord,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { Box, Cylinder, Sphere } from "../../src/index.ts";
import { expectSoup, fixtureShape, soupMetrics } from "./support.ts";

const ANGULAR_TOLERANCE = 0.1;

oracleSuite("mesh", {
    "tessellate/box": async expected => {
        let tolerance = fixtureNumber(expected, "tolerance");
        let mesh = await new Box(2, 3, 4).tessellate(tolerance, {
            angularTolerance: fixtureNumber(expected, "angular_tolerance"),
        });
        expectMatrixClose(
            expected,
            "vertices",
            mesh.vertices.map(vertex => vertex.toTuple()),
            LINEAR_TOLERANCE,
        );
        expect(mesh.triangles).toEqual(fixtureValue(expected, "triangles"));
        expectSoup(expected, "metrics", mesh);
    },

    "tessellate/curved": async expected => {
        let options = { angularTolerance: ANGULAR_TOLERANCE };
        let cylinder = await new Cylinder(2, 5).tessellate(1e-3, options);
        expectSoup(expected, "cylinder", cylinder);
        let sphere = await new Sphere(3).tessellate(1e-3, options);
        expectSoup(expected, "sphere", sphere);

        // The soup approximates the solid it came from: inscribed, so a little short on both.
        let metrics = soupMetrics(cylinder);
        expect(metrics.area).toBeLessThan(fixtureNumber(expected, "cylinder_area"));
        expect(metrics.volume).toBeLessThan(fixtureNumber(expected, "cylinder_volume"));
    },

    "tessellate/angular-tolerance": async expected => {
        // One cylinder answers both requests: tessellating never leaves a mesh on the shape it
        // was asked about, which is why the Python case needs two.
        let cylinder = new Cylinder(2, 5);
        expectSoup(expected, "fine", await cylinder.tessellate(1e-3, { angularTolerance: 0.1 }));
        expectSoup(expected, "coarse", await cylinder.tessellate(1e-3, { angularTolerance: 0.8 }));
    },

    "tessellate/reversed-faces": async expected => {
        let part = await fixtureShape(expected);
        let mesh = await part.tessellate(1e-3, { angularTolerance: ANGULAR_TOLERANCE });
        expectSoup(expected, "metrics", mesh);
        // A positive soup volume is the proof that the cut faces were wound back outwards.
        expectClose(expected, "volume", part.volume, MASS_TOLERANCE);
        expect(soupMetrics(mesh).volume).toBeGreaterThan(0);
    },

    "mesh/reuses-triangulation": async expected => {
        let options = { angularTolerance: ANGULAR_TOLERANCE };
        let meshed = await new Cylinder(2, 5).mesh(1e-5, options);
        expectSoup(expected, "fine", await meshed.tessellate(1e-5, options));
        expectSoup(expected, "reused", await meshed.tessellate(1e-1, options));
        expectSoup(expected, "fresh", await new Cylinder(2, 5).tessellate(1e-1, options));
    },

    "mesh/keeps-geometry": async expected => {
        let part = new Box(2, 3, 4).subtract(new Cylinder(0.5, 5));
        let meshed = await part.mesh(1e-3, { angularTolerance: ANGULAR_TOLERANCE });
        expectClose(expected, "volume", meshed.volume, MASS_TOLERANCE);
        expectClose(expected, "area", meshed.area, MASS_TOLERANCE);
        expect(meshed.faces().length).toBe(fixtureNumber(expected, "faces"));
        let bounds = fixtureRecord(expected, "bounding_box");
        let box = meshed.boundingBox();
        expectVectorClose(bounds, "min", box.min.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(bounds, "max", box.max.toTuple(), LINEAR_TOLERANCE);
    },
});
