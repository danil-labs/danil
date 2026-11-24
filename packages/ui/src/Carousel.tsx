import type { Accessor, ComponentProps, JSX } from "solid-js";
import {
  createContext,
  createEffect,
  mergeProps,
  onCleanup,
  onMount,
  splitProps,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import createEmblaCarousel from "embla-carousel-solid";
import type { CreateEmblaCarouselType } from "embla-carousel-solid";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { cn } from "./lib/utils";
import { Button } from "./Button";

type CarouselApi = CreateEmblaCarouselType[1];
type EmblaApi = NonNullable<ReturnType<CarouselApi>>;
type CreateCarouselParameters = Parameters<typeof createEmblaCarousel>;
type CarouselOptions = CreateCarouselParameters[0];
type CarouselPlugin = CreateCarouselParameters[1];

type CarouselProps = ComponentProps<"div"> & {
  options?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: "horizontal" | "vertical";
  setApi?: (api: EmblaApi) => void;
};

type CarouselContextProps = {
  ref: ReturnType<typeof createEmblaCarousel>[0];
  api: CarouselApi;
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: Accessor<boolean>;
  canScrollNext: Accessor<boolean>;
  orientation: "horizontal" | "vertical";
};

const CarouselContext = createContext<CarouselContextProps>();

function useCarousel() {
  const context = useContext(CarouselContext);
  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />");
  }
  return context;
}

export function Carousel(props: CarouselProps) {
  const merge = mergeProps({ orientation: "horizontal" as const }, props);
  const [local, rest] = splitProps(merge, [
    "orientation",
    "options",
    "setApi",
    "plugins",
    "class",
    "children",
  ]);
  const [ref, api] = createEmblaCarousel(
    () => ({
      ...local.options?.(),
      axis: local.orientation === "horizontal" ? "x" : "y",
    }),
    () => local.plugins?.() ?? [],
  );
  const [store, setStore] = createStore({
    canScrollNext: false,
    canScrollPrev: false,
  });

  const scrollPrev = () => api()?.scrollPrev();
  const scrollNext = () => api()?.scrollNext();
  let root: HTMLDivElement | undefined;

  // Sin `passive: false` el navegador no deja cancelar la rueda y el hilo se
  // lleva el gesto. Si la tira no puede seguir, el evento pasa al chat.
  onMount(() => {
    const node = root;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      const current = api();
      if (!current) return;
      const horizontal = local.orientation === "horizontal";
      const primary = horizontal ? event.deltaX : event.deltaY;
      const cross = horizontal ? event.deltaY : event.deltaX;
      const delta = Math.abs(primary) > Math.abs(cross) ? primary : cross;
      if (delta === 0) return;
      const forward = delta > 0;
      if (forward ? !current.canScrollNext() : !current.canScrollPrev()) return;
      event.preventDefault();
      event.stopPropagation();
      if (forward) current.scrollNext();
      else current.scrollPrev();
    };
    node.addEventListener("wheel", wheel, { passive: false });
    onCleanup(() => node.removeEventListener("wheel", wheel));
  });

  createEffect(() => {
    const current = api();
    if (!current) return;
    const onSelect = () => {
      setStore({
        canScrollNext: current.canScrollNext(),
        canScrollPrev: current.canScrollPrev(),
      });
    };
    onSelect();
    local.setApi?.(current);
    current.on("reInit", onSelect);
    current.on("select", onSelect);
    onCleanup(() => {
      current.off("reInit", onSelect);
      current.off("select", onSelect);
    });
  });

  return (
    <CarouselContext.Provider
      value={{
        ref,
        api,
        scrollPrev,
        scrollNext,
        canScrollPrev: () => store.canScrollPrev,
        canScrollNext: () => store.canScrollNext,
        get orientation() {
          return local.orientation;
        },
      }}
    >
      <div
        ref={root}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollPrev();
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollNext();
          }
        }}
        class={cn("relative", local.class)}
        role="region"
        aria-roledescription="carousel"
        {...rest}
      >
        {local.children}
      </div>
    </CarouselContext.Provider>
  );
}

export function CarouselContent(props: ComponentProps<"div">) {
  const { ref, orientation } = useCarousel();
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <div ref={ref} class="min-w-0 overflow-hidden">
      <div
        class={cn("flex", orientation === "horizontal" ? "-ml-2" : "-mt-2 flex-col", local.class)}
        {...rest}
      />
    </div>
  );
}

export function CarouselItem(props: ComponentProps<"div">) {
  const { orientation } = useCarousel();
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <div
      role="group"
      aria-roledescription="slide"
      class={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-2" : "pt-2",
        local.class,
      )}
      {...rest}
    />
  );
}

function CarouselButton(props: {
  side: "previous" | "next";
  class?: string;
  "aria-label"?: string;
  children: JSX.Element;
}) {
  const { orientation, scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();
  const horizontal = () => orientation === "horizontal";
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={props["aria-label"]}
      class={cn(
        "absolute z-10 size-8 rounded-full",
        props.side === "previous"
          ? horizontal()
            ? "top-1/2 left-1 -translate-y-1/2"
            : "top-1 left-1/2 -translate-x-1/2 rotate-90"
          : horizontal()
            ? "top-1/2 right-1 -translate-y-1/2"
            : "bottom-1 left-1/2 -translate-x-1/2 rotate-90",
        props.class,
      )}
      disabled={props.side === "previous" ? !canScrollPrev() : !canScrollNext()}
      onClick={props.side === "previous" ? scrollPrev : scrollNext}
    >
      {props.children}
    </Button>
  );
}

export function CarouselPrevious(props: { class?: string; "aria-label"?: string }) {
  return (
    <CarouselButton side="previous" class={props.class} aria-label={props["aria-label"]}>
      <ChevronLeft size={16} />
    </CarouselButton>
  );
}

export function CarouselNext(props: { class?: string; "aria-label"?: string }) {
  return (
    <CarouselButton side="next" class={props.class} aria-label={props["aria-label"]}>
      <ChevronRight size={16} />
    </CarouselButton>
  );
}

export type { EmblaApi };
