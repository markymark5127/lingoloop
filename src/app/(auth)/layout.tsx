import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-display text-xl font-black text-white">L</span>
        <span className="font-display text-2xl font-extrabold">LingoLoop</span>
      </Link>
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-sm">{children}</div>
    </main>
  );
}
