/**
 * Las piezas del diff que comparten el visor de archivos (`FileViewer.tsx`) y
 * el lado «Cambios» del panel de la tarea (`TaskFiles.tsx`): el cuerpo de un
 * archivo y el selector unificado / dos paneles.
 *
 * **El contexto se despliega, y por eso hace falta un segundo comando.** `git
 * diff` da tres líneas alrededor de cada trozo, y un cambio leído sin lo que lo
 * rodea no se puede juzgar: `tree_patch` recalcula ese archivo con el archivo
 * entero de contexto. Se pide solo al desplegar — traer todos los archivos
 * enteros de golpe es megabytes que casi nadie va a leer.
 *
 * **Sin resaltado de sintaxis, y es una decisión.** Lo que hay que distinguir es
 * qué entró y qué salió, y eso lo dice la línea entera. Un resaltador son
 * cientos de kilobytes de gramáticas para teñir palabras que no deciden nada en
 * una revisión.
 */

export { SelectorDeDisposicion, type Cambios } from "./changes-layout";
export { CuerpoDeArchivo } from "./changes-body";
