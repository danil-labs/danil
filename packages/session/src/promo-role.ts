/**
 * Quién ve «Canjear código»: solo owner y admin de la organización (F0.1, DS1 v3).
 * Sin rol todavía, o con uno que no se conoce, no: el canje es de quien administra.
 * La misma regla vale para el riel, los menús de cuenta, el menú anterior y la web.
 */
export const canRedeemPromo = (role: unknown) => role === "owner" || role === "admin";
