import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import '@fastify/websocket';
import { collaborationService } from '../services/collaboration.service.js';
import { prisma } from '../prisma.js';
import { requireProjectAccess } from './ownership.js';
import { logger } from '../utils/logger.js';
import { URL } from 'url';

interface WSMessage {
  type: string;
  documentId?: string;
  userId?: string;
  userName?: string;
  change?: unknown;
  cursor?: { line: number; column: number };
  selection?: { start: number; end: number };
  collaboratorId?: string;
}

/**
 * Validate auth token from query string or first message.
 * Returns the authenticated user or null.
 */
async function validateWSToken(token: string): Promise<{ id: string; email: string; name: string | null } | null> {
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export async function collaborationWsRoutes(fastify: FastifyInstance) {
  // WebSocket endpoint for real-time collaboration
  fastify.get('/ws/collaborate/:documentId', { websocket: true }, async (socket: WebSocket, request: FastifyRequest) => {
    // Extract documentId from URL path (WebSocket routes may not populate request.params)
    const urlMatch = request.url.match(/\/ws\/collaborate\/([^?]+)/);
    const documentId = urlMatch?.[1] || (request.params as any)?.documentId;
    if (!documentId) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing documentId' }));
      socket.close();
      return;
    }

    let collaboratorId: string | null = null;
    let authenticatedUser: { id: string; email: string; name: string | null } | null = null;
    let authResolved = false;

    // Validate token from query string (?token=xxx) before accepting messages
    const rawUrl = request.url;
    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      const queryToken = parsed.searchParams.get('token');
      if (queryToken) {
        const user = await validateWSToken(queryToken);
        if (user) {
          authenticatedUser = user;
        } else {
          socket.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
          socket.close();
          return;
        }
      } else {
        // No token provided — close immediately
        socket.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
        socket.close();
        return;
      }
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid request' }));
      socket.close();
      return;
    }
    authResolved = true;

    socket.on('message', async (data) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'join': {
            if (!message.userId || !message.userName) {
              socket.send(JSON.stringify({ type: 'error', message: 'userId and userName required' }));
              return;
            }

            // Validate that the join request matches the authenticated user
            if (authenticatedUser && authenticatedUser.id !== message.userId) {
              socket.send(JSON.stringify({ type: 'error', message: 'userId does not match authenticated user' }));
              return;
            }

            // If no token was provided in query, validate from join message
            if (!authenticatedUser) {
              // Require token in the join message for unauthenticated connections
              socket.send(JSON.stringify({ type: 'error', message: 'Authentication required. Provide ?token= query parameter.' }));
              return;
            }

            // Verify user has access to this document's project
            const doc = await prisma.laTeXDocument.findUnique({ where: { id: documentId } });
            if (!doc) {
              socket.send(JSON.stringify({ type: 'error', message: 'Document not found' }));
              return;
            }
            const hasAccess = await prisma.researchProject.findFirst({
              where: { id: doc.projectId, userId: authenticatedUser.id },
              select: { id: true }
            });
            if (!hasAccess) {
              socket.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
              return;
            }

            const result = await collaborationService.joinDocument(
              documentId,
              message.userId,
              message.userName,
              socket
            );

            collaboratorId = result.collaboratorId;

            // Send initial state
            socket.send(JSON.stringify({
              type: 'joined',
              collaboratorId,
              color: result.color,
              content: result.state.content,
              version: result.state.version,
              collaborators: collaborationService.getCollaborators(documentId)
            }));
            break;
          }

          case 'change': {
            if (!collaboratorId || !message.change) return;

            await collaborationService.applyChange(
              documentId,
              collaboratorId,
              message.change as any,
              (message as any).clientVersion
            );
            break;
          }

          case 'cursor:update': {
            if (!collaboratorId || !message.cursor) return;
            collaborationService.updateCursor(collaboratorId, message.cursor);
            break;
          }

          case 'selection:update': {
            if (!collaboratorId || !message.selection) return;
            collaborationService.updateSelection(collaboratorId, message.selection);
            break;
          }

          case 'ping': {
            socket.send(JSON.stringify({ type: 'pong' }));
            break;
          }

          default:
            socket.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }));
        }
      } catch (error) {
        logger.error('WebSocket message error', { error: error instanceof Error ? error.message : 'Unknown error' });
        socket.send(JSON.stringify({ 
          type: 'error', 
          message: 'An error occurred processing your message'
        }));
      }
    });

    socket.on('close', () => {
      if (collaboratorId) {
        collaborationService.leaveDocument(collaboratorId);
      }
    });

    socket.on('error', (error) => {
      logger.error('WebSocket error', { error: error instanceof Error ? error.message : 'Unknown error' });
      if (collaboratorId) {
        collaborationService.leaveDocument(collaboratorId);
      }
    });
  });

  // REST endpoint to get collaborators for a document
  fastify.get('/documents/:documentId/collaborators', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };

    // Verify document exists and user owns the project
    const doc = await prisma.laTeXDocument.findUnique({
      where: { id: documentId }
    });

    if (!doc) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    if (!(await requireProjectAccess(prisma, reply, doc.projectId, request.user?.id))) return;

    const collaborators = collaborationService.getCollaborators(documentId);
    return { data: collaborators };
  });
}
