import { oracleSuite } from "../../../../reference/build123d/oracle.ts";
import { booleanCases } from "./oracle/boolean-cases.ts";
import { compositeCases } from "./oracle/composite-cases.ts";
import { constructCases } from "./oracle/construct-cases.ts";
import { convexityCases } from "./oracle/convexity-cases.ts";
import { curveCases } from "./oracle/curve-cases.ts";
import { exploreCases } from "./oracle/explore-cases.ts";
import { faceCases } from "./oracle/face-cases.ts";
import { identityCases } from "./oracle/identity-cases.ts";
import { inertiaCases } from "./oracle/inertia-cases.ts";
import { intersectionCases } from "./oracle/intersection-cases.ts";
import { listCases } from "./oracle/list-cases.ts";
import { propertyCases } from "./oracle/property-cases.ts";
import { touchCases } from "./oracle/touch-cases.ts";
import { transformCases } from "./oracle/transform-cases.ts";

oracleSuite("topology", {
    ...exploreCases,
    ...propertyCases,
    ...inertiaCases,
    ...identityCases,
    ...transformCases,
    ...booleanCases,
    ...listCases,
    ...curveCases,
    ...intersectionCases,
    ...faceCases,
    ...convexityCases,
    ...touchCases,
    ...constructCases,
    ...compositeCases,
});
