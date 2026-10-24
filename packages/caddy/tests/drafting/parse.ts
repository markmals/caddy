/**
 * Readers that turn Caddy's own 2D exports back into geometry, so the oracle can compare what a
 * consumer of the file sees rather than the bytes Caddy happened to write.
 */

export interface XmlNode {
    readonly tag: string;
    readonly attributes: Readonly<Record<string, string>>;
    readonly children: XmlNode[];
}

const TAG = /<\/?([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/g;

function attributesOf(source: string): Record<string, string> {
    let attributes: Record<string, string> = {};
    for (let match of source.matchAll(ATTRIBUTE)) {
        attributes[match[1] as string] = (match[2] as string)
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, "<")
            .replace(/&amp;/g, "&");
    }
    return attributes;
}

/** The element tree of a simple XML document: no namespaces, CDATA or text content. */
export function parseXml(text: string): XmlNode {
    let stack: XmlNode[] = [];
    let root: XmlNode | undefined;
    for (let match of text.matchAll(TAG)) {
        let [whole, tag = "", attributes = "", selfClosing = ""] = match;
        if (whole.startsWith("</")) {
            stack.pop();
            continue;
        }
        let node: XmlNode = { tag, attributes: attributesOf(attributes), children: [] };
        let parent = stack[stack.length - 1];
        if (parent === undefined) root = node;
        else parent.children.push(node);
        if (selfClosing !== "/") stack.push(node);
    }
    if (root === undefined) throw new Error("document has no elements");
    return root;
}

export type Point = readonly [x: number, y: number];

export interface ParsedSegment {
    /** `Line`, `Arc`, `QuadraticBezier` or `CubicBezier`, as svgpathtools names them. */
    readonly type: string;
    readonly start: Point;
    readonly end: Point;
    readonly radius?: Point;
    readonly rotation?: number;
    readonly largeArc?: boolean;
    readonly sweep?: boolean;
    readonly controls?: readonly Point[];
}

const PATH_TOKEN = /[MLAQCZmlaqcz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

class PathReader {
    private readonly tokens: string[];
    private index = 0;

    constructor(data: string) {
        this.tokens = data.match(PATH_TOKEN) ?? [];
    }

    done(): boolean {
        return this.index >= this.tokens.length;
    }

    /** The next token when it is a number, without consuming it. */
    peeksNumber(): boolean {
        let token = this.tokens[this.index];
        return token !== undefined && !Number.isNaN(Number(token));
    }

    command(): string {
        let token = this.tokens[this.index];
        if (token === undefined || this.peeksNumber()) {
            throw new Error(`expected a path command, got ${JSON.stringify(token)}`);
        }
        this.index += 1;
        return token;
    }

    number(): number {
        let token = this.tokens[this.index];
        if (token === undefined || Number.isNaN(Number(token))) {
            throw new Error(`expected a number, got ${JSON.stringify(token)}`);
        }
        this.index += 1;
        return Number(token);
    }

    point(): Point {
        return [this.number(), this.number()];
    }
}

/** Absolute-coordinate path data, as both build123d and Caddy write it. */
export function parsePathData(data: string): ParsedSegment[] {
    let reader = new PathReader(data);
    let segments: ParsedSegment[] = [];
    let cursor: Point = [0, 0];
    let start: Point = [0, 0];
    let command = "";
    while (!reader.done()) {
        if (!reader.peeksNumber()) command = reader.command();
        if (command === "M") {
            cursor = reader.point();
            start = cursor;
            command = "L";
        } else if (command === "Z") {
            segments.push({ type: "Line", start: cursor, end: start });
            cursor = start;
        } else if (command === "L") {
            let end = reader.point();
            segments.push({ type: "Line", start: cursor, end });
            cursor = end;
        } else if (command === "A") {
            let radius = reader.point();
            let rotation = reader.number();
            let largeArc = reader.number() !== 0;
            let sweep = reader.number() !== 0;
            let end = reader.point();
            segments.push({ type: "Arc", start: cursor, end, radius, rotation, largeArc, sweep });
            cursor = end;
        } else if (command === "Q") {
            let control = reader.point();
            let end = reader.point();
            segments.push({ type: "QuadraticBezier", start: cursor, end, controls: [control] });
            cursor = end;
        } else if (command === "C") {
            let first = reader.point();
            let second = reader.point();
            let end = reader.point();
            segments.push({
                type: "CubicBezier",
                start: cursor,
                end,
                controls: [first, second],
            });
            cursor = end;
        } else {
            throw new Error(`unsupported path command ${JSON.stringify(command)}`);
        }
    }
    return segments;
}

export interface DxfTag {
    readonly code: number;
    readonly value: string;
}

export interface DxfRecord {
    readonly type: string;
    readonly tags: readonly DxfTag[];
}

/** Group-code pairs of a DXF file, split into the records of one section. */
export function parseDxfSection(text: string, name: string): DxfRecord[] {
    let lines = text.split("\n");
    let tags: DxfTag[] = [];
    for (let index = 0; index + 1 < lines.length; index += 2) {
        tags.push({ code: Number(lines[index]), value: (lines[index + 1] as string).trim() });
    }
    let records: DxfRecord[] = [];
    let inSection = false;
    let current: { type: string; tags: DxfTag[] } | undefined;
    for (let [index, tag] of tags.entries()) {
        if (tag.code === 0 && tag.value === "SECTION") {
            inSection = tags[index + 1]?.value === name;
            continue;
        }
        if (tag.code !== 0) {
            current?.tags.push(tag);
            continue;
        }
        if (current !== undefined) records.push(current);
        current = undefined;
        if (tag.value === "ENDSEC") inSection = false;
        else if (inSection) current = { type: tag.value, tags: [] };
    }
    if (current !== undefined) records.push(current);
    return records;
}

/** First value of `code` in a record, or `undefined`. */
export function dxfValue(record: DxfRecord, code: number): string | undefined {
    return record.tags.find(tag => tag.code === code)?.value;
}

/** Every value of `code` in a record, as numbers. */
export function dxfNumbers(record: DxfRecord, code: number): number[] {
    return record.tags.filter(tag => tag.code === code).map(tag => Number(tag.value));
}
