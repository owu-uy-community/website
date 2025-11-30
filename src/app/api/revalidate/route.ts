import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function GET() {
  revalidateTag("csv", "max");

  return NextResponse.json("Revalidated");
}
