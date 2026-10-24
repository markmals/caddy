/**
 * The dependency-free rectangle packer behind `pack` (build123d `pack_utils._pack2d`), a port
 * of https://github.com/jakesgordon/bin-packing's growing packer: rectangles are placed largest
 * first into a binary tree of free space which grows right or down, whichever keeps the packed
 * area squarer.
 */

import { GeometryError } from "../errors.ts";

/** A rectangle's extent as `[width, height]`. */
export type Size = readonly [number, number];

/** A region of the packed area; a used one has been split into the space left around it. */
interface Node {
    used: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    down: Node | undefined;
    right: Node | undefined;
}

function node(x: number, y: number, width: number, height: number): Node {
    return { used: false, x, y, width, height, down: undefined, right: undefined };
}

/** The first free region big enough, searching right before down. */
function findNode(start: Node | undefined, width: number, height: number): Node | undefined {
    if (start === undefined) {
        return undefined;
    }
    if (start.used) {
        return findNode(start.right, width, height) ?? findNode(start.down, width, height);
    }
    return width <= start.width && height <= start.height ? start : undefined;
}

/** Occupy the lower-left `width` x `height` corner of `free`, leaving the rest as two children. */
function splitNode(free: Node, width: number, height: number): Node {
    free.used = true;
    free.down = node(free.x, free.y + height, free.width, free.height - height);
    free.right = node(free.x + width, free.y, free.width - width, height);
    return free;
}

/** Largest side first, shortest side breaking ties — both descending, as build123d sorts. */
function placementOrder(
    sizes: readonly Size[],
): { index: number; width: number; height: number }[] {
    let order = sizes.map((size, index) => ({ index, width: size[0], height: size[1] }));
    order.sort(
        (first, second) =>
            Math.min(second.width, second.height) - Math.min(first.width, first.height),
    );
    order.sort(
        (first, second) =>
            Math.max(second.width, second.height) - Math.max(first.width, first.height),
    );
    return order;
}

/** Offsets for `sizes`, as `[x, y]` pairs in the order the sizes were given. */
export function packRectangles(sizes: readonly Size[]): [number, number][] {
    let order = placementOrder(sizes);
    let first = order[0];
    if (first === undefined) {
        throw new GeometryError("no objects to pack");
    }
    let root = node(0, 0, first.width, first.height);

    let claim = (width: number, height: number): Node => {
        let free = findNode(root, width, height);
        if (free === undefined) {
            throw new GeometryError(`failed to fit ${width} x ${height} into the packed area`);
        }
        return splitNode(free, width, height);
    };

    let growRight = (width: number, height: number): Node => {
        let grown = node(0, 0, root.width + width, root.height);
        grown.used = true;
        grown.down = root;
        grown.right = node(root.width, 0, width, root.height);
        root = grown;
        return claim(width, height);
    };

    let growDown = (width: number, height: number): Node => {
        let grown = node(0, 0, root.width, root.height + height);
        grown.used = true;
        grown.down = node(0, root.height, root.width, height);
        grown.right = root;
        root = grown;
        return claim(width, height);
    };

    let grow = (width: number, height: number): Node => {
        let canGrowDown = width <= root.width;
        let canGrowRight = height <= root.height;
        if (canGrowRight && root.height >= root.width + width) {
            return growRight(width, height);
        }
        if (canGrowDown && root.width >= root.height + height) {
            return growDown(width, height);
        }
        if (canGrowRight) {
            return growRight(width, height);
        }
        if (canGrowDown) {
            return growDown(width, height);
        }
        throw new GeometryError(`failed to grow the packed area to fit ${width} x ${height}`);
    };

    let placements: [number, number][] = Array.from({ length: sizes.length }, () => [0, 0]);
    for (let entry of order) {
        let free = findNode(root, entry.width, entry.height);
        let placed =
            free === undefined
                ? grow(entry.width, entry.height)
                : splitNode(free, entry.width, entry.height);
        placements[entry.index] = [placed.x, placed.y];
    }
    return placements;
}
