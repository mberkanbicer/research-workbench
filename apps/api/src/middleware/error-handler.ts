import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { AppError, formatErrorResponse } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Global error handler for Fastify
 */
export async function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id;
  const userId = request.user?.id;
  const params = request.params as Record<string, string>;
  const projectId = params?.projectId;

  // Log the error
  const errorContext = {
    requestId,
    userId,
    projectId,
    method: request.method,
    url: request.url,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  };

  // Determine if this is an operational error
  const isOperational = error instanceof AppError ? error.isOperational : false;

  if (isOperational) {
    logger.warn('Operational error', errorContext);
  } else {
    logger.error('Unexpected error', errorContext);
  }

  // Handle Zod validation errors
  if (error.name === 'ZodError') {
    const response = formatErrorResponse(error);
    return reply.status(400).send({
      ...response,
      requestId,
      code: 'VALIDATION_ERROR'
    });
  }

  // Handle Fastify validation errors
  if (error.name === 'FastifyError' && 'validation' in error) {
    return reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: (error as any).validation,
      requestId
    });
  }

  // Handle AppError instances
  if (error instanceof AppError) {
    const response = formatErrorResponse(error);
    return reply.status(error.statusCode).send({
      ...response,
      requestId
    });
  }

  // Handle other Error instances
  if (error instanceof Error) {
    const response = formatErrorResponse(error);
    return reply.status(500).send({
      ...response,
      requestId
    });
  }

  // Unknown error
  return reply.status(500).send({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    requestId
  });
}

/**
 * Not found handler
 */
export async function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return reply.status(404).send({
    code: 'NOT_FOUND',
    message: `Route ${request.method} ${request.url} not found`,
    requestId: request.id
  });
}

/**
 * Request timeout handler
 */
export async function timeoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return reply.status(408).send({
    code: 'REQUEST_TIMEOUT',
    message: 'Request timed out',
    requestId: request.id
  });
}
