import dynamic from "next/dynamic";

const Peta = dynamic(() => import("@/components/Peta"), { ssr: false });

export default function Home() {
  return (
    <main className="relative mx-auto h-dvh max-w-md overflow-hidden">
      <Peta />
    </main>
  );
}
