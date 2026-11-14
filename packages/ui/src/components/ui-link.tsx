"use client";

import {
  createContext,
  createElement,
  forwardRef,
  useContext,
  type AnchorHTMLAttributes,
  type ComponentType,
  type PropsWithChildren,
  type ReactElement,
  type Ref,
} from "react";

/**
 * What a link component is handed: anchor attributes and a string `href`.
 * The contract leaves `ref` out on purpose. A ref still reaches the
 * component (React 19 passes it as a prop, a forwardRef component takes it
 * as its ref), but naming it here would tie the type to one copy of
 * @types/react, and next/link's typings resolve their own, whose `Ref` is
 * not assignable to ours; without it `component={Link}` type-checks.
 */
export interface UiLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/** Anything that renders an anchor from `href` plus anchor attributes: a plain `a`, or next/link's `Link`. */
export type UiLinkComponent = ComponentType<UiLinkProps>;

const PlainLink = forwardRef<HTMLAnchorElement, UiLinkProps>(function PlainLink(props, ref) {
  // The href and children arrive through the spread; the rule cannot see them.
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  return <a ref={ref} {...props} />;
});

const UiLinkContext = createContext<UiLinkComponent>(PlainLink);

/**
 * Tells the shared components which element to render for an internal
 * link (breadcrumbs, TextLink, ListRow, Stat and HeroCard links). The
 * package cannot import next/link itself, so without this they render a
 * plain `a`, which reloads the whole app; apps/web passes `Link` once at
 * the root and every shared link becomes a client-side navigation.
 */
export function UiLinkProvider({
  component,
  children,
}: PropsWithChildren<{ component: UiLinkComponent }>): ReactElement {
  return <UiLinkContext.Provider value={component}>{children}</UiLinkContext.Provider>;
}

export function useUiLink(): UiLinkComponent {
  return useContext(UiLinkContext);
}

/**
 * An internal link through the provided component: what the shared
 * components render for an `href`. The ref is a plain prop (React 19) and
 * travels with the rest.
 */
export function UiLink(props: UiLinkProps & { ref?: Ref<HTMLAnchorElement> }): ReactElement {
  const component = useUiLink();
  // createElement, not JSX: the component comes from context, which a JSX
  // tag would read as a component declared during render.
  return createElement(component, props);
}
