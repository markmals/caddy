import { GeometryError } from "../errors.ts";
import { Face } from "../topology/face.ts";
import { Wire } from "../topology/wire.ts";

export function loftHoleSections(faces: readonly Face[]): Wire[][] {
    let sections = faces.map(face => face.innerWires());
    let first = sections[0];
    if (first === undefined) return [];
    if (sections.some(wires => wires.length !== first.length)) {
        throw new GeometryError("All loft sections must contain the same number of holes");
    }
    if (first.length === 0) return [];
    let grouped = first.map(wire => [wire]);
    for (let wires of sections.slice(1)) {
        let bestCost = Number.POSITIVE_INFINITY;
        let best: number[] = [];
        let chosen: number[] = [];
        let used = new Set<number>();
        function assign(index: number, cost: number): void {
            if (cost >= bestCost) return;
            if (index === grouped.length) {
                bestCost = cost;
                best = [...chosen];
                return;
            }
            let previous = grouped[index]!.at(-1)!.center();
            for (let candidate = 0; candidate < wires.length; candidate++) {
                if (used.has(candidate)) continue;
                chosen[index] = candidate;
                used.add(candidate);
                assign(index + 1, cost + previous.sub(wires[candidate]!.center()).length);
                used.delete(candidate);
            }
        }
        assign(0, 0);
        for (let index = 0; index < grouped.length; index++) {
            grouped[index]!.push(wires[best[index]!]!);
        }
    }
    return grouped;
}
