import { defineConfig } from "vite-plus";

export default defineConfig({
    pack: {
        entry: ["src/index.ts"],
        format: ["esm"],
        dts: true,
        platform: "node",
        sourcemap: true,
        // The native package is a runtime dependency, never bundled.
        external: ["@roonieone/occt-native"],
    },
});
