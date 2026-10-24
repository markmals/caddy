/**
 * The little of OpenType the font registry needs: the human-readable names a font file declares
 * and, for variable fonts, the named instances it offers.
 *
 * build123d reads these with fontTools; Caddy reads the two tables itself (`name` and `fvar`)
 * rather than taking a font library as a dependency. Tables are read exactly as the OpenType
 * specification lays them out, so a file either parses or is reported unusable.
 */

/** One decoded `name` table record, in table order. */
export interface NameRecord {
    /** OpenType name ID: 1 family, 2 subfamily, 16 typographic family. */
    readonly nameId: number;
    readonly text: string;
}

/** One font inside a file: a `.ttf`/`.otf` holds one, a `.ttc` collection several. */
export interface SfntFont {
    readonly names: readonly NameRecord[];
    /** Subfamily name IDs of the `fvar` named instances, or undefined for a static font. */
    readonly variationNameIds: readonly number[] | undefined;
}

/** A file that is not an OpenType font, or whose tables do not fit inside it. */
export class SfntError extends Error {
    override name = "SfntError";
}

/** `ttcf`, the tag of a TrueType collection. */
const COLLECTION_TAG = 0x74746366;
/** The sfnt versions of a single font: TrueType (1.0 and Apple's `true`) and CFF (`OTTO`). */
const FONT_VERSIONS = new Set([0x00010000, 0x74727565, 0x4f54544f]);

/**
 * Character encoding of a `name` record, by platform and encoding ID, or undefined for the
 * platform-specific legacy encodings no decoder is available for (which fontTools also refuses).
 */
function encodingOf(platformId: number, encodingId: number): string | undefined {
    if (platformId === 0) return "utf-16be";
    if (platformId === 1) return encodingId === 0 ? "macintosh" : undefined;
    if (platformId !== 3) return undefined;
    switch (encodingId) {
        case 0:
        case 1:
        case 10:
            return "utf-16be";
        case 2:
            return "shift_jis";
        case 3:
            return "gbk";
        case 4:
            return "big5";
        case 5:
            return "euc-kr";
        default:
            return undefined;
    }
}

/** The fonts `bytes` holds, with their names and variations. */
export function readSfnt(bytes: Uint8Array): SfntFont[] {
    let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return fontOffsets(view).map(offset => readFont(view, offset));
}

/** Where each font starts: one at zero, or the directory of a `ttcf` collection. */
function fontOffsets(view: DataView): number[] {
    let tag = read32(view, 0, "sfnt version");
    if (tag !== COLLECTION_TAG) {
        if (!FONT_VERSIONS.has(tag)) {
            throw new SfntError(`not an OpenType font (sfnt version 0x${tag.toString(16)})`);
        }
        return [0];
    }
    let count = read32(view, 8, "collection font count");
    let offsets: number[] = [];
    for (let index = 0; index < count; index += 1) {
        offsets.push(read32(view, 12 + 4 * index, "collection font offset"));
    }
    return offsets;
}

function readFont(view: DataView, offset: number): SfntFont {
    let tables = tableDirectory(view, offset);
    let names = tables.get("name");
    let variations = tables.get("fvar");
    return {
        names: names === undefined ? [] : readNames(view, names),
        variationNameIds: variations === undefined ? undefined : readVariations(view, variations),
    };
}

/** Table tag to table offset, for the tables this module reads. */
function tableDirectory(view: DataView, offset: number): Map<string, number> {
    let count = read16(view, offset + 4, "table count");
    let tables = new Map<string, number>();
    for (let index = 0; index < count; index += 1) {
        let entry = offset + 12 + 16 * index;
        let tag = String.fromCharCode(
            read8(view, entry, "table tag"),
            read8(view, entry + 1, "table tag"),
            read8(view, entry + 2, "table tag"),
            read8(view, entry + 3, "table tag"),
        );
        tables.set(tag, read32(view, entry + 8, "table offset"));
    }
    return tables;
}

/** Every record of the `name` table that a decoder can read, in table order. */
function readNames(view: DataView, offset: number): NameRecord[] {
    let count = read16(view, offset + 2, "name record count");
    let storage = offset + read16(view, offset + 4, "name string offset");
    let records: NameRecord[] = [];
    for (let index = 0; index < count; index += 1) {
        let entry = offset + 6 + 12 * index;
        let encoding = encodingOf(
            read16(view, entry, "name platform ID"),
            read16(view, entry + 2, "name encoding ID"),
        );
        let nameId = read16(view, entry + 6, "name ID");
        let length = read16(view, entry + 8, "name length");
        let start = storage + read16(view, entry + 10, "name offset");
        if (encoding === undefined) continue;
        let text = decode(view, start, length, encoding);
        if (text !== undefined) records.push({ nameId, text });
    }
    return records;
}

/** Subfamily name IDs of the named instances in `fvar`, in table order. */
function readVariations(view: DataView, offset: number): number[] {
    let axesOffset = read16(view, offset + 4, "fvar axes offset");
    let axisCount = read16(view, offset + 8, "fvar axis count");
    let axisSize = read16(view, offset + 10, "fvar axis size");
    let instanceCount = read16(view, offset + 12, "fvar instance count");
    let instanceSize = read16(view, offset + 14, "fvar instance size");
    let first = offset + axesOffset + axisCount * axisSize;
    let nameIds: number[] = [];
    for (let index = 0; index < instanceCount; index += 1) {
        nameIds.push(read16(view, first + index * instanceSize, "fvar subfamily name ID"));
    }
    return nameIds;
}

/** The record's text, or undefined when its bytes are not valid in `encoding`. */
function decode(
    view: DataView,
    offset: number,
    length: number,
    encoding: string,
): string | undefined {
    if (offset + length > view.byteLength) {
        throw new SfntError(`name record runs past the end of the file`);
    }
    let bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
    try {
        return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
        return undefined;
    }
}

function read8(view: DataView, offset: number, what: string): number {
    bounded(view, offset, 1, what);
    return view.getUint8(offset);
}

function read16(view: DataView, offset: number, what: string): number {
    bounded(view, offset, 2, what);
    return view.getUint16(offset);
}

function read32(view: DataView, offset: number, what: string): number {
    bounded(view, offset, 4, what);
    return view.getUint32(offset);
}

function bounded(view: DataView, offset: number, size: number, what: string): void {
    if (offset < 0 || offset + size > view.byteLength) {
        throw new SfntError(`${what} at ${offset} lies outside the font file`);
    }
}
