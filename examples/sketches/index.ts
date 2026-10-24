// 2D sketches built from objects and booleans, then turned into solids.
// Run: node examples/sketches/index.ts

import { Circle, Pos, Rectangle, RegularPolygon, SlotCenterToCenter } from "@roonieone/caddy";

let outline = new Rectangle(60, 40);
let opening = new Circle(6).transform(new Pos(15, 0));
let slot = new SlotCenterToCenter(20, 6).transform(new Pos(-12, 8));
let hexagon = new RegularPolygon(5, 6).transform(new Pos(-12, -10));

let sketch = outline.subtract(opening).subtract(slot).subtract(hexagon);
let plate = sketch.extrude(8);

console.log(`sketch: ${sketch.faces().length} face, area ${sketch.area.toFixed(3)}`);
console.log(
    `plate:  volume ${plate.volume.toFixed(3)} (= area x 8), ${plate.faces().length} faces`,
);
