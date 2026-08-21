import { rolleErzwingen } from "@/lib/auth";
import { Navigation } from "@/components/Navigation";

export default async function InternLayout({ children }: { children: React.ReactNode }) {
  const benutzer = await rolleErzwingen();

  return (
    <div className="min-h-dvh">
      <Navigation name={benutzer.profil.name} rolle={benutzer.profil.rolle} />
      <main className="mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
