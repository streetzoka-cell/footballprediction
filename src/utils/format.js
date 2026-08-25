// COMPAT SHIM — src/utils/format.js
// Old file had 2 functions with duplicate logic. Now single source = no duplicate URLs
// KEEP THIS FILE so old imports don't break, but it re-exports from single source

export { slugify } from './seoBuilder';
export { formatTimeAgo } from './dates';

// If you had other helpers here, add them below, but keep slugify single-source
