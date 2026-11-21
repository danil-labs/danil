# @danil/feature-terminal

Feature de terminal interactiva para la plataforma Danil.

## Qué hace

- Proporciona la pantalla interactiva `TerminalScreen(conn)` para ejecutar shells en máquinas conectadas al motor.
- Renderiza secuencias de escape ANSI con estilos temáticos y soporte de saltos de línea sin desbordar contenedores (`min-w-0`, `break-words`, `break-all`).
- Permite interacción bidireccional por teclado (`stdin`) capturando eventos de teclas y atajos estándar como `Ctrl+C` y `Ctrl+D`.
- **Buffer de entrada stdin (B-017)**: Retiene en un buffer en memoria las pulsaciones tecleadas por el usuario mientras el proceso remoto inicializa su pty. Una vez recibido el evento `shell_started`, el buffer se vacía de forma secuencial hacia el canal de entrada del proceso.
- **Corrección de desbordamiento (B-018)**: Asegura `min-w-0` y ajuste de palabras continuas para evitar que URLs largas o tokens rompan el grid de paneles.
- Visualización de errores con botón de reintento explícito ante fallos de conexión o ejecución.

## Qué consume y de qué contrato

### Borde HTTPS `/v1`:
- Ninguno (la ejecución de shell es local al motor o relay WebSocket de la máquina correspondiente).

### Comandos RPC1 del motor (`@danil/engine-client`):
- `run_shell_command`: Inicia el proceso de shell en la máquina.
- `write_shell_input`: Envía fragmentos de texto al pipe de entrada estándar del proceso.
- `stop_shell_command`: Detiene el proceso en ejecución mediante señales del sistema.
- `close_process`: Libera handles y procesos al desmontar o cerrar la pantalla.

### Eventos Push (`chat`):
- `shell_started`: Notifica que el pty remoto está listo y listo para recibir stdin. Desencadena el vaciado del buffer B-017.
- `shell_output`: Transmite fragmentos de salida en tiempo real para ser renderizados con formato ANSI.
- `shell_done`: Notifica el término del proceso.

## Pendiente

- Pendiente: migrar componentes visuales base de Terminal a @danil/ui cuando el paquete los provea.
