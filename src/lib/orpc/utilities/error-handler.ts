/**
 * Enhanced error handler for oRPC procedures
 */
export const handleServiceError = (error: unknown, operation: string): never => {
  console.error(`❌ Failed to ${operation}:`);
  console.error('Error object:', error);
  console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');

  if (error instanceof Error) {
    throw new Error(error.message);
  }

  throw new Error(`Failed to ${operation}`);
};

/**
 * Async error handler wrapper for service calls
 */
export const withErrorHandling = <T extends any[], R>(serviceMethod: (...args: T) => Promise<R>, operation: string) => {
  return async (...args: T): Promise<R> => {
    try {
      return await serviceMethod(...args);
    } catch (error) {
      return handleServiceError(error, operation);
    }
  };
};
