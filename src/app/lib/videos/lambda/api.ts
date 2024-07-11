import type { RenderMediaOnLambdaOutput } from "@remotion/lambda/client";

import { type z } from "zod";

import { type ProgressRequest, type ProgressResponse, type RenderRequest } from "../types/schema";
import { type CompositionProps } from "../types/constants";
import { type ApiResponse } from "../utils/api-response";

const makeRequest = async <Res>(endpoint: string, body: unknown): Promise<Res> => {
  const result = await fetch(endpoint, {
    method: "post",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
  const json = (await result.json()) as ApiResponse<Res>;

  if (json.type === "error") {
    throw new Error(json.message);
  }

  return json.data;
};

export const renderVideo = async ({ id, inputProps }: { id: string; inputProps: z.infer<typeof CompositionProps> }) => {
  const body: z.infer<typeof RenderRequest> = {
    id,
    inputProps,
  };

  return makeRequest<RenderMediaOnLambdaOutput>("/api/lambda/render", body);
};

export const getProgress = async ({ id, bucketName }: { id: string; bucketName: string }) => {
  const body: z.infer<typeof ProgressRequest> = {
    id,
    bucketName,
  };

  return makeRequest<ProgressResponse>("/api/lambda/progress", body);
};
