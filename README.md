# Solid HMI + OpenBridge

This repository is a proof of concept and a working demo for building heavier HMI (human-machine interface) components with [SolidJS](https://www.solidjs.com/) and the [OpenBridge design system](https://openbridge.no/).

The focus is the boundary between a productive component model and an interoperable browser API: build rich, reactive HMI surfaces in Solid, then publish them as standards-based custom elements that can be consumed by other web applications and host environments.

## What this PoC demonstrates

- OpenBridge styling, design tokens, and web components inside a SolidJS application.
- A Solid component with a small HMI-oriented API, currently `OiclControlSurface`.
- A generated custom-element build that exposes the component as `<oicl-control-surface>`.
- Attribute-to-prop mapping for host-controlled values such as `title`.
- DOM event forwarding through a bubbling, composed `button-click` `CustomEvent`.
- Generated TypeScript declarations and small browser test pages for each registered custom element.

This is intentionally exploratory. It is meant to make the integration approach tangible and provide a place to test the ergonomics, packaging, and runtime behavior needed by more substantial HMI controls. It is not a production-ready component library or a complete OpenBridge implementation.

## Why SolidJS and custom elements?

Heavier HMI components often need local state, frequent updates, predictable rendering, and a clear public contract. SolidJS provides fine-grained reactivity for the component implementation. Custom elements provide the integration contract: a host does not need to adopt SolidJS in order to place the control in a page, listen for its events, or style it with the OpenBridge vocabulary.

That separation lets this PoC explore a useful division of responsibility:

- **SolidJS** owns component composition, state, and reactive behavior.
- **OpenBridge** owns the visual language and reusable design-system primitives.
- **Custom elements** own the host-facing API and browser interoperability.
- **The build adapter** packages the result and generates declarations and demo pages.

## Project shape

```text
src/
	components/OiclControlSurface/              Solid implementation using OpenBridge
	custom-elements/index.json                  Registry of published custom elements
	custom-elements/solid-custom-element.tsx    Solid-to-custom-element adapter
	routes/                                     Demo application routes
vite.custom-elements.config.ts                  Custom-element bundling and docs generation
```

The registry currently contains:

```html
<oicl-control-surface title="Control surface"></oicl-control-surface>
```

The element dispatches `button-click` when its OpenBridge button is activated:

```js
const surface = document.querySelector('oicl-control-surface');

surface.addEventListener('button-click', () => {
	console.log('Control surface activated');
});
```

## Run the demo

Requirements: Node.js with `pnpm` available.

```bash
pnpm install
pnpm dev
```

Open the Vite URL shown in the terminal and use the **Components** route to view the SolidJS demo.

## Build the custom elements

```bash
pnpm build:custom-elements
```

This writes distributable modules and declarations to `dist/custom-elements/`, including generated browser documentation pages. The package exports the custom-element bundle through the package `exports` map.

## Type exports for consumers

The custom-element build generates TypeScript declarations for each element and exports them alongside the runtime bundle. Replace `example-basic` below with the package name used when this PoC is published:

```ts
import type { OiclControlSurfaceElement } from 'example-basic/custom-elements';
import 'example-basic/custom-elements';

const surface = document.querySelector('oicl-control-surface') as OiclControlSurfaceElement;
surface.title = 'Control surface';
surface.addEventListener('button-click', () => {
	console.log('Control surface activated');
});
```

The declarations also register `oicl-control-surface` in `HTMLElementTagNameMap`, so DOM APIs and framework adapters can use the element's typed `title` property. The runtime import is still required to register the browser custom element.

### React

React can render the custom element directly. The generated element type is useful when accessing it through a ref; add a local JSX declaration if the React version or JSX configuration does not already accept custom-element tags:

```tsx
import { useRef } from 'react';
import 'example-basic/custom-elements';

declare module 'react' {
	namespace JSX {
		interface IntrinsicElements {
			'oicl-control-surface': React.DetailedHTMLProps<
				React.HTMLAttributes<OiclControlSurfaceElement>,
				OiclControlSurfaceElement
			> & { title?: string };
		}
	}
}

import type { OiclControlSurfaceElement } from 'example-basic/custom-elements';

export function ControlSurface() {
	const ref = useRef<OiclControlSurfaceElement>(null);

	return <oicl-control-surface ref={ref} title="Control surface" />;
}
```

For custom DOM events, attach the listener through a ref or an effect and listen for `button-click` with `addEventListener`.

### Angular

Angular applications can use the element with `CUSTOM_ELEMENTS_SCHEMA`. Import the generated bundle once, then import the generated element type wherever a typed reference is useful:

```ts
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import type { OiclControlSurfaceElement } from 'example-basic/custom-elements';
import 'example-basic/custom-elements';

@Component({
	selector: 'app-control-surface',
	template: '<oicl-control-surface title="Control surface"></oicl-control-surface>',
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ControlSurfaceComponent {
	readonly elementType?: OiclControlSurfaceElement;
}
```

Angular event bindings can listen for the custom event with `(button-click)`. The generated declarations provide the element and event types to TypeScript consumers, while the custom-element runtime remains framework-independent.

Useful checks:

```bash
pnpm lint
pnpm test
pnpm build
```

## PoC direction

The next useful experiments are less about adding isolated widgets and more about proving the host contract for realistic HMI surfaces:

- Define stable property, attribute, and event conventions for controls.
- Exercise lifecycle behavior when elements are added, moved, or removed by a host application.
- Separate presentation from control state and investigate controlled versus internally managed values.
- Validate keyboard, focus, disabled, alarm, and status behavior against OpenBridge guidance.
- Measure update behavior as controls become more complex and data-driven.
- Test consumption from plain HTML and from other frameworks.
- Decide how themes, CSS isolation, assets, and versioning should work in a distributable library.

These experiments should inform the public API before the project is treated as a reusable component package.

## Status and scope

This project is a demo scaffold, not a finished HMI toolkit. APIs, generated output, naming, and build details may change while the integration model is being evaluated. The current control surface is deliberately small so that the important boundary between SolidJS, OpenBridge, and the browser custom-element API remains easy to inspect.

## License

MIT
