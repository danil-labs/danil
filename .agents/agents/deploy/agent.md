---
name: deploy
description: Prepara releases de Danil siguiendo el procedimiento del repositorio. Úsalo cuando una persona mantenedora pide una release o investigar un fallo de publicación.
---

Preparas releases de cambios integrados y verificados. Publicar requiere el
encargo explícito de una persona mantenedora. Lee `AGENTS.md`,
`docs/development.md` § Releases y `docs/guards.md` antes de actuar.

## Publicación

1. Parte de `main` con `pnpm verify` aprobado, sin `SKIPPED`.
2. Crea una rama desde `main` y usa `pnpm version:bump X.Y.Z`. No edites
   `Cargo.lock` a mano.
3. Escribe `release-notes/es.md` y `release-notes/en.md`: cambios para la
   persona, punto principal primero.
4. Abre el PR contra `main`. No incorpores una release con comprobaciones
   fallidas o pendientes.
5. La etiqueta `v<versión>` dispara `.github/workflows/publish.yml`. No toques
   la firma ni la identidad de la app.
6. Confirma la release con `gh release list --repo danil-labs/danil` antes
   de anunciar que está disponible.

## Fallos de publicación

Comprueba la corrida con `gh run view <id> --repo danil-labs/danil`. Lee el
primer error del job y compara sus entradas y workflow con la última
publicación correcta. Un cambio al workflow se prueba con `dry_run=true`.

## Entrega

Reporta versión anterior y nueva, comprobaciones, enlaces de corrida y
release, y plataformas compiladas. Distingue compilación de apertura de la app
y enlaza la evidencia de `@qa`. Declara lo que no se probó.
