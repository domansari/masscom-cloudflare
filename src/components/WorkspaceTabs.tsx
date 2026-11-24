import { Link } from "react-router-dom";

type WorkspaceTab = { label: string; to: string; active: boolean };

export default function WorkspaceTabs({ label, tabs }: { label: string; tabs: WorkspaceTab[] }) {
  return (
    <div className="relative z-10 mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
      <nav aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg border border-white/20 bg-black/20 p-1 shadow-sm backdrop-blur-lg">
        {tabs.map(tab => (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={tab.active ? "page" : undefined}
            className={tab.active
              ? "rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              : "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
