import { Plugin } from "vite";
import { createRequire } from "module";
import fs from "fs/promises";
import path from "path";
import { parse } from "@babel/parser";

// Helper to strip TS types from a function node
function stripTypes(node: any) {
  if (node.params) {
    for (const param of node.params) {
      if (param.typeAnnotation) param.typeAnnotation = null;
      if (param.type === "AssignmentPattern" && param.left.typeAnnotation)
        param.left.typeAnnotation = null;
    }
  }
  if (node.returnType) node.returnType = null;
  if (node.typeParameters) node.typeParameters = null;
}

// Plugin to extract server$ functions and generate registry
export function serverDollarPlugin(): Plugin {
  const serverFunctions: Record<
    string,
    { file: string; exportName: string; code: string }
  > = {};

  return {
    name: "server$-registry",
    enforce: "pre" as const,
    async transform(code, id) {
      if (
        !id.endsWith(".ts") &&
        !id.endsWith(".tsx") &&
        !id.endsWith(".js") &&
        !id.endsWith(".jsx")
      ) {
        return code;
      }
      let ast;
      try {
        ast = parse(code, {
          sourceType: "module",
          plugins: ["typescript", "jsx"],
        });
      } catch (e) {
        return code;
      }
      // Use createRequire to import CJS traverse and generator
      const require = createRequire(import.meta.url);
      const traverse = require("@babel/traverse").default;
      const t = require("@babel/types");
      const generate = require("@babel/generator").default;
      traverse(ast, {
        VariableDeclarator(p: any) {
          const { node } = p;
          if (
            node.id &&
            node.init &&
            node.init.type === "CallExpression" &&
            node.init.callee.type === "Identifier" &&
            node.init.callee.name === "server$" &&
            node.init.arguments.length === 1
          ) {
            const exportName = node.id.name;
            const functionArg = node.init.arguments[0];
            // Strip TS types from the function node
            stripTypes(functionArg);
            const endpoint =
              path.basename(id, path.extname(id)) + "_" + exportName;
            const functionCode = generate(functionArg, {
              comments: false,
            }).code;
            serverFunctions[endpoint] = {
              file: path.relative(process.cwd(), id),
              exportName,
              code: functionCode,
            };
            if (!process.env.SSR) {
              // Replace the server$ variable declarator with a fetch stub
              p.replaceWith(
                t.variableDeclarator(
                  t.identifier(exportName),
                  t.arrowFunctionExpression(
                    [t.restElement(t.identifier("args"))],
                    t.callExpression(
                      t.memberExpression(
                        t.callExpression(t.identifier("fetch"), [
                          t.stringLiteral(`/_serverdollar/${endpoint}`),
                          t.objectExpression([
                            t.objectProperty(
                              t.identifier("method"),
                              t.stringLiteral("POST")
                            ),
                            t.objectProperty(
                              t.identifier("body"),
                              t.callExpression(
                                t.memberExpression(
                                  t.identifier("JSON"),
                                  t.identifier("stringify")
                                ),
                                [t.identifier("args")]
                              )
                            ),
                          ]),
                        ]),
                        t.identifier("then")
                      ),
                      [
                        t.arrowFunctionExpression(
                          [t.identifier("r")],
                          t.callExpression(
                            t.memberExpression(
                              t.identifier("r"),
                              t.identifier("json")
                            ),
                            []
                          )
                        ),
                      ]
                    )
                  )
                )
              );
            }
          }
        },
      });
      // Always generate the full file from the AST
      return generate(ast, { comments: false }).code;
    },
    async writeBundle() {
      if (Object.keys(serverFunctions).length === 0) return;
      let registryCode = "// Auto-generated server$ function registry\n\n";
      for (const [endpoint, func] of Object.entries(serverFunctions)) {
        registryCode += `// ${func.file}\n`;
        registryCode += `export const ${func.exportName} = ${func.code};\n\n`;
      }

      // Ensure the dist directory exists
      const outDir = process.env.SSR === "true" ? "dist" : "dist-client";
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(`${outDir}/server-functions.js`, registryCode);

      const manifest: Record<string, { file: string; exportName: string }> = {};
      for (const [endpoint, func] of Object.entries(serverFunctions)) {
        manifest[endpoint] = {
          file: func.file,
          exportName: func.exportName,
        };
      }
      await fs.writeFile(
        `${outDir}/serverdollar.manifest.json`,
        JSON.stringify(manifest, null, 2)
      );
    },
  };
}
