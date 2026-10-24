import { Vector } from "../geometry/vector.ts";

/** Principal axes and moments of a symmetric, row-major 3×3 inertia tensor. */
export function principalInertia(inertia: readonly number[]): [Vector, number][] {
    let tensor = Float64Array.from(inertia);
    let basis = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
    for (let iteration = 0; iteration < 32; iteration++) {
        let p = 0;
        let q = 1;
        if (Math.abs(tensor[2]!) > Math.abs(tensor[3 * p + q]!)) {
            p = 0;
            q = 2;
        }
        if (Math.abs(tensor[5]!) > Math.abs(tensor[3 * p + q]!)) {
            p = 1;
            q = 2;
        }
        let offDiagonal = tensor[3 * p + q]!;
        let scale = Math.max(1, Math.abs(tensor[0]!), Math.abs(tensor[4]!), Math.abs(tensor[8]!));
        if (Math.abs(offDiagonal) <= 1e-15 * scale) break;

        let tau = (tensor[3 * q + q]! - tensor[3 * p + p]!) / (2 * offDiagonal);
        let tangent = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        let cosine = 1 / Math.sqrt(1 + tangent * tangent);
        let sine = tangent * cosine;
        tensor[3 * p + p] = tensor[3 * p + p]! - tangent * offDiagonal;
        tensor[3 * q + q] = tensor[3 * q + q]! + tangent * offDiagonal;
        tensor[3 * p + q] = 0;
        tensor[3 * q + p] = 0;
        for (let row = 0; row < 3; row++) {
            if (row !== p && row !== q) {
                let first = tensor[3 * row + p]!;
                let second = tensor[3 * row + q]!;
                tensor[3 * row + p] = tensor[3 * p + row] = cosine * first - sine * second;
                tensor[3 * row + q] = tensor[3 * q + row] = sine * first + cosine * second;
            }
            let first = basis[3 * row + p]!;
            let second = basis[3 * row + q]!;
            basis[3 * row + p] = cosine * first - sine * second;
            basis[3 * row + q] = sine * first + cosine * second;
        }
    }
    return [0, 1, 2]
        .map(
            index =>
                [
                    new Vector(basis[index]!, basis[3 + index]!, basis[6 + index]!),
                    tensor[3 * index + index]!,
                ] as [Vector, number],
        )
        .sort((first, second) => second[1] - first[1]);
}
