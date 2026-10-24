// Selecting edges and faces by geometry, then filleting and chamfering the selection.
// Run: node examples/topology-selection/index.ts

import { Axis, Box, Cylinder, GeomType, SortBy } from "@roonieone/caddy";

let part = new Box(40, 30, 10).subtract(new Cylinder(6, 20));

// Vertical edges, ordered along X (build123d: edges().filter_by(Axis.Z).sort_by(Axis.X)). The
// hole's seam is vertical too, so keep only the box corners, which lie far from the Z axis.
let vertical = part.edges
    .filter(Axis.Z)
    .toSorted(Axis.X)
    .filter(edge => Math.hypot(edge.center.x, edge.center.y) > 15);
console.log(`vertical corner edges: ${vertical.length}`);
let rounded = part.fillet(3, vertical);

// The top face is the last face when sorted along Z; chamfer its outer edges.
let top = rounded.faces.toSorted(Axis.Z).last;
let circular = top.edges.filter(edge => edge.geomType === GeomType.Circle);
let chamfered = rounded.chamfer(1, circular);

// Group faces by their height and report the largest face.
let levels = chamfered.faces.groupBy(Axis.Z);
let largest = chamfered.faces.toSorted(SortBy.Area).last;
console.log(`face levels along Z: ${levels.length}; largest face area ${largest.area.toFixed(3)}`);
console.log(
    `volume: ${part.volume.toFixed(3)} -> ${rounded.volume.toFixed(3)} -> ${chamfered.volume.toFixed(3)}`,
);
