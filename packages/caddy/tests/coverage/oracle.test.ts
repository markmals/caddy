import { oracleSuite } from "../../../../reference/build123d/oracle.ts";
import { edgeCases } from "./edge-cases.ts";
import { enumCases } from "./enum-cases.ts";
import { errorCases } from "./error-cases.ts";
import { faceCases } from "./face-cases.ts";
import { importCases } from "./import-cases.ts";
import { jointCases } from "./joint-cases.ts";
import { shapeCases } from "./shape-cases.ts";
import { typeCases } from "./type-cases.ts";

oracleSuite("coverage", {
    ...edgeCases,
    ...enumCases,
    ...errorCases,
    ...faceCases,
    ...importCases,
    ...jointCases,
    ...shapeCases,
    ...typeCases,
});
