// openbridge-jsx.d.ts
//
// Solid JSX typings for @oicl/openbridge-webcomponents custom elements.
//
// To use another OICL element in a .tsx file:
//   1. Import its class from the package's dist path below.
//   2. Add a `'tag-name': ClassName` entry to `OiclComponents`.
// The IntrinsicElements entry (attributes, `prop:*`, children, events) is derived automatically.
import type { JSX as SolidJSX } from '@solidjs/web';
import type { ObcCard } from '@oicl/openbridge-webcomponents/dist/components/card/card.js';
import type { ObcButton } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';
import type { ObcIconButton } from '@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js';
import type { ObiPaletteDimming } from '@oicl/openbridge-webcomponents/dist/icons/icon-palette-dimming.js';

/** Register every OICL custom element used in .tsx files here. */
interface OiclComponents {
  'obc-card': ObcCard;
  'obc-button': ObcButton;
  'obc-icon-button': ObcIconButton;
  'obi-palette-dimming': ObiPaletteDimming;
}

/** Boolean/string Lit properties can also be set as plain lowercase HTML attributes. */
type OiclAttrValue<V> = V extends boolean ? boolean | '' : V extends string ? `${V}` : never;

/** Plain lowercase attribute form, derived only from attribute-reflectable (string/boolean) properties. */
type OiclAttributes<T> = {
  [K in keyof T as OiclAttrValue<T[K]> extends never ? never : K]?: OiclAttrValue<T[K]>;
};

/**
 * Full JSX props for one OICL element: standard HTML/ARIA/event attributes (incl. `children`),
 * typed `prop:*` bindings for every class property, and plain attribute-style setters for
 * string/boolean properties (e.g. `variant="raised"`).
 */
type OiclElementProps<T> = SolidJSX.HTMLAttributes<T> & SolidJSX.Properties<T> & OiclAttributes<T>;

type OiclIntrinsicElements = {
  [K in keyof OiclComponents]: OiclElementProps<OiclComponents[K]>;
};

declare module '@solidjs/web' {
  namespace JSX {
    interface IntrinsicElements extends OiclIntrinsicElements {}
  }
}