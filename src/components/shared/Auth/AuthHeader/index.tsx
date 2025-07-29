import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface AuthHeaderProps {
  title: string;
  description: string;
}

export default function AuthHeader({ title, description }: AuthHeaderProps) {
  return (
    <>
      <Link href="/" className="mb-8 inline-flex items-center text-zinc-400 transition-colors hover:text-yellow-400">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver a la página principal
      </Link>

      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-white">{title}</h1>
        <p className="text-zinc-400">{description}</p>
      </div>
    </>
  );
}
