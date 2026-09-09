# @newsekolah/config

Shared build tooling configuration: TypeScript base configs, ESLint 9 flat
configs, the Tailwind v4 token preset, and the Prettier config. Consumed by
every other package and by `apps/web`.

## Usage

```jsonc
// tsconfig.json
{ "extends": "@newsekolah/config/tsconfig.react.json" }
```

```js
// eslint.config.js
import next from "@newsekolah/config/eslint/next";
export default next;
```

```css
/* app/globals.css */
@import "tailwindcss";
@import "@newsekolah/config/tailwind/preset.css";
```

```js
// prettier.config.js
module.exports = require("@newsekolah/config/prettier");
```
