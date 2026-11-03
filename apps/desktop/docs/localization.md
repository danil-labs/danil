# Contrato del catálogo de frases

Toda frase propia que una persona lee en la app sale de `t()` o `Frase`.
Quien mantiene UI y catálogo revisa este contrato al cambiar el motor o los
paquetes. Qué cuenta como texto visible y qué no: [copy.md](./copy.md).

| Se traduce | Conserva su forma |
|---|---|
| Rótulos, estados y errores de la app | Texto del agente y stderr ajeno |
| title, aria-label, placeholder y alt | Nombres elegidos por la persona |
| `what` de Failure | `detail`: datos de máquina |
| Frases con datos mediante placeholders | Eventos, comandos y otros identificadores |

Las claves son identificadores jerárquicos en inglés. El catálogo elige los
plurales y el formato; las frases con datos usan placeholders. `Intl` toma
`manifiesto().formato` y no fija un locale al importar. La comparación de
identificadores usa `toLowerCase()` sin locale.

Los literales de eventos e `invoke()` permanecen visibles a las guardas del
puente. Rust entrega frases propias mediante `Frase`; el tipo `util::Prosa`
conserva texto crudo durante la migración y `sin_migrar` identifica sus pendientes.

La lengua pertenece al workspace. El motor de traducción vive en
`src/lib/i18n.ts`; el instalador de paquetes es parte del motor de Danil.
