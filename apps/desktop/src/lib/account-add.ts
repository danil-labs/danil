/** La web no ofrece agregar hasta que su sesión publique una acción real. */
export function createAccountAddAction(nativeWindow: boolean, nativeAdd: () => Promise<unknown>, webAdd?: (email?: string | null) => void): (() => Promise<unknown> | void) | undefined {
  return nativeWindow ? nativeAdd : webAdd ? () => webAdd() : undefined;
}
