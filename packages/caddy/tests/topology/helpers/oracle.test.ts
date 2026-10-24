import { oracleSuite } from "../../../../../reference/build123d/oracle.ts";
import { curveCases } from "./curve-cases.ts";
import { exploreCases } from "./explore-cases.ts";
import { shapeCases } from "./shape-cases.ts";

oracleSuite("helpers", {
    ...exploreCases,
    ...shapeCases,
    ...curveCases,
});
