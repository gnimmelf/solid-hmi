import { Title } from "@solidjs/meta";
import { Loading } from "solid-js";
import { paths, Router } from "./router";
import { getTheme, setTheme, ThemeNames } from "./lib/theme";
import "@oicl/openbridge-webcomponents/dist/openbridge.css";
import "./global.css";
import styles from "./App.module.css";

import  "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button";
import  "@oicl/openbridge-webcomponents/dist/icons/icon-palette-dimming";

export default function App() {
  const cycleThemes = () => {
    const currentIndex = ThemeNames.indexOf(getTheme());
    setTheme(ThemeNames[(currentIndex + 1) % ThemeNames.length]);
  };

  return (
    <Router>
      {(props) => (
        <>
          <Title>Solid OpenBridge demo</Title>
          <section class={styles["top-bar"]}>
            <nav>
              <a href={paths()}>Home</a>
              <a href={paths.pages()}>Pages</a>
            </nav>
            <div class={styles.tools}>
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
