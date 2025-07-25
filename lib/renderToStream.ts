import { VDOMNode } from "./h";
import { untracked } from "./signal";

// Generate unique IDs for hydration
let hydrationIdCounter = (globalThis as any).hydrationIdCounter || 0;
const generateHydrationId = (type: string) => {
  hydrationIdCounter = (globalThis as any).hydrationIdCounter =
    hydrationIdCounter + 1;
  return `${type}_${hydrationIdCounter}`;
};

// Interface for serialized resource data
interface SerializedResourceData {
  [id: string]: {
    data: any;
    status: "success" | "error";
    error?: string;
  };
}

const renderToStream = async (
  vnode: VDOMNode | string | any,
  formatOptions?: FormatOptions
) => {
  const stream = new ReadableStream({
    async start(controller) {
      const serializedData: SerializedResourceData = {};
      await renderToStreamRecursive(
        vnode,
        controller,
        formatOptions || {},
        serializedData
      );

      // Always inject the serialized data as a script tag if there's data
      if (Object.keys(serializedData).length > 0) {
        const dataScript = `<script type="application/json" id="sabrewing-resource-data">${JSON.stringify(
          serializedData
        )}</script>`;
        controller.enqueue(dataScript);
      }

      controller.close();
    },
  });

  return stream;
};

interface FormatOptions {
  indent?: number;
  addNewlines?: boolean;
  indentSize?: number;
}

const renderToStreamRecursive = async (
  vnode: VDOMNode | string | any,
  controller: ReadableStreamDefaultController,
  options: FormatOptions = {},
  serializedData: SerializedResourceData = {}
) => {
  const { indent = 0, addNewlines = false, indentSize = 2 } = options;
  const indentStr = " ".repeat(indent * indentSize);
  const newline = addNewlines ? "\n" : "";

  if (typeof vnode === "string") {
    controller.enqueue(indentStr + vnode + newline);
    return;
  }
  if (vnode == null || vnode === undefined) {
    return;
  }
  if (typeof vnode === "function") {
    await renderToStreamRecursive(vnode(), controller, options, serializedData);
    return;
  }

  // --- Parallel resource loading logic ---
  if (vnode.type === "RESOURCE") {
    const hydrationId = generateHydrationId("resource");
    const hydrationAttr = ` data-hydrate="resource" data-hydrate-id="${hydrationId}"`;

    // Start the async function promise immediately if not already started
    if (!vnode._asyncPromise) {
      vnode._asyncPromise = untracked(() => vnode.asyncFn());
    }

    let data;
    let status: "success" | "error" = "success";
    let error: string | undefined;

    try {
      const asyncResult = await vnode._asyncPromise;
      data = vnode.options.success(asyncResult);

      // Store the raw API data for hydration, not the rendered VDOM
      serializedData[hydrationId] = {
        data: asyncResult, // Store raw API data
        status,
        error,
      };
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      data = vnode.options.failure(errorObj);
      status = "error";
      error = errorObj.message;

      // Store error data for hydration
      serializedData[hydrationId] = {
        data: null,
        status,
        error,
      };
    }

    // Wrap resource content in a div with hydration markers
    controller.enqueue(indentStr + `<div${hydrationAttr}>` + newline);
    await renderToStreamRecursive(
      data,
      controller,
      {
        ...options,
        indent: indent + 1,
      },
      serializedData
    );
    controller.enqueue(indentStr + `</div>` + newline);
    return;
  }

  // --- Signal handling logic ---
  if (vnode.type === "SIGNAL") {
    const hydrationId = generateHydrationId("signal");
    const hydrationAttr = ` data-hydrate="signal" data-hydrate-id="${hydrationId}"`;

    const signalValue = vnode.signalValue.value;
    const result = vnode.callback(signalValue);

    // Wrap signal content in a div with hydration markers
    controller.enqueue(indentStr + `<div${hydrationAttr}>` + newline);
    await renderToStreamRecursive(
      result,
      controller,
      {
        ...options,
        indent: indent + 1,
      },
      serializedData
    );
    controller.enqueue(indentStr + `</div>` + newline);
    return;
  }

  // --- List handling logic ---
  if (vnode.type === "LIST") {
    const hydrationId = generateHydrationId("list");
    const hydrationAttr = ` data-hydrate="list" data-hydrate-id="${hydrationId}"`;

    const items = vnode.signalValue.value;

    // Wrap list content in a div with hydration markers
    controller.enqueue(indentStr + `<div${hydrationAttr}>` + newline);

    // Render each child with key information
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = vnode.keyFn(item, i);
      const child = vnode.renderFn(item, i);

      // Add data-key attribute to the rendered element
      if (child && child.props) {
        child.props["data-key"] = key;
      }

      await renderToStreamRecursive(
        child,
        controller,
        {
          ...options,
          indent: indent + 1,
        },
        serializedData
      );
    }
    controller.enqueue(indentStr + `</div>` + newline);
    return;
  }

  if (!vnode || typeof vnode !== "object" || !vnode.tag) {
    controller.enqueue(indentStr + String(vnode || "") + newline);
    return;
  }

  const { tag, props, children } = vnode;

  // Filter out event handlers and other non-attribute props
  const attributes = props
    ? Object.entries(props)
        .filter(([key]) => !key.startsWith("on") && key !== "key")
        .map(([key, value]) => {
          if (key === "style" && typeof value === "object" && value !== null) {
            // Handle style object with fine-grained reactivity: unwrap signals
            const styleString =
              Object.entries(value)
                .map(([prop, val]) => {
                  // Unwrap signal values for SSR
                  const unwrappedVal =
                    val &&
                    typeof val === "object" &&
                    "value" in val &&
                    typeof val.subscribe === "function"
                      ? val.value
                      : val;
                  return `${prop
                    .replace(/([A-Z])/g, "-$1")
                    .toLowerCase()}: ${unwrappedVal}`;
                })
                .join("; ") + ";";
            return `${key}="${styleString}"`;
          } else if (
            [
              "disabled",
              "checked",
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
            ].includes(key)
          ) {
            // Handle boolean attributes - only include if true
            return value ? key : "";
          } else if (
            [
              "strokeWidth",
              "strokeLinecap",
              "strokeLinejoin",
              "strokeOpacity",
              "strokeDasharray",
              "strokeDashoffset",
              "fillOpacity",
              "fillRule",
              "clipRule",
              "clipPath",
              "textAnchor",
              "dominantBaseline",
              "fontFamily",
              "fontSize",
              "fontWeight",
              "fontStyle",
              "textDecoration",
              "letterSpacing",
              "wordSpacing",
              "textRendering",
              "writingMode",
              "textOrientation",
              "whiteSpace",
              "markerEnd",
              "markerStart",
              "markerMid",
              "stopColor",
              "stopOpacity",
              "floodColor",
              "floodOpacity",
              "lightingColor",
              "colorInterpolation",
              "colorRendering",
              "shapeRendering",
              "imageRendering",
              "pointerEvents",
              "colorProfile",
              "colorInterpolationFilters",
            ].includes(key)
          ) {
            // Handle specific SVG camelCase attributes - convert to kebab-case
            return `${key.replace(/([A-Z])/g, "-$1").toLowerCase()}="${value}"`;
          }
          return `${key}="${value}"`;
        })
        .filter((attr) => attr !== "") // Remove empty attributes
        .join(" ")
    : "";

  // Add data-key attribute if key prop exists
  const keyAttr =
    props && props.key !== undefined ? ` data-key="${props.key}"` : "";

  // Stream the opening tag
  controller.enqueue(
    indentStr +
      `<${tag}${attributes ? " " + attributes : ""}${keyAttr}>` +
      newline
  );

  // Stream children progressively with lookahead resource loading
  if (children && children.length > 0) {
    const validChildren = children.filter(
      (child: any) => child !== null && child !== undefined
    );

    // Pre-pass: Start all resource promises in parallel
    const startResourcePromises = (node: any) => {
      if (node && typeof node === "object") {
        if (node.type === "RESOURCE" && !node._asyncPromise) {
          node._asyncPromise = untracked(() => node.asyncFn());
        } else if (node.children) {
          for (const child of node.children) {
            startResourcePromises(child);
          }
        }
      }
    };

    // Start all resource promises in parallel
    for (const child of validChildren) {
      startResourcePromises(child);
    }

    // Now render children (resources will use their already-started promises)
    for (const child of validChildren) {
      await renderToStreamRecursive(child, controller, options, serializedData);
    }
  }

  // Stream the closing tag
  controller.enqueue(indentStr + `</${tag}>` + newline);
};

export { renderToStream, hydrationIdCounter };
