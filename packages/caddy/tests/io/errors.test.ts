import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { ORACLE_PROJECT_DIR } from "../../../../reference/build123d/oracle.ts";
import { ExportError, ImportError } from "../../src/errors.ts";
import { Color } from "../../src/geometry/color.ts";
import * as caddy from "../../src/index.ts";
import { CADFileType, exportCAD, importCAD, serialize } from "../../src/io/index.ts";
import { Box } from "../../src/parts/index.ts";
import { Part } from "../../src/topology/index.ts";

let run = promisify(execFile);

let directory = "";

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "caddy-io-errors-"));
});

afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
});

function part(): Part {
    let solid = new Part([new Box(4, 5, 6)]);
    solid.label = "widget";
    solid.color = new Color("#4080c0");
    return solid;
}

describe("the package API", () => {
    test("exposes the exporter as both `export` and `exportCAD`", async () => {
        let name = join(directory, "namespaced.step");
        await caddy.export(part(), { name, type: caddy.CADFileType.Step });
        let imported = await caddy.importCAD(name);
        expect(imported.label).toBe("widget");
        expect(caddy.export).toBe(caddy.exportCAD);
    });
});

describe("export failures", () => {
    test("a directory that does not exist is an ExportError naming the path", async () => {
        let name = join(directory, "missing", "part.step");
        await expect(exportCAD(part(), { name, type: CADFileType.Step })).rejects.toThrow(
            ExportError,
        );
        await expect(exportCAD(part(), { name, type: CADFileType.Step })).rejects.toThrow(name);
    });

    test("an empty shape is rejected before the addon is called", async () => {
        let empty = new Part([]);
        await expect(serialize(empty, { type: CADFileType.Stl })).rejects.toThrow(ExportError);
    });
});

describe("import failures", () => {
    test("bytes without a type are rejected", async () => {
        await expect(importCAD(new Uint8Array([1, 2, 3]))).rejects.toThrow(
            /needs an explicit `type`/,
        );
    });

    test("an unknown extension is rejected with the list of known ones", async () => {
        await expect(importCAD("/tmp/model.sldprt")).rejects.toThrow(/known: .*\.step/);
    });

    test("malformed STEP data is an ImportError keeping the native error as cause", async () => {
        let bytes = new TextEncoder().encode("not a step file");
        let failure = await importCAD(bytes, { type: CADFileType.Step }).catch(
            (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(ImportError);
        expect((failure as ImportError).cause).toBeInstanceOf(Error);
        expect(String((failure as ImportError).cause)).toMatch(/STEP read failed/);
    });

    test("a missing file is an ImportError", async () => {
        await expect(importCAD(join(directory, "absent.brep"))).rejects.toThrow(ImportError);
    });

    test("truncated STL data is an ImportError", async () => {
        await expect(importCAD(new Uint8Array(7), { type: CADFileType.Stl })).rejects.toThrow(
            ImportError,
        );
    });
});

describe("interoperability", () => {
    test("a Caddy STEP file opens in a fresh OCCT reader", async () => {
        let name = join(directory, "fresh.step");
        await exportCAD(part(), { name, type: CADFileType.Step });
        let reread = await importCAD(await readFile(name), { type: CADFileType.Step });
        expect(reread.volume).toBeCloseTo(120, 6);
    });

    // Starts the build123d oracle, whose OCP import alone takes seconds; more under parallel load.
    test("a Caddy STEP file opens in build123d", { timeout: 60_000 }, async () => {
        let name = join(directory, "for-build123d.step");
        await exportCAD(part(), { name, type: CADFileType.Step });
        let script = [
            "from build123d import import_step",
            `shape = import_step(${JSON.stringify(name)})`,
            "print(shape.label, round(shape.volume, 6), tuple(round(c, 3) for c in shape.color))",
        ].join("\n");
        let { stdout } = await run("uv", ["run", "python", "-c", script], {
            cwd: ORACLE_PROJECT_DIR,
        });
        expect(stdout.trim()).toBe("widget 120.0 (0.251, 0.502, 0.753, 1.0)");
    });
});

describe("IGES", () => {
    test("round trips through a path and through bytes", async () => {
        let name = join(directory, "part.iges");
        await exportCAD(part(), { name, type: CADFileType.Iges });
        let fromPath = await importCAD(name);
        expect(fromPath.boundingBox.size.toTuple()).toEqual([4, 5, 6]);

        let bytes = await serialize(part(), { type: CADFileType.Iges });
        let copy = join(directory, "copy.iges");
        await writeFile(copy, bytes);
        let fromBytes = await importCAD(bytes, { type: CADFileType.Iges });
        expect(fromBytes.boundingBox.size.toTuple()).toEqual([4, 5, 6]);
    });
});
