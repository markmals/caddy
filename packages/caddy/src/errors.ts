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
