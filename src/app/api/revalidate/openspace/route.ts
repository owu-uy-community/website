import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/**
 * @deprecated This API route is deprecated in favor of Server Actions
 * 
 * Use the `revalidateOpenSpace()` Server Action from `src/lib/revalidation.ts` instead.
 * Server Actions are more efficient (no HTTP overhead) and easier to use.
 * 
 * This route is kept for backward compatibility with external webhooks.
 * If you don't have external webhooks using this endpoint, you can safely delete this file.
 * 
 * Migration:
 *   Before: await fetch("/api/revalidate/openspace", {...})
 *   After:  await revalidateOpenSpace()
 * 
 * ---
 * 
 * API Route for on-demand revalidation of OpenSpace pages
 * 
 * This endpoint triggers ISG revalidation when OpenSpace data changes.
 * 
 * Usage:
 *   POST /api/revalidate/openspace
 *   Body: { secret: "your-secret-token" }
 * 
 * Security:
 *   Set REVALIDATE_SECRET in your environment variables
 * 
 * Integration:
 *   - Set up as a Supabase webhook for automatic revalidation
 *   - Trigger from your CI/CD pipeline for content updates
 */
export async function POST(request: NextRequest) {
  try {
    // Verify secret token to prevent unauthorized revalidation
    const body = await request.json();
    const { secret } = body;

    // Check for secret token
    if (secret !== process.env.REVALIDATE_SECRET) {
      return NextResponse.json(
        { message: "Invalid token" },
        { status: 401 }
      );
    }

    // Revalidate the OpenSpace page
    revalidatePath("/la-meetup/openspace");
    
    // Also revalidate the kiosk page if it exists
    revalidatePath("/openspace/kiosk");

    return NextResponse.json({
      revalidated: true,
      now: Date.now(),
      message: "OpenSpace pages revalidated successfully",
    });
  } catch (err) {
    console.error("Error revalidating OpenSpace:", err);
    return NextResponse.json(
      { message: "Error revalidating", error: String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "OpenSpace revalidation endpoint is active",
    hint: "Send POST request with secret to trigger revalidation",
  });
}

