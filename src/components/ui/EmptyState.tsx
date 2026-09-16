export const EmptyState = ({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) => (
  <div className="rounded-[24px] border border-dashed border-linea bg-surface/60 px-6 py-10 text-center">
    <p className="font-display text-xl uppercase tracking-tight text-carbon">{title}</p>
    {body && <p className="mt-2 text-sm text-carbon/55">{body}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);
