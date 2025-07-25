import { JSDOM } from "jsdom";

// Create a new JSDOM instance
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});

// Set up global variables
global.document = dom.window.document;
global.window = dom.window as any;
global.navigator = dom.window.navigator;
global.location = dom.window.location;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.DocumentFragment = dom.window.DocumentFragment;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.FocusEvent = dom.window.FocusEvent;
global.InputEvent = dom.window.InputEvent;
global.NodeFilter = dom.window.NodeFilter;
global.TreeWalker = dom.window.TreeWalker;

// Set up requestAnimationFrame for effects
global.requestAnimationFrame = (callback) => {
  return setTimeout(callback, 0);
};

global.cancelAnimationFrame = (id) => {
  clearTimeout(id);
};

// Set up queueMicrotask if not available
if (!global.queueMicrotask) {
  global.queueMicrotask = (callback) => {
    Promise.resolve().then(callback);
  };
}
