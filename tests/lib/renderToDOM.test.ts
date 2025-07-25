import "../setup";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { h, signal } from "../../lib";
import { renderToDOM } from "../../lib/renderToDOM";

describe("renderToDOM", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clear the container completely
    container.innerHTML = "";
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it("should render basic elements", () => {
    const vnode = h("div", { class: "test" }, "Hello World");
    const cleanup = renderToDOM(vnode, container);

    expect(container.innerHTML).toBe('<div class="test">Hello World</div>');
    cleanup();
  });

  it("should render reactive signals", async () => {
    const count = signal(0);
    const vnode = h.signal(count, (value) => h("span", {}, `Count: ${value}`));

    const cleanup = renderToDOM(vnode, container);

    expect(container.innerHTML).toContain("Count: 0");

    count.value = 5;
    // Wait for next tick for reactivity
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(container.innerHTML).toContain("Count: 5");

    cleanup();
  });

  it("should render reactive lists", async () => {
    const items = signal(["a", "b", "c"]);
    const vnode = h.list(
      items,
      (item, index) => index.toString(),
      (item, index) => h("li", {}, item)
    );

    const cleanup = renderToDOM(vnode, container);

    expect(container.innerHTML).toContain("a");
    expect(container.innerHTML).toContain("b");
    expect(container.innerHTML).toContain("c");

    items.value = ["x", "y"];
    // Wait for next tick for reactivity
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(container.innerHTML).toContain("x");
    expect(container.innerHTML).toContain("y");
    expect(container.innerHTML).not.toContain("c");

    cleanup();
  });

  it("should render resources with loading states", async () => {
    const asyncData = () => Promise.resolve("loaded data");
    const vnode = h.resource(asyncData, {
      loading: () => h("div", {}, "Loading..."),
      success: (data) => h("div", {}, `Success: ${data}`),
      failure: (error) => h("div", {}, `Error: ${error.message}`),
    });

    const cleanup = renderToDOM(vnode, container);

    // Initially should show loading
    expect(container.innerHTML).toContain("Loading...");

    // Wait for async resolution
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(container.innerHTML).toContain("Success: loaded data");

    cleanup();
  });

  it("should handle event listeners", () => {
    let clicked = false;
    const handleClick = () => {
      clicked = true;
    };

    const vnode = h("button", { onClick: handleClick }, "Click me");
    const cleanup = renderToDOM(vnode, container);

    const button = container.querySelector("button");
    expect(button).toBeTruthy();

    button!.click();
    expect(clicked).toBe(true);

    cleanup();
  });

  it("should render elements with style objects", () => {
    const vnode = h(
      "div",
      {
        style: {
          color: "red",
          fontSize: "16px",
          backgroundColor: "blue",
        },
      },
      "Styled content"
    );
    const cleanup = renderToDOM(vnode, container);

    expect(container.innerHTML).toBe(
      '<div style="color: red; font-size: 16px; background-color: blue;">Styled content</div>'
    );
    cleanup();
  });

  it("should render elements with mixed props including style", () => {
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
    const cleanup = renderToDOM(vnode, container);

    expect(container.innerHTML).toBe(
      '<div id="container" class="main-content" style="display: flex; justify-content: center; align-items: center; min-height: 100vh;">Centered content</div>'
    );
    cleanup();
  });

  it("should cleanup effects and signals properly", async () => {
    const count = signal(0);
    let effectRunCount = 0;

    const vnode = h.signal(count, (value) => {
      effectRunCount++;
      return h("span", {}, `Count: ${value}`);
    });

    const cleanup = renderToDOM(vnode, container);

    // Effect runs once for initial render (may run twice due to signal access)
    expect(effectRunCount).toBeGreaterThanOrEqual(1);

    count.value = 5;
    // Wait for next tick for reactivity
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(effectRunCount).toBeGreaterThanOrEqual(2);

    cleanup();

    // After cleanup, changing the signal should not trigger effects
    const effectCountAfterCleanup = effectRunCount;
    count.value = 10;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(effectRunCount).toBe(effectCountAfterCleanup); // Should not have increased
  });

  it("should handle nested reactive components", async () => {
    const outerCount = signal(0);
    const innerCount = signal(100);

    const vnode = h(
      "div",
      {},
      h.signal(outerCount, (outer) =>
        h(
          "div",
          {},
          `Outer: ${outer}`,
          h.signal(innerCount, (inner) => h("span", {}, `Inner: ${inner}`))
        )
      )
    );

    const cleanup = renderToDOM(vnode, container);

    expect(container.innerHTML).toContain("Outer: 0");
    expect(container.innerHTML).toContain("Inner: 100");

    outerCount.value = 5;
    innerCount.value = 200;

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(container.innerHTML).toContain("Outer: 5");
    expect(container.innerHTML).toContain("Inner: 200");

    cleanup();
  });

  it("should refetch resource when dependencies change", async () => {
    const dep = signal("A");
    let fetchCount = 0;

    const resource = h.resource(
      async () => {
        fetchCount++;
        // Access signal synchronously to establish dependency
        const value = dep.value;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return `Data: ${value}`;
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      },
      [dep]
    );

    const cleanup = renderToDOM(resource, container);

    // Initially should show loading
    expect(container.innerHTML).toContain("Loading...");
    expect(fetchCount).toBe(1);

    // Wait for initial fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toContain("Data: A");

    // Change dependency - should trigger refetch
    dep.value = "B";

    // Wait a bit for the effect to run and show loading
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fetchCount).toBe(2);

    // Wait for refetch to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toContain("Data: B");

    // Change dependency again
    dep.value = "C";
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(container.innerHTML).toContain("Data: C");
    expect(fetchCount).toBe(3);

    cleanup();
  });

  it("should handle conditionally rendered button with signals and events", async () => {
    const open = signal(false);
    const count = signal(0);

    // Create a more explicit event handler
    const handleClick = () => {
      count.value++;
    };

    const vnode = h(
      "div",
      {},
      h.signal(open, (isOpen) =>
        isOpen
          ? h.signal(count, (countValue) =>
              h(
                "button",
                {
                  onClick: handleClick,
                  "data-testid": "my-btn",
                  disabled: countValue > 10,
                },
                `Count: ${countValue}`
              )
            )
          : null
      )
    );

    const cleanup = renderToDOM(vnode, container);

    // Initially button should not be present (open is false)
    let btn = container.querySelector("button[data-testid='my-btn']");
    expect(btn).toBeNull();

    // Open the button
    open.value = true;
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Now the button should appear
    btn = container.querySelector("button[data-testid='my-btn']");
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toBe("Count: 0");

    // Click the button a few times
    for (let i = 0; i < 3; i++) {
      btn = container.querySelector("button[data-testid='my-btn']");
      // Use dispatchEvent for reliable event triggering in tests
      btn!.dispatchEvent(new Event("click", { bubbles: true }));
      // Wait a bit for the signal update to propagate
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    btn = container.querySelector("button[data-testid='my-btn']");
    expect(btn!.textContent).toBe("Count: 3");

    // Set count > 10, should disable the button
    count.value = 11;
    await new Promise((resolve) => setTimeout(resolve, 10));
    btn = container.querySelector("button[data-testid='my-btn']");
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    // Close the button
    open.value = false;
    await new Promise((resolve) => setTimeout(resolve, 10));
    btn = container.querySelector("button[data-testid='my-btn']");
    expect(btn).toBeNull();

    cleanup();
  });

  it("should handle deeply nested conditional rendering", async () => {
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

    const cleanup = renderToDOM(vnode, container);

    // Should show "Level 2 disabled" since level2 is false
    let span = container.querySelector("span");
    expect(span!.textContent).toBe("Level 2 disabled");

    // Enable level 2
    level2.value = true;
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should show "Deep Count: 5" since all levels are now true
    let btn = container.querySelector("button[data-testid='deep-nested-btn']");
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
    span = container.querySelector("span");
    expect(span!.textContent).toBe("Level 1 disabled");

    cleanup();
  });

  it("should handle nested conditional rendering with lists", async () => {
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

    const cleanup = renderToDOM(vnode, container);

    // Should show all items
    let buttons = container.querySelectorAll(
      "button[data-testid^='nested-item-']"
    );
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toBe("apple");
    expect(buttons[1].textContent).toBe("banana");
    expect(buttons[2].textContent).toBe("cherry");

    // Hide items
    showItems.value = false;
    await new Promise((resolve) => setTimeout(resolve, 10));

    let span = container.querySelector("span");
    expect(span!.textContent).toBe("Items hidden");

    // Hide list
    showList.value = false;
    await new Promise((resolve) => setTimeout(resolve, 10));

    span = container.querySelector("span");
    expect(span!.textContent).toBe("List hidden");

    cleanup();
  });

  it("should handle nested conditional rendering with resources", async () => {
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
                    async () => ({ message: "Hello from nested resource" }),
                    {
                      loading: () => h("div", {}, "Loading nested resource..."),
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
                        h("div", {}, `Nested resource error: ${error.message}`),
                    }
                  )
                : h("span", {}, "Button hidden")
            )
          : h("span", {}, "Resource hidden")
      )
    );

    const cleanup = renderToDOM(vnode, container);

    // Wait for resource to load
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should show resource content
    let btn = container.querySelector(
      "button[data-testid='nested-resource-btn']"
    );
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toBe("Hello from nested resource");

    // Hide button
    showButton.value = false;
    await new Promise((resolve) => setTimeout(resolve, 10));

    let span = container.querySelector("span");
    expect(span!.textContent).toBe("Button hidden");

    // Hide resource
    showResource.value = false;
    await new Promise((resolve) => setTimeout(resolve, 10));

    span = container.querySelector("span");
    expect(span!.textContent).toBe("Resource hidden");

    cleanup();
  });

  it("should handle complex nested conditional rendering with user roles", async () => {
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

    const cleanup = renderToDOM(vnode, container);

    // Should show "Advanced features disabled" since showAdvancedFeatures is false
    let span = container.querySelector("span");
    expect(span!.textContent).toBe("Advanced features disabled");

    // Enable advanced features
    showAdvancedFeatures.value = true;
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should show "John's Debug Count: 3" since debug mode is enabled
    let btn = container.querySelector("button[data-testid='admin-debug-btn']");
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toBe("John's Debug Count: 3");
    expect(btn!.className).toBe("admin-button debug-mode");

    // Click the button
    btn!.dispatchEvent(new Event("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));

    btn = container.querySelector("button[data-testid='admin-debug-btn']");
    expect(btn!.textContent).toBe("John's Debug Count: 4");

    // Disable admin panel
    showAdminPanel.value = false;
    await new Promise((resolve) => setTimeout(resolve, 10));

    span = container.querySelector("span");
    expect(span!.textContent).toBe("Admin panel disabled");

    cleanup();
  });

  describe("fine-grained reactivity (function children and style signals)", () => {
    it("should update DOM when function child returns a signal value", async () => {
      const count = signal(1);
      const vnode = h("div", {}, (() => `Count: ${count.value}`) as any);
      const cleanup = renderToDOM(vnode, container);
      expect(container.innerHTML).toContain("Count: 1");
      count.value = 42;
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(container.innerHTML).toContain("Count: 42");
      cleanup();
    });

    it("should update style property when signal in style object changes", async () => {
      const color = signal("red");
      const vnode = h("div", { style: { color } }, "Styled");
      const cleanup = renderToDOM(vnode, container);
      const div = container.querySelector("div");
      expect(div).toBeTruthy();
      expect(div!.style.color).toBe("red");
      color.value = "blue";
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(div!.style.color).toBe("blue");
      cleanup();
    });
  });
});
