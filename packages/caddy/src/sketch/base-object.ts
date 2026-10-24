/** Base for the sketch objects, which are built from dimensions rather than a native shape
 * (build123d `BaseSketchObject`). */

import type * as occt from "@roonieone/occt-native";

import { Sketch } from "../topology/composite.ts";
import { rebuilt } from "../topology/rebuild.ts";

export class BaseSketchObject extends Sketch {
    protected override withWrapped(wrapped: occt.Shape): this {
        return rebuilt(this, Sketch, wrapped);
    }
}
