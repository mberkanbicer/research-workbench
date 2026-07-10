'use client';

import { useEffect, useState } from 'react';
import type { Collaborator } from '@/hooks/useCollaboration';

interface TypingIndicatorProps {
  collaborators: Collaborator[];
  currentUserId?: string;
  maxNames?: number;
}

interface TypingUser {
  id: string;
  userName: string;
  color: string;
  elapsed: number;
}

export function TypingIndicator({
  collaborators,
  currentUserId = '',
  maxNames = 3,
}: TypingIndicatorProps) {
  const [, setTick] = useState(0);

  // Re-render every second to update elapsed time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const typingUsers: TypingUser[] = collaborators
    .filter((c) => c.isTyping && c.userId !== currentUserId)
    .map((c) => ({
      id: c.id,
      userName: c.userName,
      color: c.color,
      elapsed: c.typingStartedAt ? Date.now() - c.typingStartedAt : 0,
    }));

  if (typingUsers.length === 0) return null;

  const visible = typingUsers.slice(0, maxNames);
  const remaining = typingUsers.length - maxNames;

  // Build the text
  let text = '';
  if (visible.length === 1) {
    text = `${visible[0].userName} is typing`;
  } else if (visible.length === 2) {
    text = `${visible[0].userName} and ${visible[1].userName} are typing`;
  } else if (visible.length === 3 && remaining === 0) {
    text = `${visible[0].userName}, ${visible[1].userName}, and ${visible[2].userName} are typing`;
  } else {
    text = `${visible[0].userName} and ${typingUsers.length} others are typing`;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg">
      {/* Animated dots */}
      <div className="flex gap-0.5">
        {visible.map((user, i) => (
          <div key={user.id} className="relative">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: user.color }}
            >
              {user.userName.charAt(0).toUpperCase()}
            </div>
            {/* Typing bounce animation */}
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                backgroundColor: user.color,
                animationDelay: `${i * 150}ms`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Text */}
      <span className="text-xs text-indigo-700 font-medium">
        {text}
      </span>

      {/* Animated ellipsis */}
      <div className="flex gap-0.5">
        <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

/**
 * Inline typing indicator for the editor status bar.
 * Shows a compact version with just dots and name.
 */
export function TypingIndicatorInline({
  collaborators,
  currentUserId = '',
}: TypingIndicatorProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const typingUsers = collaborators.filter(
    (c) => c.isTyping && c.userId !== currentUserId
  );

  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((c) => c.userName);
  let text = '';
  if (names.length === 1) {
    text = `${names[0]} typing...`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} typing...`;
  } else {
    text = `${names[0]} and ${names.length - 1} others typing...`;
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <div className="flex gap-px">
        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{text}</span>
    </div>
  );
}
