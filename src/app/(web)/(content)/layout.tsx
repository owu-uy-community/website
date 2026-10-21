import Starfield from "react-starfield";

import { CommandPaletteProvider } from "components/community/CommandPalette";
import Navbar from "components/shared/Navbar";
import { getSearchIndex } from "lib/community/search";

export default async function ContentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const searchIndex = await getSearchIndex();

  return (
    <div className="owu-site relative flex min-h-screen w-full flex-col">
      <Starfield speedFactor={0.04} starColor={[255, 255, 255]} starCount={700} />
      <CommandPaletteProvider items={searchIndex}>
        <Navbar />
        <div className="relative z-20 flex w-full max-w-screen flex-1 flex-col">{children}</div>
      </CommandPaletteProvider>
    </div>
  );
}
