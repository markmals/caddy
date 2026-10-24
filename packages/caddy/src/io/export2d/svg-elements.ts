// The small slice of XML and SVG path syntax the SVG exporter emits.

import type { PathSegment, Point2 } from "./segments.ts";

export class Element {
    readonly tag: string;
    readonly attributes: Record<string, string>;
    readonly children: Element[] = [];

    constructor(tag: string, attributes: Record<string, string>) {
        this.tag = tag;
        this.attributes = attributes;
    }

    render(depth: number): string {
        let indent = "  ".repeat(depth);
        let attributes = Object.entries(this.attributes)
            .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
            .join("");
        if (this.children.length === 0) return `${indent}<${this.tag}${attributes} />`;
        let children = this.children.map(child => child.render(depth + 1)).join("\n");
        return `${indent}<${this.tag}${attributes}>\n${children}\n${indent}</${this.tag}>`;
    }
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function coordinates(point: Point2): string {
    return `${point[0]},${point[1]}`;
}

function segmentStart(segment: PathSegment): Point2 {
    if (segment.kind === "line" || segment.kind === "arc") return segment.start;
    return segment.points[0] as Point2;
}

function segmentEnd(segment: PathSegment): Point2 {
    if (segment.kind === "line" || segment.kind === "arc") return segment.end;
    return segment.points[segment.points.length - 1] as Point2;
}

function segmentCommand(segment: PathSegment): string {
    if (segment.kind === "line") return `L ${coordinates(segment.end)}`;
    if (segment.kind === "arc") {
        let flags = `${segment.largeArc ? 1 : 0} ${segment.sweep ? 1 : 0}`;
        let radius = `${segment.radius[0]},${segment.radius[1]}`;
        return `A ${radius} ${segment.rotation} ${flags} ${coordinates(segment.end)}`;
    }
    let controls = segment.points.slice(1).map(coordinates).join(" ");
    return `${segment.kind === "quadratic" ? "Q" : "C"} ${controls}`;
}

/** The `d` attribute drawing `segments`, starting a new sub-path wherever they do not meet. */
export function pathData(segments: readonly PathSegment[]): string {
    let parts: string[] = [];
    let cursor: Point2 | undefined;
    for (let segment of segments) {
        let start = segmentStart(segment);
        if (cursor === undefined || cursor[0] !== start[0] || cursor[1] !== start[1]) {
            parts.push(`M ${coordinates(start)}`);
        }
        parts.push(segmentCommand(segment));
        cursor = segmentEnd(segment);
    }
    return parts.join(" ");
}
