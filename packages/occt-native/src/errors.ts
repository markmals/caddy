// Errors thrown by the addon are plain `Error`s carrying a stable `code`; see
// crates/occt-neon/src/error.rs.

export const OcctErrorCode = {
    /** Input rejected before reaching OCCT. */
    InvalidArgument: "INVALID_ARGUMENT",
    /** OCCT raised a Standard_Failure; its class name is in `kernelException`. */
    OcctException: "OCCT_EXCEPTION",
    /** An OCCT algorithm reported failure without throwing. */
    OperationFailed: "OPERATION_FAILED",
    /** A shape was used after `dispose`. */
    Disposed: "DISPOSED",
    ImportFailed: "IMPORT_FAILED",
    ExportFailed: "EXPORT_FAILED",
} as const;
export type OcctErrorCode = (typeof OcctErrorCode)[keyof typeof OcctErrorCode];

export interface OcctError extends Error {
    readonly code: OcctErrorCode;
    /** OCCT exception class, e.g. `Standard_DomainError`, when OCCT threw. */
    readonly kernelException?: string;
}

const CODES = new Set<string>(Object.values(OcctErrorCode));

export function isOcctError(error: unknown): error is OcctError {
    return (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        CODES.has(error.code)
    );
}
