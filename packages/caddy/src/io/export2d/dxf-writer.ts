// Writing DXF R12 (AC1009) ASCII: a tag stream of group code / value pairs.

import type { DxfEntity } from "./dxf-entities.ts";
import type { LineTypeDefinition } from "./line-types.ts";
import type { Point2 } from "./segments.ts";

export interface DxfLayer {
    readonly name: string;
    /** AutoCAD colour index. */
    readonly color: number;
    /** Hundredths of a millimetre, as DXF stores stroke width. */
    readonly lineWeight: number | undefined;
    readonly lineType: string;
}

export interface DxfLineType extends LineTypeDefinition {
    readonly name: string;
}

export interface DxfDrawing {
    /** DXF unit code ($INSUNITS). */
    readonly unitCode: number;
    readonly lineTypes: readonly DxfLineType[];
    readonly layers: readonly DxfLayer[];
    readonly entities: readonly { readonly layer: string; readonly entity: DxfEntity }[];
}

function real(value: number): string {
    return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

class TagStream {
    private readonly tags: string[] = [];

    add(code: number, value: string | number): this {
        this.tags.push(String(code), String(value));
        return this;
    }

    real(code: number, value: number): this {
        return this.add(code, real(value));
    }

    point(code: number, point: Point2): this {
        return this.real(code, point[0])
            .real(code + 10, point[1])
            .real(code + 20, 0);
    }

    get text(): string {
        return `${this.tags.join("\n")}\n`;
    }
}

function writeLineType(tags: TagStream, lineType: DxfLineType): void {
    tags.add(0, "LTYPE")
        .add(2, lineType.name)
        .add(70, 64)
        .add(3, lineType.description)
        .add(72, 65)
        .add(73, Math.max(lineType.pattern.length - 1, 0))
        .real(40, lineType.pattern[0] ?? 0);
    for (let dash of lineType.pattern.slice(1)) tags.real(49, dash);
}

function writeLayer(tags: TagStream, layer: DxfLayer): void {
    tags.add(0, "LAYER").add(2, layer.name).add(70, 0).add(62, layer.color).add(6, layer.lineType);
    if (layer.lineWeight !== undefined) tags.add(370, layer.lineWeight);
}

function writeEntity(tags: TagStream, layer: string, entity: DxfEntity): void {
    tags.add(0, entity.kind.toUpperCase()).add(8, layer === "" ? "0" : layer);
    if (entity.kind === "line") {
        tags.point(10, entity.start).point(11, entity.end);
    } else if (entity.kind === "circle") {
        tags.point(10, entity.center).real(40, entity.radius);
    } else if (entity.kind === "arc") {
        tags.point(10, entity.center)
            .real(40, entity.radius)
            .real(50, entity.startAngle)
            .real(51, entity.endAngle);
    } else if (entity.kind === "ellipse") {
        tags.point(10, entity.center)
            .point(11, entity.majorAxis)
            .real(40, entity.ratio)
            .real(41, entity.startParam)
            .real(42, entity.endParam);
    } else {
        writeSpline(tags, entity);
    }
}

/** 8 marks the spline planar, 4 marks it rational (DXF spline flags). */
function writeSpline(tags: TagStream, entity: Extract<DxfEntity, { kind: "spline" }>): void {
    tags.add(70, entity.weights === null ? 8 : 12)
        .add(71, entity.degree)
        .add(72, entity.knots.length)
        .add(73, entity.controlPoints.length)
        .add(74, 0);
    for (let knot of entity.knots) tags.real(40, knot);
    for (let weight of entity.weights ?? []) tags.real(41, weight);
    for (let pole of entity.controlPoints) tags.point(10, pole);
}

export function writeDxf(drawing: DxfDrawing): string {
    let tags = new TagStream();
    tags.add(0, "SECTION")
        .add(2, "HEADER")
        .add(9, "$ACADVER")
        .add(1, "AC1009")
        .add(9, "$INSUNITS")
        .add(70, drawing.unitCode)
        .add(0, "ENDSEC");

    tags.add(0, "SECTION").add(2, "TABLES");
    tags.add(0, "TABLE").add(2, "LTYPE").add(70, drawing.lineTypes.length);
    for (let lineType of drawing.lineTypes) writeLineType(tags, lineType);
    tags.add(0, "ENDTAB");
    tags.add(0, "TABLE").add(2, "LAYER").add(70, drawing.layers.length);
    for (let layer of drawing.layers) writeLayer(tags, layer);
    tags.add(0, "ENDTAB");
    tags.add(0, "ENDSEC");

    tags.add(0, "SECTION").add(2, "ENTITIES");
    for (let { layer, entity } of drawing.entities) writeEntity(tags, layer, entity);
    tags.add(0, "ENDSEC");

    return tags.add(0, "EOF").text;
}
