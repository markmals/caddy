/**
 * Reader for ASCII DXF: the tagged group-code stream, grouped into entities.
 *
 * A DXF file is pairs of lines, a group code and its value. Only the entities section is read,
 * which is where a drawing's model space lives; the vertices that follow a `POLYLINE` are
 * attached to it as children, the way every DXF library presents them.
 */

import { ImportError } from "../../errors.ts";

export interface DxfTag {
    readonly code: number;
    readonly value: string;
}

export interface DxfEntity {
    readonly type: string;
    readonly tags: readonly DxfTag[];
    /** The `VERTEX` entities of a `POLYLINE`. */
    readonly vertices: readonly DxfEntity[];
}

const BINARY_SENTINEL = "AutoCAD Binary DXF";

/** Every entity of the drawing's entities section, in file order. */
export function readDxfEntities(text: string): DxfEntity[] {
    if (text.startsWith(BINARY_SENTINEL)) {
        throw new ImportError("binary DXF is not supported; save the drawing as ASCII DXF");
    }
    let tags = parseTags(text);
    let entities: MutableEntity[] = [];
    let inEntities = false;
    let current: MutableEntity | undefined;
    let polyline: MutableEntity | undefined;
    let finish = (): void => {
        if (current !== undefined && current.type !== "VERTEX") entities.push(current);
        current = undefined;
    };
    for (let [index, tag] of tags.entries()) {
        if (tag.code !== 0) {
            if (current !== undefined) current.tags.push(tag);
            continue;
        }
        if (tag.value === "SECTION") {
            inEntities = tags[index + 1]?.value === "ENTITIES";
            continue;
        }
        if (tag.value === "ENDSEC" || tag.value === "EOF") {
            finish();
            inEntities = false;
            continue;
        }
        if (!inEntities) continue;
        finish();
        if (tag.value === "SEQEND") {
            polyline = undefined;
            continue;
        }
        current = { type: tag.value, tags: [], vertices: [] };
        if (tag.value === "VERTEX") polyline?.vertices.push(current);
        else if (tag.value === "POLYLINE") polyline = current;
    }
    finish();
    return entities;
}

interface MutableEntity {
    readonly type: string;
    readonly tags: DxfTag[];
    readonly vertices: MutableEntity[];
}

function parseTags(text: string): DxfTag[] {
    let lines = text.split(/\r?\n/);
    let tags: DxfTag[] = [];
    for (let index = 0; index + 1 < lines.length; index += 2) {
        let code = Number.parseInt((lines[index] ?? "").trim(), 10);
        if (Number.isNaN(code)) {
            throw new ImportError(`DXF group code expected on line ${index + 1}`);
        }
        tags.push({ code, value: (lines[index + 1] ?? "").trim() });
    }
    return tags;
}

/** First value of a group code, or `undefined` when the entity does not carry it. */
export function tagValue(entity: DxfEntity, code: number): string | undefined {
    return entity.tags.find(tag => tag.code === code)?.value;
}

export function tagNumber(entity: DxfEntity, code: number, fallback: number): number {
    let text = tagValue(entity, code);
    if (text === undefined) return fallback;
    let value = Number.parseFloat(text);
    return Number.isFinite(value) ? value : fallback;
}

/** Every value of a repeated group code, in file order. */
export function tagNumbers(entity: DxfEntity, code: number): number[] {
    let values: number[] = [];
    for (let tag of entity.tags) {
        if (tag.code !== code) continue;
        let value = Number.parseFloat(tag.value);
        if (Number.isFinite(value)) values.push(value);
    }
    return values;
}

/** A point written as `code`, `code + 10` and `code + 20`, with a missing z reading as zero. */
export function tagPoint(entity: DxfEntity, code: number): [number, number, number] {
    return [
        tagNumber(entity, code, 0),
        tagNumber(entity, code + 10, 0),
        tagNumber(entity, code + 20, 0),
    ];
}

/** Every repetition of a point, for the control and fit points of a spline. */
export function tagPoints(entity: DxfEntity, code: number): [number, number, number][] {
    let points: [number, number, number][] = [];
    let pending: number[] = [];
    for (let tag of entity.tags) {
        if (tag.code !== code && tag.code !== code + 10 && tag.code !== code + 20) continue;
        if (tag.code === code && pending.length > 0) {
            points.push([pending[0] ?? 0, pending[1] ?? 0, pending[2] ?? 0]);
            pending = [];
        }
        pending.push(Number.parseFloat(tag.value));
    }
    if (pending.length > 0) points.push([pending[0] ?? 0, pending[1] ?? 0, pending[2] ?? 0]);
    return points;
}
