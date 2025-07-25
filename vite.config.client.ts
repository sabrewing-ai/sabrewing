import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "lib/index.ts"),
      name: "sabrewing",
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [
    dts({
      entryRoot: "lib",
      outDir: "dist",
    }),
  ],
});
