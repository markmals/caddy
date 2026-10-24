/**
 * Minimal XML reader for the 2D importers.
 *
 * Only what SVG documents need: elements, attributes, text and namespace prefixes. Prefixed
 * attribute names are expanded to `{uri}local` the way Python's `ElementTree` expands them,
 * because build123d addresses Inkscape's attributes by that expanded name.
 */

import { ImportError } from "../../errors.ts";

export interface XmlElement {
    /** Local name, with any namespace prefix dropped. */
    readonly name: string;
    /** Attribute values by name; prefixed names appear as `{uri}local`. */
    readonly attributes: ReadonlyMap<string, string>;
    /** Namespace URIs by prefix, in scope for this element (the default namespace is `""`). */
    readonly namespaces: ReadonlyMap<string, string>;
    readonly children: readonly XmlElement[];
    /** Concatenated character data of the element itself, entities resolved. */
    readonly text: string;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
};

const NAME_START = /[A-Za-z_:]/;
const NAME_PART = /[-.0-9A-Za-z_:\u00B7]/;

/** Reads a whole document and returns its root element. */
export function parseXml(source: string): XmlElement {
    let cursor = { text: source, index: 0 };
    skipProlog(cursor);
    let root = readElement(cursor, new Map());
    return root;
}

interface Cursor {
    readonly text: string;
    index: number;
}

function skipProlog(cursor: Cursor): void {
    for (;;) {
        skipSpace(cursor);
        if (cursor.text.startsWith("<?", cursor.index)) {
            cursor.index = closingIndex(cursor, "?>") + 2;
        } else if (cursor.text.startsWith("<!--", cursor.index)) {
            cursor.index = closingIndex(cursor, "-->") + 3;
        } else if (cursor.text.startsWith("<!", cursor.index)) {
            cursor.index = skipDoctype(cursor);
        } else {
            return;
        }
    }
}

/** A `<!DOCTYPE …>` may carry a bracketed internal subset, so angle brackets have to be paired. */
function skipDoctype(cursor: Cursor): number {
    let depth = 0;
    for (let index = cursor.index; index < cursor.text.length; index += 1) {
        let character = cursor.text[index];
        if (character === "<") depth += 1;
        else if (character === ">") {
            depth -= 1;
            if (depth === 0) return index + 1;
        }
    }
    throw new ImportError("unterminated XML declaration");
}

function readElement(cursor: Cursor, inherited: ReadonlyMap<string, string>): XmlElement {
    if (cursor.text[cursor.index] !== "<") {
        throw new ImportError(`expected an XML element at offset ${cursor.index}`);
    }
    cursor.index += 1;
    let qualifiedName = readName(cursor);
    let { attributes, namespaces, empty } = readAttributes(cursor, inherited);
    if (empty) {
        return { name: localName(qualifiedName), attributes, namespaces, children: [], text: "" };
    }
    let children: XmlElement[] = [];
    let text = "";
    for (;;) {
        let next = cursor.text.indexOf("<", cursor.index);
        if (next < 0) throw new ImportError(`unterminated XML element <${qualifiedName}>`);
        text += decodeText(cursor.text.slice(cursor.index, next));
        cursor.index = next;
        if (cursor.text.startsWith("</", cursor.index)) {
            cursor.index = closingIndex(cursor, ">") + 1;
            return { name: localName(qualifiedName), attributes, namespaces, children, text };
        }
        if (cursor.text.startsWith("<!--", cursor.index)) {
            cursor.index = closingIndex(cursor, "-->") + 3;
        } else if (cursor.text.startsWith("<![CDATA[", cursor.index)) {
            let end = closingIndex(cursor, "]]>");
            text += cursor.text.slice(cursor.index + 9, end);
            cursor.index = end + 3;
        } else if (cursor.text.startsWith("<?", cursor.index)) {
            cursor.index = closingIndex(cursor, "?>") + 2;
        } else {
            children.push(readElement(cursor, namespaces));
        }
    }
}

interface ElementHead {
    attributes: ReadonlyMap<string, string>;
    namespaces: ReadonlyMap<string, string>;
    empty: boolean;
}

function readAttributes(cursor: Cursor, inherited: ReadonlyMap<string, string>): ElementHead {
    let pairs: [string, string][] = [];
    let namespaces = new Map(inherited);
    for (;;) {
        skipSpace(cursor);
        let character = cursor.text[cursor.index];
        if (character === undefined) throw new ImportError("unterminated XML element");
        if (character === ">") {
            cursor.index += 1;
            return { attributes: expand(pairs, namespaces), namespaces, empty: false };
        }
        if (cursor.text.startsWith("/>", cursor.index)) {
            cursor.index += 2;
            return { attributes: expand(pairs, namespaces), namespaces, empty: true };
        }
        let name = readName(cursor);
        skipSpace(cursor);
        if (cursor.text[cursor.index] !== "=") {
            throw new ImportError(`XML attribute ${name} has no value`);
        }
        cursor.index += 1;
        skipSpace(cursor);
        let value = readQuoted(cursor);
        if (name === "xmlns") namespaces.set("", value);
        else if (name.startsWith("xmlns:")) namespaces.set(name.slice(6), value);
        else pairs.push([name, value]);
    }
}

/** `ElementTree` keeps unprefixed attributes bare and rewrites prefixed ones as `{uri}local`. */
function expand(
    pairs: readonly [string, string][],
    namespaces: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
    let attributes = new Map<string, string>();
    for (let [name, value] of pairs) {
        let colon = name.indexOf(":");
        let uri = colon < 0 ? undefined : namespaces.get(name.slice(0, colon));
        attributes.set(uri === undefined ? name : `{${uri}}${name.slice(colon + 1)}`, value);
    }
    return attributes;
}

function readQuoted(cursor: Cursor): string {
    let quote = cursor.text[cursor.index];
    if (quote !== '"' && quote !== "'") {
        throw new ImportError(`unquoted XML attribute value at offset ${cursor.index}`);
    }
    let end = cursor.text.indexOf(quote, cursor.index + 1);
    if (end < 0) throw new ImportError("unterminated XML attribute value");
    let value = cursor.text.slice(cursor.index + 1, end);
    cursor.index = end + 1;
    return decodeText(value);
}

function readName(cursor: Cursor): string {
    let start = cursor.index;
    if (!NAME_START.test(cursor.text[cursor.index] ?? "")) {
        throw new ImportError(`expected an XML name at offset ${start}`);
    }
    cursor.index += 1;
    while (NAME_PART.test(cursor.text[cursor.index] ?? "")) cursor.index += 1;
    return cursor.text.slice(start, cursor.index);
}

function skipSpace(cursor: Cursor): void {
    while (/\s/.test(cursor.text[cursor.index] ?? "")) cursor.index += 1;
}

function closingIndex(cursor: Cursor, terminator: string): number {
    let end = cursor.text.indexOf(terminator, cursor.index);
    if (end < 0) throw new ImportError(`unterminated XML ${terminator} section`);
    return end;
}

function localName(qualifiedName: string): string {
    let colon = qualifiedName.indexOf(":");
    return colon < 0 ? qualifiedName : qualifiedName.slice(colon + 1);
}

function decodeText(text: string): string {
    if (!text.includes("&")) return text;
    return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, reference: string) => {
        if (reference.startsWith("#x") || reference.startsWith("#X")) {
            return String.fromCodePoint(Number.parseInt(reference.slice(2), 16));
        }
        if (reference.startsWith("#")) {
            return String.fromCodePoint(Number.parseInt(reference.slice(1), 10));
        }
        return NAMED_ENTITIES[reference] ?? match;
    });
}
