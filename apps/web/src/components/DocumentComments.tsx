'use client';

import { useState, useEffect, useRef } from 'react';
import {
  useDocumentComments,
  useCreateDocumentComment,
  useUpdateDocumentComment,
  useDeleteDocumentComment,
  useResolveDocumentComment,
  type DocumentComment,
} from '@/hooks/useCollaboration';

interface DocumentCommentsProps {
  documentId: string;
  pendingSelection?: { start: number; end: number } | null;
  onClearSelection?: () => void;
  activeCommentId?: string | null;
  onClearActiveComment?: () => void;
}

export function DocumentComments({ documentId, pendingSelection, onClearSelection, activeCommentId, onClearActiveComment }: DocumentCommentsProps) {
  const { data: comments = [], isLoading } = useDocumentComments(documentId);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [newCommentText, setNewCommentText] = useState('');
  const createComment = useCreateDocumentComment();

  const filteredComments = comments.filter((c) => {
    if (filter === 'open') return !c.resolved;
    if (filter === 'resolved') return c.resolved;
    return true;
  });

  const openCount = comments.filter((c) => !c.resolved).length;
  const resolvedCount = comments.filter((c) => c.resolved).length;

  const handleCreateComment = async () => {
    if (!newCommentText.trim() || !pendingSelection) return;
    await createComment.mutateAsync({
      documentId,
      content: newCommentText,
      startOffset: pendingSelection.start,
      endOffset: pendingSelection.end,
    });
    setNewCommentText('');
    onClearSelection?.();
  };

  // Scroll to active comment when clicked from editor highlight
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeCommentId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-comment-id="${activeCommentId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onClearActiveComment?.();
    }
  }, [activeCommentId, comments, onClearActiveComment]);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading comments...</div>;
  }

  return (
    <div className="border rounded-lg bg-white">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm">Comments</h3>
          <span className="text-xs text-gray-500">
            {openCount} open, {resolvedCount} resolved
          </span>
        </div>
        <div className="flex gap-1">
          {(['all', 'open', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-xs rounded ${
                filter === f
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* New comment form — shown when text is selected in editor */}
      {pendingSelection && (
        <div className="px-4 py-3 border-b bg-indigo-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-indigo-700">
              New comment on selected text (chars {pendingSelection.start}–{pendingSelection.end})
            </span>
            <button
              onClick={onClearSelection}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Write a comment..."
            className="w-full border rounded px-2 py-1 text-sm resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-1 mt-2">
            <button
              onClick={onClearSelection}
              className="px-2 py-1 text-xs text-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateComment}
              disabled={!newCommentText.trim() || createComment.isPending}
              className="px-3 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
            >
              {createComment.isPending ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </div>
      )}

      {/* Comments list */}
      <div ref={listRef} className="divide-y max-h-[32rem] overflow-y-auto">
        {filteredComments.map((comment) => (
          <div key={comment.id} data-comment-id={comment.id}>
            <CommentThread
              comment={comment}
              documentId={documentId}
              isHighlighted={comment.id === activeCommentId}
            />
          </div>
        ))}

        {filteredComments.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            {filter === 'all'
              ? 'No comments yet. Select text in the editor to add a comment.'
              : `No ${filter} comments.`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Comment Thread ─────────────────────────────────────────────────────────

function CommentThread({
  comment,
  documentId,
  isHighlighted,
}: {
  comment: DocumentComment;
  documentId: string;
  isHighlighted?: boolean;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const createComment = useCreateDocumentComment();
  const updateComment = useUpdateDocumentComment();
  const deleteComment = useDeleteDocumentComment();
  const resolveComment = useResolveDocumentComment();

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    await createComment.mutateAsync({
      documentId,
      content: replyContent,
      startOffset: comment.startOffset,
      endOffset: comment.endOffset,
      parentId: comment.id,
    });
    setReplyContent('');
    setShowReplyForm(false);
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    await updateComment.mutateAsync({ documentId, commentId, content: editContent });
    setEditingId(null);
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    await deleteComment.mutateAsync({ documentId, commentId });
  };

  return (
    <div className={`px-4 py-3 transition-colors ${comment.resolved ? 'bg-gray-50 opacity-75' : ''} ${isHighlighted ? 'bg-yellow-50 ring-2 ring-yellow-300' : ''}`}>
      {/* Main comment */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
            {comment.user.name?.[0]?.toUpperCase() || comment.user.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{comment.user.name || comment.user.email}</span>
              <span className="text-xs text-gray-400">
                {new Date(comment.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {comment.resolved && (
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                  Resolved
                </span>
              )}
            </div>

            {editingId === comment.id ? (
              <div className="mt-1">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm resize-none"
                  rows={3}
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => handleEdit(comment.id)}
                    className="px-2 py-0.5 text-xs bg-indigo-500 text-white rounded"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-2 py-0.5 text-xs text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{comment.content}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => resolveComment.mutateAsync({ documentId, commentId: comment.id })}
            className={`text-xs px-1.5 py-0.5 rounded ${
              comment.resolved
                ? 'text-yellow-600 hover:text-yellow-800'
                : 'text-green-600 hover:text-green-800'
            }`}
            title={comment.resolved ? 'Reopen' : 'Resolve'}
          >
            {comment.resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button
            onClick={() => {
              setEditingId(comment.id);
              setEditContent(comment.content);
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Edit
          </button>
          <button
            onClick={() => handleDelete(comment.id)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 mt-2 space-y-2 border-l-2 border-gray-100 pl-3">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 shrink-0">
                {reply.user.name?.[0]?.toUpperCase() || reply.user.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{reply.user.name || reply.user.email}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(reply.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      {showReplyForm ? (
        <div className="ml-8 mt-2">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Write a reply..."
            className="w-full border rounded px-2 py-1 text-sm resize-none"
            rows={2}
          />
          <div className="flex gap-1 mt-1">
            <button
              onClick={handleReply}
              disabled={!replyContent.trim()}
              className="px-2 py-0.5 text-xs bg-indigo-500 text-white rounded disabled:opacity-50"
            >
              Reply
            </button>
            <button
              onClick={() => { setShowReplyForm(false); setReplyContent(''); }}
              className="px-2 py-0.5 text-xs text-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowReplyForm(true)}
          className="ml-8 mt-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          Reply
        </button>
      )}
    </div>
  );
}
