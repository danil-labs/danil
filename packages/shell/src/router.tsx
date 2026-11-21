import { createContext, createSignal, onCleanup, onMount, useContext, type JSX } from "solid-js";

export type Route =
  | { name: "machines" }
  | { name: "workspace"; id: string }
  | { name: "account" };

export interface RouterContextValue {
  route: () => Route;
  path: () => string;
  navigate: (to: string | Route) => void;
}

const RouterContext = createContext<RouterContextValue>();

export function parseRoute(rawPath: string): Route {
  // Eliminar prefijos de hash o query
  let path = rawPath.replace(/^[#/]+/, "");
  if (path.includes("?")) {
    path = path.split("?")[0]!;
  }

  if (!path || path === "machines") {
    return { name: "machines" };
  }

  if (path === "account") {
    return { name: "account" };
  }

  const workspaceMatch = path.match(/^workspace\/([^/]+)/);
  if (workspaceMatch && workspaceMatch[1]) {
    return { name: "workspace", id: decodeURIComponent(workspaceMatch[1]) };
  }

  return { name: "machines" };
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case "machines":
      return "/machines";
    case "workspace":
      return `/workspace/${encodeURIComponent(route.id)}`;
    case "account":
      return "/account";
  }
}

export function RouterProvider(props: { initialPath?: string; children: JSX.Element }): JSX.Element {
  const getInitialPath = () => {
    if (props.initialPath) return props.initialPath;
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) return hash;
      const pathname = window.location.pathname;
      if (pathname && pathname !== "/") return pathname;
    }
    return "/machines";
  };

  const [path, setPath] = createSignal(getInitialPath());
  const [route, setRoute] = createSignal<Route>(parseRoute(getInitialPath()));

  const navigate = (to: string | Route) => {
    let nextPath: string;
    let nextRoute: Route;

    if (typeof to === "string") {
      nextPath = to.startsWith("/") ? to : `/${to}`;
      nextRoute = parseRoute(nextPath);
    } else {
      nextRoute = to;
      nextPath = routeToPath(to);
    }

    setPath(nextPath);
    setRoute(nextRoute);

    if (typeof window !== "undefined" && window.history) {
      const currentUrl = window.location.pathname + window.location.hash;
      if (currentUrl !== nextPath) {
        window.history.pushState(null, "", nextPath);
      }
    }
  };

  onMount(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const p = window.location.hash.replace(/^#/, "") || window.location.pathname || "/machines";
      setPath(p);
      setRoute(parseRoute(p));
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);

    onCleanup(() => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    });
  });

  return (
    <RouterContext.Provider value={{ route, path, navigate }}>
      {props.children}
    </RouterContext.Provider>
  );
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter debe usarse dentro de RouterProvider");
  }
  return ctx;
}
