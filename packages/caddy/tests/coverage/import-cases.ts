import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape } from "../../src/index.ts";
import type { OracleCases } from "../topology/oracle/support.ts";

import { fixtureString } from "../../../../reference/build123d/oracle.ts";
import { importDxf, importSvg } from "../../src/io/import2d/index.ts";
import { expectImported } from "../io2/metrics.ts";

/** Writes the fixture's document to a scratch file and hands its path to `read`. */
async function withDocumentFile(
    expected: FixtureCase,
    name: string,
    encoding: BufferEncoding,
    read: (path: string) => Promise<Iterable<Shape>>,
): Promise<void> {
    let directory = await mkdtemp(join(tmpdir(), "caddy-coverage-"));
    try {
        let path = join(directory, name);
        await writeFile(path, fixtureString(expected, "source"), encoding);
        expectImported(expected, [...(await read(path))]);
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

export const importCases: OracleCases = {
    "import/svg-file": async expected =>
        withDocumentFile(expected, "drawing.svg", "utf-8", path => importSvg(path)),
    "import/dxf-file": async expected =>
        withDocumentFile(expected, "drawing.dxf", "latin1", path => importDxf(path)),
};
