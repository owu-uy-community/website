"use server";

import { revalidatePath } from "next/cache";

/**
 * Revalidation utilities for ISG using Next.js Server Actions
 * Automatically trigger page revalidation when data changes
 */

/**
 * Server Action: Trigger on-demand revalidation for OpenSpace pages
 * Can be called directly from client components or server components
 * No HTTP requests needed - runs server-side
 *
 * NOTE: As of the switch to fully client-side rendering with oRPC batching,
 * this function is no longer necessary for /la-meetup/openspace since there's
 * no server-rendered content to revalidate. However, it's kept for:
 * 1. Other pages that may still use ISR
 * 2. Backward compatibility
 * 3. Future use cases
 *
 * The function will silently succeed but has no effect on client-only pages.
 */
export async function revalidateOpenSpace(): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("🔄 [Revalidation] Starting revalidation for OpenSpace pages...");
    console.log("ℹ️  [Revalidation] Note: /la-meetup/openspace is now fully client-side, revalidation not needed");

    // Revalidate the OpenSpace page with 'page' type
    // This is a no-op for client-only pages but kept for compatibility
    revalidatePath("/la-meetup/openspace", "page");
    console.log("✅ [Revalidation] /la-meetup/openspace revalidated (client-side page, no effect)");

    console.log("✅ [Revalidation] OpenSpace pages revalidated successfully");

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [Revalidation] Error revalidating OpenSpace:", errorMessage);
    console.error("❌ [Revalidation] Full error:", error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Server Action: Revalidate a specific path
 * More flexible version that accepts any path
 */
export async function revalidateSpecificPath(path: string): Promise<{ success: boolean; error?: string }> {
  try {
    revalidatePath(path);
    console.log(`Path revalidated: ${path}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error revalidating path ${path}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}
