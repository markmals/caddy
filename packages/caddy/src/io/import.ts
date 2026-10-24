/**
 * Reading shapes in.
 *
 * `importCAD` takes either a path or the bytes themselves. Format detection is deliberately
 * narrow: `options.type` always wins; without it a path is classified by its extension and
 * bytes are rejected, because sniffing a STEP header out of a buffer would silently
 * misclassify the formats that have none.
 */

import { io, mesh } from "@roonieone/occt-native";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import type { ImportOptions } from "./types.ts";

import { ImportError } from "../errors.ts";
import { Compound } from "../topology/compound.ts";
import { Shape } from "../topology/index.ts";
import { fromStepNodes } from "./assembly.ts";
import { CADFileType } from "./types.ts";

const EXTENSIONS: Readonly<Record<string, CADFileType>> = {
    ".step": CADFileType.Step,
    ".stp": CADFileType.Step,
    ".stl": CADFileType.Stl,
    ".brep": CADFileType.Brep,
    ".brp": CADFileType.Brep,
    ".iges": CADFileType.Iges,
    ".igs": CADFileType.Iges,
};

/**
 * Reads a model from a file path or a buffer.
 *
 * A STEP file with several free shapes comes back as a {@link Compound} of them; a single one
 * comes back on its own, with its STEP name in `label` and its colour in `color`.
 */
export async function importCAD(
    source: string | Uint8Array,
    options: ImportOptions = {},
): Promise<Shape> {
    let type = resolveType(source, options);
    try {
        return await decode(source, type);
    } catch (cause) {
        if (cause instanceof ImportError) throw cause;
        let origin = typeof source === "string" ? source : `${source.length} bytes`;
        throw new ImportError(`cannot import ${origin} as ${type}`, { cause });
    }
}

/** `.brep` cannot be told apart from its binary form by name, so both read through sniffing. */
function resolveType(source: string | Uint8Array, options: ImportOptions): CADFileType {
    if (options.type !== undefined) return options.type;
    if (typeof source !== "string") {
        throw new ImportError("importing from bytes needs an explicit `type`");
    }
    let extension = extname(source).toLowerCase();
    let type = EXTENSIONS[extension];
    if (type === undefined) {
        let known = Object.keys(EXTENSIONS).join(", ");
        throw new ImportError(
            `cannot tell the format of ${source} from its extension (known: ${known}); ` +
                "pass `type`",
        );
    }
    return type;
}

async function decode(source: string | Uint8Array, type: CADFileType): Promise<Shape> {
    if (type === CADFileType.Iges) return readIges(source);

    let bytes = typeof source === "string" ? await readFile(source) : source;
    switch (type) {
        case CADFileType.Brep:
        case CADFileType.BrepBinary:
            return Shape.cast(await io.readBrep(bytes, isBinaryBrep(bytes)));
        case CADFileType.Stl:
            return Shape.cast(await mesh.readStl(bytes));
        case CADFileType.Step: {
            let shapes = fromStepNodes(await io.readStep(bytes));
            let [single] = shapes;
            return shapes.length === 1 && single !== undefined ? single : new Compound(shapes);
        }
    }
}

/**
 * `BinTools` and `BRepTools` are separate readers and neither tolerates the other's file, so
 * the encoding is read off the banner: `Open CASCADE Topology V4` for binary against
 * `CASCADE Topology V3` for text. The extension cannot tell them apart — both are `.brep`.
 */
function isBinaryBrep(bytes: Uint8Array): boolean {
    let banner = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 64));
    return banner.includes("Open CASCADE Topology");
}

/**
 * OCCT 8.0.1 has no IGES stream reader (`IGESSelect_WorkLibrary` implements `ReadFile` only),
 * so bytes have to reach it through a scratch file.
 */
async function readIges(source: string | Uint8Array): Promise<Shape> {
    if (typeof source === "string") return Shape.cast(await io.readIges(source));
    let directory = await mkdtemp(join(tmpdir(), "caddy-iges-"));
    try {
        let path = join(directory, "import.iges");
        await writeFile(path, source);
        return Shape.cast(await io.readIges(path));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
