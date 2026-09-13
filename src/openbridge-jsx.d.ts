// openbridge-jsx.d.ts
import type { JSX as SolidJSX } from '@solidjs/web';
import type { ObcCard } from '@oicl/openbridge-webcomponents/dist/components/card/card.js';
import type { ObcButton } from '@oicl/openbridge-webcomponents/dist/components/button/button.js';

type OiclChild =
  | SolidJSX.Element
  | string
  | number
  | boolean
  | null
  | undefined
  | OiclChild[];

type SolidLitProps<T> =
  Omit<SolidJSX.HTMLAttributes<T>, 'children'> &
  Partial<T> & {
    children?: OiclChild;
    [key: string]: unknown;
  };

declare module '@solidjs/web' {
  namespace JSX {
    interface IntrinsicElements {
      'obc-card': SolidLitProps<ObcCard>;
      'obc-button': SolidLitProps<ObcButton>;
    }
  }
}