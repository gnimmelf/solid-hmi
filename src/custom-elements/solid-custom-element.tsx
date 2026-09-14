import { render } from '@solidjs/web';
import type { Component } from 'solid-js';

export function defineSolidCustomElement<P extends Record<string, unknown>>(
  tag: string,
  component: Component<P>,
  createProps?: (element: HTMLElement) => P,
) {
  if (customElements.get(tag)) {
    return;
  }

  class SolidCustomElement extends HTMLElement {
    private dispose?: () => void;

    connectedCallback() {
      if (this.dispose) {
        return;
      }

      this.replaceChildren();
      this.dispose = render(
        () => component(createProps?.(this) ?? ({} as P)),
        this,
      );
    }

    disconnectedCallback() {
      this.dispose?.();
      this.dispose = undefined;
    }
  }

  customElements.define(tag, SolidCustomElement);
}