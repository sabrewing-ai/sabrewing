import { createServer } from "./server";
import { FC } from "./h";
import { Route, createRouter } from "./router";

// Define the route structure that the app provides
interface AppRoute {
  path: string;
  import: () => Promise<any>;
}

function createApp(config: {
  routes: AppRoute[];
  layout?: FC;
  port?: number;
  host?: string;
  staticDir?: string;
}) {
  const server = createServer({
    routes: config.routes,
    layout: config.layout,
    port: config.port,
    host: config.host,
    staticDir: config.staticDir,
  });

  // Convert app routes to router routes
  const routerRoutes: Route[] = config.routes.map((route) => ({
    path: route.path,
    component: async () => {
      const module = await route.import();
      return module.default;
    },
  }));

  const router = createRouter({
    routes: routerRoutes,
  });

  return {
    server,
    router,
    start: () => server.start(),
  };
}

export { createApp };
export type { AppRoute };
