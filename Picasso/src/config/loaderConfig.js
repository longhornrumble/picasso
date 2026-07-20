/**
 * Minimal config for the widget host (widget.js) bundle.
 *
 * widget.js runs on every embedding page and has a hard 25KB CI budget.
 * Importing the full environment.js dragged its multi-environment tables,
 * runtime detection, and validation into the loader (~half the bundle) even
 * though every build bakes the values in via esbuild defines (defineVars in
 * esbuild.config.mjs is set unconditionally for dev/staging/production, so
 * the detection path is unreachable in the loader). The iframe app keeps
 * using environment.js; widget-host.js uses only this module.
 *
 * Fallbacks below are the production values and are only reachable outside
 * an esbuild build (e.g. jest, where the defines don't exist).
 */

export const loaderConfig = {
  WIDGET_DOMAIN: typeof __WIDGET_DOMAIN__ !== 'undefined'
    ? __WIDGET_DOMAIN__
    : 'https://chat.myrecruiter.ai',

  STREAMING_ENDPOINT: typeof __STREAMING_ENDPOINT__ !== 'undefined'
    ? __STREAMING_ENDPOINT__
    : 'https://chat.myrecruiter.ai/stream',

  ERROR_REPORTING_ENDPOINT: typeof __ERROR_REPORTING_ENDPOINT__ !== 'undefined'
    ? __ERROR_REPORTING_ENDPOINT__
    : 'https://chat.myrecruiter.ai/Master_Function?action=log_error',

  getConfigUrl(tenantHash) {
    if (!tenantHash) {
      throw new Error('getConfigUrl: tenantHash is required');
    }
    const endpoint = typeof __CONFIG_ENDPOINT__ !== 'undefined'
      ? __CONFIG_ENDPOINT__
      : 'https://chat.myrecruiter.ai/Master_Function?action=get_config';
    return `${endpoint}&t=${encodeURIComponent(tenantHash)}`;
  }
};
