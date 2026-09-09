import type { Preview } from "@storybook/react";
import { useEffect } from "react";

import "../src/styles.css";

/**
 * Every story renders in both themes via this toolbar toggle rather than a
 * duplicated *.stories.tsx per theme, per docs/05-shared-components.md
 * section 8 ("tema terang/gelap"): flip "Theme" in the Storybook toolbar to
 * verify a component in light and dark.
 */
const preview: Preview = {
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
  },
  globalTypes: {
    theme: {
      description: "Warna tema",
      toolbar: {
        title: "Tema",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Terang" },
          { value: "dark", title: "Gelap" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme as "light" | "dark";
      useEffect(() => {
        document.documentElement.dataset.theme = theme;
      }, [theme]);
      return (
        <div className="bg-bg p-6 text-fg">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
