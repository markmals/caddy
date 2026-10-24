// Minimal end-to-end check of a built addon without the test runner, for verifying artifacts
// on other architectures (e.g. `arch -x86_64 node-x64 scripts/smoke.ts` with OCCT_NATIVE_ADDON
// pointing at native/darwin-x64/occt-native.node).

import { booleans, io, measure, occtVersion, primitives } from "../src/index.ts";

function check(label: string, actual: number, expected: number, tolerance: number): void {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
    console.log(`ok ${label} = ${actual}`);
}

let plate = primitives.makeBox(80, 40, 5, {
    origin: [-40, -20, 0],
    zDirection: [0, 0, 1],
    xDirection: [1, 0, 0],
});
let hole = primitives.makeCylinder(5, 10, {
    origin: [20, 0, -1],
    zDirection: [0, 0, 1],
    xDirection: [1, 0, 0],
});
let part = booleans.cut([plate], [hole]);
let expected = 80 * 40 * 5 - Math.PI * 25 * 5;
check("volume", measure.massProperties(part, "volume").mass, expected, 1e-6);
let step = await io.writeStep(
    { shape: part, label: "plate", color: null, subShapeColors: "none", children: [] },
    {
        lengthUnitMeters: 0.001,
        writePCurves: true,
        precisionMode: io.StepPrecisionMode.Average,
        originatingSystem: "caddy smoke test",
        name: "",
        timestamp: "",
    },
);
let [root] = await io.readStep(step);
if (root === undefined) throw new Error("STEP file contains no shape");
check("STEP round-trip volume", measure.massProperties(root.shape, "volume").mass, expected, 1e-6);
if (!measure.isValid(part)) throw new Error("result is not a valid shape");
console.log(`ok OCCT ${occtVersion()} on ${process.platform}-${process.arch}`);
