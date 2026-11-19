export const canRedeemPromo = (role: unknown) => role !== "member" && role !== "guest";
/** El canje de un grupo del riel: solo owner y admin de esa organización (DS1 v3); sin rol, no. */
export const canRedeemGroupCode = (role: unknown) => role === "owner" || role === "admin";
