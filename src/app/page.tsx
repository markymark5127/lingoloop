import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default async function Landing() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/home");
  const t = await getT();

  const features = [
    { icon: "🎬", title: t("Short videos"), text: t("Swipe a personalized feed with tappable captions.") },
    { icon: "📖", title: t("Serialized stories"), text: t("Narrated chapters with recurring characters.") },
    { icon: "🎮", title: t("Mini-games"), text: t("Quick, tactile challenges that adapt to you.") },
    { icon: "💬", title: t("Conversations"), text: t("Roleplay by voice or text with AI characters.") },
  ];
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-display text-lg font-black text-white">L</span>
          <span className="font-display text-xl font-extrabold">LingoLoop</span>
        </span>
        <span className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-surface-2">
            {t("Log in")}
          </Link>
        </span>
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <p className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">{t("Spanish & Japanese for English speakers · A1–B1")}</p>
        <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          {t("Learn Spanish or Japanese from content you")} <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">{t("actually enjoy")}</span>{t(".")}
        </h1>
        <p className="max-w-xl text-lg text-muted">{t("Watch, read, play and talk. One adaptive engine learns what you know and what you struggle with — and every activity shapes the next.")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="rounded-full bg-accent-gradient px-7 py-3 font-semibold text-white shadow-lg shadow-accent/30 hover:brightness-110">
            {t("Start learning — free")}
          </Link>
          <Link href="/login" className="glass rounded-full px-7 py-3 font-semibold hover:brightness-105">
            {t("I have an account")}
          </Link>
        </div>
      </section>
      <section className="grid gap-3 pb-8 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="glass rounded-[28px] p-5">
            <div className="emoji text-3xl">{f.icon}</div>
            <h2 className="mt-3 font-display font-bold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted">{f.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
