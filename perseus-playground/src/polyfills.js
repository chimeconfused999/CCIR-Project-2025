// Make a minimal "process" so libs can read process.env safely
if (!window.process) {
  window.process = { env: { NODE_ENV: import.meta.env.MODE || 'development' } };
}
