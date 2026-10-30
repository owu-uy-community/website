"use client";

import dynamic from "next/dynamic";

/**
 * The navbar in its own chunk, for the root 404. Every route carries that boundary, so a plain
 * import put the navbar's code (menu dialog, icons) in /conf's and /admin's bundles too.
 */
const LazyNavbar = dynamic(() => import("./index"));

export default LazyNavbar;
