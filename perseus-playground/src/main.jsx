import "./polyfills.js"; // your `process` shim from earlier
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "katex/dist/katex.min.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
