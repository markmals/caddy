import { oracleSuite } from "../../../../../reference/build123d/oracle.ts";
import { makerCases } from "./maker-cases.ts";
import { memberCases } from "./member-cases.ts";

oracleSuite("faces", {
    ...makerCases,
    ...memberCases,
});
