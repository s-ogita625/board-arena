import { Header } from "@/components/common/Header";
import { PresenceProvider } from "@/components/common/PresenceProvider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PresenceProvider>
      <Header />
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-50" />
        <div className="pointer-events-none absolute inset-0 noise" />
        <div className="relative max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
          {children}
        </div>
      </div>
    </PresenceProvider>
  );
}
