import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
export default defineConfig({
  build: {
    lib: {
      entry: {
        server: resolve(__dirname, "lib/server.ts"),
        "vite-plugin-serverdollar": resolve(
          __dirname,
          "lib/vite-plugin-serverdollar.ts"
        ),
      },
      name: "SabrewingServer",
    },
    outDir: "dist",
    emptyOutDir: false,
    target: "node18",
    rollupOptions: {
      external: [
        "fs",
        "fs/promises",
        "path",
        "http",
        "module",
        "vite",
        "@babel/parser",
        "@babel/traverse",
        "@babel/types",
        "@babel/generator",
      ],
    },
    ssr: true,
  },
  plugins: [
    dts({
      entryRoot: "lib",
      outDir: "dist",
    }),
  ],
});
