import { cacheLife } from "next/cache";

import { ButtonLink, Container, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { getPhotoCommunities } from "lib/timeline/photos";

import PhotoIndex from "./PhotoIndex";

export const metadata = pageMetadata({
  title: "Las fotos de la comunidad tech uruguaya",
  description:
    "Todas las fotos de cada comunidad tech de Uruguay en un solo lugar: sus meetups, conferencias y hackatones, de Meetup, Flickr y sus archivos.",
  path: "/timeline/fotos",
});

const number = new Intl.NumberFormat("es-UY");

export default async function PhotosIndexPage() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const communities = getPhotoCommunities();
  const photos = communities.reduce((sum, community) => sum + community.photos, 0);

  return (
    <>
      <main>
        <PageHeader
          actions={
            <ButtonLink href="/timeline" variant="secondary">
              Volver a la historia
            </ButtonLink>
          }
          description={
            <>
              {number.format(photos)} fotos de {communities.length} comunidades, cada una con todas las suyas en un
              mismo lugar: elegí una y recorré sus eventos sin abrirlos de a uno.
            </>
          }
          eyebrow="Historia · Fotos"
          title="Las fotos de cada comunidad"
        />
        <Container className="pb-16">
          <PhotoIndex communities={communities} />
        </Container>
      </main>
      <Footer />
    </>
  );
}
