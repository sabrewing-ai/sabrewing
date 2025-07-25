import "../setup";
import { describe, test, expect } from "vitest";
import { h } from "../../lib/h";
import { signal } from "../../lib/signal";
import { renderToStream } from "../../lib/renderToStream";
import { batch } from "../../lib/signal";

describe("renderToStream", () => {
  test("renders string nodes", async () => {
    const stream = await renderToStream("Hello World");
    const result = await readStream(stream);
    expect(result).toBe("Hello World");
  });

  test("renders null and undefined nodes", async () => {
    const stream = await renderToStream(null);
    const result = await readStream(stream);
    expect(result).toBe("");
  });

  test("renders undefined nodes", async () => {
    const stream = await renderToStream(undefined);
    const result = await readStream(stream);
    expect(result).toBe("");
  });

  test("renders function nodes", async () => {
    const fn = () => h("div", {}, "Function result");
    const stream = await renderToStream(fn);
    const result = await readStream(stream);
    expect(result).toBe("<div>Function result</div>");
  });

  test("renders element nodes with attributes", async () => {
    const vnode = h("div", { id: "test", class: "container" }, "Hello");
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe('<div id="test" class="container">Hello</div>');
  });

  test("renders element nodes without attributes", async () => {
    const vnode = h("span", {}, "Hello");
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe("<span>Hello</span>");
  });

  test("renders element nodes with event handlers (filtered out)", async () => {
    const vnode = h(
      "button",
      { onClick: () => {}, onMouseEnter: () => {} },
      "Click me"
    );
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe("<button>Click me</button>");
  });

  test("renders element nodes with key prop (converted to data-key)", async () => {
    const vnode = h("div", { key: "unique", id: "test" }, "Content");
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe('<div id="test" data-key="unique">Content</div>');
  });

  test("renders element nodes with style objects", async () => {
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
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe(
      '<div style="color: red; font-size: 16px; background-color: #f0f0f0;">Styled content</div>'
    );
  });

  test("renders element nodes with mixed props including style", async () => {
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
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe(
      '<div id="container" class="main-content" style="display: flex; justify-content: center; align-items: center; min-height: 100vh;">Centered content</div>'
    );
  });

  test("renders nested element nodes", async () => {
    const vnode = h("div", {}, h("h1", {}, "Title"), h("p", {}, "Paragraph"));
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe("<div><h1>Title</h1><p>Paragraph</p></div>");
  });

  test("renders element nodes with mixed children", async () => {
    const vnode = h(
      "div",
      {},
      "Text",
      h("span", {}, "Span"),
      null,
      "More text"
    );
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe("<div>Text<span>Span</span>More text</div>");
  });

  test("renders non-object values as strings", async () => {
    const stream = await renderToStream(42);
    const result = await readStream(stream);
    expect(result).toBe("42");
  });

  test("renders objects without tag as strings", async () => {
    const stream = await renderToStream({ not: "a vnode" });
    const result = await readStream(stream);
    expect(result).toBe("[object Object]");
  });

  test("renders empty objects as empty strings", async () => {
    const stream = await renderToStream({});
    const result = await readStream(stream);
    expect(result).toBe("[object Object]");
  });
});

describe("renderToStream batching", () => {
  test("batched signal updates only affect final output", async () => {
    const count = signal(0);
    const vnode = h(
      "div",
      {},
      h.signal(count, (value) => `Count: ${value}`)
    );
    batch(() => {
      count.value = 1;
      count.value = 2;
      count.value = 3;
    });
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe(
      '<div><div data-hydrate="signal" data-hydrate-id="signal_1">  Count: 3</div></div>'
    );
  });

  test("batched updates with multiple signals", async () => {
    const a = signal(1);
    const b = signal(2);
    const vnode = h(
      "div",
      {},
      h.signal(a, (aValue) =>
        h.signal(b, (bValue) => `Sum: ${aValue + bValue}`)
      )
    );
    batch(() => {
      a.value = 10;
      b.value = 20;
    });
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe(
      '<div><div data-hydrate="signal" data-hydrate-id="signal_2">  <div data-hydrate="signal" data-hydrate-id="signal_3">    Sum: 30  </div></div></div>'
    );
  });

  test("nested batch calls with renderToStream", async () => {
    const x = signal(1);
    batch(() => {
      x.value = 2;
      batch(() => {
        x.value = 3;
      });
      x.value = 4;
    });
    const vnode = h(
      "span",
      {},
      h.signal(x, (value) => `Value: ${value}`)
    );
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe(
      '<span><div data-hydrate="signal" data-hydrate-id="signal_4">  Value: 4</div></span>'
    );
  });
});

describe("renderToStream with formatting options", () => {
  test("renders with indentation", async () => {
    const vnode = h("div", {}, h("h1", {}, "Title"), h("p", {}, "Paragraph"));
    const stream = await renderToStream(vnode, { indent: 1, indentSize: 2 });
    const result = await readStream(stream);
    expect(result).toBe(
      "  <div>  <h1>  Title  </h1>  <p>  Paragraph  </p>  </div>"
    );
  });

  test("renders with newlines", async () => {
    const vnode = h("div", {}, "Hello");
    const stream = await renderToStream(vnode, { addNewlines: true });
    const result = await readStream(stream);
    expect(result).toBe("<div>\nHello\n</div>\n");
  });

  test("renders with custom indent size", async () => {
    const vnode = h("div", {}, "Hello");
    const stream = await renderToStream(vnode, { indent: 2, indentSize: 4 });
    const result = await readStream(stream);
    expect(result).toBe("        <div>        Hello        </div>");
  });

  test("renders with all formatting options", async () => {
    const vnode = h("div", {}, h("h1", {}, "Title"), h("p", {}, "Paragraph"));
    const stream = await renderToStream(vnode, {
      indent: 1,
      indentSize: 3,
      addNewlines: true,
    });
    const result = await readStream(stream);
    expect(result).toBe(
      "   <div>\n   <h1>\n   Title\n   </h1>\n   <p>\n   Paragraph\n   </p>\n   </div>\n"
    );
  });
});

describe("renderToStream with resource nodes", () => {
  test("renders resource nodes successfully", async () => {
    const resource = h.resource(async () => ({ title: "Test Post" }), {
      loading: () => h("div", {}, "Loading..."),
      success: (data) => h("div", {}, data.title),
      failure: (error) => h("div", {}, `Error: ${error.message}`),
    });

    const stream = await renderToStream(resource);
    const result = await readStream(stream);
    expect(result).toContain("Test Post");
    expect(result).toContain('data-hydrate="resource"');
  });

  test("renders resource nodes with failure", async () => {
    const resource = h.resource(
      async () => {
        throw new Error("Network error");
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data: { title: string }) => h("div", {}, data.title),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      }
    );

    const stream = await renderToStream(resource);
    const result = await readStream(stream);
    expect(result).toContain("Error: Network error");
    expect(result).toContain('data-hydrate="resource"');
  });

  test("renders resource nodes with non-Error exceptions", async () => {
    const resource = h.resource(
      async () => {
        throw "String error";
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data: { title: string }) => h("div", {}, data.title),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      }
    );

    const stream = await renderToStream(resource);
    const result = await readStream(stream);
    expect(result).toContain("Error: String error");
    expect(result).toContain('data-hydrate="resource"');
  });

  test("handles parallel resource loading", async () => {
    const resource1 = h.resource(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { id: 1 };
      },
      {
        loading: () => h("div", {}, "Loading 1"),
        success: (data) => h("div", {}, `Post ${data.id}`),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      }
    );

    const resource2 = h.resource(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: 2 };
      },
      {
        loading: () => h("div", {}, "Loading 2"),
        success: (data) => h("div", {}, `Post ${data.id}`),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      }
    );

    const vnode = h("div", {}, resource1, resource2);
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toContain("Post 1");
    expect(result).toContain("Post 2");
    expect(result).toContain('data-hydrate="resource"');
  });

  test("embeds serialized resource data", async () => {
    const resource = h.resource(async () => ({ title: "Test Post" }), {
      loading: () => h("div", {}, "Loading..."),
      success: (data) => h("div", {}, data.title),
      failure: (error) => h("div", {}, `Error: ${error.message}`),
    });

    const stream = await renderToStream(resource);
    const result = await readStream(stream);

    // Check that the HTML contains the resource content (with hydration wrapper)
    expect(result).toContain("Test Post");
    expect(result).toContain('data-hydrate="resource"');

    // Check that serialized data is embedded
    expect(result).toContain(
      '<script type="application/json" id="sabrewing-resource-data">'
    );
    expect(result).toContain('"data":{"title":"Test Post"}');
    expect(result).toContain('"status":"success"');
  });

  test("embeds error data when resource fails", async () => {
    const resource = h.resource(
      async () => {
        throw new Error("Network error");
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data: { title: string }) => h("div", {}, data.title),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      }
    );

    const stream = await renderToStream(resource);
    const result = await readStream(stream);

    // Check that the HTML contains the error content (with hydration wrapper)
    expect(result).toContain("Error: Network error");
    expect(result).toContain('data-hydrate="resource"');

    // Check that error data is embedded
    expect(result).toContain(
      '<script type="application/json" id="sabrewing-resource-data">'
    );
    expect(result).toContain('"status":"error"');
    expect(result).toContain('"error":"Network error"');
  });

  test("always embeds serialized data for resources", async () => {
    const resource = h.resource(async () => ({ title: "Test Post" }), {
      loading: () => h("div", {}, "Loading..."),
      success: (data) => h("div", {}, data.title),
      failure: (error) => h("div", {}, `Error: ${error.message}`),
    });

    const stream = await renderToStream(resource);
    const result = await readStream(stream);

    // Check that the HTML contains the resource content with hydration wrapper
    expect(result).toContain("Test Post");
    expect(result).toContain('data-hydrate="resource"');

    // Check that serialized data is always embedded
    expect(result).toContain("sabrewing-resource-data");
  });
});

describe("renderToStream with resource nodes (catch block)", () => {
  test("resource rejects with a string", async () => {
    const resource = h.resource(
      async () => {
        throw "String error!";
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data: any) => h("div", {}, data.title),
        failure: (error: Error) => {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toBe("String error!");
          return h("div", {}, `Error: ${error.message}`);
        },
      }
    );
    const stream = await renderToStream(resource);
    const result = await readStream(stream);
    expect(result).toContain("Error: String error!");
    expect(result).toContain('data-hydrate="resource"');
  });

  test("resource rejects with a number", async () => {
    const resource = h.resource(
      async () => {
        throw 404;
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data: any) => h("div", {}, data.title),
        failure: (error: Error) => {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toBe("404");
          return h("div", {}, `Error: ${error.message}`);
        },
      }
    );
    const stream = await renderToStream(resource);
    const result = await readStream(stream);
    expect(result).toContain("Error: 404");
    expect(result).toContain('data-hydrate="resource"');
  });
});

describe("renderToStream with signal nodes", () => {
  test("renders signal nodes", async () => {
    const count = signal(42);
    const signalNode = h.signal(count, (value) =>
      h("span", {}, `Count: ${value}`)
    );

    const stream = await renderToStream(signalNode);
    const result = await readStream(stream);
    expect(result).toContain("Count: 42");
    expect(result).toContain('data-hydrate="signal"');
  });

  test("renders nested signal nodes", async () => {
    const count = signal(10);
    const multiplier = signal(5);

    const vnode = h(
      "div",
      {},
      h.signal(count, (value) => h("span", {}, `Count: ${value}`)),
      h.signal(multiplier, (value) => h("span", {}, `Multiplier: ${value}`))
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toContain("Count: 10");
    expect(result).toContain("Multiplier: 5");
    expect(result).toContain('data-hydrate="signal"');
  });
});

describe("renderToStream with list nodes", () => {
  test("renders list nodes", async () => {
    const items = signal(["apple", "banana", "cherry"]);
    const listNode = h.list(
      items,
      (item, index) => index.toString(),
      (item, index) => h("li", {}, item)
    );

    const stream = await renderToStream(listNode);
    const result = await readStream(stream);
    expect(result).toContain("apple");
    expect(result).toContain("banana");
    expect(result).toContain("cherry");
    expect(result).toContain('data-hydrate="list"');
  });

  test("renders empty list nodes", async () => {
    const items = signal([]);
    const listNode = h.list(
      items,
      (item, index) => index.toString(),
      (item, index) => h("li", {}, item)
    );

    const stream = await renderToStream(listNode);
    const result = await readStream(stream);
    expect(result).toContain('data-hydrate="list"');
    expect(result).not.toContain("<li>");
  });

  test("renders nested list nodes", async () => {
    const items = signal([
      { name: "John", age: 30 },
      { name: "Jane", age: 25 },
    ]);
    const listNode = h.list(
      items,
      (item, index) => index.toString(),
      (item, index) =>
        h("div", {}, h("span", {}, item.name), h("span", {}, ` (${item.age})`))
    );

    const stream = await renderToStream(listNode);
    const result = await readStream(stream);
    expect(result).toContain("John");
    expect(result).toContain("Jane");
    expect(result).toContain("(30)");
    expect(result).toContain("(25)");
    expect(result).toContain('data-hydrate="list"');
  });
});

describe("renderToStream with complex nested structures", () => {
  test("renders deeply nested structures", async () => {
    const vnode = h(
      "div",
      {},
      h(
        "header",
        {},
        h("h1", {}, "Title"),
        h(
          "nav",
          {},
          h("a", { href: "#" }, "Home"),
          h("a", { href: "#" }, "About")
        )
      ),
      h(
        "main",
        {},
        h("article", {}, h("h2", {}, "Article"), h("p", {}, "Content"))
      ),
      h("footer", {}, "Footer")
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toBe(
      '<div><header><h1>Title</h1><nav><a href="#">Home</a><a href="#">About</a></nav></header><main><article><h2>Article</h2><p>Content</p></article></main><footer>Footer</footer></div>'
    );
  });

  test("renders mixed content types", async () => {
    const count = signal(5);
    const items = signal(["a", "b", "c"]);

    const vnode = h(
      "div",
      {},
      "Static text",
      h.signal(count, (value) => h("span", {}, `Count: ${value}`)),
      h.list(
        items,
        (item, index) => index.toString(),
        (item, index) => h("li", {}, item)
      ),
      h.resource(async () => ({ message: "Hello" }), {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data.message),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      })
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toContain("Static text");
    expect(result).toContain("Count: 5");
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result).toContain("Hello");
    expect(result).toContain('data-hydrate="signal"');
    expect(result).toContain('data-hydrate="list"');
    expect(result).toContain('data-hydrate="resource"');
  });
});

describe("renderToStream with conditional button tests", () => {
  test("should render conditional button with signals and events", async () => {
    const open = signal(false);
    const count = signal(0);

    const vnode = h(
      "div",
      {},
      h.signal(open, (isOpen) =>
        isOpen
          ? h.signal(count, (countValue) =>
              h(
                "button",
                {
                  onClick: () => count.value++,
                  "data-testid": "my-btn",
                  disabled: countValue > 10,
                },
                `Count: ${countValue}`
              )
            )
          : null
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Initially button should not be present (open is false)
    expect(result).not.toContain("button");
    expect(result).not.toContain("Count: 0");
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should render conditional button when signal is true", async () => {
    const open = signal(true);
    const count = signal(5);

    const vnode = h(
      "div",
      {},
      h.signal(open, (isOpen) =>
        isOpen
          ? h.signal(count, (countValue) =>
              h(
                "button",
                {
                  onClick: () => count.value++,
                  "data-testid": "my-btn",
                  disabled: countValue > 10,
                },
                `Count: ${countValue}`
              )
            )
          : null
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Button should be present when open is true
    expect(result).toContain("<button");
    expect(result).toContain("Count: 5");
    expect(result).toContain('data-testid="my-btn"');
    expect(result).not.toContain("disabled"); // count is 5, not > 10, so disabled should not be present
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should render disabled button when count exceeds threshold", async () => {
    const open = signal(true);
    const count = signal(15);

    const vnode = h(
      "div",
      {},
      h.signal(open, (isOpen) =>
        isOpen
          ? h.signal(count, (countValue) =>
              h(
                "button",
                {
                  onClick: () => count.value++,
                  "data-testid": "my-btn",
                  disabled: countValue > 10,
                },
                `Count: ${countValue}`
              )
            )
          : null
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Button should be present and disabled
    expect(result).toContain("<button");
    expect(result).toContain("Count: 15");
    expect(result).toContain("disabled");
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should filter out event handlers in server rendering", async () => {
    const open = signal(true);
    const count = signal(3);

    const vnode = h(
      "div",
      {},
      h.signal(open, (isOpen) =>
        isOpen
          ? h.signal(count, (countValue) =>
              h(
                "button",
                {
                  onClick: () => count.value++,
                  onMouseEnter: () => console.log("hover"),
                  onFocus: () => console.log("focus"),
                  "data-testid": "my-btn",
                  disabled: countValue > 10,
                },
                `Count: ${countValue}`
              )
            )
          : null
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Event handlers should be filtered out
    expect(result).toContain("<button");
    expect(result).toContain("Count: 3");
    expect(result).toContain('data-testid="my-btn"');
    expect(result).not.toContain("onClick");
    expect(result).not.toContain("onMouseEnter");
    expect(result).not.toContain("onFocus");
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should handle batched signal updates in conditional rendering", async () => {
    const open = signal(false);
    const count = signal(0);

    // Update signals in batch
    batch(() => {
      open.value = true;
      count.value = 7;
    });

    const vnode = h(
      "div",
      {},
      h.signal(open, (isOpen) =>
        isOpen
          ? h.signal(count, (countValue) =>
              h(
                "button",
                {
                  onClick: () => count.value++,
                  "data-testid": "my-btn",
                  disabled: countValue > 10,
                },
                `Count: ${countValue}`
              )
            )
          : null
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should render with batched values
    expect(result).toContain("<button");
    expect(result).toContain("Count: 7");
    expect(result).not.toContain("disabled"); // count is 7, not > 10, so disabled should not be present
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should handle nested conditional rendering", async () => {
    const showContainer = signal(true);
    const showButton = signal(false);
    const count = signal(2);

    const vnode = h(
      "div",
      {},
      h.signal(showContainer, (showContainerValue) =>
        showContainerValue
          ? h.signal(showButton, (showButtonValue) =>
              showButtonValue
                ? h.signal(count, (countValue) =>
                    h(
                      "button",
                      {
                        onClick: () => count.value++,
                        "data-testid": "nested-btn",
                        disabled: countValue > 10,
                      },
                      `Nested Count: ${countValue}`
                    )
                  )
                : h("span", {}, "Button hidden")
            )
          : null
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show "Button hidden" since showButton is false
    expect(result).toContain("Button hidden");
    expect(result).not.toContain("Nested Count: 2");
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should handle complex conditional rendering with multiple signals", async () => {
    const user = signal({ name: "John", isAdmin: true });
    const showAdvanced = signal(false);
    const count = signal(5);

    const vnode = h(
      "div",
      {},
      h.signal(user, (userValue) =>
        userValue.isAdmin
          ? h.signal(showAdvanced, (showAdvancedValue) =>
              showAdvancedValue
                ? h.signal(count, (countValue) =>
                    h(
                      "button",
                      {
                        onClick: () => count.value++,
                        "data-testid": "admin-btn",
                        disabled: countValue > 10,
                        class: "admin-button",
                      },
                      `${userValue.name}'s Count: ${countValue}`
                    )
                  )
                : h("span", {}, "Advanced features disabled")
            )
          : h("span", {}, "Access denied")
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show "Advanced features disabled" since showAdvanced is false
    expect(result).toContain("Advanced features disabled");
    expect(result).not.toContain("John's Count: 5");
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should handle conditional rendering with list inside signal", async () => {
    const showList = signal(true);
    const items = signal(["apple", "banana", "cherry"]);

    const vnode = h(
      "div",
      {},
      h.signal(showList, (showListValue) =>
        showListValue
          ? h.list(
              items,
              (item, index) => index.toString(),
              (item, index) =>
                h(
                  "button",
                  {
                    onClick: () => console.log(item),
                    "data-testid": `item-${index}`,
                  },
                  item
                )
            )
          : h("span", {}, "List hidden")
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show list items
    expect(result).toContain("apple");
    expect(result).toContain("banana");
    expect(result).toContain("cherry");
    expect(result).toContain('data-testid="item-0"');
    expect(result).toContain('data-testid="item-1"');
    expect(result).toContain('data-testid="item-2"');
    expect(result).toContain('data-hydrate="signal"');
    expect(result).toContain('data-hydrate="list"');
  });

  test("should handle conditional rendering with resource inside signal", async () => {
    const showResource = signal(true);

    const vnode = h(
      "div",
      {},
      h.signal(showResource, (showResourceValue) =>
        showResourceValue
          ? h.resource(async () => ({ message: "Hello from resource" }), {
              loading: () => h("div", {}, "Loading resource..."),
              success: (data) =>
                h(
                  "button",
                  {
                    onClick: () => console.log(data.message),
                    "data-testid": "resource-btn",
                  },
                  data.message
                ),
              failure: (error) =>
                h("div", {}, `Resource error: ${error.message}`),
            })
          : h("span", {}, "Resource hidden")
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show resource content
    expect(result).toContain("Hello from resource");
    expect(result).toContain('data-testid="resource-btn"');
    expect(result).toContain('data-hydrate="signal"');
    expect(result).toContain('data-hydrate="resource"');
  });
});

describe("renderToStream with nested conditional tests", () => {
  test("should handle deeply nested conditional rendering", async () => {
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

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show "Level 2 disabled" since level2 is false
    expect(result).toContain("Level 2 disabled");
    expect(result).not.toContain("Deep Count: 5");
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should handle nested conditional rendering with lists", async () => {
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

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show all items
    expect(result).toContain("apple");
    expect(result).toContain("banana");
    expect(result).toContain("cherry");
    expect(result).toContain('data-testid="nested-item-0"');
    expect(result).toContain('data-testid="nested-item-1"');
    expect(result).toContain('data-testid="nested-item-2"');
    expect(result).toContain('data-hydrate="signal"');
    expect(result).toContain('data-hydrate="list"');
  });

  test("should handle nested conditional rendering with resources", async () => {
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

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show resource content
    expect(result).toContain("Hello from nested resource");
    expect(result).toContain('data-testid="nested-resource-btn"');
    expect(result).toContain('data-hydrate="signal"');
    expect(result).toContain('data-hydrate="resource"');
  });

  test("should handle complex nested conditional rendering with user roles", async () => {
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

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show "Advanced features disabled" since showAdvancedFeatures is false
    expect(result).toContain("Advanced features disabled");
    expect(result).not.toContain("John's Debug Count: 3");
    expect(result).toContain('data-hydrate="signal"');
  });

  test("should handle nested conditional rendering with mixed content types", async () => {
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
                  ? h.signal(count, (c) => h("span", {}, `Signal Count: ${c}`))
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
                      async () => ({ message: "Mixed content resource" }),
                      {
                        loading: () => h("div", {}, "Loading mixed content..."),
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

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should show signals and resources, but not lists
    expect(result).toContain("Signal Count: 7");
    expect(result).toContain("Lists hidden");
    expect(result).toContain("Mixed content resource");
    expect(result).not.toContain("List Item: x");
    expect(result).toContain('data-hydrate="signal"');
    expect(result).toContain('data-hydrate="resource"');
  });
});

describe("renderToStream with checked attribute", () => {
  test("should handle checked attribute correctly", async () => {
    const isChecked = signal(true);
    const isUnchecked = signal(false);

    const vnode = h(
      "div",
      {},
      h("input", {
        type: "checkbox",
        checked: isChecked.value,
        "data-testid": "checked-input",
      }),
      h("input", {
        type: "checkbox",
        checked: isUnchecked.value,
        "data-testid": "unchecked-input",
      })
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Checked input should have checked attribute without value
    expect(result).toContain('data-testid="checked-input"');
    expect(result).toContain("checked");
    expect(result).not.toContain('checked="true"');

    // Unchecked input should not have checked attribute
    expect(result).toContain('data-testid="unchecked-input"');
    expect(result).not.toContain('checked="false"');
  });
});

describe("renderToStream with all boolean attributes", () => {
  test("should handle all boolean attributes correctly", async () => {
    const booleanAttrs = [
      "readonly",
      "required",
      "multiple",
      "autofocus",
      "autoplay",
      "controls",
      "loop",
      "muted",
      "novalidate",
      "open",
      "scoped",
      "seamless",
      "async",
      "defer",
    ];

    const vnode = h(
      "div",
      {},
      ...booleanAttrs.map((attr) =>
        h("input", { [attr]: true, "data-testid": `${attr}-true` })
      ),
      ...booleanAttrs.map((attr) =>
        h("input", { [attr]: false, "data-testid": `${attr}-false` })
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // All boolean attributes should be present without values
    booleanAttrs.forEach((attr) => {
      expect(result).toContain(attr);
      expect(result).not.toContain(`${attr}="true"`);
      expect(result).not.toContain(`${attr}="false"`);
    });
  });
});

describe("renderToStream with SVG attributes", () => {
  test("should handle SVG attributes correctly", async () => {
    const vnode = h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 24 24",
        strokeWidth: "1.5",
        fillOpacity: "0.8",
      },
      h("path", {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        fillRule: "evenodd",
        clipRule: "evenodd",
        d: "M12 6v12m6-6H6",
      })
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // SVG attributes should be converted to kebab-case
    expect(result).toContain('stroke-width="1.5"');
    expect(result).toContain('fill-opacity="0.8"');
    expect(result).toContain('stroke-linecap="round"');
    expect(result).toContain('stroke-linejoin="round"');
    expect(result).toContain('fill-rule="evenodd"');
    expect(result).toContain('clip-rule="evenodd"');

    // Regular attributes should remain unchanged
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('viewBox="0 0 24 24"');
    expect(result).toContain('d="M12 6v12m6-6H6"');

    // Should not contain camelCase versions
    expect(result).not.toContain("strokeWidth");
    expect(result).not.toContain("strokeLinecap");
    expect(result).not.toContain("strokeLinejoin");
  });

  test("should handle untracked async functions in resources", async () => {
    const dep = signal("A");
    let fetchCallCount = 0;

    const fetchData = async () => {
      fetchCallCount++;
      // This access should NOT establish a dependency because it's in untracked context
      const value = dep.value;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return `Data: ${value}`;
    };

    const vnode = h.resource(
      fetchData,
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      },
      [dep] // Dependency array for explicit tracking
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should contain the resource HTML
    expect(result).toContain('data-hydrate="resource"');
    expect(result).toContain("Data: A");

    // Should contain serialized data
    expect(result).toContain('id="sabrewing-resource-data"');
    expect(result).toContain('"data":"Data: A"');

    // Should have fetched once during server-side rendering
    expect(fetchCallCount).toBe(1);
  });

  test("should handle multiple resources with untracked async functions", async () => {
    const dep1 = signal("A");
    const dep2 = signal(1);
    let fetch1Count = 0;
    let fetch2Count = 0;

    const fetchData1 = async () => {
      fetch1Count++;
      const value = dep1.value;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return `Data1: ${value}`;
    };

    const fetchData2 = async () => {
      fetch2Count++;
      const value = dep2.value;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return `Data2: ${value}`;
    };

    const vnode = h(
      "div",
      {},
      h.resource(
        fetchData1,
        {
          loading: () => h("div", {}, "Loading 1..."),
          success: (data) => h("div", {}, data),
          failure: (error) => h("div", {}, `Error: ${error.message}`),
        },
        [dep1]
      ),
      h.resource(
        fetchData2,
        {
          loading: () => h("div", {}, "Loading 2..."),
          success: (data) => h("div", {}, data),
          failure: (error) => h("div", {}, `Error: ${error.message}`),
        },
        [dep2]
      )
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should contain both resources
    expect(result).toContain("Data1: A");
    expect(result).toContain("Data2: 1");

    // Should contain serialized data for both resources
    expect(result).toContain('"data":"Data1: A"');
    expect(result).toContain('"data":"Data2: 1"');

    // Should have fetched both during server-side rendering
    expect(fetch1Count).toBe(1);
    expect(fetch2Count).toBe(1);
  });
});

describe("renderToStream with hydration fetch prevention", () => {
  test("should not make fetch calls after hydration when data is already available", async () => {
    let fetchCallCount = 0;
    const dep = signal(1);

    const fetchData = async () => {
      fetchCallCount++;
      const value = dep.value;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return `Data: ${value}`;
    };

    const vnode = h.resource(
      fetchData,
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      },
      [dep] // Dependency array for explicit tracking
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should contain the resource HTML with hydration data
    expect(result).toContain('data-hydrate="resource"');
    expect(result).toContain("Data: 1");
    expect(result).toContain('id="sabrewing-resource-data"');
    expect(result).toContain('"data":"Data: 1"');

    // Should have fetched once during server-side rendering
    expect(fetchCallCount).toBe(1);

    // Simulate hydration by creating a DOM element and hydrating
    const container = document.createElement("div");
    container.innerHTML = result;
    document.body.appendChild(container);

    // Import and use the hydration function
    const { hydrate } = await import("../../lib/hydration");

    // Hydrate the component
    const { cleanup } = hydrate(vnode, container);

    // Wait for any microtasks to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The fetch should not be called again during hydration
    expect(fetchCallCount).toBe(1);

    // Clean up
    cleanup();
    document.body.removeChild(container);
  });

  test("should make fetch calls after hydration when dependencies change", async () => {
    let fetchCallCount = 0;
    const dep = signal(1);

    const fetchData = async () => {
      fetchCallCount++;
      const value = dep.value;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return `Data: ${value}`;
    };

    const vnode = h.resource(
      fetchData,
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      },
      [dep]
    );

    const stream = await renderToStream(vnode);
    const result = await readStream(stream);

    // Should have fetched once during server-side rendering
    expect(fetchCallCount).toBe(1);

    // Simulate hydration
    const container = document.createElement("div");
    container.innerHTML = result;
    document.body.appendChild(container);

    const { hydrate } = await import("../../lib/hydration");
    const { cleanup } = hydrate(vnode, container);

    // Wait for hydration to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should still only have fetched once
    expect(fetchCallCount).toBe(1);

    // Change the dependency - this should trigger a new fetch
    dep.value = 2;

    // Wait for the effect to run
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should have fetched again due to dependency change
    expect(fetchCallCount).toBe(2);

    // Clean up
    cleanup();
    document.body.removeChild(container);
  });
});

describe("fine-grained reactivity (function children and style signals)", () => {
  test("renders function child with initial signal value", async () => {
    const count = signal(7);
    const vnode = h("div", {}, (() => `SSR: ${count.value}`) as any);
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toContain("SSR: 7");
  });

  test("renders style object with signal initial value", async () => {
    const color = signal("green");
    const vnode = h("div", { style: { color } }, "Styled SSR");
    const stream = await renderToStream(vnode);
    const result = await readStream(stream);
    expect(result).toContain('style="color: green;');
    expect(result).toContain("Styled SSR");
  });
});

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
