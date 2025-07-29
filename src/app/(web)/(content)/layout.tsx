import Starfield from "react-starfield";

import Navbar from "components/shared/Navbar";
import { NavigationProvider } from "components/shared/Navbar/navigationProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <NavigationProvider>
      <Starfield speedFactor={0.05} starColor={[255, 255, 255]} starCount={1000} />
      <Navbar />
      <section className="max-w-screen relative z-50 flex flex-col w-full">{children}</section>
    </NavigationProvider>
  );
}
