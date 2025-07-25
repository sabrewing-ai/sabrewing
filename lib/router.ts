import { FC } from "./h";

interface Route {
  path: string;
  component: FC | (() => Promise<any>);
  children?: Route[];
}

interface RouterConfig {
  routes: Route[];
  base?: string;
}

class Router {
  private routes: Route[];
  private base: string;

  constructor(config: RouterConfig) {
    this.routes = config.routes;
    this.base = config.base || "";
  }

  match(path: string): Route | null {
    const normalizedPath = this.normalizePath(path);

    for (const route of this.routes) {
      if (this.matchesRoute(route.path, normalizedPath)) {
        return route;
      }
      if (route.children) {
        for (const child of route.children) {
          if (this.matchesRoute(child.path, normalizedPath)) {
            return child;
          }
        }
      }
    }
    return null;
  }

  private normalizePath(path: string): string {
    return path.replace(/\/$/, "") || "/";
  }

  private matchesRoute(routePath: string, requestPath: string): boolean {
    // Simple exact match for now, can be extended with params
    return routePath === requestPath;
  }

  getCurrentRoute(): string {
    if (typeof window !== "undefined") {
      return (window as any).__INITIAL_ROUTE__ || window.location.pathname;
    }
    return "/";
  }
}

function createRouter(config: RouterConfig): Router {
  return new Router(config);
}

export { createRouter, Router };
export type { Route, RouterConfig };
