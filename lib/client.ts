import { hydrate } from "./hydration";

export interface ClientConfig {
  rootElement?: string;
  vdom?: any;
}

export class SabrewingClient {
  private config: ClientConfig;

  constructor(config: ClientConfig = {}) {
    this.config = {
      rootElement: "#root",
      ...config,
    };
  }

  async start() {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve);
      });
    }

    // Hydrate the app
    await this.hydrate();
  }

  private async hydrate() {
    const rootElement = document.querySelector(this.config.rootElement!);
    if (!rootElement) {
      console.error(`Root element ${this.config.rootElement} not found`);
      return;
    }

    try {
      await hydrate(this.config.vdom, rootElement as HTMLElement);
      console.log("✅ App hydrated successfully");
    } catch (error) {
      console.error("❌ Hydration failed:", error);
    }
  }
}

export function createClient(config?: ClientConfig): SabrewingClient {
  return new SabrewingClient(config);
}
