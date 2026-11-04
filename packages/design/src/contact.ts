/** El buzón donde se solicita acceso a Danil, al iniciar sesión y sin licencia, en todos los clientes. */
export const ACCESS_CONTACT = "hola@danil.ai";

/** El correo de solicitud con su asunto ya traducido. */
export const accessMailto = (subject: string): string =>
  `mailto:${ACCESS_CONTACT}?subject=${encodeURIComponent(subject)}`;
