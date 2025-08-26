// src/perseus-umd.js
import React from "react";
import * as ReactDOM from "react-dom";

/** Wait until window.Perseus exists, then wire deps, return the renderer */
export async function loadPerseusRenderer(timeoutMs = 6000) {
  const start = Date.now();
  while (!window.Perseus) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Perseus UMD not loaded. Check the <script> tag in index.html.");
    }
    await new Promise(r => setTimeout(r, 50));
  }

  const { setDependencies, Renderer, ItemRenderer, ServerItemRenderer } = window.Perseus;

  // underscore + katex come from UMD globals we loaded in index.html
  if (typeof setDependencies === "function") {
    setDependencies({
      React,
      ReactDOM,
      _: window._,
      katex: window.katex,
    });
  }

  return Renderer || ItemRenderer || ServerItemRenderer;
}
