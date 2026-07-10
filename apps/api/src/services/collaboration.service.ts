import { prisma } from '../prisma.js';
import { logger } from '../utils/logger.js';
import { WebSocket } from 'ws';
import crypto from 'crypto';

export interface Collaborator {
  id: string;
  userId: string;
  userName: string;
  documentId: string;
  socket: WebSocket;
  cursor?: { line: number; column: number };
  selection?: { start: number; end: number };
  color: string;
  lastActive: Date;
}

export interface DocumentChange {
  type: 'insert' | 'delete' | 'replace';
  position: number;
  content?: string;
  length?: number;
  userId: string;
  timestamp: number;
  version: number;
}

export interface DocumentState {
  content: string;
  version: number;
  lastModified: Date;
  collaborators: Map<string, Collaborator>;
}

// Colors for different collaborators
const COLLABORATOR_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

class CollaborationService {
  private documents: Map<string, DocumentState> = new Map();
  private collaborators: Map<string, Collaborator> = new Map();
  private colorIndex: number = 0;

  /**
   * Get or create document state
   */
  private async getDocumentState(documentId: string): Promise<DocumentState> {
    if (!this.documents.has(documentId)) {
      // Load from database
      const doc = await prisma.laTeXDocument.findUnique({
        where: { id: documentId }
      });

      if (!doc) {
        throw new Error(`Document not found: ${documentId}`);
      }

      this.documents.set(documentId, {
        content: doc.content,
        version: 1,
        lastModified: new Date(),
        collaborators: new Map()
      });
    }

    return this.documents.get(documentId)!;
  }

  /**
   * Join a document for collaborative editing
   */
  async joinDocument(
    documentId: string,
    userId: string,
    userName: string,
    socket: WebSocket
  ): Promise<{ state: DocumentState; collaboratorId: string; color: string }> {
    const state = await this.getDocumentState(documentId);
    
    const collaboratorId = crypto.randomUUID();
    const color = COLLABORATOR_COLORS[this.colorIndex % COLLABORATOR_COLORS.length];
    this.colorIndex++;

    const collaborator: Collaborator = {
      id: collaboratorId,
      userId,
      userName,
      documentId,
      socket,
      color,
      lastActive: new Date()
    };

    state.collaborators.set(collaboratorId, collaborator);
    this.collaborators.set(collaboratorId, collaborator);

    // Notify other collaborators
    this.broadcast(documentId, {
      type: 'collaborator:join',
      collaborator: {
        id: collaboratorId,
        userName,
        color
      }
    }, collaboratorId);

    // Send current state to the new collaborator
    return {
      state,
      collaboratorId,
      color
    };
  }

  /**
   * Leave a document
   */
  leaveDocument(collaboratorId: string): void {
    const collaborator = this.collaborators.get(collaboratorId);
    if (!collaborator) return;

    const state = this.documents.get(collaborator.documentId);
    if (state) {
      state.collaborators.delete(collaboratorId);
      
      // Notify others
      this.broadcast(collaborator.documentId, {
        type: 'collaborator:leave',
        collaboratorId
      }, collaboratorId);

      // Cleanup empty documents
      if (state.collaborators.size === 0) {
        this.documents.delete(collaborator.documentId);
      }
    }

    this.collaborators.delete(collaboratorId);
  }

  /**
   * Apply a change to the document
   */
  async applyChange(
    documentId: string,
    collaboratorId: string,
    change: Omit<DocumentChange, 'userId' | 'timestamp' | 'version'>,
    clientVersion?: number
  ): Promise<{ state: DocumentState; conflict: boolean }> {
    const state = await this.getDocumentState(documentId);
    const collaborator = this.collaborators.get(collaboratorId);

    if (!collaborator) {
      throw new Error(`Collaborator not found: ${collaboratorId}`);
    }

    // Version conflict detection — reject if client is stale
    if (clientVersion !== undefined && clientVersion < state.version) {
      // Send conflict notification to the client
      collaborator.socket.send(JSON.stringify({
        type: 'conflict',
        serverVersion: state.version,
        serverContent: state.content,
        clientVersion,
        message: 'Your changes conflict with newer edits. Please review and retry.',
      }));
      return { state, conflict: true };
    }

    // Apply the change
    let newContent = state.content;
    
    switch (change.type) {
      case 'insert':
        newContent = newContent.slice(0, change.position) + 
                     (change.content || '') + 
                     newContent.slice(change.position);
        break;
      case 'delete':
        newContent = newContent.slice(0, change.position) + 
                     newContent.slice(change.position + (change.length || 0));
        break;
      case 'replace':
        newContent = newContent.slice(0, change.position) + 
                     (change.content || '') + 
                     newContent.slice(change.position + (change.length || 0));
        break;
    }

    // Update state
    state.content = newContent;
    state.version++;
    state.lastModified = new Date();
    collaborator.lastActive = new Date();

    // Save to database (debounced in production)
    await this.saveDocument(documentId, newContent);

    // Broadcast change to other collaborators with full content for sync
    this.broadcast(documentId, {
      type: 'change',
      change: {
        ...change,
        userId: collaborator.userId,
        timestamp: Date.now(),
        version: state.version,
        fullContent: newContent,
      },
      collaboratorId,
    }, collaboratorId);

    return { state, conflict: false };
  }

  /**
   * Update cursor position
   */
  updateCursor(collaboratorId: string, cursor: { line: number; column: number }): void {
    const collaborator = this.collaborators.get(collaboratorId);
    if (!collaborator) return;

    collaborator.cursor = cursor;
    collaborator.lastActive = new Date();

    // Broadcast cursor update
    this.broadcast(collaborator.documentId, {
      type: 'cursor:update',
      collaboratorId,
      cursor
    }, collaboratorId);
  }

  /**
   * Update selection
   */
  updateSelection(collaboratorId: string, selection: { start: number; end: number }): void {
    const collaborator = this.collaborators.get(collaboratorId);
    if (!collaborator) return;

    collaborator.selection = selection;
    collaborator.lastActive = new Date();

    // Broadcast selection update
    this.broadcast(collaborator.documentId, {
      type: 'selection:update',
      collaboratorId,
      selection
    }, collaboratorId);
  }

  /**
   * Broadcast message to all collaborators except sender
   */
  private broadcast(documentId: string, message: unknown, excludeCollaboratorId?: string): void {
    const state = this.documents.get(documentId);
    if (!state) return;

    const messageStr = JSON.stringify(message);
    
    state.collaborators.forEach((collaborator) => {
      if (collaborator.id !== excludeCollaboratorId && 
          collaborator.socket.readyState === WebSocket.OPEN) {
        collaborator.socket.send(messageStr);
      }
    });
  }

  /**
   * Save document to database and create version snapshot
   */
  private async saveDocument(documentId: string, content: string): Promise<void> {
    try {
      // Get current document to check if content actually changed
      const doc = await prisma.laTeXDocument.findUnique({
        where: { id: documentId },
        select: { content: true, title: true, metadata: true }
      });

      if (doc && doc.content === content) return; // No change, skip save

      // Update document content
      await prisma.laTeXDocument.update({
        where: { id: documentId },
        data: {
          content,
          updatedAt: new Date()
        }
      });

      // Auto-create version snapshot (throttled: max once per 30 seconds)
      const now = Date.now();
      const lastVersionKey = `lastVersion_${documentId}`;
      const lastVersionTime = (this as any)[lastVersionKey] || 0;

      if (now - lastVersionTime > 30000) {
        (this as any)[lastVersionKey] = now;

        // Get next version number
        const lastVersion = await prisma.documentVersion.findFirst({
          where: { documentId },
          orderBy: { version: 'desc' }
        });

        const nextVersion = (lastVersion?.version || 0) + 1;

        // Only create version if there's meaningful content
        if (content.trim().length > 0) {
          await prisma.documentVersion.create({
            data: {
              documentId,
              version: nextVersion,
              content,
              title: doc?.title || 'Untitled',
              metadata: doc?.metadata as any,
              message: `Auto-saved v${nextVersion}`
            }
          });
        }
      }
    } catch (error) {
      logger.error('Failed to save document', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Get collaborators for a document
   */
  getCollaborators(documentId: string): Array<{
    id: string;
    userId: string;
    userName: string;
    color: string;
    cursor?: { line: number; column: number };
    selection?: { start: number; end: number };
  }> {
    const state = this.documents.get(documentId);
    if (!state) return [];

    return Array.from(state.collaborators.values()).map(c => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      color: c.color,
      cursor: c.cursor,
      selection: c.selection
    }));
  }

  /**
   * Cleanup inactive collaborators (called periodically)
   */
  cleanupInactive(timeoutMs: number = 5 * 60 * 1000): void {
    const now = new Date();
    
    this.collaborators.forEach((collaborator, id) => {
      const timeSinceActive = now.getTime() - collaborator.lastActive.getTime();
      if (timeSinceActive > timeoutMs) {
        this.leaveDocument(id);
      }
    });
  }
}

export const collaborationService = new CollaborationService();
