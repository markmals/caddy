import type * as occt from "@roonieone/occt-native";

import type { Plane } from "../geometry/plane.ts";

/** The native coordinate frame (origin, main and X direction) of a plane. */
export function frameOf(plane: Plane): occt.Frame {
    return {
        origin: plane.origin.toTuple(),
        zDirection: plane.zDir.toTuple(),
        xDirection: plane.xDir.toTuple(),
    };
}
