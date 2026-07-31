/** A data table. Wide tables scroll inside their own container, never the page. */
export function DataTable({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: string[][];
  caption?: string;
}) {
  return (
    <figure className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">
        {caption && (
          <caption className="caption-bottom py-2 text-[11px] text-muted-foreground">
            {caption}
          </caption>
        )}
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-foreground whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
