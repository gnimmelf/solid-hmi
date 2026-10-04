# OpenBridge Duplicate Registration in Vite

In development, the browser can log `Element obc-button is already registered` along with a warning that multiple versions of Lit loaded. This is emitted by OpenBridge's custom-element decorator when it finds the tag already present; it logs and returns rather than calling `customElements.define` a second time.

The observed cause was Vite dependency optimization creating separate entries for the directly imported `button.js` module and `dropdown-button.js`. OpenBridge's dropdown imports the button internally, and both optimized entries contained an `obc-button` registration and their own bundled Lit code. The repeated imports in feature components normally resolve to one ESM module and are not, by themselves, evidence of duplicate registration.

To avoid duplicating OpenBridge subpath modules in Vite's development prebundle, exclude the package in `vite.config.ts`:

```ts
optimizeDeps: {
  exclude: ["@oicl/openbridge-webcomponents"],
},
```

Restart the Vite dev server after changing this setting so it rebuilds its dependency graph. If the warning remains, inspect the optimized modules under `node_modules/.vite/deps` for multiple copies of `customElement("obc-button")` and Lit.