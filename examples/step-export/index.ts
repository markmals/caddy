// The export API from the project brief: a plate with a hole, written as STEP, STL and BREP,
// then read back.
// Run: node examples/step-export/index.ts [output directory]

import * as caddy from "@roonieone/caddy";
import { Box, CADFileType, Color, Cylinder, Pos, importCAD } from "@roonieone/caddy";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

let outputDirectory = process.argv[2] ?? "exports";
await mkdir(outputDirectory, { recursive: true });

let plate = new Box(80, 40, 5);
let hole = new Cylinder(5, 10).transform(new Pos(20, 0, 0));
let part = plate.subtract(hole);
part.label = "plate";
part.color = new Color(0.25, 0.5, 0.75);

// `export` is a reserved word, so it is used through the namespace (or renamed on import).
await caddy.export(part, { name: join(outputDirectory, "plate.step"), type: CADFileType.Step });
await caddy.export(part, { name: join(outputDirectory, "plate.stl"), type: CADFileType.Stl });
await caddy.exportCAD(part, { name: join(outputDirectory, "plate.brep"), type: CADFileType.Brep });

let fromStep = await importCAD(join(outputDirectory, "plate.step"));
console.log(`exported volume ${part.volume.toFixed(6)}`);
console.log(`STEP round trip ${fromStep.volume.toFixed(6)} (${fromStep.label ?? "unnamed"})`);
