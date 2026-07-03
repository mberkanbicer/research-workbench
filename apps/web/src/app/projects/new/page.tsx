'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useCreateProject, useTemplates, useCreateProjectFromTemplate } from '@/hooks/useApi';
import { useState } from 'react';
import type { CreateProjectInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useCreateProject();
  const { data: templatesData } = useTemplates();
  const createFromTemplate = useCreateProjectFromTemplate();
  const [mode, setMode] = useState<'manual' | 'template'>('manual');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [topic, setTopic] = useState('');

  const templates = (templatesData?.data as any[]) || [];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectInput>({
    defaultValues: { title: '', goal: '', initialIdea: '' },
  });

  const onSubmit = async (data: CreateProjectInput) => {
    const result = await createProject.mutateAsync(data);
    router.push(`/projects/${result.data.project.id}`);
  };

  const onSubmitTemplate = async () => {
    if (!selectedTemplate || !topic.trim()) return;
    const template = templates.find((t: any) => t.id === selectedTemplate);
    const title = `${template?.name || 'Research'}: ${topic}`;
    const result = await createFromTemplate.mutateAsync({
      templateId: selectedTemplate,
      title,
      topic: topic.trim(),
    });
    const data = result.data as any;
    router.push(`/projects/${data.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="bg-white p-8 md:p-12 rounded-3xl border border-gray-100 shadow-sm">
        <h1 className="text-3xl font-extrabold mb-2 text-black">Start New Research</h1>
        <p className="text-gray-500 mb-6">Define your objective and initial hypothesis to begin deliberation.</p>

        {/* Mode selector */}
        <div className="flex gap-2 mb-8">
          <button onClick={() => setMode('manual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Manual
          </button>
          <button onClick={() => setMode('template')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'template' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            From Template
          </button>
        </div>

        {mode === 'manual' ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Project Title</label>
              <input
                type="text"
                {...register('title', { required: 'Title is required', minLength: { value: 1, message: 'Title is required' } })}
                className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 transition-all outline-none"
                placeholder="e.g., Future of Decentralized Storage"
              />
              {errors.title && <p className="text-sm text-red-600 mt-1">{errors.title.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Research Goal</label>
              <textarea
                {...register('goal', { required: 'Goal is required' })}
                className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 h-28 transition-all outline-none resize-none"
                placeholder="What specific truth or feasibility are you trying to determine?"
              />
              {errors.goal && <p className="text-sm text-red-600 mt-1">{errors.goal.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Initial Idea / Hypothesis</label>
              <textarea
                {...register('initialIdea', { required: 'Initial idea is required' })}
                className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 h-40 transition-all outline-none resize-none"
                placeholder="Describe your current starting point in detail..."
              />
              {errors.initialIdea && <p className="text-sm text-red-600 mt-1">{errors.initialIdea.message}</p>}
            </div>
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting || createProject.isPending}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-sm hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {isSubmitting || createProject.isPending ? 'Initializing...' : 'Initialize Project'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Select Template</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${selectedTemplate === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <p className="font-bold text-sm">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 transition-all outline-none"
                placeholder="e.g., Quantum Computing Applications"
              />
            </div>
            <div className="pt-4">
              <button
                onClick={onSubmitTemplate}
                disabled={createFromTemplate.isPending || !selectedTemplate || !topic.trim()}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-sm hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {createFromTemplate.isPending ? 'Creating...' : 'Create from Template'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
