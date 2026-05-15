import { Header } from "@/components/common/Header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-8">{children}</div>
    </>
  );
}
