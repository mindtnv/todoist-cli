/**
 * Wrappable process.exit for testability.
 * In tests, override `cliExit` to throw instead of exiting.
 */
export let cliExit: (code?: number) => never = (code = 0) => {
  process.exit(code);
};

export function setCLIExit(fn: (code?: number) => never): void {
  cliExit = fn;
}
