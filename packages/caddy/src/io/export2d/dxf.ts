// DXF export of 2D shapes (build123d `ExportDXF`).
//
// Caddy writes DXF R12 (AC1009) rather than build123d's R2013: it is the version every reader
// accepts, and the entity geometry — which is all a 2D export carries — is identical.

import { writeFile } from "node:fs/promises";

import type { Shape } from "../../topology/index.ts";
import type { DxfEntity } from "./dxf-entities.ts";
import type { DxfLayer, DxfLineType } from "./dxf-writer.ts";
import type { ColorIndex } from "./enums.ts";
import type { LineType } from "./line-types.ts";

import { ExportError } from "../../errors.ts";
import { Unit } from "../types.ts";
import { edgeEntity } from "./dxf-entities.ts";
import { writeDxf } from "./dxf-writer.ts";
import { ColorIndex as ColorIndices } from "./enums.ts";
import { LINETYPE_DEFS, LineType as LineTypes, LTYPE_SCALE } from "./line-types.ts";

/** DXF `$INSUNITS` codes; micrometres have no standard code, so DXF's "unitless" 13 is used. */
const UNIT_CODES: Readonly<Record<Unit, number>> = {
    [Unit.Micrometer]: 13,
    [Unit.Millimeter]: 4,
    [Unit.Centimeter]: 5,
    [Unit.Meter]: 6,
    [Unit.Inch]: 1,
    [Unit.Foot]: 2,
};

const METRIC_UNITS: readonly Unit[] = [Unit.Millimeter, Unit.Centimeter, Unit.Meter];

export interface DXFLayerOptions {
    readonly color?: ColorIndex;
    /** Stroke width in millimetres. */
    readonly lineWeight?: number;
    readonly lineType?: LineType;
}

export interface ExportDXFOptions extends DXFLayerOptions {
    readonly unit?: Unit;
}

export interface AddShapeOptions {
    readonly layer?: string;
}

export class ExportDXF {
    readonly unit: Unit;
    private readonly lineTypeScale: number;
    private readonly layers = new Map<string, DxfLayer>();
    private readonly lineTypes = new Map<string, DxfLineType>();
    private readonly entities: { layer: string; entity: DxfEntity }[] = [];

    constructor(options: ExportDXFOptions = {}) {
        this.unit = options.unit ?? Unit.Millimeter;
        if (!Object.hasOwn(UNIT_CODES, this.unit)) {
            throw new ExportError(`Unit ${this.unit} is not supported by DXF`);
        }
        this.lineTypeScale = METRIC_UNITS.includes(this.unit)
            ? (LTYPE_SCALE[Unit.Millimeter] ?? 1)
            : 1;
        this.registerLineType(LineTypes.Continuous);
        this.layers.set("0", {
            name: "0",
            color: options.color ?? ColorIndices.Black,
            lineWeight: lineWeightTag(options.lineWeight),
            lineType: this.registerLineType(options.lineType ?? LineTypes.Continuous),
        });
    }

    /** Add a named layer with its own colour, stroke width and dash pattern. */
    addLayer(name: string, options: DXFLayerOptions = {}): this {
        if (this.layers.has(name)) {
            throw new ExportError(`Duplicate layer name ${JSON.stringify(name)}`);
        }
        this.layers.set(name, {
            name,
            color: options.color ?? ColorIndices.Black,
            lineWeight: lineWeightTag(options.lineWeight),
            lineType: this.registerLineType(options.lineType ?? LineTypes.Continuous),
        });
        return this;
    }

    /** Draw a shape (or several) on `layer`, one DXF entity per edge. */
    addShape(shape: Shape | Iterable<Shape>, options: AddShapeOptions = {}): this {
        let layer = options.layer ?? "";
        if (layer !== "" && !this.layers.has(layer)) {
            throw new ExportError(`Undefined layer: ${JSON.stringify(layer)}`);
        }
        let shapes = isShape(shape) ? [shape] : [...shape];
        for (let single of shapes) {
            for (let edge of single.edges) {
                this.entities.push({ layer, entity: edgeEntity(edge) });
            }
        }
        return this;
    }

    /** The DXF document. */
    get text(): string {
        return writeDxf({
            unitCode: UNIT_CODES[this.unit],
            lineTypes: [...this.lineTypes.values()],
            layers: [...this.layers.values()],
            entities: this.entities,
        });
    }

    async write(fileName: string): Promise<void> {
        await writeFile(fileName, this.text, "utf8");
    }

    /** Defines `lineType` in the document's line type table, returning its DXF name. */
    private registerLineType(lineType: LineType): string {
        if (this.lineTypes.has(lineType)) return lineType;
        let definition = LINETYPE_DEFS[lineType];
        if (definition === undefined) {
            throw new ExportError(`Unknown line type ${JSON.stringify(lineType)}`);
        }
        this.lineTypes.set(lineType, {
            name: lineType,
            description: definition.description,
            pattern: definition.pattern.map(run => this.lineTypeScale * run),
        });
        return lineType;
    }
}

function isShape(value: Shape | Iterable<Shape>): value is Shape {
    return "wrapped" in value;
}

/** DXF records stroke width in hundredths of a millimetre. */
function lineWeightTag(lineWeight: number | undefined): number | undefined {
    return lineWeight === undefined ? undefined : Math.round(lineWeight * 100);
}
