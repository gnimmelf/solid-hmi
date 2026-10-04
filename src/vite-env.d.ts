/// <reference types="vite/client" />
/// <reference types="../file-routes.d.ts" />

declare module "*.css" {
  const css: string;
  export default css;
}

declare module "*.scss" {
  const styles: string;
  export default styles;
}

declare module "*.sass" {
  const styles: string;
  export default styles;
}

declare module "*.less" {
  const styles: string;
  export default styles;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.md" {
  const markdown: string;
  export default markdown;
}

declare module "*.md?raw" {
  const markdown: string;
  export default markdown;
}
