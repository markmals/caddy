// Booleans compose like build123d's `+`, `-` and `&`, as methods returning new shapes.
// Run: node examples/boolean-operations/index.ts

import { Box, Cylinder, Pos, Rot, Sphere } from "@roonieone/caddy";

let block = new Box(30, 30, 30);
let ball = new Sphere(19);
let rod = new Cylinder(6, 50);

// A dice-like shape: the intersection of a cube and a sphere...
let rounded = block.intersect(ball);
// ...drilled along all three axes.
let drilled = rounded
    .subtract(rod)
    .subtract(rod.transform(new Rot(90, 0, 0)))
    .subtract(rod.transform(new Rot(0, 90, 0)));
// A second part joined to it.
let assembly = drilled.union(new Box(10, 10, 10).transform(new Pos(0, 0, 20)));

for (let [name, shape] of Object.entries({ rounded, drilled, assembly })) {
    console.log(
        `${name.padEnd(8)} ${shape.constructor.name.padEnd(5)} volume ${shape.volume.toFixed(3)}` +
            `  solids ${shape.solids().length}  faces ${shape.faces().length}  valid ${shape.isValid}`,
    );
}
