import { ArrowUpRight } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommunityLogo, Container, headingClassName, TitleBar } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { getCommunityPhotos, getPhotoCommunities } from "lib/timeline/photos";

import Provenance from "../../Provenance";
import CommunityPhotos from "./CommunityPhotos";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getPhotoCommunities().map(({ slug }) => ({ slug }));
}

// Fully static; a slug that isn't prerendered waits for its complete render, so an unknown one is a real 404
export const ensureStatic = "navigation";

const number = new Intl.NumberFormat("es-UY");

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const found = getCommunityPhotos(slug);
  if (!found) return {};
  const photos = found.groups.reduce((sum, group) => sum + group.photos.length, 0);

  return pageMetadata({
    title: `Fotos de ${found.community.name}`,
    description: `${number.format(photos)} fotos de ${found.groups.length} eventos de ${found.community.name}, de ${found.groups[0].year} a ${found.groups.at(-1)!.year}.`,
    path: `/timeline/fotos/${slug}`,
  });
}

export default async function CommunityPhotosPage({ params }: Props) {
  const { slug } = await params;
  if (!getCommunityPhotos(slug)) notFound();

  return <PhotosView slug={slug} />;
}

async function PhotosView({ slug }: { slug: string }) {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { community, groups } = getCommunityPhotos(slug)!;
  const photos = groups.reduce((sum, group) => sum + group.photos.length, 0);
  const years = [...new Set(groups.map((group) => group.year))];
  const from = years[0];
  const to = years.at(-1);

  return (
    <>
      <main>
        <Container className="pt-10 pb-8 sm:pt-16">
          <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <Link className="hover:text-zinc-200" href="/timeline">
              Historia
            </Link>
            <span aria-hidden>/</span>
            <Link className="hover:text-zinc-200" href="/timeline/fotos">
              Fotos
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-300">{community.name}</span>
          </nav>

          <header className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
            <CommunityLogo logo={community.logo ?? null} name={community.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className={headingClassName.h1}>Fotos de {community.name}</h1>
              <TitleBar className="mt-6" />
              <p className="mt-6 text-lg text-zinc-300">
                {number.format(photos)} fotos de {groups.length} {groups.length === 1 ? "evento" : "eventos"}
                <span className="text-zinc-400"> · {from === to ? from : `${from}–${to}`}</span>
              </p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <Link
                  className="inline-flex items-center gap-1 text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                  href={`/timeline?comunidad=${slug}#archivo`}
                >
                  Todos sus eventos en el archivo
                </Link>
                {community.directory ? (
                  <Link
                    className="inline-flex items-center gap-1 text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                    href={`/comunidad/${slug}`}
                  >
                    Su página en OWU <ArrowUpRight aria-hidden className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          </header>

          {years.length > 1 ? (
            <nav aria-label="Ir a un año" className="mt-10 flex flex-wrap gap-2">
              {years.map((year) => (
                <a
                  key={year}
                  className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.03] px-3 font-terminal text-[13px] text-zinc-300 tabular-nums transition-colors hover:border-yellow-400/40 hover:text-white"
                  href={`#fotos-${year}`}
                >
                  {year}
                </a>
              ))}
            </nav>
          ) : null}
        </Container>

        <Container className="pb-16">
          <CommunityPhotos community={community.name} groups={groups} />
          <Provenance
            className="mt-10"
            path={`/timeline/fotos/${community.slug}`}
            sources={[
              ...(community.meetup ? [{ label: `${community.name} en Meetup`, url: community.meetup }] : []),
              ...(community.website ? [{ label: "Su sitio", url: community.website }] : []),
            ]}
            subject={`Sacar una foto de ${community.name}`}
          >
            Las fotos son de quienes las sacaron y están publicadas en Meetup, Flickr, GitHub o el Wayback Machine: el
            visor dice de quién es cada una, lleva a la original y tiene cómo pedir que la saquemos.
          </Provenance>
        </Container>
      </main>
      <Footer />
    </>
  );
}
