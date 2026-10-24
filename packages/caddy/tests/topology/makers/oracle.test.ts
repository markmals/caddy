import { oracleSuite } from "../../../../../reference/build123d/oracle.ts";
import { extrudeCases } from "./extrude-cases.ts";
import { primitiveCases } from "./primitive-cases.ts";
import { sweepCases } from "./sweep-cases.ts";
import { wireCases } from "./wire-cases.ts";

oracleSuite("makers", {
    ...primitiveCases,
    ...sweepCases,
    ...extrudeCases,
    ...wireCases,
});
