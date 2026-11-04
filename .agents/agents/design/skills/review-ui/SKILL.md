---
name: review-ui
description: Revisión visual y de accesibilidad de un cambio en la interfaz de Danil antes de darlo por bueno — capturas en tema claro y oscuro, contraste medido y no a ojo, foco y teclado, movimiento reducido, y en qué webview se miró. Úsala cuando pidan revisar cómo se ve algo, comprobar si se lee en oscuro, sacar capturas, auditar accesibilidad o contraste, o antes de abrir un pull request que toca el front de Danil.
---

# Revisar una interfaz

Revisa el cambio en la ventana y entrega capturas, mediciones y límites. Los
contratos estáticos que comprueba la cadena están en `docs/guards.md`.

## Entradas

- **Qué cambió**: el diff o la rama, y qué vista lo muestra.
- **Qué build se mira**: la ventana de la rama (`pnpm window:build`) contra el
  laboratorio del motor (`pnpm engine:start`), según `docs/development.md`.
  Registra el commit de la build.

## Pasos

1. **Guardas primero**: `pnpm verify --no-cargo`. Un `SKIPPED` no es verde,
   y se reporta cuál se omitió.
2. **Capturar en los dos temas** la vista que cambió, en su estado normal, vacío,
   cargando y con error si los tiene. La apariencia se fuerza desde Configuración
   o con el botón de tema (`src/lib/theme.ts`, `elegirApariencia`), sin cambiar
   el sistema operativo.
3. **Medir el contraste** de lo nuevo contra la superficie donde se posa, no
   contra el fondo del tema: 4,5:1 para texto, 3:1 para bordes de controles y
   para el foco. Las cifras ya medidas del sistema están en
   `docs/visual-system.md`. Un color nuevo entra con su cifra.
4. **Recorrer con teclado**: Tab llega a cada control en orden, el foco se ve, y
   Escape cierra popovers y diálogos. Kobalte lo da si se usó su primitivo; si no
   se usó, aquí aparece.
5. **Activar el movimiento reducido** en el sistema y repetir: nada sostenido
   late y nada se desliza.
6. **Anotar la plataforma**. WebView2 (Windows), WKWebView (macOS) y WebKitGTK
   (Linux) pintan distinto: una revisión en una no vale para las otras.

## Salida esperada

Un informe corto que diga:

- qué vista y qué build se miraron, y en qué plataforma;
- las capturas en claro y oscuro;
- las cifras de contraste de lo nuevo;
- lo que falló, cada fallo con los pasos para verlo;
- lo que no se revisó.

Se cierra con una línea: se ve bien, se ve bien con salvedades, o no se ve bien.
Esta skill no arregla lo que encuentra: lo reporta para que se arregle con
`ui-component`.

## Ejemplo

Petición: «revisa cómo quedó el perfil del agente antes del PR».
Resultado: capturas en claro y oscuro del perfil con y sin imagen de fondo, la
cifra de contraste del texto sobre el velo en cada tema, el recorrido con
teclado, y «mirado en Windows; macOS y Linux sin revisar».

## Qué no hacer

- **Afirmar un resultado visual sin abrir la ventana**: la compilación no
  comprueba la apertura ni la apariencia de esa build.
- **Medir el contraste contra el fondo del tema** en vez de contra la superficie
  donde se posa el elemento: la cifra sale bien y la fila real no se lee.
- **Revisar solo el tema en el que se trabajó**: el defecto típico del sistema
  es el que solo aparece en el contrario.

## Se activa con

- «revisa si el panel nuevo se lee en modo oscuro»
- «sácame capturas de cómo quedó antes del PR»
- «audita la accesibilidad de la pantalla de configuración»

No se activa con: «haz un panel para las fuentes», «¿compila la rama?».
