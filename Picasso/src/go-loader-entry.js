/**
 * esbuild entry for the /go/ fullpage launcher.
 *
 * Bundled to dist/<env>/go/loader.js and loaded by public/go/index.html as an
 * external <script src="./loader.js">. Kept as a one-line entry so the launcher
 * logic itself (go-loader.js) stays importable and directly unit-testable.
 */

import { initFullpageLauncher } from './go-loader.js';

initFullpageLauncher();
