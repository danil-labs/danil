Copia de los ejemplos del contrato `mvp-v1` que consume el login de Desk
(`terminus-workspace` `docs/contracts/mvp-v1/examples/`, PR #35, `695634e`).
Se actualizan copiando desde allí; la prueba `contract_examples_are_understood` los lee.

`free-router-routes-v1.json` es copia exacta de `danil-contracts`
`platform/free-router/vectors/routes-v1.json` en `ba893d590b5735ba43ec6489c3e73c89de1f25ad`
(Free router v8, §3.3). La prueba `free_router_routes_follow_the_contract_vectors` lo lee:
Desk admite las rutas autenticadas y nunca el JWKS público, que lee el motor.
