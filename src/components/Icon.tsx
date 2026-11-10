const paths = {
  note: "M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10ZM14 3v7h7",
  layers: "m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  settings: "M4 6h5m4 0h7M4 12h10m4 0h2M4 18h2m4 0h10M9 3v6m5 0v6M6 15v6",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  pin: "M8 3h8l-1 6 3 4H6l3-4-1-6Z M12 13v8",
  indent: "M3 5h18M10 9h11M10 15h11M3 19h18M2 12h6M5 9l3 3-3 3",
  outdent: "M3 5h18M10 9h11M10 15h11M3 19h18M8 12H2M5 9l-3 3 3 3",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-4l2 3M4 17l2 3a8 8 0 0 0 13-4",
  check: "m5 12 4 4L19 6",
  issue: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 8v5m0 3h.01",
  merge:
    "M6 8v8m12-8v8M9 5h3a6 6 0 0 1 6 6M9 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0m0 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0m12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  message: "M21 11a9 9 0 0 1-9 9H4l-3 2 2-6a9 9 0 1 1 18-5",
  branch:
    "M6 9v6m0-3h6a6 6 0 0 0 6-6M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0m0 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  filter: "M4 5h16l-6 7v7l-4 2v-9Z",
  server: "M3 3h18v7H3Zm0 11h18v7H3ZM7 6.5h.01M7 17.5h.01",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
