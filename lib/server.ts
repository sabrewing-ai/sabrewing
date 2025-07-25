import { renderToStream } from "./renderToStream";
import { Router } from "./router";
import { FC, h } from "./h";
import http from "http";
import fs from "fs/promises";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";

interface ServerConfig {
  port?: number;
  host?: string;
  routes: any[];
  layout?: FC;
  staticDir?: string;
}

interface ServerContext {
  url: URL;
  params: Record<string, string>;
  query: Record<string, string>;
}

class SabrewingServer {
  private config: ServerConfig;
  private router: Router;
  private server: http.Server | null = null;

  constructor(config: ServerConfig) {
    this.config = {
      port: 3000,
      host: "localhost",
      ...config,
    };

    this.router = new Router({
      routes: config.routes.map((route) => ({
        path: route.path,
        component: async () => {
          const module = await route.import();
          return h(module.default, {});
        },
      })),
    });
  }

  async start() {
    this.server = http.createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || "", `http://${req.headers.host}`);
        const response = await this.handleRequest(req, url);

        if (response instanceof Response) {
          res.statusCode = response.status;
          for (const [key, value] of response.headers) {
            res.setHeader(key, value);
          }

          // Check if response has a readable body for streaming
          if (response.body) {
            // Stream the response body directly
            const reader = response.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            } finally {
              reader.releaseLock();
            }
            res.end();
          } else {
            // Fallback for non-streaming responses
            const body = await response.text();
            res.end(body);
          }
        } else {
          res.statusCode = 200;
          res.end(String(response));
        }
      }
    );
    this.server.listen(this.config.port, this.config.host, () => {
      console.log(
        `🚀 Sabrewing server running at http://${this.config.host}:${this.config.port}`
      );
    });
    return this.server;
  }

  private async handleRequest(
    req: http.IncomingMessage,
    url: URL
  ): Promise<Response> {
    // Handle server$ endpoints
    if (url.pathname.startsWith("/_serverdollar/")) {
      return await handleServerDollarRequest(req, url);
    }

    // Handle static files
    if (this.config.staticDir && url.pathname.startsWith("/static/")) {
      const filePath = url.pathname.replace("/static/", "");
      const absPath = path.join(process.cwd(), this.config.staticDir, filePath);
      try {
        const data = await fs.readFile(absPath);
        return new Response(data, {
          headers: { "Content-Type": getMimeType(absPath) },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // Handle API routes
    if (url.pathname.startsWith("/api/")) {
      return this.handleApiRoute(url, req);
    }

    // Handle page routes
    return this.handlePageRoute(url);
  }

  private async handleApiRoute(
    url: URL,
    req: http.IncomingMessage
  ): Promise<Response> {
    // Simple API handling - can be extended
    return new Response(
      JSON.stringify({
        message: "API endpoint",
        path: url.pathname,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async handlePageRoute(url: URL): Promise<Response> {
    const route = this.router.match(url.pathname);

    if (!route) {
      return new Response("404 - Page not found", { status: 404 });
    }

    const pageComponent = await route.component({});
    const appContent = this.config.layout
      ? this.config.layout({}, pageComponent)
      : pageComponent;

    const appStream = await renderToStream(appContent, {
      addNewlines: true,
      indent: 0,
    });

    return this.createStreamingResponse(appStream, url.pathname);
  }

  private async createStreamingResponse(
    appStream: ReadableStream,
    initialRoute: string
  ): Promise<Response> {
    console.log("[Sabrewing] Starting SSR stream for route:", initialRoute);

    // Create a new stream that includes the HTML wrapper and streams content
    const htmlStream = new ReadableStream({
      async start(controller) {
        // Send the HTML head and opening body
        const head = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Sabrewing App</title>\n    <link rel="stylesheet" href="/static/styles.css">\n    <script>window.__INITIAL_ROUTE__ = "${initialRoute}";</script>\n</head>\n<body>\n    <div id="root">`;
        controller.enqueue(head);

        // Stream the app content
        const reader = appStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          reader.releaseLock();
        }

        // Send the closing HTML
        const tail = `\n    </div>\n    <script type="module" src="/static/entry.client.js"></script>\n</body>\n</html>`;
        controller.enqueue(tail);
        controller.close();
      },
    });

    return new Response(htmlStream, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  }
}

function getMimeType(filePath: string): string {
  // Minimal mime type mapping
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
    return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function createServer(config: ServerConfig): SabrewingServer {
  return new SabrewingServer(config);
}

export { createServer, SabrewingServer };
export type { ServerConfig, ServerContext };

async function handleServerDollarRequest(
  req: http.IncomingMessage,
  url: URL
): Promise<Response> {
  try {
    const endpoint = url.pathname.replace("/_serverdollar/", "");

    // Load server$ functions from generated registry
    const manifestPath = path.join(
      process.cwd(),
      "dist/serverdollar.manifest.json"
    );
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const entry = manifest[endpoint];

    if (!entry) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Import the server$ function from the generated registry
    const registryPath = path.join(process.cwd(), "dist/server-functions.js");
    const registry = await import(registryPath);
    const fn = registry[entry.exportName];

    if (typeof fn !== "function") {
      return new Response(JSON.stringify({ error: "Not a function" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    const args = req.method === "POST" && body ? JSON.parse(body) : [];

    const result = await fn(...args);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export * from "./framework";
export * from "./renderToStream";
