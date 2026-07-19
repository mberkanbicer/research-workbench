import Link from 'next/link';

const links = [
  { href: '/timeline', label: 'Deliberation Timeline' },
  { href: '/evidence', label: 'Evidence Commons' },
  { href: '/ideas', label: 'Idea Evolution' },
  { href: '/decisions', label: 'Decision Ledger' },
  { href: '/hypotheses', label: 'Hypotheses' },
  { href: '/tasks', label: 'Research Tasks' },
  { href: '/argument-map', label: 'Argument Map' },
  { href: '/graph', label: 'Citation Graph' },
  { href: '/runs/compare', label: 'Compare Runs' },
  { href: '/literature-reviews', label: 'Literature Reviews' },
  { href: '/claim-dependencies', label: 'Claim Dependencies' },
  { href: '/references', label: 'References' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/latex', label: 'LaTeX Editor' },
];

interface ProjectNavLinksProps {
  projectId: string;
}

export default function ProjectNavLinks({ projectId }: ProjectNavLinksProps) {
  return (
    <nav className="flex flex-col space-y-1">
      {links.map((link) => (
        <Link
          key={link.href}
          href={`/projects/${projectId}${link.href}`}
          className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium"
        >
          {link.label}
        </Link>
      ))}
      <Link
        href="/settings/evaluation-criteria"
        className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium"
      >
        Evaluation Criteria
      </Link>
    </nav>
  );
}
