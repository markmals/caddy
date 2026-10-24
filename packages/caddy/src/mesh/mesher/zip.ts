/**
 * The ZIP container a 3MF package is: deflated members, a central directory and an end record.
 *
 * Only what the format needs — no encryption, no ZIP64, no data descriptors — and timestamps are
 * frozen so that writing the same model twice gives the same bytes.
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";

import { ImportError } from "../../errors.ts";

export interface ZipEntry {
    readonly name: string;
    readonly data: Uint8Array;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const DEFLATED = 8;

/** 1980-01-01 00:00, the earliest timestamp the format can express. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_END_SIGNATURE = 0x06064b50;
const ZIP64_EXTRA_ID = 0x0001;
const MAX_16 = 0xffff;
const MAX_32 = 0xffffffff;

const CRC_TABLE = buildCrcTable();

export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
    let parts: Uint8Array[] = [];
    let directory: Uint8Array[] = [];
    let offset = 0;
    for (let entry of entries) {
        let name = Buffer.from(entry.name, "utf-8");
        let compressed = deflateRawSync(entry.data, { level: 9 });
        let crc = crc32(entry.data);
        parts.push(localHeader(name, crc, compressed.length, entry.data.length), name, compressed);
        directory.push(
            centralHeader(name, crc, compressed.length, entry.data.length, offset),
            name,
        );
        offset += 30 + name.length + compressed.length;
    }
    let directoryBytes = Buffer.concat(directory);
    return Buffer.concat([
        ...parts,
        directoryBytes,
        endRecord(entries.length, directoryBytes.length, offset),
    ]);
}

/** Member contents by name; a stored or deflated member is read, anything else is rejected. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
    let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let { count, cursor } = directoryStart(view, bytes.length);
    let members = new Map<string, Uint8Array>();
    for (let index = 0; index < count; index += 1) {
        if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
            throw new ImportError("damaged ZIP central directory");
        }
        let method = view.getUint16(cursor + 10, true);
        let nameLength = view.getUint16(cursor + 28, true);
        let extraLength = view.getUint16(cursor + 30, true);
        let commentLength = view.getUint16(cursor + 32, true);
        let name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
        let extra = cursor + 46 + nameLength;
        let sizes = entrySizes(view, cursor, extra, extraLength);
        members.set(
            name,
            member(bytes, view, sizes.localOffset, method, sizes.compressedSize, name),
        );
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return members;
}

/**
 * Where the central directory starts and how many entries it has. lib3mf writes ZIP64 archives
 * even for small packages, so the classic end record's fields are often placeholders that have
 * to be read from the ZIP64 end record instead.
 */
function directoryStart(view: DataView, length: number): { count: number; cursor: number } {
    let end = endRecordOffset(view, length);
    let count = view.getUint16(end + 10, true);
    let cursor = view.getUint32(end + 16, true);
    if (count !== MAX_16 && cursor !== MAX_32) return { count, cursor };
    let locator = end - 20;
    if (locator < 0 || view.getUint32(locator, true) !== ZIP64_LOCATOR_SIGNATURE) {
        throw new ImportError("ZIP archive claims ZIP64 sizes but has no ZIP64 locator");
    }
    let record = Number(view.getBigUint64(locator + 8, true));
    if (view.getUint32(record, true) !== ZIP64_END_SIGNATURE) {
        throw new ImportError("damaged ZIP64 end of central directory record");
    }
    return {
        count: Number(view.getBigUint64(record + 32, true)),
        cursor: Number(view.getBigUint64(record + 48, true)),
    };
}

/**
 * The compressed size and local header offset of one entry, read from its ZIP64 extra field when
 * the fixed fields are placeholders. The extra field holds, in order and only when needed, the
 * uncompressed size, the compressed size and the local header offset.
 */
function entrySizes(
    view: DataView,
    cursor: number,
    extra: number,
    extraLength: number,
): { compressedSize: number; localOffset: number } {
    let compressedSize = view.getUint32(cursor + 20, true);
    let localOffset = view.getUint32(cursor + 42, true);
    if (compressedSize !== MAX_32 && localOffset !== MAX_32) return { compressedSize, localOffset };
    let size = view.getUint32(cursor + 24, true);
    for (let field = extra; field + 4 <= extra + extraLength;) {
        let id = view.getUint16(field, true);
        let fieldLength = view.getUint16(field + 2, true);
        if (id === ZIP64_EXTRA_ID) {
            let value = field + 4;
            if (size === MAX_32) value += 8;
            if (compressedSize === MAX_32) {
                compressedSize = Number(view.getBigUint64(value, true));
                value += 8;
            }
            if (localOffset === MAX_32) localOffset = Number(view.getBigUint64(value, true));
            break;
        }
        field += 4 + fieldLength;
    }
    return { compressedSize, localOffset };
}

function member(
    bytes: Uint8Array,
    view: DataView,
    localOffset: number,
    method: number,
    compressedSize: number,
    name: string,
): Uint8Array {
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
        throw new ImportError(`damaged ZIP entry ${name}`);
    }
    let start =
        localOffset +
        30 +
        view.getUint16(localOffset + 26, true) +
        view.getUint16(localOffset + 28, true);
    let data = bytes.subarray(start, start + compressedSize);
    if (method === DEFLATED) return inflateRawSync(data);
    if (method === 0) return data;
    throw new ImportError(`ZIP entry ${name} uses unsupported compression method ${method}`);
}

function endRecordOffset(view: DataView, length: number): number {
    for (let offset = length - 22; offset >= 0; offset -= 1) {
        if (view.getUint32(offset, true) === END_SIGNATURE) return offset;
    }
    throw new ImportError("not a ZIP archive: no end of central directory record");
}

function localHeader(
    name: Uint8Array,
    crc: number,
    compressedSize: number,
    size: number,
): Uint8Array {
    let header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_SIGNATURE, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(DEFLATED, 8);
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressedSize, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(name.length, 26);
    return header;
}

function centralHeader(
    name: Uint8Array,
    crc: number,
    compressedSize: number,
    size: number,
    offset: number,
): Uint8Array {
    let header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(DEFLATED, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressedSize, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    return header;
}

function endRecord(count: number, directorySize: number, directoryOffset: number): Uint8Array {
    let record = Buffer.alloc(22);
    record.writeUInt32LE(END_SIGNATURE, 0);
    record.writeUInt16LE(count, 8);
    record.writeUInt16LE(count, 10);
    record.writeUInt32LE(directorySize, 12);
    record.writeUInt32LE(directoryOffset, 16);
    return record;
}

function crc32(data: Uint8Array): number {
    let remainder = 0xffffffff;
    for (let byte of data) {
        remainder = (remainder >>> 8) ^ (CRC_TABLE[(remainder ^ byte) & 0xff] ?? 0);
    }
    return (remainder ^ 0xffffffff) >>> 0;
}

function buildCrcTable(): Uint32Array {
    let table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
}
