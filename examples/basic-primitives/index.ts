// Solid primitives, their placement options, and the properties every shape reports.
// Run: node examples/basic-primitives/index.ts

import { Align, Box, Cone, Cylinder, Pos, Sphere, Torus } from "@roonieone/caddy";

let shapes = {
    box: new Box(20, 10, 5),
    cylinder: new Cylinder(4, 12, { align: [Align.Center, Align.Center, Align.Min] }),
    cone: new Cone(6, 2, 10, { rotation: [90, 0, 0] }),
    halfSphere: new Sphere(5, { arcSize1: 0 }),
    torus: new Torus(10, 2).transform(new Pos(0, 0, 20)),
};

for (let [name, shape] of Object.entries(shapes)) {
    let { min, max } = shape.boundingBox;
    console.log(
        `${name.padEnd(10)} ${shape.constructor.name.padEnd(8)} volume ${shape.volume.toFixed(3).padStart(10)}` +
            `  area ${shape.area.toFixed(3).padStart(9)}  faces ${shape.faces.length}` +
            `  bounds ${min.toString()} .. ${max.toString()}`,
    );
}
