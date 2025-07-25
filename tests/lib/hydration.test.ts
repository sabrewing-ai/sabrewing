import "../setup";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { h } from "../../lib/h";
import { signal } from "../../lib/signal";
import { hydrate } from "../../lib/hydration";
import { renderToStream } from "../../lib/renderToStream";
import console from "console";
import { JSDOM } from "jsdom";
import { setHydratingState } from "../../lib/hydration.js";

// Helper function to read stream content
async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(
      typeof value === "string" ? value : new TextDecoder().decode(value)
    );
  }

  return chunks.join("");
}

// Helper function to generate HTML from VDOM
async function generateHTML(vnode: any): Promise<string> {
  const stream = await renderToStream(vnode);
  return await readStream(stream);
}

describe("hydration", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    // Clean up any hydration data script
    const script = document.getElementById("sabrewing-resource-data");
    if (script) {
      script.remove();
    }
  });

  describe("basic hydration", () => {
    it("should extract hydration data from script tag", () => {
      // Create mock hydration data
      const mockData = {
        resource_1: {
          data: "test data",
          status: "success",
        },
        signal_1: {
          value: 42,
          status: "success",
        },
      };

      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = JSON.stringify(mockData);
      document.head.appendChild(script);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      expect(result.context.hydrationData).toEqual(mockData);
      result.cleanup();
    });

    it("should find hydration elements in DOM", async () => {
      // Create mock DOM with hydration markers using VDOM
      const mockVDOM = h(
        "div",
        {},
        h(
          "div",
          { "data-hydrate": "resource", "data-hydrate-id": "resource_1" },
          h("span", {}, "Loading...")
        ),
        h(
          "span",
          { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
          "Count: 0"
        ),
        h(
          "div",
          { "data-hydrate": "list", "data-hydrate-id": "list_1" },
          h("li", {}, "Item 1"),
          h("li", {}, "Item 2")
        )
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Since the VDOM only contains a simple div, no hydration elements should be registered
      const hydrationElements = Array.from(result.context.mountedElements);
      expect(hydrationElements).toHaveLength(0);

      // Check that elements still exist in the DOM
      const resourceElement = container.querySelector(
        '[data-hydrate-id="resource_1"]'
      );
      const signalElement = container.querySelector(
        '[data-hydrate-id="signal_1"]'
      );
      const listElement = container.querySelector('[data-hydrate-id="list_1"]');

      expect(resourceElement).toBeTruthy();
      expect(signalElement).toBeTruthy();
      expect(listElement).toBeTruthy();

      result.cleanup();
    });

    it("should handle missing hydration data gracefully", async () => {
      const mockVDOM = h(
        "div",
        { "data-hydrate": "resource", "data-hydrate-id": "resource_1" },
        h("span", {}, "Loading...")
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Should not throw error when hydration data is missing
      expect(result.context.hydrationData).toEqual({});
      result.cleanup();
    });

    it("should cleanup hydration context properly", async () => {
      const mockData = {
        resource_1: {
          data: "test data",
          status: "success",
        },
      };

      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = JSON.stringify(mockData);
      document.head.appendChild(script);

      const mockVDOM = h(
        "div",
        { "data-hydrate": "resource", "data-hydrate-id": "resource_1" },
        h("span", {}, "Loading...")
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Verify context is populated
      expect(result.context.hydrationData).toEqual(mockData);
      // Since the VDOM doesn't hydrate the resource, mountedElements should be empty
      expect(result.context.mountedElements.size).toBe(0);

      // Cleanup
      result.cleanup();

      // Verify context is cleared
      expect(result.context.hydrationData).toEqual({});
      expect(result.context.mountedElements.size).toBe(0);
      expect(result.context.effects.size).toBe(0);
      expect(result.context.signals.size).toBe(0);
    });

    it("should handle malformed hydration data", () => {
      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = "invalid json";
      document.head.appendChild(script);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Should handle malformed JSON gracefully
      expect(result.context.hydrationData).toEqual({});
      result.cleanup();
    });

    it("should work with empty container", () => {
      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      expect(result.context.mountedElements.size).toBe(0);
    });

    it("should hydrate elements with style objects", async () => {
      const vnode = h(
        "div",
        {
          style: {
            color: "red",
            fontSize: "16px",
            backgroundColor: "#f0f0f0",
          },
        },
        "Styled content"
      );

      const result = hydrate(vnode, container);

      expect(container.innerHTML).toBe(
        '<div style="color: red; font-size: 16px; background-color: #f0f0f0;">Styled content</div>'
      );
      result.cleanup();
    });

    it("should hydrate elements with mixed props including style", async () => {
      const vnode = h(
        "div",
        {
          id: "container",
          class: "main-content",
          style: {
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
          },
        },
        "Centered content"
      );

      const result = hydrate(vnode, container);

      expect(container.innerHTML).toBe(
        '<div id="container" class="main-content" style="display: flex; justify-content: center; align-items: center; min-height: 100vh;">Centered content</div>'
      );
      result.cleanup();
    });

    it("should handle nested hydration elements", async () => {
      const mockVDOM = h(
        "div",
        { "data-hydrate": "resource", "data-hydrate-id": "resource_1" },
        h(
          "div",
          {},
          h(
            "div",
            {},
            h(
              "div",
              { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
              h("span", {}, "Deep nested")
            )
          )
        )
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Since the VDOM only contains a simple div, no hydration elements should be registered
      expect(result.context.mountedElements.size).toBe(0);

      // Check that elements still exist in the DOM
      const resourceElement = container.querySelector(
        '[data-hydrate-id="resource_1"]'
      );
      const signalElement = container.querySelector(
        '[data-hydrate-id="signal_1"]'
      );

      expect(resourceElement).toBeTruthy();
      expect(signalElement).toBeTruthy();

      result.cleanup();
    });
  });

  describe("signal hydration", () => {
    it("should hydrate signal with initial value", async () => {
      const count = signal(42);
      const mockVDOM = h(
        "span",
        { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
        "Count: 42"
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h.signal(count, (value) =>
        h("span", {}, `Count: ${value}`)
      );
      const result = hydrate(vnode, container);

      const signalElement = container.querySelector(
        '[data-hydrate-id="signal_1"]'
      );
      expect(signalElement).toBeTruthy();
      expect(signalElement!.textContent?.trim()).toBe("Count: 42");
      expect(result.context.signals.size).toBe(1);

      result.cleanup();
    });

    it("should update signal reactively after hydration", async () => {
      const count = signal(42);
      const mockVDOM = h(
        "span",
        { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
        "Count: 42"
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h.signal(count, (value) =>
        h("span", {}, `Count: ${value}`)
      );
      const result = hydrate(vnode, container);

      // Update signal
      count.value = 100;

      // Should update reactively
      const signalElement = container.querySelector(
        '[data-hydrate-id="signal_1"]'
      );
      expect(signalElement!.textContent?.trim()).toBe("Count: 100");

      result.cleanup();
    });

    it("should handle multiple signals", async () => {
      const count1 = signal(10);
      const count2 = signal(20);

      const mockVDOM = h(
        "div",
        {},
        h(
          "span",
          { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
          "Count: 10"
        ),
        h(
          "span",
          { "data-hydrate": "signal", "data-hydrate-id": "signal_2" },
          "Count: 20"
        )
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h(
        "div",
        {},
        h.signal(count1, (value) => h("span", {}, `Count: ${value}`)),
        h.signal(count2, (value) => h("span", {}, `Count: ${value}`))
      );

      const result = hydrate(vnode, container);

      expect(result.context.signals.size).toBe(2);
      expect(result.context.mountedElements.size).toBe(2);

      result.cleanup();
    });
  });

  describe("list hydration", () => {
    it("should hydrate list with initial items", async () => {
      const items = signal(["Item 1", "Item 2", "Item 3"]);
      const mockVDOM = h(
        "div",
        { "data-hydrate": "list", "data-hydrate-id": "list_1" },
        h("li", { "data-key": "0" }, "Item 1"),
        h("li", { "data-key": "1" }, "Item 2"),
        h("li", { "data-key": "2" }, "Item 3")
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h.list(
        items,
        (item, index) => index.toString(),
        (item) => h("li", {}, item)
      );
      const result = hydrate(vnode, container);

      const listElement = container.querySelector('[data-hydrate-id="list_1"]');
      expect(listElement).toBeTruthy();
      expect(listElement!.children.length).toBe(3);
      expect(result.context.signals.size).toBe(1);

      result.cleanup();
    });

    it("should update list reactively after hydration", async () => {
      const items = signal(["Item 1", "Item 2"]);
      const mockVDOM = h(
        "div",
        { "data-hydrate": "list", "data-hydrate-id": "list_1" },
        h("li", { "data-key": "0" }, "Item 1"),
        h("li", { "data-key": "1" }, "Item 2")
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h.list(
        items,
        (item, index) => index.toString(),
        (item) => h("li", {}, item)
      );
      const result = hydrate(vnode, container);

      // Update list
      items.value = ["Item A", "Item B", "Item C"];

      const listElement = container.querySelector('[data-hydrate-id="list_1"]');
      expect(listElement!.children.length).toBe(3);
      expect(listElement!.children[0].textContent).toBe("Item A");
      expect(listElement!.children[1].textContent).toBe("Item B");
      expect(listElement!.children[2].textContent).toBe("Item C");

      result.cleanup();
    });

    it("should handle empty list", async () => {
      const items = signal([]);
      const mockVDOM = h("div", {
        "data-hydrate": "list",
        "data-hydrate-id": "list_1",
      });

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h.list(
        items,
        (item, index) => index.toString(),
        (item) => h("li", {}, item)
      );
      const result = hydrate(vnode, container);

      const listElement = container.querySelector('[data-hydrate-id="list_1"]');
      expect(listElement!.children.length).toBe(0);

      result.cleanup();
    });
  });

  describe("keyed list hydration", () => {
    it("should hydrate keyed list with proper key matching", async () => {
      const items = signal([
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
      ]);

      const mockVDOM = h(
        "div",
        { "data-hydrate": "list", "data-hydrate-id": "list_1" },
        h("li", { "data-key": "1" }, "Item 1"),
        h("li", { "data-key": "2" }, "Item 2"),
        h("li", { "data-key": "3" }, "Item 3")
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h.list(
        items,
        (item) => item.id.toString(),
        (item) => h("li", {}, item.name)
      );
      const result = hydrate(vnode, container);

      const listElement = container.querySelector('[data-hydrate-id="list_1"]');
      expect(listElement).toBeTruthy();
      expect(listElement!.children.length).toBe(3);

      // Check that keys are preserved
      expect(listElement!.children[0].getAttribute("data-key")).toBe("1");
      expect(listElement!.children[1].getAttribute("data-key")).toBe("2");
      expect(listElement!.children[2].getAttribute("data-key")).toBe("3");

      result.cleanup();
    });

    it("should efficiently update keyed list by reordering", async () => {
      const items = signal([
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
      ]);

      // Mock SSR output: wrapper div with list items inside
      container.innerHTML = `<div data-hydrate="list" data-hydrate-id="list_1">
        <li data-key="1">Item 1</li>
        <li data-key="2">Item 2</li>
        <li data-key="3">Item 3</li>
      </div>`;

      const vnode = h.list(
        items,
        (item) => item.id.toString(),
        (item) => h("li", {}, item.name)
      );
      const result = hydrate(vnode, container);

      // Wait for initial hydration
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Reorder items
      items.value = [
        { id: 3, name: "Item 3" },
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
      ];

      // Wait for update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const listElement = container.querySelector('[data-hydrate-id="list_1"]');
      expect(listElement!.children.length).toBe(3);

      // Check that items are reordered correctly
      expect(listElement!.children[0].textContent).toBe("Item 3");
      expect(listElement!.children[1].textContent).toBe("Item 1");
      expect(listElement!.children[2].textContent).toBe("Item 2");

      result.cleanup();
    });

    it("should handle keyed list with additions and removals", async () => {
      const items = signal([
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
      ]);

      // Mock SSR output: wrapper div with list items inside
      container.innerHTML = `<div data-hydrate="list" data-hydrate-id="list_1">
        <li data-key="1">Item 1</li>
        <li data-key="2">Item 2</li>
      </div>`;

      const vnode = h.list(
        items,
        (item) => item.id.toString(),
        (item) => h("li", {}, item.name)
      );
      const result = hydrate(vnode, container);

      // Wait for initial hydration
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Add new item in middle
      items.value = [
        { id: 1, name: "Item 1" },
        { id: 3, name: "Item 3" },
        { id: 2, name: "Item 2" },
      ];

      // Wait for update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const listElement = container.querySelector('[data-hydrate-id="list_1"]');
      expect(listElement!.children.length).toBe(3);
      expect(listElement!.children[0].textContent).toBe("Item 1");
      expect(listElement!.children[1].textContent).toBe("Item 3");
      expect(listElement!.children[2].textContent).toBe("Item 2");

      // Remove item
      items.value = [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
      ];

      // Wait for update
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listElement!.children.length).toBe(2);
      expect(listElement!.children[0].textContent).toBe("Item 1");
      expect(listElement!.children[1].textContent).toBe("Item 2");

      result.cleanup();
    });

    it("should handle duplicate keys gracefully", async () => {
      const items = signal([
        { id: 1, name: "Item 1" },
        { id: 1, name: "Item 1 Duplicate" }, // Duplicate key
        { id: 2, name: "Item 2" },
      ]);

      // Mock SSR output: wrapper div with list items inside, including duplicate key
      container.innerHTML = `<div data-hydrate="list" data-hydrate-id="list_1">
        <li data-key="1">Item 1</li>
        <li data-key="1">Item 1 Duplicate</li>
        <li data-key="2">Item 2</li>
      </div>`;

      const vnode = h.list(
        items,
        (item) => item.id.toString(),
        (item) => h("li", {}, item.name)
      );
      const result = hydrate(vnode, container);

      // Wait for initial hydration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const listElement = container.querySelector('[data-hydrate-id="list_1"]');
      // With duplicate keys, we should have all 3 items since that's what the VDOM expects
      expect(listElement!.children.length).toBe(3);

      result.cleanup();
    });

    it("should handle missing keys in DOM", async () => {
      const items = signal([
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
      ]);

      // Mock SSR output: wrapper div with list items, one missing data-key
      container.innerHTML = `<div data-hydrate="list" data-hydrate-id="list_1">
        <li data-key="1">Item 1</li>
        <li>Item 2</li>
        <li data-key="3">Item 3</li>
      </div>`;

      const vnode = h.list(
        items,
        (item) => item.id.toString(),
        (item) => h("li", {}, item.name)
      );
      const result = hydrate(vnode, container);

      // Wait for initial hydration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const listElement = container.querySelector('[data-hydrate-id="list_1"]');
      expect(listElement!.children.length).toBe(3);

      result.cleanup();
    });
  });

  describe("resource hydration", () => {
    it("should hydrate resource with success data", async () => {
      // Create mock hydration data for the test
      const mockData = {
        resource_1: {
          data: "success data",
          status: "success",
        },
      };

      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = JSON.stringify(mockData);
      document.head.appendChild(script);

      // Use static HTML for the server-side rendered content
      container.innerHTML = `
        <div data-hydrate="resource" data-hydrate-id="resource_1">
          <span>success data</span>
        </div>
      `;

      // Create VDOM for client-side hydration
      const vnode = h.resource(async () => "test", {
        loading: () => h("span", {}, "Loading..."),
        success: (data) => h("span", {}, data),
        failure: (error) => h("span", {}, `Error: ${error.message}`),
      });

      const result = hydrate(vnode, container);

      const resourceElement = container.querySelector(
        '[data-hydrate-id="resource_1"]'
      );
      expect(resourceElement).toBeTruthy();
      expect(resourceElement!.textContent?.trim()).toBe("success data");

      result.cleanup();
    });

    it("should hydrate resource with error data", async () => {
      const mockData = {
        resource_1: {
          error: "Resource failed",
          status: "error",
        },
      };

      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = JSON.stringify(mockData);
      document.head.appendChild(script);

      // Use static HTML for the server-side rendered content
      container.innerHTML = `
        <div data-hydrate="resource" data-hydrate-id="resource_1">
          <span>Error: Resource failed</span>
        </div>
      `;

      const vnode = h.resource(async () => "test", {
        loading: () => h("span", {}, "Loading..."),
        success: (data) => h("span", {}, data),
        failure: (error) => h("span", {}, `Error: ${error.message}`),
      });

      const result = hydrate(vnode, container);

      const resourceElement = container.querySelector(
        '[data-hydrate-id="resource_1"]'
      );
      expect(resourceElement).toBeTruthy();
      expect(resourceElement!.textContent?.trim()).toBe(
        "Error: Resource failed"
      );

      result.cleanup();
    });

    it("should not fetch immediately after hydration and only refetch when dependencies change", async () => {
      let fetchCallCount = 0;
      const page = signal(0);

      // Get real data for hydration
      const realData = await fetch(
        "https://dummyjson.com/posts?limit=2&skip=0"
      ).then((r) => r.json());

      const resource = h.resource(
        async () => {
          fetchCallCount++;
          const skip = page.value * 2;
          const response = await fetch(
            `https://dummyjson.com/posts?limit=2&skip=${skip}`
          );
          if (!response.ok) throw new Error("Failed to fetch");
          return await response.json();
        },
        {
          loading: () => h("div", {}, "Loading..."),
          success: (data) =>
            h("div", {}, data.posts.map((p: any) => p.title).join("|")),
          failure: (err) => h("div", {}, `Error: ${err.message}`),
        },
        [page]
      );

      // Use real data for hydration
      const mockData = {
        resource_1: {
          data: realData,
          status: "success",
        },
      };
      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = JSON.stringify(mockData);
      document.head.appendChild(script);

      // Create HTML that matches the real API response
      const realHtml = `<div data-hydrate="resource" data-hydrate-id="resource_1"><div>${realData.posts
        .map((p: any) => p.title)
        .join("|")}</div></div>`;
      container.innerHTML = realHtml;

      fetchCallCount = 0;
      const result = hydrate(resource, container);
      const resourceElement = container.querySelector(
        '[data-hydrate-id="resource_1"]'
      );
      expect(resourceElement).toBeTruthy();
      expect(resourceElement!.textContent).toContain(realData.posts[0].title);
      expect(resourceElement!.textContent).toContain(realData.posts[1].title);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fetchCallCount).toBe(0); // Should not fetch during hydration when data is available
      // Change page
      page.value = 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(fetchCallCount).toBe(1); // Should fetch when dependency changes
      result.cleanup();
    });

    it("should handle reactive resource with signal dependencies that change after hydration", async () => {
      let fetchCallCount = 0;
      const query = signal("test");

      // Get real data for hydration
      const realData = await fetch(
        "https://dummyjson.com/posts/search?q=test&limit=2"
      ).then((r) => r.json());

      const resource = h.resource(
        async () => {
          fetchCallCount++;
          const response = await fetch(
            `https://dummyjson.com/posts/search?q=${encodeURIComponent(
              query.value
            )}&limit=2`
          );
          if (!response.ok) throw new Error("Failed to fetch");
          return await response.json();
        },
        {
          loading: () => h("div", {}, "Loading..."),
          success: (data) =>
            h("div", {}, data.posts.map((p: any) => p.title).join("|")),
          failure: (err) => h("div", {}, `Error: ${err.message}`),
        },
        [query]
      );

      // Use real data for hydration
      const mockData = {
        resource_1: {
          data: realData,
          status: "success",
        },
      };
      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = JSON.stringify(mockData);
      document.head.appendChild(script);

      // Create HTML that matches the real API response
      const realHtml = `<div data-hydrate="resource" data-hydrate-id="resource_1"><div>${realData.posts
        .map((p: any) => p.title)
        .join("|")}</div></div>`;
      container.innerHTML = realHtml;

      fetchCallCount = 0;
      const result = hydrate(resource, container);
      const resourceElement = container.querySelector(
        '[data-hydrate-id="resource_1"]'
      );
      expect(resourceElement).toBeTruthy();
      if (realData.posts.length > 0) {
        expect(resourceElement!.textContent).toContain(realData.posts[0].title);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fetchCallCount).toBe(0); // Should not fetch during hydration when data is available
      // Change query
      query.value = "lorem";
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(fetchCallCount).toBe(1); // Should fetch when dependency changes
      result.cleanup();
    });

    it("should NOT fetch immediately when resource has hydration data", async () => {
      let fetchCallCount = 0;
      const page = signal(0);

      // Get real data for hydration
      const realData = await fetch(
        "https://dummyjson.com/posts?limit=2&skip=0"
      ).then((r) => r.json());

      const resource = h.resource(
        async () => {
          fetchCallCount++;
          const skip = page.value * 2;
          const response = await fetch(
            `https://dummyjson.com/posts?limit=2&skip=${skip}`
          );
          if (!response.ok) throw new Error("Failed to fetch");
          return await response.json();
        },
        {
          loading: () => h("div", {}, "Loading..."),
          success: (data) =>
            h("div", {}, data.posts.map((p: any) => p.title).join("|")),
          failure: (err) => h("div", {}, `Error: ${err.message}`),
        },
        [page] // Add dependency array
      );

      // Use real data for hydration
      const mockData = {
        resource_1: {
          data: realData,
          status: "success",
        },
      };
      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = JSON.stringify(mockData);
      document.head.appendChild(script);

      // Create HTML that matches the real API response
      const realHtml = `<div data-hydrate="resource" data-hydrate-id="resource_1"><div>${realData.posts
        .map((p: any) => p.title)
        .join("|")}</div></div>`;
      container.innerHTML = realHtml;

      fetchCallCount = 0;
      const result = hydrate(resource, container);
      const resourceElement = container.querySelector(
        '[data-hydrate-id="resource_1"]'
      );
      expect(resourceElement).toBeTruthy();
      expect(resourceElement!.textContent).toContain(realData.posts[0].title);
      expect(resourceElement!.textContent).toContain(realData.posts[1].title);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fetchCallCount).toBe(0); // Should not fetch during hydration when data is available
      result.cleanup();
    });

    it("should reproduce Posts component issue - resource with signal dependencies", async () => {
      let fetchCallCount = 0;
      const currentPage = signal(0);

      // Get real data for hydration
      const realData = await fetch(
        "https://dummyjson.com/posts?limit=2&skip=0"
      ).then((r) => r.json());

      const resource = h.resource(
        async () => {
          fetchCallCount++;
          const skip = currentPage.value * 2;
          const response = await fetch(
            `https://dummyjson.com/posts?limit=2&skip=${skip}`
          );
          if (!response.ok) throw new Error("Failed to fetch");
          return await response.json();
        },
        {
          loading: () => h("div", {}, "Loading..."),
          success: (data) =>
            h("div", {}, data.posts.map((p: any) => p.title).join("|")),
          failure: (err) => h("div", {}, `Error: ${err.message}`),
        },
        [currentPage] // Add dependency array to match Posts component
      );

      // Use real data for hydration
      const mockData = {
        resource_1: {
          data: realData,
          status: "success",
        },
      };
      const script = document.createElement("script");
      script.id = "sabrewing-resource-data";
      script.type = "application/json";
      script.textContent = JSON.stringify(mockData);
      document.head.appendChild(script);

      // Create HTML that matches the real API response
      const realHtml = `<div data-hydrate="resource" data-hydrate-id="resource_1"><div>${realData.posts
        .map((p: any) => p.title)
        .join("|")}</div></div>`;
      container.innerHTML = realHtml;

      fetchCallCount = 0;
      const result = hydrate(resource, container);
      const resourceElement = container.querySelector(
        '[data-hydrate-id="resource_1"]'
      );
      expect(resourceElement).toBeTruthy();
      expect(resourceElement!.textContent).toContain(realData.posts[0].title);
      expect(resourceElement!.textContent).toContain(realData.posts[1].title);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fetchCallCount).toBe(0); // Should not fetch during hydration when data is available
      // Change page
      currentPage.value = 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(fetchCallCount).toBe(1); // Should fetch when dependency changes
      result.cleanup();
    });
  });

  describe("conditional element with signals and events", () => {
    it("should hydrate and patch a button that appears after hydration, is reactive, and handles events", async () => {
      // Server-side: open is false, so button is not rendered
      const open = signal(false);
      const count = signal(0);

      // The VDOM structure
      function Button() {
        return h(
          "button",
          {
            disabled: count.value > 10,
            onClick: () => {
              count.value++;
            },
            "data-testid": "my-btn",
          },
          `Count: ${count.value}`
        );
      }
      function App() {
        // Use h.signal for conditional rendering
        return h(
          "div",
          {},
          h.signal(open, (open) => (open ? Button() : null))
        );
      }

      // Simulate server-side HTML (open is false, so no button)
      container.innerHTML = `<div></div>`;

      // Hydrate
      const vnode = App();
      const result = hydrate(vnode, container);

      // Initially, button should not be present
      expect(container.querySelector("button")).toBeNull();

      // Open the button after hydration
      open.value = true;
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now the button should appear
      let btn = container.querySelector("button[data-testid='my-btn']");
      expect(btn).toBeTruthy();
      expect(btn!.textContent).toBe("Count: 0");
      expect((btn as HTMLButtonElement).disabled).toBe(false);

      // Click the button a few times
      for (let i = 0; i < 3; i++) {
        btn = container.querySelector("button[data-testid='my-btn']");
        (btn as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      btn = container.querySelector("button[data-testid='my-btn']");
      expect(btn!.textContent).toBe("Count: 3");
      expect((btn as HTMLButtonElement).disabled).toBe(false);

      // Set count > 10, should disable the button
      count.value = 11;
      await new Promise((resolve) => setTimeout(resolve, 10));
      btn = container.querySelector("button[data-testid='my-btn']");
      expect((btn as HTMLButtonElement).disabled).toBe(true);

      // Close the button again
      open.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(container.querySelector("button")).toBeNull();

      result.cleanup();
    });
  });

  describe("h.signal advanced hydration", () => {
    it("should hydrate and patch a signal node that appears/disappears and is reactive", async () => {
      const show = signal(false);
      const count = signal(0);
      function SignalButton() {
        return h(
          "button",
          {
            onClick: () => count.value++,
            "data-testid": "signal-btn",
            disabled: count.value > 2,
          },
          `Signal Count: ${count.value}`
        );
      }
      function App() {
        return h(
          "div",
          {},
          h.signal(show, (v) => (v ? SignalButton() : null))
        );
      }
      container.innerHTML = `<div></div>`;
      const vnode = App();
      const result = hydrate(vnode, container);
      expect(container.querySelector("button")).toBeNull();
      show.value = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
      let btn = container.querySelector("button[data-testid='signal-btn']");
      expect(btn).toBeTruthy();
      expect(btn!.textContent).toBe("Signal Count: 0");
      for (let i = 0; i < 3; i++) {
        btn = container.querySelector("button[data-testid='signal-btn']");
        (btn as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      btn = container.querySelector("button[data-testid='signal-btn']");
      expect(btn!.textContent).toBe("Signal Count: 3");
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      show.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(container.querySelector("button")).toBeNull();
      result.cleanup();
    });
  });

  describe("h.list advanced hydration", () => {
    it("should hydrate and patch a list node with dynamic items, keys, and events", async () => {
      const items = signal([
        { id: 1, label: "A" },
        { id: 2, label: "B" },
      ]);
      function ListItem(item: any) {
        return h(
          "li",
          {
            "data-testid": `item-${item.id}`,
            onClick: () => {
              console.log("Click handler called for item:", item.id);
              // Create new items array with updated item
              const newItems = items.value.map((i: any) =>
                i.id === item.id ? { ...i, label: i.label + "+" } : i
              );
              items.value = newItems;
            },
          },
          `${item.label}`
        );
      }
      function App() {
        return h(
          "ul",
          {},
          h.list(
            items,
            (item) => item.id.toString(),
            (item) => ListItem(item)
          )
        );
      }

      // Mock SSR output: ul containing a div with hydration attributes and list items
      container.innerHTML = `<ul><div data-hydrate="list" data-hydrate-id="list_1"><li data-key="1" data-testid="item-1">A</li><li data-key="2" data-testid="item-2">B</li></div></ul>`;

      const vnode = App();
      const result = hydrate(vnode, container);

      // Wait for initial hydration
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Initial state - query after hydration since elements are recreated
      let li1 = container.querySelector("li[data-testid='item-1']");
      let li2 = container.querySelector("li[data-testid='item-2']");
      expect(li1).toBeTruthy();
      expect(li2).toBeTruthy();

      // Click to update label
      (li1 as HTMLLIElement).click();

      // Wait for update
      await new Promise((resolve) => setTimeout(resolve, 10));

      li1 = container.querySelector("li[data-testid='item-1']");
      expect(li1!.textContent).toBe("A+");

      // Remove item 2
      items.value = [{ id: 1, label: "A+" }];

      // Wait for update
      await new Promise((resolve) => setTimeout(resolve, 10));

      li2 = container.querySelector("li[data-testid='item-2']");
      expect(li2).toBeNull();

      // Add new item
      items.value = [
        { id: 1, label: "A+" },
        { id: 3, label: "C" },
      ];

      // Wait for update
      await new Promise((resolve) => setTimeout(resolve, 10));

      let li3 = container.querySelector("li[data-testid='item-3']");
      expect(li3).toBeTruthy();

      // Reorder
      items.value = [
        { id: 3, label: "C" },
        { id: 1, label: "A+" },
      ];

      // Wait for update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const lis = container.querySelectorAll("li");
      expect(lis[0].getAttribute("data-testid")).toBe("item-3");
      expect(lis[1].getAttribute("data-testid")).toBe("item-1");

      result.cleanup();
    });
  });

  describe("h.resource advanced hydration", () => {
    it("should hydrate resource with dynamic promise resolution, signal dependencies, and event handling", async () => {
      const count = signal(0);
      const shouldFail = signal(false);

      // Create a resource that depends on signals
      function App() {
        return h.resource(
          async () => {
            // Access signals synchronously to establish reactivity
            const c = count.value;
            const fail = shouldFail.value;
            // Simulate async operation that depends on signals
            await new Promise((resolve) => setTimeout(resolve, 10));

            if (fail) {
              throw new Error(`Failed at count: ${c}`);
            }

            return {
              message: "Hello",
              count: c,
              items: ["A", "B", "C"].slice(0, c + 1),
            };
          },
          {
            loading: () =>
              h("span", { "data-testid": "loading" }, "Loading..."),
            success: (data: any) =>
              h(
                "div",
                { "data-testid": "success" },
                h("h1", {}, `Message: ${data.message}`),
                h("p", {}, `Count: ${data.count}`),
                h(
                  "ul",
                  {},
                  data.items.map((item: string) =>
                    h("li", { "data-testid": `item-${item}` }, item)
                  )
                ),
                h(
                  "button",
                  {
                    onClick: () => count.value++,
                    "data-testid": "increment-btn",
                  },
                  "Increment"
                ),
                h(
                  "button",
                  {
                    onClick: () => (shouldFail.value = !shouldFail.value),
                    "data-testid": "toggle-fail-btn",
                  },
                  shouldFail.value ? "Succeed" : "Fail"
                )
              ),
            failure: (err: Error) =>
              h(
                "div",
                { "data-testid": "failure" },
                h("p", {}, `Error: ${err.message}`),
                h(
                  "button",
                  {
                    onClick: () => (shouldFail.value = false),
                    "data-testid": "retry-btn",
                  },
                  "Retry"
                )
              ),
          },
          [count, shouldFail]
        );
      }

      // Start with empty container (no hydration data)
      container.innerHTML = `<div></div>`;

      const vnode = App();
      const result = hydrate(vnode, container);

      // Initially should show loading
      let loading = container.querySelector("span[data-testid='loading']");
      expect(loading).toBeTruthy();
      expect(loading!.textContent).toBe("Loading...");

      // Wait a bit for the effect to run
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should show success state
      let success = container.querySelector("div[data-testid='success']");
      if (!success) throw new Error("Expected success element to be found");
      expect(success.textContent!.trim()).toContain("Message: Hello");
      expect(success.textContent!.trim()).toContain("Count: 0");
      // Should have one item (A)
      let itemA = container.querySelector("li[data-testid='item-A']");
      expect(itemA).toBeTruthy();

      // Click increment button
      let incrementBtn = container.querySelector(
        "button[data-testid='increment-btn']"
      );
      expect(incrementBtn).toBeTruthy();
      (incrementBtn as HTMLButtonElement).click();

      // Wait for resource to re-resolve
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should show updated count and items
      success = container.querySelector("div[data-testid='success']");
      if (!success) throw new Error("Expected success element to be found");
      expect(success.textContent!.trim()).toContain("Count: 1");

      // Should have two items (A, B)
      itemA = container.querySelector("li[data-testid='item-A']");
      let itemB = container.querySelector("li[data-testid='item-B']");
      expect(itemA).toBeTruthy();
      expect(itemB).toBeTruthy();
      expect(itemA!.textContent).toBe("A");
      expect(itemB!.textContent).toBe("B");

      // Toggle to failure mode
      let toggleFailBtn = container.querySelector(
        "button[data-testid='toggle-fail-btn']"
      );
      expect(toggleFailBtn).toBeTruthy();
      (toggleFailBtn as HTMLButtonElement).click();

      // Wait for resource to re-resolve
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should show failure state
      let failure = container.querySelector("div[data-testid='failure']");
      expect(failure).toBeTruthy();
      expect(failure!.textContent).toContain("Error: Failed at count: 1");

      // Click retry button
      let retryBtn = container.querySelector("button[data-testid='retry-btn']");
      expect(retryBtn).toBeTruthy();
      (retryBtn as HTMLButtonElement).click();

      // Wait for resource to re-resolve
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should show success state again
      success = container.querySelector("div[data-testid='success']");
      if (!success) throw new Error("Expected success element to be found");
      expect(success.textContent!.trim()).toContain("Count: 1");

      result.cleanup();
    });
  });

  describe("edge cases", () => {
    it("should handle deeply nested hydration elements", async () => {
      const mockVDOM = h(
        "div",
        { "data-hydrate": "resource", "data-hydrate-id": "resource_1" },
        h(
          "div",
          {},
          h(
            "div",
            { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
            h("span", {}, "Nested signal")
          )
        )
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Since the VDOM only contains a simple div, no hydration elements should be registered
      expect(result.context.mountedElements.size).toBe(0);

      result.cleanup();
    });

    it("should handle hydration elements with no children", async () => {
      const mockVDOM = h("div", {
        "data-hydrate": "signal",
        "data-hydrate-id": "signal_1",
      });

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Since the VDOM doesn't contain any hydration nodes, mountedElements should be empty
      expect(result.context.mountedElements.size).toBe(0);

      // The hydration element should still exist in the DOM (not removed)
      const signalElement = container.querySelector(
        '[data-hydrate-id="signal_1"]'
      );
      expect(signalElement).toBeTruthy();

      result.cleanup();
    });

    it("should handle multiple cleanup calls", () => {
      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // First cleanup
      result.cleanup();
      expect(result.context.mountedElements.size).toBe(0);

      // Second cleanup should not throw
      expect(() => result.cleanup()).not.toThrow();

      result.cleanup();
    });

    it("should handle hydration with text nodes", async () => {
      const mockVDOM = h(
        "div",
        { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
        "Some text content"
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Since the VDOM doesn't contain any hydration nodes, mountedElements should be empty
      expect(result.context.mountedElements.size).toBe(0);
      result.cleanup();
    });

    it("should handle hydration with mixed content", async () => {
      const mockVDOM = h(
        "div",
        {},
        h(
          "div",
          { "data-hydrate": "resource", "data-hydrate-id": "resource_1" },
          h("span", {}, "Resource content")
        ),
        h(
          "span",
          { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
          "Signal content"
        )
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h("div", {}, "Test");
      const result = hydrate(vnode, container);

      // Since the VDOM only contains a simple div, no hydration elements should be registered
      expect(result.context.mountedElements.size).toBe(0);

      result.cleanup();
    });

    it("should hydrate a list inside a signal (nested reactivity)", async () => {
      const items = signal(["A", "B"]);
      const show = signal(true);
      const mockVDOM = h(
        "span",
        { "data-hydrate": "signal", "data-hydrate-id": "signal_1" },
        show
          ? h(
              "div",
              {},
              h.list(
                items,
                (item, index) => index.toString(),
                (item) => h("li", {}, item)
              )
            )
          : h("div", {}, "Hidden")
      );

      container.innerHTML = await generateHTML(mockVDOM);

      const vnode = h.signal(show, (visible) =>
        visible
          ? h(
              "div",
              {},
              h.list(
                items,
                (item, index) => index.toString(),
                (item) => h("li", {}, item)
              )
            )
          : h("div", {}, "Hidden")
      );
      const result = hydrate(vnode, container);

      // Initial state - the list is inside the signal, so we need to find it within the signal element
      let signalElement = container.querySelector(
        '[data-hydrate-id="signal_1"]'
      );
      expect(signalElement).toBeTruthy();
      let listItems = signalElement!.querySelectorAll("li");
      expect(listItems.length).toBe(2);
      expect(listItems[0].textContent).toBe("A");
      expect(listItems[1].textContent).toBe("B");

      // Update list
      items.value = ["C", "D", "E"];
      listItems = signalElement!.querySelectorAll("li");
      expect(listItems.length).toBe(3);
      expect(listItems[0].textContent).toBe("C");
      expect(listItems[1].textContent).toBe("D");
      expect(listItems[2].textContent).toBe("E");

      // Hide the list
      show.value = false;
      expect(container.textContent).toContain("Hidden");

      // Show the list again
      show.value = true;
      signalElement = container.querySelector('[data-hydrate-id="signal_1"]');
      expect(signalElement).toBeTruthy();
      listItems = signalElement!.querySelectorAll("li");
      expect(listItems.length).toBe(3);
      expect(listItems[0].textContent).toBe("C");
      expect(listItems[1].textContent).toBe("D");
      expect(listItems[2].textContent).toBe("E");

      result.cleanup();
    });
  });

  describe("hydration with nested conditional tests", () => {
    it("should hydrate deeply nested conditional rendering", async () => {
      const level1 = signal(true);
      const level2 = signal(false);
      const level3 = signal(true);
      const count = signal(5);

      const vnode = h(
        "div",
        {},
        h.signal(level1, (l1) =>
          l1
            ? h.signal(level2, (l2) =>
                l2
                  ? h.signal(level3, (l3) =>
                      l3
                        ? h.signal(count, (c) =>
                            h(
                              "button",
                              {
                                onClick: () => count.value++,
                                "data-testid": "deep-nested-btn",
                                disabled: c > 10,
                              },
                              `Deep Count: ${c}`
                            )
                          )
                        : h("span", {}, "Level 3 disabled")
                    )
                  : h("span", {}, "Level 2 disabled")
              )
            : h("span", {}, "Level 1 disabled")
        )
      );

      // Render to stream first
      const stream = await renderToStream(vnode);
      const html = await readStream(stream);

      // Create container and set HTML
      const container = document.createElement("div");
      container.innerHTML = html;

      // Hydrate
      const result = hydrate(vnode, container);

      // Should show "Level 2 disabled" since level2 is false
      let span = container.querySelector("div[data-hydrate='signal'] > span");
      expect(span!.textContent!.trim()).toBe("Level 2 disabled");

      // Enable level 2
      level2.value = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Should show "Deep Count: 5" since all levels are now true
      let btn = container.querySelector(
        "button[data-testid='deep-nested-btn']"
      );
      expect(btn).toBeTruthy();
      expect(btn!.textContent).toBe("Deep Count: 5");

      // Click the button
      btn!.dispatchEvent(new Event("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 5));

      btn = container.querySelector("button[data-testid='deep-nested-btn']");
      expect(btn!.textContent).toBe("Deep Count: 6");

      // Disable level 1
      level1.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should show "Level 1 disabled"
      span = container.querySelector("div[data-hydrate='signal'] > span");
      expect(span!.textContent).toBe("Level 1 disabled");

      result.cleanup();
    });

    it("should hydrate nested conditional rendering with lists", async () => {
      const showList = signal(true);
      const showItems = signal(true);
      const items = signal(["apple", "banana", "cherry"]);

      const vnode = h(
        "div",
        {},
        h.signal(showList, (sl) =>
          sl
            ? h.signal(showItems, (si) =>
                si
                  ? h.list(
                      items,
                      (item, index) => index.toString(),
                      (item, index) =>
                        h(
                          "button",
                          {
                            onClick: () => console.log(item),
                            "data-testid": `nested-item-${index}`,
                          },
                          item
                        )
                    )
                  : h("span", {}, "Items hidden")
              )
            : h("span", {}, "List hidden")
        )
      );

      // Render to stream first
      const stream = await renderToStream(vnode);
      const html = await readStream(stream);

      // Create container and set HTML
      const container = document.createElement("div");
      container.innerHTML = html;

      // Hydrate
      const result = hydrate(vnode, container);

      // Should show all items
      let buttons = container.querySelectorAll(
        "button[data-testid^='nested-item-']"
      );
      expect(buttons.length).toBe(3);
      expect(buttons[0].textContent!.trim()).toBe("apple");
      expect(buttons[1].textContent!.trim()).toBe("banana");
      expect(buttons[2].textContent!.trim()).toBe("cherry");

      // Hide items
      showItems.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));

      let span = container.querySelector("div[data-hydrate='signal'] > span");
      expect(span!.textContent!.trim()).toBe("Items hidden");

      // Hide list
      showList.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));

      span = container.querySelector("div[data-hydrate='signal'] > span");
      expect(span!.textContent!.trim()).toBe("List hidden");

      result.cleanup();
    });

    it("should hydrate nested conditional rendering with resources", async () => {
      const showResource = signal(true);
      const showButton = signal(true);

      const vnode = h(
        "div",
        {},
        h.signal(showResource, (sr) =>
          sr
            ? h.signal(showButton, (sb) =>
                sb
                  ? h.resource(
                      async () => ({
                        message: "Hello from nested resource",
                      }),
                      {
                        loading: () =>
                          h("div", {}, "Loading nested resource..."),
                        success: (data) =>
                          h(
                            "button",
                            {
                              onClick: () => console.log(data.message),
                              "data-testid": "nested-resource-btn",
                            },
                            data.message
                          ),
                        failure: (error) =>
                          h(
                            "div",
                            {},
                            `Nested resource error: ${error.message}`
                          ),
                      }
                    )
                  : h("span", {}, "Button hidden")
              )
            : h("span", {}, "Resource hidden")
        )
      );

      // Render to stream first
      const stream = await renderToStream(vnode);
      const html = await readStream(stream);

      // Create container and set HTML
      const container = document.createElement("div");
      container.innerHTML = html;

      // Hydrate
      const result = hydrate(vnode, container);

      // Should show resource content - the button is inside the resource element
      let resourceElement = container.querySelector(
        '[data-hydrate="resource"]'
      );
      expect(resourceElement).toBeTruthy();
      // Wait for the resource to resolve and DOM to update
      await new Promise((resolve) => setTimeout(resolve, 20));
      let btn = resourceElement!.querySelector(
        "button[data-testid='nested-resource-btn']"
      );
      expect(btn).toBeTruthy();
      expect(btn!.textContent!.trim()).toBe("Hello from nested resource");

      // Hide button
      showButton.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));

      let span = container.querySelector("div[data-hydrate='signal'] > span");
      expect(span!.textContent!.trim()).toBe("Button hidden");

      // Hide resource
      showResource.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));

      span = container.querySelector("div[data-hydrate='signal'] > span");
      expect(span!.textContent!.trim()).toBe("Resource hidden");

      result.cleanup();
    });

    it("should hydrate complex nested conditional rendering with user roles", async () => {
      const user = signal({
        name: "John",
        role: "admin",
        permissions: ["read", "write"],
      });
      const showAdminPanel = signal(true);
      const showAdvancedFeatures = signal(false);
      const showDebugMode = signal(true);
      const count = signal(3);

      const vnode = h(
        "div",
        {},
        h.signal(user, (userValue) =>
          userValue.role === "admin"
            ? h.signal(showAdminPanel, (sap) =>
                sap
                  ? h.signal(showAdvancedFeatures, (saf) =>
                      saf
                        ? h.signal(showDebugMode, (sdm) =>
                            sdm
                              ? h.signal(count, (c) =>
                                  h(
                                    "button",
                                    {
                                      onClick: () => count.value++,
                                      "data-testid": "admin-debug-btn",
                                      disabled: c > 10,
                                      class: "admin-button debug-mode",
                                    },
                                    `${userValue.name}'s Debug Count: ${c}`
                                  )
                                )
                              : h("span", {}, "Debug mode disabled")
                          )
                        : h("span", {}, "Advanced features disabled")
                    )
                  : h("span", {}, "Admin panel disabled")
              )
            : h("span", {}, "Access denied - admin only")
        )
      );

      // Render to stream first
      const stream = await renderToStream(vnode);
      const html = await readStream(stream);

      // Create container and set HTML
      const container = document.createElement("div");
      container.innerHTML = html;

      // Hydrate
      const result = hydrate(vnode, container);

      // Should show "Advanced features disabled" since showAdvancedFeatures is false
      let span = container.querySelector("div[data-hydrate='signal'] > span");
      expect(span!.textContent!.trim()).toBe("Advanced features disabled");

      // Enable advanced features
      showAdvancedFeatures.value = true;
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should show "John's Debug Count: 3" since debug mode is enabled
      let btn = container.querySelector(
        "button[data-testid='admin-debug-btn']"
      );
      expect(btn).toBeTruthy();
      expect(btn!.textContent!.trim()).toBe("John's Debug Count: 3");
      expect(btn!.className).toBe("admin-button debug-mode");

      // Click the button
      btn!.dispatchEvent(new Event("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 5));

      btn = container.querySelector("button[data-testid='admin-debug-btn']");
      expect(btn!.textContent!.trim()).toBe("John's Debug Count: 4");

      // Disable admin panel
      showAdminPanel.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));

      span = container.querySelector("div[data-hydrate='signal'] > span");
      expect(span!.textContent!.trim()).toBe("Admin panel disabled");

      result.cleanup();
    });

    it("should hydrate nested conditional rendering with mixed content types", async () => {
      const showContainer = signal(true);
      const showSignals = signal(true);
      const showLists = signal(false);
      const showResources = signal(true);
      const count = signal(7);
      const items = signal(["x", "y", "z"]);

      const vnode = h(
        "div",
        {},
        h.signal(showContainer, (sc) =>
          sc
            ? h(
                "div",
                {},
                h.signal(showSignals, (ss) =>
                  ss
                    ? h.signal(count, (c) =>
                        h("span", {}, `Signal Count: ${c}`)
                      )
                    : h("span", {}, "Signals hidden")
                ),
                h.signal(showLists, (sl) =>
                  sl
                    ? h.list(
                        items,
                        (item, index) => index.toString(),
                        (item, index) => h("li", {}, `List Item: ${item}`)
                      )
                    : h("span", {}, "Lists hidden")
                ),
                h.signal(showResources, (sr) =>
                  sr
                    ? h.resource(
                        async () => ({
                          message: "Mixed content resource",
                        }),
                        {
                          loading: () =>
                            h("div", {}, "Loading mixed content..."),
                          success: (data) => h("div", {}, data.message),
                          failure: (error) =>
                            h("div", {}, `Error: ${error.message}`),
                        }
                      )
                    : h("span", {}, "Resources hidden")
                )
              )
            : h("span", {}, "Container hidden")
        )
      );

      // Render to stream first
      const stream = await renderToStream(vnode);
      const html = await readStream(stream);

      // Create container and set HTML
      const container = document.createElement("div");
      container.innerHTML = html;

      // Hydrate
      const result = hydrate(vnode, container);

      // Should show signals and resources, but not lists
      let signalSpan = container.querySelector(
        "div[data-hydrate='signal'] > span"
      );
      expect(signalSpan!.textContent!.trim()).toBe("Signal Count: 7");

      let listsSpan = Array.from(container.querySelectorAll("span")).find(
        (el) => el.textContent?.trim() === "Lists hidden"
      );
      expect(listsSpan).toBeTruthy();

      // Wait for the resource to resolve and DOM to update
      await new Promise((resolve) => setTimeout(resolve, 50));
      let resourceElement = container.querySelector(
        '[data-hydrate="resource"]'
      );
      expect(resourceElement).toBeTruthy();
      let resourceDiv = resourceElement!.querySelector(
        "div:not([data-hydrate])"
      );
      expect(resourceDiv!.textContent!.trim()).toBe("Mixed content resource");

      // Enable lists
      showLists.value = true;
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should now show list items
      let listItems = container.querySelectorAll("li");
      expect(listItems.length).toBe(3);
      expect(listItems[0].textContent).toBe("List Item: x");
      expect(listItems[1].textContent).toBe("List Item: y");
      expect(listItems[2].textContent).toBe("List Item: z");

      result.cleanup();
    });
  });

  describe("fine-grained reactivity (function children and style signals)", () => {
    it("should hydrate and update DOM for function child", async () => {
      const count = signal(10);
      // Server render
      const vnode = h("div", {}, (() => `Hydrate: ${count.value}`) as any);
      container.innerHTML = await generateHTML(vnode);
      // Hydrate
      const result = hydrate(vnode, container);
      expect(container.innerHTML).toContain("Hydrate: 10");
      count.value = 99;
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(container.innerHTML).toContain("Hydrate: 99");
      result.cleanup();
    });

    it("should hydrate and update style property for signal in style object", async () => {
      const color = signal("purple");
      const vnode = h("div", { style: { color } }, "Hydrate Style");
      container.innerHTML = await generateHTML(vnode);
      const result = hydrate(vnode, container);
      const div = container.querySelector("div");
      expect(div).toBeTruthy();
      expect(div!.style.color).toBe("purple");
      color.value = "orange";
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(div!.style.color).toBe("orange");
      result.cleanup();
    });
  });
});

describe("Multiple Lists Hydration Bug", () => {
  beforeEach(() => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body><div id="root"></div></body></html>`
    );
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    (global as any).window = dom.window;
  });

  it("should not allow multiple lists to hydrate to the same DOM element", () => {
    // Set up DOM with two separate list containers like in the HTML example
    const container = document.getElementById("root")!;
    container.innerHTML = `
      <nav>
        <div data-hydrate="list" data-hydrate-id="list_3">
          <a href="/" data-key="/">Home</a>
          <a href="/docs" data-key="/docs">Docs</a>
        </div>
      </nav>
      <main>
        <div data-hydrate="list" data-hydrate-id="list_4">
          <div data-key="feature1">Feature 1</div>
          <div data-key="feature2">Feature 2</div>
        </div>
      </main>
    `;

    // Create signals for both lists
    const navItems = signal([
      { href: "/", label: "Home" },
      { href: "/docs", label: "Docs" },
    ]);

    const features = signal([
      { id: "feature1", name: "Feature 1" },
      { id: "feature2", name: "Feature 2" },
    ]);

    // Create VNodes for both lists
    const navList = h.list(
      navItems,
      (item: any) => item.href,
      (item: any) =>
        h("a", { href: item.href, "data-key": item.href }, item.label)
    );

    const featureList = h.list(
      features,
      (item: any) => item.id,
      (item: any) => h("div", { "data-key": item.id }, item.name)
    );

    // Get references to the actual DOM elements before hydration
    const navListElement = container.querySelector(
      '[data-hydrate-id="list_3"]'
    ) as HTMLElement;
    const featureListElement = container.querySelector(
      '[data-hydrate-id="list_4"]'
    ) as HTMLElement;

    expect(navListElement).toBeTruthy();
    expect(featureListElement).toBeTruthy();
    expect(navListElement).not.toBe(featureListElement);

    // Hydrate the navigation list first
    const navResult = hydrate(navList, container);

    // Hydrate the features list second
    const featureResult = hydrate(featureList, container);

    // Verify that each list hydrated to its correct DOM element
    // The nav list should still be in the nav section
    const hydratedNavList = container.querySelector(
      'nav [data-hydrate="list"]'
    ) as HTMLElement;
    expect(hydratedNavList).toBeTruthy();
    expect(hydratedNavList.getAttribute("data-hydrate-id")).toBe("list_3");

    // The feature list should still be in the main section
    const hydratedFeatureList = container.querySelector(
      'main [data-hydrate="list"]'
    ) as HTMLElement;
    expect(hydratedFeatureList).toBeTruthy();
    expect(hydratedFeatureList.getAttribute("data-hydrate-id")).toBe("list_4");

    // Most importantly: they should be different elements
    expect(hydratedNavList).not.toBe(hydratedFeatureList);

    // Verify content is correct for each list
    expect(hydratedNavList.querySelector('[data-key="/"]')).toBeTruthy();
    expect(hydratedNavList.querySelector('[data-key="/docs"]')).toBeTruthy();

    expect(
      hydratedFeatureList.querySelector('[data-key="feature1"]')
    ).toBeTruthy();
    expect(
      hydratedFeatureList.querySelector('[data-key="feature2"]')
    ).toBeTruthy();

    // Clean up
    navResult.cleanup?.();
    featureResult.cleanup?.();
  });

  it("should handle missing list elements gracefully without affecting other lists", () => {
    const container = document.getElementById("root")!;
    container.innerHTML = `
      <div data-hydrate="list" data-hydrate-id="list_1">
        <div data-key="item1">Item 1</div>
      </div>
    `;

    const items1 = signal([{ id: "item1", name: "Item 1" }]);
    const items2 = signal([{ id: "item2", name: "Item 2" }]);

    const list1 = h.list(
      items1,
      (item: any) => item.id,
      (item: any) => h("div", { "data-key": item.id }, item.name)
    );

    // This list has no corresponding DOM element (list_2 doesn't exist)
    const list2 = h.list(
      items2,
      (item: any) => item.id,
      (item: any) => h("div", { "data-key": item.id }, item.name)
    );

    const list1Element = container.querySelector(
      '[data-hydrate-id="list_1"]'
    ) as HTMLElement;
    expect(list1Element).toBeTruthy();

    // Hydrate both lists
    const result1 = hydrate(list1, container);
    const result2 = hydrate(list2, container);

    // List 2 should either:
    // 1. Create a new element, OR
    // 2. Fail gracefully without affecting list 1
    // But it should NOT hydrate to list_1's element

    const finalList1Element = container.querySelector(
      '[data-hydrate-id="list_1"]'
    ) as HTMLElement;
    expect(finalList1Element).toBeTruthy();
    expect(finalList1Element.getAttribute("data-hydrate-id")).toBe("list_1");

    // Verify list 1 still has its correct content
    expect(finalList1Element.querySelector('[data-key="item1"]')).toBeTruthy();

    // Clean up
    result1.cleanup?.();
    result2.cleanup?.();
  });
});
