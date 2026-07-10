'use client';

import { useState } from 'react';
import PresenceIndicator from './PresenceIndicator';

interface ProjectHeaderProps {
  projectTitle: string;
  projectGoal: string;
  projectId: string;
  isRunInProgress: boolean;
  isRunPending: boolean;
  selectedModelCount: number;
  showModelSelector: boolean;
  isFailed: boolean;
  showRetry: boolean;
  activeRunId: string | null;
  retryPending: boolean;
  onStartRun: () => void;
  onRetryRun: () => void;
  onToggleModelSelector: () => void;
  onSaveProject: (title: string, goal: string) => void;
}

export default function ProjectHeader({
  projectTitle,
  projectGoal,
  projectId,
  isRunInProgress,
  isRunPending,
  selectedModelCount,
  showModelSelector,
  isFailed,
  showRetry,
  activeRunId,
  retryPending,
  onStartRun,
  onRetryRun,
  onToggleModelSelector,
  onSaveProject,
}: ProjectHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(projectTitle);
  const [editGoal, setEditGoal] = useState(projectGoal);

  return (
    <header className="flex flex-col md:flex-row justify-between items-start gap-4 bg-white p-6 md:p-10 rounded-3xl border border-gray-100 shadow-sm">
      <div className="flex-1 w-full">
        {isEditing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="w-full text-3xl font-extrabold text-black tracking-tight bg-gray-50 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <textarea
              value={editGoal}
              onChange={e => setEditGoal(e.target.value)}
              rows={3}
              className="w-full text-gray-500 text-lg leading-relaxed bg-gray-50 border rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onSaveProject(editTitle, editGoal);
                  setIsEditing(false);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="group flex items-start gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-extrabold mb-3 text-black tracking-tight">{projectTitle}</h1>
                <PresenceIndicator userName="You" />
              </div>
              <p className="text-gray-500 text-lg max-w-2xl leading-relaxed">{projectGoal}</p>
            </div>
            <button
              onClick={() => {
                setEditTitle(projectTitle);
                setEditGoal(projectGoal);
                setIsEditing(true);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600 text-sm px-2 py-1 rounded hover:bg-blue-50"
              title="Edit project details"
            >
              {'\u270E'}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
        {showRetry && activeRunId && (
          <button
            onClick={onRetryRun}
            disabled={retryPending}
            className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-bold shadow-sm hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 w-full md:w-auto"
          >
            {retryPending ? 'Retrying...' : 'Retry Failed Stage'}
          </button>
        )}
        <button
          onClick={onStartRun}
          disabled={isRunPending || isRunInProgress}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-sm hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 w-full md:w-auto"
        >
          {isRunInProgress ? 'Run In Progress...' : isRunPending ? 'Starting...' : selectedModelCount > 0 ? `Start with ${selectedModelCount} Model${selectedModelCount > 1 ? 's' : ''}` : showModelSelector ? 'Cancel' : 'Start New Run'}
        </button>
      </div>
    </header>
  );
}
