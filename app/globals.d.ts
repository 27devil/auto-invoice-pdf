declare module "*.css";

// `s-app-nav` (App Bridge's nav web component) ships types in
// @shopify/app-bridge-types, but — unlike the s-page/s-section/s-button/etc.
// elements from @shopify/polaris-types that are wired into tsconfig's
// `types` array — that package isn't auto-merged into the JSX namespace by
// this template. Declared narrowly here rather than widening every s-*
// element to `any`.
declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}
