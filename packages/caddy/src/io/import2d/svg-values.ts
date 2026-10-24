/**
 * The attribute bag `svgelements` hands to each element, which build123d reads labels, colours
 * and geometry out of.
 *
 * Every attribute propagates to descendants — including geometric ones, so a rectangle without a
 * width inherits the document's — except the five that `svgelements` deletes on the way down.
 * Presentation attributes are overridden by a matching CSS rule, and that in turn by the
 * element's own `style`.
 */

import type { XmlElement } from "./xml.ts";

export type SvgValues = ReadonlyMap<string, string>;

/** What a document starts with: `fill` is black, `stroke` is none, `currentColor` is black. */
export const INITIAL_VALUES: SvgValues = new Map([
    ["color", "black"],
    ["fill", "black"],
    ["stroke", "none"],
]);

/** Attributes that apply to one element only. */
const NON_PROPAGATING: readonly string[] = [
    "preserveAspectRatio",
    "viewBox",
    "id",
    "class",
    "clip-path",
];

export interface ElementValues {
    /** Everything in scope for the element, inherited attributes included. */
    readonly values: Map<string, string>;
    /** Only what the element itself declares, after CSS and `style` have been merged in. */
    readonly own: Map<string, string>;
}

/** `<style>` rule bodies by selector, in the shape `svgelements` keeps them. */
export function collectStyles(root: XmlElement): Map<string, string> {
    let styles = new Map<string, string>();
    let visit = (element: XmlElement): void => {
        if (element.name === "style") {
            addRules(styles, element.text);
        }
        for (let child of element.children) visit(child);
    };
    visit(root);
    return styles;
}

function addRules(styles: Map<string, string>, source: string): void {
    let text = source.replace(/\/\*[\s\S]*?\*\//g, "");
    for (let match of text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        let body = (match[2] ?? "").trim();
        for (let selector of (match[1] ?? "").split(",")) {
            let key = selector.trim();
            let existing = styles.get(key);
            if (existing === undefined) styles.set(key, body);
            else styles.set(key, existing.endsWith(";") ? existing + body : `${existing};${body}`);
        }
    }
}

export function elementValues(
    parent: SvgValues,
    element: XmlElement,
    styles: ReadonlyMap<string, string>,
): ElementValues {
    let values = new Map(parent);
    for (let attribute of NON_PROPAGATING) values.delete(attribute);

    let own = new Map(element.attributes);
    for (let [property, value] of declarations(styleFor(element, styles, own))) {
        own.set(property, value);
    }
    resolveCurrentColor(own, parent);
    for (let [name, value] of own) values.set(name, value);
    return { values, own };
}

/** CSS first, then the element's own `style`, so the inline declarations win. */
function styleFor(
    element: XmlElement,
    styles: ReadonlyMap<string, string>,
    own: ReadonlyMap<string, string>,
): string {
    let parts: string[] = [];
    let add = (selector: string): void => {
        let body = styles.get(selector);
        if (body !== undefined) parts.push(body);
    };
    add("*");
    add(element.name);
    let id = own.get("id");
    if (id !== undefined) add(`#${id}`);
    for (let className of (own.get("class") ?? "").split(" ")) {
        if (className.length === 0) continue;
        add(`.${className}`);
        add(`${element.name}.${className}`);
    }
    let inline = own.get("style");
    if (inline !== undefined) parts.push(inline);
    return parts.join(";");
}

function declarations(style: string): [string, string][] {
    let pairs: [string, string][] = [];
    for (let declaration of style.split(";")) {
        let parts = declaration.split(":");
        if (parts.length !== 2) continue;
        pairs.push([(parts[0] ?? "").trim(), (parts[1] ?? "").trim()]);
    }
    return pairs;
}

function resolveCurrentColor(own: Map<string, string>, parent: SvgValues): void {
    for (let property of ["fill", "stroke"]) {
        if (own.get(property) !== "currentColor") continue;
        let color = own.get("color") ?? parent.get("color");
        if (color !== undefined) own.set(property, color);
    }
}
