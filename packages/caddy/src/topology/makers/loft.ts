/** Lofted solids and shells (build123d `Solid.make_loft` and `Shell.make_loft`). */

import type * as occt from "@roonieone/occt-native";

import { features } from "@roonieone/occt-native";

import type { Shell } from "../shell.ts";
import type { Solid } from "../solid.ts";
import type { Vertex } from "../vertex.ts";
import type { Wire } from "../wire.ts";

import { GeometryError } from "../../errors.ts";
import { castShell, castSolid } from "./cast.ts";

export interface LoftOptions {
    /** Join the sections with straight ruled surfaces instead of a smooth skin. */
    readonly ruled?: boolean;
}

/**
 * build123d `_make_loft`: vertices may only cap the run of wires, and a loft of two vertices
 * has no cross section at all.
 */
function loftSections(objs: Iterable<Vertex | Wire>): occt.Shape[] {
    let sections = [...objs];
    if (sections.length < 2) {
        throw new GeometryError("More than one wire is required");
    }
    let vertices = sections.filter(section => section.shapeType === "Vertex");
    if (vertices.length > 2) {
        throw new GeometryError("Only two vertices are allowed");
    }
    let endsWithVertex =
        sections[0]!.shapeType === "Vertex" ||
        sections[sections.length - 1]!.shapeType === "Vertex";
    if (vertices.length === 1 && !endsWithVertex) {
        throw new GeometryError("The vertex must be either at the beginning or end of the list");
    }
    if (vertices.length === 2) {
        if (sections.length === 2) {
            throw new GeometryError(
                "You can't have only 2 vertices to loft; try adding some wires",
            );
        }
        if (
            sections[0]!.shapeType !== "Vertex" ||
            sections[sections.length - 1]!.shapeType !== "Vertex"
        ) {
            throw new GeometryError("The vertices must be at the beginning and end of the list");
        }
    }
    return sections.map(section => section.wrapped);
}

export function makeLoftSolid(objs: Iterable<Vertex | Wire>, options: LoftOptions = {}): Solid {
    let sections = loftSections(objs);
    return castSolid("Solid.makeLoft", () => features.loft(sections, options.ruled ?? false, true));
}

export function makeLoftShell(objs: Iterable<Vertex | Wire>, options: LoftOptions = {}): Shell {
    let sections = loftSections(objs);
    return castShell("Shell.makeLoft", () =>
        features.loft(sections, options.ruled ?? false, false),
    );
}
