import Image from "next/image";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen w-full bg-zinc-900">
      {/* Left Side - Image */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-1/2">
        <div className="absolute inset-0 z-10 bg-gradient-to-br from-zinc-900/20 to-zinc-900/60" />
        <Image
          src="/static/auth/background.webp"
          alt="Tech Community"
          fill
          className="object-cover opacity-75"
          priority
        />
        <div className="absolute bottom-8 left-8 z-20 text-white">
          <h2 className="mb-2 text-3xl font-bold">
            Bienvenidos a <span className="text-yellow-400">OWU Uruguay</span>
          </h2>
          <p className="max-w-md text-lg text-zinc-300">
            Un espacio donde personas apasionadas por la tecnología se reúnen, comparten y convierten sus ideas en
            realidad.
          </p>
        </div>
      </div>

      {/* Right Side - Form Content */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2 lg:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
