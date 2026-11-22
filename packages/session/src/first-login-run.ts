let signedInThisRun = false;
/** El alta de esta ventana ya pidió la sesión: la pantalla no la vuelve a pedir. */
export const noteFirstLoginSignedIn = () => { signedInThisRun = true; };
export const firstLoginSignedIn = () => signedInThisRun;
