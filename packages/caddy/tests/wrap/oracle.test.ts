import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape } from "../../src/topology/index.ts";

import {
    expectClose,
    expectVectorClose,
    fixtureRecord,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { Axis, Plane } from "../../src/geometry/index.ts";
import { fullRound } from "../../src/sketch/index.ts";
import { Compound, Edge, Face, Solid, Wire } from "../../src/topology/index.ts";
import {
    expectCount,
    expectMeasures,
    expectPoints,
    expectShapeMetrics,
} from "../topology/oracle/support.ts";
import {
    coneLocation,
    coneWall,
    cylinderLocation,
    cylinderWall,
    polygonWire,
    rectangleWire,
    trapezoidFace,
} from "./shapes.ts";

/** The `curve` serializer: metrics, length, sorted edge lengths and sorted vertices. */
function expectCurve(expected: FixtureCase, curve: Edge | Wire): void {
    expectShapeMetrics(expected, "shape", curve);
    expectClose(expected, "length", curve.length, MASS_TOLERANCE);
    expectMeasures(expected, "edge_lengths", sortedLengths(curve));
    expectVertices(expected, curve);
}

/** The `surface` serializer: metrics, area, normal, sorted edge lengths and sorted vertices. */
function expectSurface(expected: FixtureCase, face: Face): void {
    expectShapeMetrics(expected, "shape", face);
    expectClose(expected, "area", face.area, MASS_TOLERANCE);
    expectVectorClose(expected, "normal", face.normalAt().toTuple(), LINEAR_TOLERANCE);
    expectMeasures(expected, "edge_lengths", sortedLengths(face));
    expectVertices(expected, face);
}

/** The `rounded` serializer: metrics, area, the face's normal, vertices and edge lengths. */
function expectRounded(expected: FixtureCase, sketch: Shape): void {
    expectShapeMetrics(expected, "shape", sketch);
    expectClose(expected, "area", sketch.area, MASS_TOLERANCE);
    let face = sketch.faces[0];
    if (face === undefined) throw new Error("the rounded sketch holds no face");
    expectVectorClose(expected, "normal", face.normalAt().toTuple(), LINEAR_TOLERANCE);
    expectVertices(expected, sketch);
    expectMeasures(expected, "edge_lengths", sortedLengths(sketch));
}

function sortedLengths(shape: Shape): number[] {
    return shape.edges.map(edge => edge.length).sort((first, second) => first - second);
}

/**
 * The `_vertices` serializer: vertices ordered by a coordinate key rounded to 1e-9, so that two
 * symmetric corners differing by an ulp cannot reorder the whole list.
 */
function expectVertices(expected: FixtureCase, shape: Shape): void {
    let quantized = (coordinate: number): number => Math.round(coordinate * 1e9);
    let vertices = shape.vertices
        .map(vertex => vertex.center)
        .sort(
            (first, second) =>
                quantized(first.x) - quantized(second.x) ||
                quantized(first.y) - quantized(second.y) ||
                quantized(first.z) - quantized(second.z),
        );
    expectPoints(expected, "vertices", vertices);
}

oracleSuite("wrap", {
    "wrap/surface-location": expected => {
        let cylinder = fixtureRecord(expected, "cylinder");
        expectVectorClose(
            cylinder,
            "position",
            cylinderLocation().position.toTuple(),
            LINEAR_TOLERANCE,
        );
        let cone = fixtureRecord(expected, "cone");
        expectVectorClose(cone, "position", coneLocation().position.toTuple(), LINEAR_TOLERANCE);
        let wall = coneWall();
        expectVectorClose(
            expected,
            "cone_normal",
            wall.normalAt(wall.positionAt(0.25, 0.5)).toTuple(),
            LINEAR_TOLERANCE,
        );
    },

    "wrap/edge-line": expected => {
        let wrapped = cylinderWall().wrap(Edge.makeLine([0, 0], [5, 0]), cylinderLocation());
        expectCurve(expected, wrapped);
        expectSamples(expected, wrapped);
    },

    "wrap/edge-arc": expected => {
        let arc = Edge.makeThreePointArc([0, 0], [2, 1], [4, 0]);
        let wrapped = cylinderWall().wrap(arc, cylinderLocation());
        expectCurve(expected, wrapped);
        expectSamples(expected, wrapped);
        expectClose(expected, "planar_length", arc.length, MASS_TOLERANCE);
    },

    "wrap/edge-offset-start": expected => {
        let wrapped = cylinderWall().wrap(Edge.makeLine([2, 1], [5, 1]), cylinderLocation());
        expectCurve(expected, wrapped);
        expectSamples(expected, wrapped);
    },

    "wrap/wire-open": expected => {
        let open = new Wire([Edge.makeLine([0, 0], [4, 0]), Edge.makeLine([4, 0], [4, 3])]);
        expectCurve(expected, cylinderWall().wrap(open, cylinderLocation()));
    },

    "wrap/wire-closed": expected => {
        expectCurve(expected, cylinderWall().wrap(rectangleWire(6, 4), cylinderLocation()));
    },

    "wrap/face": expected => {
        let wrapped = cylinderWall().wrap(new Face(rectangleWire(6, 4)), cylinderLocation());
        expectSurface(expected, wrapped);
    },

    "wrap/face-with-hole": expected => {
        let holed = new Face(rectangleWire(6, 4), [rectangleWire(2, 1)]);
        expectSurface(expected, cylinderWall().wrap(holed, cylinderLocation()));
    },

    "wrap/face-on-cone": expected => {
        expectSurface(expected, coneWall().wrap(new Face(rectangleWire(4, 3)), coneLocation()));
    },

    "wrap/faces-along-path": expected => {
        let path = Edge.makeCircle(10, { plane: new Plane({ origin: [0, 0, 10] }) });
        let faces = [new Face(rectangleWire(3, 2)), new Face(rectangleWire(3, 2, 6))];
        let wrapped = cylinderWall().wrapFaces(faces, path, { start: 0.1 });
        expectCount(expected, "count", wrapped.length);
        expectClose(expected, "path_length", path.length, MASS_TOLERANCE);
        let records = fixtureValue(expected, "faces");
        if (!Array.isArray(records)) throw new Error("expected recorded faces");
        records.forEach((record, index) => {
            expectSurface(
                { ...expected, data: record as Record<string, unknown> },
                wrapped[index] as Face,
            );
        });
    },

    "compound/extrude-shell": expected => {
        let shell = Solid.makeBox(2, 3, 1).shells[0];
        if (shell === undefined) throw new Error("the box has no shell");
        let extruded = Compound.extrude(shell, [0, 0, 4]);
        expectShapeMetrics(expected, "shape", extruded);
        expectClose(expected, "volume", extruded.volume, MASS_TOLERANCE);
        expectMeasures(
            expected,
            "solid_volumes",
            extruded.solids.map(solid => solid.volume).sort((first, second) => first - second),
        );
    },

    "full-round/trapezoid": expected => {
        let trapezoid = trapezoidFace();
        expectRounded(expected, fullRound(trapezoid.edges.toSorted(Axis.Y).last));
    },

    "full-round/trapezoid-inverted": expected => {
        let trapezoid = trapezoidFace();
        expectRounded(expected, fullRound(trapezoid.edges.toSorted(Axis.Y).last, { invert: true }));
    },

    "full-round/trapezoid-coarse": expected => {
        let trapezoid = new Face(
            polygonWire([
                [-1, -0.5],
                [1, -0.5],
                [0.4, 0.5],
                [-0.15, 0.5],
            ]),
        );
        expectRounded(
            expected,
            fullRound(trapezoid.edges.toSorted(Axis.Y).last, { voronoiPointCount: 40 }),
        );
    },

    "full-round/rectangle": expected => {
        expectRounded(expected, fullRound(leftmostEdge(Face.makeRect(34, 10))));
    },

    "full-round/rectangle-inverted": expected => {
        expectRounded(expected, fullRound(leftmostEdge(Face.makeRect(34, 10)), { invert: true }));
    },

    "full-round/triangle": expected => {
        let triangle = new Face(
            polygonWire([
                [0, 0],
                [10, 0],
                [3, 6],
            ]),
        );
        expectRounded(expected, fullRound(triangle.edges.toSorted(Axis.X).first));
    },

    "full-round/flipped-face": expected => {
        expectRounded(expected, fullRound(leftmostEdge(Face.makeRect(34, 10).reverseNormal())));
    },
});

/** The `samples` key: nine points along the wrapped edge. */
function expectSamples(expected: FixtureCase, edge: Edge): void {
    expectPoints(
        expected,
        "samples",
        Array.from({ length: 9 }, (_, index) => edge.positionAt(index / 8)),
    );
}

/** build123d's `(face.edges() << Axis.X)[0]`: the edge furthest along -X in `face.edges`. */
function leftmostEdge(face: Face): Edge {
    return face.edges.groupBy(Axis.X).first.first;
}
