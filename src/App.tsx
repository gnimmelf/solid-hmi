import { Title } from "@solidjs/meta";
import { Loading, createSignal } from "solid-js";
import { paths, Router } from "./router";
import "./App.css";

import "@oicl/openbridge-webcomponents/dist/openbridge.css";
import  "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button";
import  "@oicl/openbridge-webcomponents/dist/icons/icon-palette-dimming";

const themes = ["day", "dusk", "night", "bright"] as const;

export default function App() {
  const [themeIndex, setThemeIndex] = createSignal(0);

  const cycleThemes = () => {
    const nextIndex = (themeIndex() + 1) % themes.length;
    setThemeIndex(nextIndex);
    document.documentElement.setAttribute("data-obc-theme", themes[nextIndex]);
  };

  return (
    <Router>
      {(props) => (
        <>
          <Title>Solid OpenBridge demo</Title>
          <section class="top-bar">
            <nav>
              <a href={paths()}>Home</a>
              <a href={paths.components()}>Components</a>
            </nav>
            <div class="tools">
              <obc-icon-button onClick={() =>cycleThemes()}>
                <obi-palette-dimming />
              </obc-icon-button>
            </div>
          </section>
          <Loading fallback={<main>Loading…</main>}>{props.children}</Loading>
        </>
      )}
    </Router>
  );
}
