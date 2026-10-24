import { oracleSuite } from "../../../../../reference/build123d/oracle.ts";
import { errorCases } from "./error-cases.ts";
import { networkCases } from "./network-cases.ts";

oracleSuite("gordon", {
    ...networkCases,
    ...errorCases,
});
