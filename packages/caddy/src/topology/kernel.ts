import { isOcctError } from "@roonieone/occt-native";

import { NativeKernelError } from "../errors.ts";

/**
 * Run a native call, rethrowing addon failures as {@link NativeKernelError} (or the error class
 * given) with the addon error as `cause`. Other errors pass through untouched.
 */
export function native<T>(
    operation: string,
    call: () => T,
    ErrorClass: new (message: string, options?: ErrorOptions) => Error = NativeKernelError,
): T {
    try {
        return call();
    } catch (error) {
        if (isOcctError(error)) {
            throw new ErrorClass(`${operation} failed: ${error.message}`, { cause: error });
        }
        throw error;
    }
}
