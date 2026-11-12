import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-display text-xl font-black text-white">L</span>
        <span className="font-display text-2xl font-extrabold">LingoLoop</span>
      </Link>
      <div className="w-full max-w-sm glass rounded-[32px] p-6 shadow-sm">{children}</div>
    </main>
  );
}
