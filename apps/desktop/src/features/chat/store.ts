/**
 * Los stores de chat que leen otras features. Van aparte de `index.ts` porque
 * `node --test` carga `index.ts` desde los stores de hilos y colas, sin el
 * resolvedor de Vite, y este saldo arrastra `lib/platform`.
 */
export { createDanilCreditsBalance } from "./danil-credits-balance";
