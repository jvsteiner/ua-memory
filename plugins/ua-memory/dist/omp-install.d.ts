/**
 * Installing the omp adapter.
 *
 * omp discovers extensions as loose modules in its own directory, so the
 * adapter cannot simply live in this repo and be found. What gets installed is
 * a three-line shim that re-exports the built adapter by absolute path, so all
 * the real code stays here, under test and under version control, and the
 * installed file has nothing in it worth editing.
 *
 * The absolute path matters: a symlink would resolve relative imports through
 * its target, but a copy would not, and users copy things. An absolute
 * re-export works either way.
 *
 * This is the same shape herdr uses for its own omp integration — a generated,
 * clearly-marked file that the installer owns and rewrites.
 */
export declare const INSTALLED_FILENAME = "ua-memory.ts";
/** omp's user-level extension directory. */
export declare function defaultOmpExtensionsDir(): string;
/**
 * Absolute path to the compiled adapter this package ships.
 *
 * Resolved from the package root rather than relative to this module, because
 * this file runs from `dist/` in production and straight from `src/` under
 * vitest. Anchoring on package.json gives the same answer either way.
 */
export declare function adapterPath(): string;
export interface InstallResult {
    path: string;
    target: string;
    replaced: boolean;
}
export declare function ompInstall(extensionsDir?: string): InstallResult;
export interface StatusResult {
    path: string;
    installed: boolean;
    target: string | null;
    /** True when the shim points somewhere that no longer exists. */
    stale: boolean;
}
export declare function ompStatus(extensionsDir?: string): StatusResult;
export declare function ompUninstall(extensionsDir?: string): {
    removed: boolean;
};
