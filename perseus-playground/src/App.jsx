// src/App.jsx
import React from "react";
import { loadPerseusRenderer } from "./perseus-umd";

const item = {
  question: {
    content: "Solve for $x$: $|x+2|=5$.\n\n$x =$ [[☃ expression 1]] or [[☃ expression 2]]",
    images: {},
    widgets: {}
  },
  widgets: {
    "expression 1": { type: "expression", graded: true, options: { answer: "3", form: true }, version: {major:1, minor:0}},
    "expression 2": { type: "expression", graded: true, options: { answer: "-7", form: true }, version: {major:1, minor:0}}
  },
  hints: [{ content: "Split absolute value: $x+2=5$ or $x+2=-5$." }]
};

export default function App() {
  const [Renderer, setRenderer] = React.useState(null);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    loadPerseusRenderer().then(setRenderer).catch(e => setErr(String(e)));
  }, []);

  if (err) return <div style={{color:"crimson"}}>{err}</div>;
  if (!Renderer) return <div>Loading Perseus…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2>Perseus render test (UMD)</h2>
      <Renderer item={item} problemNum={0} apiOptions={{ readOnly: false }} />
    </div>
  );
}
