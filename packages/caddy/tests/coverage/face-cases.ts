import { expect } from "vite-plus/test";

import type { OracleCases } from "../topology/oracle/support.ts";

import {
    expectNumbersClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureString,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import {
    APPROXIMATION_TOLERANCE,
    LINEAR_TOLERANCE,
    MASS_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import { Axis, Plane, Sphere, Torus, Vector } from "../../src/index.ts";
import { Edge, Face, Solid, Wire } from "../../src/topology/index.ts";
import { expectFlags, expectShapeMetrics } from "../topology/oracle/support.ts";

/** build123d's `test_make_surface` boundary: three straight sides and an arc that dips. */
function netExterior(): Wire {
    let corners = [-50.5, 50.5].flatMap(x => [-24.5, 24.5].map(y => new Vector(x, y)));
    return new Wire([
        Edge.makeLine(corners[3]!, corners[1]!),
        Edge.makeLine(corners[1]!, corners[0]!),
        Edge.makeLine(corners[0]!, corners[2]!),
        Edge.makeThreePointArc(
            corners[2]!,
            corners[2]!
                .add(corners[3]!)
                .divide(2)
                .sub(new Vector(0, 0, 3)),
            corners[3]!,
        ),
    ]);
}

export const faceCases: OracleCases = {
    "face/is-coplanar": expected => {
        let square = Face.makeRect(1, 1, Plane.XZ);
        let sphere = Solid.makeSphere(1).faces[0]!;
        expectFlags(expected, {
            square_in_xz: square.isCoplanar(Plane.XZ),
            reversed_in_xz: square.reverseNormal().isCoplanar(Plane.XZ),
            square_in_xy: square.isCoplanar(Plane.XY),
            square_in_offset_xz: square.isCoplanar(Plane.XZ.offset(0.5)),
            sphere_in_xy: sphere.isCoplanar(Plane.XY),
        });
    },
    "face/make-surface": expected => {
        let exterior = netExterior();
        let plain = Face.makeSurface(exterior);
        let pulled = Face.makeSurface(exterior, { surfacePoints: [new Vector(0, 0, -5)] });
        let hole = Wire.makeCircle(10).projectToShape(pulled, { direction: [0, 0, -1] })[0]!;
        let pierced = Face.makeSurface(exterior, {
            surfacePoints: [new Vector(0, 0, -5)],
            interiorWires: [hole as Wire],
        });
        expectShapeMetrics(expected, "plain", plain);
        expectShapeMetrics(expected, "pulled", pulled);
        expectShapeMetrics(expected, "pierced", pierced);
        expectShapeMetrics(
            expected,
            "from_edges",
            Face.makeSurface([Edge.makeCircle(50)], { surfacePoints: [[0, 0, -5]] }),
        );
    },
    "face/radii": expected => {
        let torus = new Torus(5, 1).face;
        expect(torus.radii, "torus").toBeDefined();
        expectNumbersClose(expected, "torus", torus.radii ?? [], LINEAR_TOLERANCE);
        // Every other surface answers `None` upstream, which is `undefined` here.
        let others = {
            sphere: new Sphere(1).face,
            cylinder: Solid.makeCylinder(2, 4).faces.toSorted(Axis.Z)[1]!,
            planar: Face.makeRect(1, 1),
        };
        for (let [key, face] of Object.entries(others)) {
            expect(face.radii ?? null, key).toBe(fixtureValue(expected, key));
        }
    },
    "face/surface-patch": expected => {
        // Only what survives the kernel-level difference documented in the Python case: the
        // patch's topology and its bounding box, never its area.
        let first = Edge.makeSpline([
            [0, 0, 0],
            [1, 0, 0],
            [10, 0, -10],
        ]);
        let second = Edge.makeSpline([
            [0, 0, 0],
            [0, 1, 0],
            [0, 10, -10],
        ]);
        let third = Edge.makeSpline([first.positionAt(1), [7, 7, -10], second.positionAt(1)]);
        let patch = Face.makeSurfacePatch({ edgeConstraints: [first, second, third] });

        expect(patch.constructor.name, "class").toBe(fixtureString(expected, "class_name"));
        expect(patch.isValid, "validity").toBe(fixtureBoolean(expected, "is_valid"));
        expect(patch.geomType, "geom type").toBe(fixtureString(expected, "geom_type"));
        expect(patch.faces.length, "face count").toBe(fixtureNumber(expected, "face_count"));
        expect(patch.edges.length, "edge count").toBe(fixtureNumber(expected, "edge_count"));
        expect(patch.vertices.length, "vertex count").toBe(fixtureNumber(expected, "vertex_count"));
        let box = patch.boundingBox;
        expectVectorClose(expected, "min", box.min.toTuple(), APPROXIMATION_TOLERANCE);
        expectVectorClose(expected, "max", box.max.toTuple(), APPROXIMATION_TOLERANCE);
        expectNumbersClose(
            expected,
            "boundary_lengths",
            patch.edges.map(edge => edge.length).sort((left, right) => left - right),
            MASS_TOLERANCE,
        );
    },
};
