import type { Face, Shape } from "./topology/index.ts";

/**
 * Error hierarchy for Caddy. Every error thrown by the library derives from {@link CaddyError}
 * so callers can distinguish Caddy failures from programming errors.
 */
export class CaddyError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

/** Invalid geometric input: zero-length directions, parallel axes, malformed coordinates. */
export class GeometryError extends CaddyError {}

/** A shape is missing, empty, or of the wrong topological type for the requested operation. */
export class InvalidShapeError extends CaddyError {}

/** A boolean (fuse/cut/common) operation failed or produced an invalid result. */
export class BooleanOperationError extends CaddyError {}

/** A file could not be imported. */
export class ImportError extends CaddyError {}

/** A model could not be exported. */
export class ExportError extends CaddyError {}

/** The native OCCT addon reported a failure or could not be loaded. */
export class NativeKernelError extends CaddyError {}

/** A material is unknown, malformed, or missing the data an operation needs. */
export class MaterialError extends CaddyError {}

/** A font is unknown to the registry, or its file cannot be read. */
export class FontError extends CaddyError {}

/** Details of a draft the kernel refused. */
export interface DraftAngleErrorOptions extends ErrorOptions {
    /** The face OCCT could not draft, when it failed on a particular one. */
    readonly face?: Face;
    /** The sub-shape OCCT blamed for the failure, when it named one. */
    readonly problematicShape?: Shape;
}

/** A draft angle could not be applied to the selected faces (build123d `DraftAngleError`). */
export class DraftAngleError extends CaddyError {
    readonly face: Face | undefined;
    readonly problematicShape: Shape | undefined;

    constructor(message: string, options: DraftAngleErrorOptions = {}) {
        super(message, options);
        this.face = options.face;
        this.problematicShape = options.problematicShape;
    }
}
