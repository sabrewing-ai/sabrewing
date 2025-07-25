# Sabrewing

A modern web framework with server-side rendering and client-side hydration.

# Table of Contents

1. [Introduction & Installation](#introduction--installation)
2. [Core Concepts: Signals & Reactivity](#core-concepts-signals--reactivity)
3. [Virtual DOM & Component Basics](#virtual-dom--component-basics)
4. [Building Single Page Applications (SPA)](#building-single-page-applications-spa)
5. [Server-Side Rendering (SSR) & Hydration](#server-side-rendering-ssr--hydration)
6. [Server Functions (`server$`)](#server-functions-server)
7. [Vite & Build Configuration](#vite--build-configuration)
8. [Development Workflow](#development-workflow)
9. [Advanced Patterns & Error Handling](#advanced-patterns--error-handling)
10. [API Reference](#api-reference)

---

## Introduction & Installation

Sabrewing is a reactive UI framework for building modern web applications with fine-grained reactivity, server-side rendering (SSR), and seamless client-side hydration. It features a simple, JSX-like API and a signal-based state management system.

### Installation

```bash
npm install sabrewing
```

### Package Structure

Sabrewing provides multiple entry points for different use cases:

```typescript
// Main exports (reactivity, VDOM, rendering)
import { signal, h, renderToDOM } from "sabrewing";

// Server-side exports (SSR, server functions)
import { createApp, renderToStream } from "sabrewing/server";

// Vite plugin for server functions
import { serverDollarPlugin } from "sabrewing/vite-plugin-serverdollar";
```

#### Available Exports

- **Main Package** (`sabrewing`): Core reactivity, VDOM, and client-side rendering
- **Server Package** (`sabrewing/server`): SSR, server functions, and server-side utilities
- **Vite Plugin** (`sabrewing/vite-plugin-serverdollar`): Build-time server function processing

---

## Core Concepts: Signals & Reactivity

Sabrewing's reactivity system is built around **signals**. Signals are reactive state containers that trigger updates when their value changes.

### Signals

```typescript
import { signal, computed, effect, untracked } from "sabrewing";

const count = signal(0); // Reactive state
count.value = 5; // Triggers updates
```

- **`signal(initialValue)`**: Creates a reactive value.
- **`computed(fn)`**: Derived state that updates when dependencies change.
- **`effect(fn)`**: Runs side effects when dependencies change.
- **`untracked(fn)`**: Reads signals without creating dependencies.

#### Example: Using Signals

```typescript
const name = signal("John");
const greeting = computed(() => `Hello, ${name.value}!`);
effect(() => {
  console.log(greeting.value); // Logs whenever name changes
});
```

#### Fine-Grained Reactivity

Sabrewing's fine-grained reactivity system ensures optimal performance by only updating what actually needs to change:

- **Component-Level Updates**: Only components that depend on changed signals re-render
- **Function Children**: Pass functions as children for automatic reactive updates
- **Signal Style Objects**: Use signals directly in style objects for dynamic styling
- **Nested Signal Support**: Signals can contain other signals for complex state management
- **Automatic Dependency Tracking**: The framework automatically tracks which components depend on which signals

```typescript
// Function children for reactive text
const count = signal(0);
const vnode = h("div", {}, () => `Count: ${count.value}`);

// Signal in style object for reactive styling
const color = signal("red");
const vnode = h("div", { style: { color } }, "Dynamic color");

// Nested signals
const theme = signal({ primary: "blue", secondary: "gray" });
const vnode = h(
  "div",
  {
    style: { backgroundColor: () => theme.value.primary },
  },
  "Themed content"
);
```

#### Signal Subscription API

```typescript
const count = signal(0);
const unsubscribe = count.subscribe(() => {
  console.log("Count changed!");
});
count.value = 1; // Logs "Count changed!"
unsubscribe();
```

---

## Virtual DOM & Component Basics

Sabrewing uses a lightweight virtual DOM system with a JSX-like API for building UI components. The virtual DOM enables efficient updates by comparing changes and only updating the actual DOM when necessary.

### The `h` Function

The `h` function is the core building block for creating virtual DOM elements:

- **`h(tag, props?, ...children)`**: Creates virtual DOM elements
- **Function children**: Pass functions as children for reactive updates
- **Component functions**: Pass component functions as the first argument
- **Array children**: Support for multiple children in arrays
- **Text nodes**: Automatic handling of text content

```typescript
// Basic element creation
const element = h("div", { className: "container" }, "Hello World");

// Function children for reactivity
const count = signal(0);
const reactiveElement = h("div", {}, () => `Count: ${count.value}`);

// Component usage
const MyComponent = (props: { name: string }) =>
  h("div", {}, `Hello, ${props.name}!`);
const componentElement = h(MyComponent, { name: "John" });

// Multiple children
const listElement = h(
  "ul",
  {},
  h("li", {}, "Item 1"),
  h("li", {}, "Item 2"),
  h("li", {}, "Item 3")
);
```

```typescript
const count = signal(0);
const vnode = h("div", {}, () => `Count: ${count.value}`);
```

### Event Handling

```typescript
const count = signal(0);
const vnode = h("button", { onClick: () => count.value++ }, "Click me");
```

### Styling & Dynamic Properties

Sabrewing provides powerful styling capabilities with full signal integration:

- **Signal Style Objects**: Use signals directly in style objects for reactive styling
- **Function Style Properties**: Use functions for computed style values
- **CamelCase to Kebab-Case**: Automatic conversion of CSS property names
- **CSS Classes**: Standard class name support
- **Dynamic Attributes**: Any attribute can be reactive using signals or functions

```typescript
// Signal in style object
const color = signal("red");
const vnode = h("div", { style: { color } }, "Dynamic color");

// Function for computed styles
const isActive = signal(false);
const vnode = h(
  "button",
  {
    style: {
      backgroundColor: () => (isActive.value ? "blue" : "gray"),
      color: () => (isActive.value ? "white" : "black"),
    },
  },
  "Toggle Button"
);

// Dynamic attributes
const disabled = signal(false);
const vnode = h("input", {
  disabled: () => disabled.value,
  placeholder: () => (disabled.value ? "Disabled" : "Enter text"),
});
```

---

## Building Single Page Applications (SPA)

Sabrewing is designed for SPAs with fine-grained reactivity and component composition.

### Component Patterns

- One component per file
- Use `FC` type for function components
- Pass signals as props for shared state

#### Example: Counter Component

```typescript
import { h, signal } from "sabrewing";

const Counter = (props: { initial: number }) => {
  const count = signal(props.initial);
  return h(
    "div",
    {},
    h("span", {}, count.value),
    h("button", { onClick: () => count.value++ }, "Increment")
  );
};
```

### Client-Side Rendering with `renderToDOM`

To render your SPA to the browser, use the `renderToDOM` function. This mounts your root component to a DOM container and enables reactivity on the client.

```typescript
import { renderToDOM } from "sabrewing";

const root = document.getElementById("app");
renderToDOM(h(Counter, { initial: 0 }), root);
```

- The first argument is your root virtual node/component.
- The second argument is the DOM element to mount into.

### Lists & Conditional Rendering

Sabrewing provides specialized helpers for common UI patterns:

#### `h.list` - Reactive Lists

The `h.list` helper creates reactive lists that automatically update when the source array changes:

```typescript
const items = signal(["apple", "banana", "cherry"]);
const vnode = h.list(
  items, // Signal containing the array
  (item, i) => i.toString(), // Key function for React-like keys
  (item) => h("li", {}, item) // Render function for each item
);

// Adding/removing items automatically updates the DOM
items.value.push("orange"); // List updates automatically
```

#### `h.resource` - Async Data Loading

The `h.resource` helper provides a declarative way to handle async data with loading states:

```typescript
const userData = h.resource(
  async () => fetch("/api/user").then((r) => r.json()),
  {
    loading: () => h("div", {}, "Loading user data..."),
    success: (data) => h("div", {}, `Welcome, ${data.name}!`),
    failure: (error) => h("div", {}, `Error: ${error.message}`),
  }
);
```

#### Conditional Rendering

Use functions for conditional rendering based on signal values:

```typescript
const isLoggedIn = signal(false);
const user = signal(null);

const userSection = () =>
  isLoggedIn.value
    ? h("div", {}, `Welcome back, ${user.value?.name}!`)
    : h("button", { onClick: () => login() }, "Log In");
```

### Advanced SPA Patterns

Sabrewing supports sophisticated patterns for building complex applications:

- **Nested Signals**: Signals can contain other signals for complex state management
- **Computed Signals in Components**: Use computed signals for derived state within components
- **Signal Context**: Share signals across component trees for global state
- **Function Returns**: Components can return functions for reactive content
- **Responsive Design**: Combine signals with CSS media queries for responsive layouts
- **Theme-Based Styling**: Use signal-based themes for dynamic theming

```typescript
// Function returns for reactive components
const Counter = (props: { initial: number }) => {
  const count = signal(props.initial);
  return () =>
    h(
      "div",
      {},
      h("span", {}, `Count: ${count.value}`),
      h("button", { onClick: () => count.value++ }, "Increment")
    );
};

// Nested signals for complex state
const user = signal({
  profile: signal({ name: "John", age: 25 }),
  preferences: signal({ theme: "dark", language: "en" }),
});

// Computed signals in components
const UserCard = () => {
  const displayName = computed(() =>
    user.value.profile.value.name.toUpperCase()
  );
  return h("div", {}, () => `Hello, ${displayName.value}!`);
};
```

---

## Server-Side Rendering (SSR) & Hydration

Sabrewing supports SSR for fast initial loads and SEO, with seamless hydration on the client. **Content is streamed to the client as it's generated**, providing faster perceived performance.

### SSR Entry Points

- **Client Entry**: `entry.client.ts` (hydration)
- **Server Entry**: `entry.server.ts` (SSR)

### Rendering APIs

- **`renderToDOM(vnode, container)`**: Client-side rendering
- **`renderToStream(vnode)`**: Server-side streaming (content streams to client progressively)
- **`hydrate(vnode, container)`**: Hydrate SSR output

### Streaming Benefits

- **Faster Time to First Byte (TTFB)**: HTML starts streaming immediately
- **Progressive Loading**: Content appears as it's rendered
- **Better User Experience**: Users see content faster, especially on slower connections
- **Resource Parallelization**: Async resources load in parallel while HTML streams

### Hydration Process

Hydration is the process of attaching client-side interactivity to server-rendered HTML. Sabrewing's hydration system is designed to be seamless and efficient.

#### How Hydration Works

1. **Server Renders HTML**: The server generates HTML with special hydration markers
2. **Client Loads**: The client loads the HTML and JavaScript
3. **Hydration Begins**: The client matches the virtual DOM with the existing HTML
4. **Interactivity Attached**: Event handlers and reactive effects are attached
5. **Seamless Transition**: The app becomes fully interactive without re-rendering

#### Hydration Markers

Sabrewing uses special data attributes to mark elements for hydration:

```html
<!-- Signal hydration -->
<div data-hydrate="signal" data-hydrate-id="signal_1">Count: 5</div>

<!-- List hydration -->
<div data-hydrate="list" data-hydrate-id="list_1">
  <div data-key="item_1">Item 1</div>
  <div data-key="item_2">Item 2</div>
</div>

<!-- Resource hydration -->
<div data-hydrate="resource" data-hydrate-id="resource_1">
  <span>Loaded data</span>
</div>
```

#### Hydration Data

Server-rendered resources include hydration data for seamless client-side continuation:

```html
<script id="sabrewing-resource-data" type="application/json">
  {
    "resource_1": {
      "data": { "title": "Hello World", "content": "..." },
      "status": "success"
    },
    "signal_1": {
      "value": 42,
      "status": "success"
    }
  }
</script>
```

### Hydration Features

#### Signal Hydration

Signals are automatically hydrated with their server-rendered values:

```typescript
const count = signal(0);

// Server renders: <div data-hydrate="signal" data-hydrate-id="signal_1">Count: 0</div>
// Client hydrates: count.value = 0 (from server)
// User interaction: count.value = 5
// DOM updates: <div>Count: 5</div>
```

#### List Hydration with Keys

Lists are efficiently hydrated using key-based reconciliation:

```typescript
const items = signal(["apple", "banana", "cherry"]);

const list = h.list(
  items,
  (item, i) => i.toString(), // Key function
  (item) => h("li", {}, item) // Render function
);

// Server renders with data-key attributes
// Client efficiently updates only changed items
// New items are inserted, removed items are deleted
```

#### Resource Hydration

Async resources are hydrated with their server-fetched data:

```typescript
const userData = h.resource(
  async () => fetch("/api/user").then((r) => r.json()),
  {
    loading: () => h("div", {}, "Loading..."),
    success: (data) => h("div", {}, `Hello, ${data.name}!`),
    failure: (error) => h("div", {}, `Error: ${error.message}`),
  }
);

// Server: Fetches data and renders success state
// Client: Hydrates with same data, no duplicate requests
// Updates: Only re-fetches when dependencies change
```

#### Event Handler Hydration

Event handlers are automatically attached during hydration:

```typescript
const count = signal(0);
const increment = () => count.value++;

const button = h("button", { onClick: increment }, "Click me");

// Server: Renders button without event handlers
// Client: Attaches onClick handler during hydration
// Result: Button becomes interactive seamlessly
```

### Hydration Best Practices

#### Consistent Server/Client Rendering

Ensure your components render identically on server and client:

```typescript
// ❌ Bad: Different rendering on server vs client
const Component = () => {
  const isClient = typeof window !== "undefined";
  return h("div", {}, isClient ? "Client" : "Server");
};

// ✅ Good: Consistent rendering
const Component = () => {
  return h("div", {}, "Always the same");
};
```

#### Avoid Client-Only Code During SSR

```typescript
// ❌ Bad: Browser APIs during SSR
const Component = () => {
  const [width, setWidth] = useState(window.innerWidth);
  return h("div", {}, `Width: ${width}`);
};

// ✅ Good: Use effects for client-only code
const Component = () => {
  const width = signal(0);

  effect(() => {
    if (typeof window !== "undefined") {
      setWidth(window.innerWidth);
      window.addEventListener("resize", () => setWidth(window.innerWidth));
    }
  });

  return h("div", {}, () => `Width: ${width.value}`);
};
```

#### Handle Hydration Mismatches

```typescript
// Use hydration-safe patterns for dynamic content
const Component = () => {
  const isHydrated = signal(false);

  effect(() => {
    if (typeof window !== "undefined") {
      isHydrated.value = true;
    }
  });

  return h("div", {}, () =>
    isHydrated.value ? "Client content" : "Server content"
  );
};
```

### Hydration Performance

#### Efficient DOM Matching

Sabrewing's hydration system efficiently matches virtual DOM with existing HTML:

- **Element Matching**: Matches by tag name and position
- **Key-Based Lists**: Uses data-key attributes for efficient list updates
- **Signal Tracking**: Only updates elements that depend on changed signals
- **Resource Continuation**: Continues async operations without duplicate requests

#### Memory Management

```typescript
const result = hydrate(vnode, container);

// Clean up hydration context when needed
result.cleanup();
```

### Hydration Debugging

#### Check Hydration State

```typescript
import { getHydratingState, isHydrated } from "sabrewing";

// Check if currently hydrating
if (getHydratingState()) {
  console.log("Currently hydrating...");
}

// Check if element is hydrated
const element = document.querySelector("#my-element");
if (isHydrated(element)) {
  console.log("Element is hydrated");
}
```

#### Common Hydration Issues

1. **Mismatched Content**: Server and client render different content
2. **Missing Dependencies**: Signals not properly tracked during hydration
3. **Event Handler Issues**: Event handlers not attached correctly
4. **Resource State Mismatch**: Resource data not properly serialized

### Async Data Loading

```typescript
const vnode = h.resource(async () => fetch("/api/data").then((r) => r.json()), {
  loading: () => h("div", {}, "Loading..."),
  success: (data) => h("div", {}, data.title),
  failure: (error) => h("div", {}, `Error: ${error.message}`),
});
```

---

## Server Functions (`server$`)

Sabrewing provides a powerful server function system that allows you to write server-side code that runs on the server but can be called from the client. This enables secure API endpoints, database access, and server-side operations while maintaining a seamless developer experience.

### What are Server Functions?

Server functions are functions marked with the `server$` wrapper that:

- **Run on the server**: Execute in the Node.js environment with full server capabilities
- **Called from client**: Can be invoked from client-side code as if they were regular functions
- **Type-safe**: Maintain full TypeScript support across the client-server boundary
- **Secure**: Keep sensitive operations (database access, API keys) on the server
- **Automatic serialization**: Arguments and return values are automatically serialized

### Basic Usage

```typescript
import { server$ } from "sabrewing";

// Define a server function
export const fetchUserData = server$(async (userId: number) => {
  // This code runs on the server
  const response = await fetch(`https://api.example.com/users/${userId}`);
  const userData = await response.json();
  return userData;
});

// Use it in a component
const UserProfile = () => {
  const userId = signal(1);

  const userData = h.resource(
    async () => {
      // This call is automatically routed to the server
      return await fetchUserData(userId.value);
    },
    {
      loading: () => h("div", {}, "Loading user..."),
      success: (data) => h("div", {}, `Hello, ${data.name}!`),
      failure: (error) => h("div", {}, `Error: ${error.message}`),
    }
  );

  return userData;
};
```

### Advanced Server Function Patterns

#### Database Operations

```typescript
import { server$ } from "sabrewing";

// Database query function
export const getPosts = server$(async (page: number, limit: number) => {
  // Database connection and queries run on server
  const posts = await db.query(
    "SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [limit, page * limit]
  );
  return posts;
});

// Create/update operations
export const createPost = server$(
  async (title: string, content: string, authorId: number) => {
    const result = await db.query(
      "INSERT INTO posts (title, content, author_id) VALUES (?, ?, ?)",
      [title, content, authorId]
    );
    return { id: result.insertId, title, content, authorId };
  }
);
```

#### External API Calls

```typescript
export const fetchWeatherData = server$(async (city: string) => {
  // API keys stay secure on the server
  const API_KEY = process.env.WEATHER_API_KEY;
  const response = await fetch(
    `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${city}`
  );
  return await response.json();
});
```

#### File System Operations

```typescript
export const readConfigFile = server$(async (filename: string) => {
  const fs = await import("fs/promises");
  const content = await fs.readFile(`./config/${filename}`, "utf-8");
  return JSON.parse(content);
});
```

### Server Function Features

#### Automatic Error Handling

Server functions automatically handle errors and propagate them to the client:

```typescript
export const riskyOperation = server$(async () => {
  if (Math.random() > 0.5) {
    throw new Error("Something went wrong!");
  }
  return "Success!";
});

// Client-side error handling
const result = h.resource(async () => await riskyOperation(), {
  success: (data) => h("div", {}, data),
  failure: (error) => h("div", {}, `Error: ${error.message}`),
});
```

#### Complex Data Types

Server functions support complex data types through automatic serialization:

```typescript
export const processUserData = server$(
  async (user: { name: string; age: number; preferences: string[] }) => {
    // Process complex objects on the server
    const processed = {
      ...user,
      processedAt: new Date().toISOString(),
      metadata: { serverVersion: "1.0.0" },
    };
    return processed;
  }
);
```

#### Async Operations

Server functions fully support async/await patterns:

```typescript
export const multiStepOperation = server$(async (input: string) => {
  // Step 1: Validate input
  if (!input) throw new Error("Input required");

  // Step 2: Process data
  const processed = await processData(input);

  // Step 3: Save to database
  const saved = await saveToDatabase(processed);

  // Step 4: Send notification
  await sendNotification(saved);

  return saved;
});
```

### Build Configuration

Server functions require the `serverDollarPlugin` in your Vite configuration:

```typescript
import { defineConfig } from "vite";
import { serverDollarPlugin } from "sabrewing/vite-plugin-serverdollar";

export default defineConfig({
  plugins: [serverDollarPlugin()],
  // ... other config
});
```

### How It Works

1. **Build Time**: The Vite plugin extracts server functions and generates:

   - A registry of server functions (`server-functions.js`)
   - A manifest file (`serverdollar.manifest.json`)
   - Client-side fetch stubs for each server function

2. **Runtime**:

   - Client calls are automatically converted to HTTP requests to `/_serverdollar/` endpoints
   - Server handles these requests by executing the corresponding server function
   - Results are serialized and returned to the client

3. **Security**: Sensitive code, API keys, and database connections remain on the server

### Best Practices

#### Error Handling

```typescript
export const robustServerFunction = server$(async (input: any) => {
  try {
    // Validate input
    if (!input) {
      throw new Error("Input is required");
    }

    // Perform operation
    const result = await performOperation(input);

    return { success: true, data: result };
  } catch (error) {
    // Log server-side errors
    console.error("Server function error:", error);

    // Return structured error response
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});
```

#### Type Safety

```typescript
// Define types for your server functions
type UserData = {
  id: number;
  name: string;
  email: string;
};

type CreateUserInput = {
  name: string;
  email: string;
  password: string;
};

export const createUser = server$(
  async (input: CreateUserInput): Promise<UserData> => {
    // TypeScript ensures type safety across the client-server boundary
    const user = await db.users.create(input);
    return user;
  }
);
```

#### Performance Considerations

```typescript
// Cache expensive operations
const cache = new Map();

export const expensiveOperation = server$(async (key: string) => {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await performExpensiveOperation(key);
  cache.set(key, result);
  return result;
});
```

### Limitations

- **Serialization**: Only JSON-serializable data can be passed between client and server
- **Build Requirement**: Server functions must be processed at build time
- **SSR Only**: Server functions only work in SSR mode

### Performance Optimizations

#### Fine-Grained Reactivity

Sabrewing's reactivity system is designed for optimal performance:

```typescript
// Only components that depend on changed signals re-render
const user = signal({ name: "John", age: 25 });
const posts = signal([]);

// This component only re-renders when user.name changes
const UserName = () => h("div", {}, () => user.value.name);

// This component only re-renders when posts change
const PostList = () =>
  h.list(
    posts,
    (post) => post.id,
    (post) => h("div", {}, post.title)
  );
```

#### Efficient DOM Updates

The framework uses intelligent DOM diffing and key-based reconciliation:

```typescript
// Key-based list updates for minimal DOM changes
const items = signal(["a", "b", "c"]);

const list = h.list(
  items,
  (item, index) => `${item}-${index}`, // Stable keys
  (item) => h("li", { key: item }, item)
);

// Only changed items are updated in the DOM
items.value = ["a", "x", "c"]; // Only "b" → "x" is updated
```

#### Batching and Flushing

Optimize updates with batching and manual flushing:

```typescript
import { batch, asyncBatch, flush } from "sabrewing";

// Batch multiple updates
batch(() => {
  user.value = { ...user.value, name: "Jane" };
  posts.value = [...posts.value, newPost];
  loading.value = false;
}); // Only one re-render triggered

// Async batching for data loading
asyncBatch(async () => {
  const data = await fetch("/api/data");
  const result = await data.json();
  userData.value = result;
  loading.value = false;
});

// Force immediate processing
flush();
```

#### Memory Management

Proper cleanup prevents memory leaks:

```typescript
// Clean up effects
const cleanup = effect(() => {
  console.log("Effect running");
});

// Later...
cleanup(); // Remove effect

// Clean up hydration context
const result = hydrate(vnode, container);
// Later...
result.cleanup(); // Clean up hydration resources
```

#### Untracked Reads

Use `untracked` to read signals without creating dependencies:

```typescript
const expensiveSignal = signal(expensiveCalculation());

// Read without creating dependency
const currentValue = untracked(() => expensiveSignal.value);

// Useful in effects that shouldn't depend on certain signals
effect(() => {
  const shouldLog = untracked(() => debugMode.value);
  if (shouldLog) {
    console.log("Current value:", expensiveSignal.value);
  }
});
```

#### Circular Dependency Detection

The framework automatically detects and handles circular dependencies:

```typescript
const a = signal(1);
const b = computed(() => a.value + 1);
const c = computed(() => b.value + 1);

// This would create a circular dependency
// a.value = c.value; // Error: Circular dependency detected

// Use untracked to break the cycle
a.value = untracked(() => c.value);
```

#### Error Recovery

Robust error handling with automatic recovery:

```typescript
// Global error handler
setGlobalErrorHandler((error, context) => {
  console.error(`Error in ${context}:`, error);
  // Send to error reporting service
});

// Per-signal error boundaries
const errorBoundary = createErrorBoundary(
  (error, context) => {
    console.error(`Signal error in ${context}:`, error);
  },
  () => {
    console.log("Recovered from signal error");
  }
);

const safeSignal = signal(0, errorBoundary);
```

---

## Vite & Build Configuration

Sabrewing provides a flexible Vite configuration system for SSR and client builds.

### Example Vite Config

```typescript
import { defineConfig } from "vite";
import { serverDollarPlugin } from "sabrewing/vite-plugin-serverdollar";

const isSSR = process.env.SSR === "true";

export default defineConfig({
  build: {
    outDir: isSSR ? "dist" : "dist-client",
    rollupOptions: {
      input: isSSR ? "entry.server.ts" : "entry.client.ts",
      output: {
        entryFileNames: isSSR ? "entry.server.js" : "entry.client.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  plugins: [serverDollarPlugin()],
  ssr: { noExternal: ["sabrewing"] },
});
```

### Build Scripts

```json
{
  "scripts": {
    "build:client": "vite build",
    "build:server": "SSR=true vite build",
    "build": "npm run build:server && npm run build:client",
    "dev:client": "vite",
    "dev:server": "SSR=true vite build --watch"
  }
}
```

### Build Modes

- **Client Build**: `SSR=false` or omit the variable
- **SSR Build**: `SSR=true`

---

## Development Workflow

> **Note:** Hot reloading is **not supported** in Sabrewing as of now.
>
> Use watch mode or restart the dev server to see changes.

### Development

- Run `npm run dev:client` for client-side development
- Run `npm run dev:server` for SSR development (with watch mode)

### Testing

Sabrewing includes comprehensive testing utilities and examples:

#### Test Setup

```typescript
// tests/setup.ts
import { JSDOM } from "jsdom";

// Create a new JSDOM instance for testing
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});

// Set up global variables for testing
global.document = dom.window.document;
global.window = dom.window as any;
global.navigator = dom.window.navigator;
// ... other globals
```

#### Running Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage
```

#### Testing Examples

```typescript
// Test signal reactivity
import { signal, computed, effect } from "sabrewing";

describe("signals", () => {
  it("should be reactive", () => {
    const count = signal(0);
    const doubled = computed(() => count.value * 2);

    expect(doubled.value).toBe(0);

    count.value = 5;
    expect(doubled.value).toBe(10);
  });
});

// Test hydration
import { hydrate, h } from "sabrewing";

describe("hydration", () => {
  it("should hydrate server-rendered content", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div data-hydrate="signal" data-hydrate-id="signal_1">Count: 5</div>';

    const count = signal(5);
    const vnode = h.signal(count, (value) => h("div", {}, `Count: ${value}`));

    const result = hydrate(vnode, container);
    expect(container.textContent).toBe("Count: 5");

    result.cleanup();
  });
});
```

#### End-to-End Testing

Sabrewing includes Puppeteer for end-to-end testing:

```javascript
// puppeteer-test.js
import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Track API calls
  let apiCallCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/_serverdollar/")) {
      apiCallCount++;
    }
  });

  await page.goto("http://localhost:3000/posts");
  await page.click("button:contains('Next')");

  // Verify pagination works
  expect(apiCallCount).toBeGreaterThan(0);

  await browser.close();
})();
```

### Production Build

- Run `npm run build` to build both client and server bundles

---

## Advanced Patterns & Error Handling

### Batching & Performance

Sabrewing provides powerful batching capabilities to optimize performance and prevent unnecessary re-renders:

- **`batch(fn)`**: Batches multiple signal updates into a single re-render
- **`asyncBatch(fn)`**: Batches updates across async operations
- **`flush()`**: Forces immediate processing of pending updates
- **Automatic Batching**: Framework automatically batches related updates
- **Memory Management**: Efficient cleanup of unused signal subscriptions

```typescript
import { batch, asyncBatch, flush } from "sabrewing";

// Batch multiple updates
batch(() => {
  signal1.value = 1;
  signal2.value = 2;
  signal3.value = 3;
}); // Only one re-render triggered

// Async batching for data loading
asyncBatch(async () => {
  const data = await fetch("/api/data");
  const result = await data.json();
  userData.value = result;
  loading.value = false;
});

// Force immediate update processing
flush();
```

### Error Handling

- Error boundaries
- Per-component error recovery
- Circular dependency detection

---

## API Reference

### Core Exports

#### Reactivity System

- `signal(initialValue, errorBoundary?)` - Create reactive state
- `computed(fn, errorBoundary?)` - Create derived state
- `effect(fn, errorBoundary?)` - Create side effects
- `untracked(fn)` - Read signals without creating dependencies
- `batch(fn)` - Batch multiple updates into single re-render
- `asyncBatch(fn)` - Batch updates across async operations
- `flush()` - Force immediate processing of pending updates

#### Virtual DOM & Components

- `h(tag, props?, ...children)` - Create virtual DOM elements
- `h.signal(signal, callback)` - Create reactive signal nodes
- `h.list(signal, keyFn, renderFn)` - Create reactive lists
- `h.resource(asyncFn, options, dependencies?)` - Create async resource nodes

#### Rendering & Hydration

- `renderToDOM(vnode, container, hydrationData?)` - Client-side rendering
- `renderToStream(vnode, options?)` - Server-side streaming
- `hydrate(vnode, container)` - Hydrate SSR output

#### Server Functions

- `server$(fn)` - Create server functions (SSR only)

#### Framework & Routing

- `createApp(config)` - Create full-stack application
- `createClient(config)` - Create client-side application
- `createRouter(config)` - Create router instance

#### Error Handling

- `setGlobalErrorHandler(handler)` - Set global error handler
- `createErrorBoundary(onError, onRecover?)` - Create error boundary

#### Hydration Utilities

- `getHydratingState()` - Check if currently hydrating
- `isHydrated(element)` - Check if element is hydrated
- `getHydrationId(element)` - Get hydration ID
- `getHydrationType(element)` - Get hydration type
- `setHydratingState(hydrating)` - Set hydration state

### Advanced Features

#### Computed Signal Methods

```typescript
const computedSignal = computed(() => expensiveCalculation());

// Force recomputation
computedSignal.recompute();

// Manual notification (advanced use cases)
computedSignal.notify();
```

#### Error Boundaries

```typescript
import { createErrorBoundary, signal } from "sabrewing";

const errorBoundary = createErrorBoundary(
  (error, context) => {
    console.error(`Error in ${context}:`, error);
  },
  () => {
    console.log("Recovered from error");
  }
);

const safeSignal = signal(0, errorBoundary);
```

#### Global Error Handling

```typescript
import { setGlobalErrorHandler } from "sabrewing";

setGlobalErrorHandler((error, context) => {
  console.error(`Global error in ${context}:`, error);
  // Send to error reporting service
  reportError(error, context);
});
```

#### Router Features

```typescript
import { createRouter } from "sabrewing";

const router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/about", component: About },
    {
      path: "/users",
      component: Users,
      children: [{ path: "/users/:id", component: UserDetail }],
    },
  ],
  base: "/app", // Optional base path
});

// Get current route
const currentRoute = router.getCurrentRoute();

// Match route
const matchedRoute = router.match("/users/123");
```

#### Client Configuration

```typescript
import { createClient } from "sabrewing";

const client = createClient({
  rootElement: "#app", // Custom root element selector
  vdom: h(App, {}), // Pre-built virtual DOM
});

await client.start();
```

#### App Configuration

```typescript
import { createApp } from "sabrewing/server";

const app = createApp({
  routes: [
    { path: "/", import: () => import("./pages/Home") },
    { path: "/about", import: () => import("./pages/About") },
  ],
  layout: Layout, // Optional layout component
  port: 3000, // Custom port
  host: "localhost", // Custom host
  staticDir: "static", // Static file directory
});

await app.start();
```

### Type Definitions

#### Core Types

```typescript
type Signal<T> = {
  value: T;
  subscribe: (fn: () => void) => () => void;
};

type Computed<T> = Signal<T> & {
  notify: () => void;
  recompute: () => void;
};

type FC<P = {}> = (props: P, ...children: VDOMChild[]) => VDOMNode;

type VDOMNode =
  | ElementNode
  | ResourceNode
  | SignalNode
  | ListNode
  | string
  | null;
```

#### Configuration Types

```typescript
interface ClientConfig {
  rootElement?: string;
  vdom?: VDOMNode;
}

interface AppRoute {
  path: string;
  import: () => Promise<any>;
}

interface RouterConfig {
  routes: Route[];
  base?: string;
}
```

See the full documentation above for usage examples.

---

For more details, see the [examples](#) and [tests](./tests/lib/) directories.

---

**⚠️ WARNING: This project was built with vibes and experimental enthusiasm! ⚠️**

This project was created by following intuition, experimenting with new patterns, and building what felt right in the moment - rather than following strict best practices or comprehensive planning.

### ⚠️ Use at your own risk:

If you're looking for a stable, production-ready framework, please look elsewhere!
