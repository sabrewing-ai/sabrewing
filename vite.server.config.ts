import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: resolve(__dirname, "examples/ssr/entry.server.ts"),
      output: {
        entryFileNames: "entry.server.js",
        format: "esm",
      },
    },
    ssr: true,
  },
  ssr: {
    noExternal: ["sabrewing"],
    external: ["http", "fs", "fs/promises", "path", "url"],
  },
  plugins: [
    // Transform server$ calls to regular functions for server
    {
      name: "server$-server-transformer",
      transform(code, id) {
        if (id.includes("server$")) {
          // Remove server$ wrapper, keeping the function
          return code.replace(
            /export const (\w+) = server\$\(/g,
            "export const $1 = "
          );
        }
      },
    },
  ],
});
