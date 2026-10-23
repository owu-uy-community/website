import { connection, NextResponse } from "next/server";

export async function GET() {
  // Answered by the server on each request: a prerendered "ok" would say nothing about it
  await connection();

  return NextResponse.json({ status: "ok" });
}
