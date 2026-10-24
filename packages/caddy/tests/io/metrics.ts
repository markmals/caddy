import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape } from "../../src/topology/index.ts";

import { fixtureString } from "../../../../reference/build123d/oracle.ts";
import { importCAD } from "../../src/io/index.ts";
import { CADFileType } from "../../src/io/types.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Loads the BREP asset a case shipped as the input its round trip starts from. */
export async function fixtureShape(expected: FixtureCase, key = "source"): Promise<Shape> {
    let bytes = await readFile(`${REPO_ROOT}${fixtureString(expected, key)}`);
    return importCAD(bytes, { type: CADFileType.Brep });
}
