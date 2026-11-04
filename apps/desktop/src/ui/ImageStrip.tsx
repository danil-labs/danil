import { createEffect, createSignal, For } from "solid-js";
import { t } from "../lib/i18n";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type EmblaApi } from "./Carousel";
import { Miniatura } from "./EnlargeableImage";

/** La tira de miniaturas de varias imágenes. Muestra cuatro; el resto se desplaza en horizontal. */
export default function ImageStrip(props: {
  srcs: string[];
  alt: string;
  actual: number;
  abierta: boolean;
  onOpen: (index: number) => void;
}) {
  const [tira, setTira] = createSignal<EmblaApi>();
  const visibles = () => Math.min(props.srcs.length, 4);
  createEffect(() => {
    tira()?.scrollTo(props.actual);
  });
  return (
    <Carousel
      class="min-w-0 max-w-full"
      style={{ width: `min(100%, calc(${visibles()} * 12.5rem - 0.5rem))` }}
      options={() => ({ align: "start", containScroll: "trimSnaps", dragFree: true })}
      setApi={setTira}
    >
      <CarouselContent>
        <For each={props.srcs}>
          {(url, index) => (
            <CarouselItem class="basis-48">
              <Miniatura
                src={url}
                alt={props.alt}
                marcada={props.abierta && props.actual === index()}
                onOpen={() => props.onOpen(index())}
              />
            </CarouselItem>
          )}
        </For>
      </CarouselContent>
      <CarouselPrevious aria-label={t("chat.image.previous")} class="disabled:hidden" />
      <CarouselNext aria-label={t("chat.image.next")} class="disabled:hidden" />
    </Carousel>
  );
}
