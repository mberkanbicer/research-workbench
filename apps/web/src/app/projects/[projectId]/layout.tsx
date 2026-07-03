import InspectorPanel from '@/components/InspectorPanel';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <InspectorPanel />
    </>
  );
}