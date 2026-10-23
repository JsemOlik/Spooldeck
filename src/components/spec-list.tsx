export function SpecList({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  const visible = items.filter(([, v]) => v != null && v !== "" && v !== "—");
  if (visible.length === 0) return <p className="text-muted-foreground text-sm">Nothing recorded.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {visible.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
