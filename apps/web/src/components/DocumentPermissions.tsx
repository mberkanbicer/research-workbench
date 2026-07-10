'use client';

import { useState } from 'react';
import {
  useDocumentPermissions,
  useGrantDocumentPermission,
  useUpdateDocumentPermission,
  useRevokeDocumentPermission,
} from '@/hooks/useCollaboration';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

interface DocumentPermissionsProps {
  documentId: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  admin: { label: 'Admin', color: 'bg-purple-100 text-purple-800', description: 'Full access including permission management' },
  editor: { label: 'Editor', color: 'bg-blue-100 text-blue-800', description: 'Can view and edit the document' },
  viewer: { label: 'Viewer', color: 'bg-gray-100 text-gray-800', description: 'Can only view the document' },
};

export function DocumentPermissions({ documentId }: DocumentPermissionsProps) {
  const { data: permissions, isLoading } = useDocumentPermissions(documentId);
  const grantMutation = useGrantDocumentPermission();
  const updateMutation = useUpdateDocumentPermission();
  const revokeMutation = useRevokeDocumentPermission();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<string>('viewer');

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-gray-500">Loading permissions...</div>
    );
  }

  if (!permissions) return null;

  const [lookupError, setLookupError] = useState('');

  const handleGrant = async () => {
    if (!newEmail.trim()) return;
    setLookupError('');
    try {
      // Look up userId by email
      const res = await apiFetch(`${API_BASE}/auth/lookup?email=${encodeURIComponent(newEmail.trim())}`);
      if (!res.ok) {
        const err = await res.json();
        setLookupError(err.error?.message || 'User not found');
        return;
      }
      const { data: user } = await res.json();
      await grantMutation.mutateAsync({
        documentId,
        userId: user.id,
        role: newRole,
      });
      setNewEmail('');
      setShowAddForm(false);
    } catch {
      setLookupError('Failed to look up user');
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    await updateMutation.mutateAsync({ documentId, targetUserId, role: newRole });
  };

  const handleRevoke = async (targetUserId: string) => {
    await revokeMutation.mutateAsync({ documentId, targetUserId });
  };

  const allUsers = [
    ...(permissions.owner ? [permissions.owner] : []),
    ...permissions.permissions,
  ];

  return (
    <div className="border rounded-lg bg-white">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-medium text-sm">Sharing & Permissions</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          + Add person
        </button>
      </div>

      {/* Add person form */}
      {showAddForm && (
        <div className="px-4 py-3 border-b bg-gray-50 space-y-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email address"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm flex-1"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={handleGrant}
              disabled={!newEmail.trim() || grantMutation.isPending}
              className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
            >
              {grantMutation.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
          {lookupError && (
            <p className="text-xs text-red-600 mt-1">{lookupError}</p>
          )}
        </div>
      )}

      {/* Permissions list */}
      <div className="divide-y">
        {allUsers.map((user) => {
          const roleInfo = ROLE_LABELS[user.role] || ROLE_LABELS.viewer;
          const isOwner = user.isOwner;

          return (
            <div key={user.userId} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                  {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <div className="text-sm font-medium">{user.name || user.email}</div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isOwner ? (
                  <span className="text-xs text-gray-500 italic">Owner</span>
                ) : permissions.yourRole === 'admin' ? (
                  <>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.userId, e.target.value)}
                      className="text-xs border rounded px-1.5 py-1"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => handleRevoke(user.userId)}
                      className="text-xs text-red-500 hover:text-red-700"
                      title="Remove access"
                    >
                      x
                    </button>
                  </>
                ) : (
                  <span className={`px-2 py-0.5 rounded text-xs ${roleInfo.color}`}>
                    {roleInfo.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {allUsers.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            No permissions set yet
          </div>
        )}
      </div>

      {/* Role descriptions */}
      <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500 space-y-1">
        <div><span className="font-medium">Admin:</span> Full access, manage permissions</div>
        <div><span className="font-medium">Editor:</span> View and edit document</div>
        <div><span className="font-medium">Viewer:</span> Read-only access</div>
      </div>
    </div>
  );
}
