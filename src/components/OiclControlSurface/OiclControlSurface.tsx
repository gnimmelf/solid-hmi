import { Loading } from 'solid-js';
import '@oicl/openbridge-webcomponents/dist/openbridge.css';
import '@oicl/openbridge-webcomponents/dist/components/card/card.js';

export default function OiclControlSurface() {
  return (
    <main>
      <obc-card showTitle>
        <div slot="title">Control Surface</div>
        <div style="color: var(--element-neutral-color);">
          <p style="color: var(--alert-alarm-color);">Theme-ready web component demo</p>
          <p>Test</p>
        </div>
      </obc-card>
    </main>
  );
}
