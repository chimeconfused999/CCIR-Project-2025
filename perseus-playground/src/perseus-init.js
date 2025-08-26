// src/perseus-init.js
import * as Perseus from "@khanacademy/perseus";
import React from "react";
// Perseus wants the classic ReactDOM object (not the 'client' one)
import * as ReactDOM from "react-dom";
import _ from "underscore";
import katex from "katex";
import "katex/dist/katex.min.css";

// --- call setDependencies() from whichever place it exists ---
const setDeps =
  Perseus.setDependencies || Perseus?.default?.setDependencies;

if (typeof setDeps === "function") {
  setDeps({ React, ReactDOM, _, katex });
} else {
  console.error(
    "[Perseus] setDependencies() not found on this build.",
    Perseus
  );
}

// --- pick whichever renderer this build provides ---
export const PerseusRenderer =
  Perseus.Renderer ||
  Perseus.ItemRenderer ||
  Perseus.ServerItemRenderer ||
  Perseus?.default?.Renderer ||
  Perseus?.default?.ItemRenderer ||
  Perseus?.default?.ServerItemRenderer;
