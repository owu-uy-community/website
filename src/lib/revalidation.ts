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
 */
export async function revalidateOpenSpace(): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("🔄 [Revalidation] Starting revalidation for OpenSpace pages...");

    // Revalidate the OpenSpace page with 'page' type
    revalidatePath("/la-meetup/openspace", "page");
    console.log("✅ [Revalidation] /la-meetup/openspace revalidated");

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
