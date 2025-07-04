/* eslint-disable react/no-array-index-key */
"use client";
import { motion } from "motion/react";
import { AbsoluteFill, Sequence } from "remotion";

import { alphabeticalSort } from "../../../../../utils";

import { BackgroundCircleNoise } from "../../../design/atoms/BackgroundCircleNoise";

import { Sponsor } from "./Sponsor";

type SponsorProps = {
  id: number;
  name: string;
  website: string;
  logo: {
    url: string;
    mimeType: string;
    filesize: number;
    width: number;
    height: number;
  };
};

const sponsorsList = alphabeticalSort([
  {
    id: 5,
    name: "Mimiquate",
    website: "https://www.mimiquate.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/mimiquate-1.webp",
      mimeType: "image/webp",
      filesize: 20490,
      width: 2000,
      height: 1395,
    },
  },
  {
    id: 18,
    name: "Trupropel",
    website: "https://www.trupropel.com",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/trupropel.svg",
      mimeType: "image/svg+xml",
      filesize: 6297,
      width: 154,
      height: 29,
    },
  },
  {
    id: 17,
    name: "Tryolabs",
    website: "https://tryolabs.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/tryolabs.webp",
      mimeType: "image/webp",
      filesize: 31610,
      width: 3324,
      height: 741,
    },
  },
  {
    id: 16,
    name: "ORT Uruguay",
    website: "https://www.ort.edu.uy/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/ort.webp",
      mimeType: "image/webp",
      filesize: 19200,
      width: 1052,
      height: 474,
    },
  },
  {
    id: 15,
    name: "RevenueCat",
    website: "https://www.revenuecat.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/revenue_cat-1.webp",
      mimeType: "image/webp",
      filesize: 47128,
      width: 2901,
      height: 662,
    },
  },
  {
    id: 14,
    name: "Neocoast",
    website: "https://www.neocoast.com",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/Neocoast_Logos_RGB-05.webp",
      mimeType: "image/webp",
      filesize: 17760,
      width: 1960,
      height: 255,
    },
  },
  {
    id: 11,
    name: "Pyxis",
    website: "https://pyxis.tech/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/pyxis.webp",
      mimeType: "image/webp",
      filesize: 5182,
      width: 799,
      height: 149,
    },
  },
  {
    id: 10,
    name: "Kaizen Softworks",
    website: "https://www.kzsoftworks.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/kaizen_softworks.webp",
      mimeType: "image/webp",
      filesize: 24160,
      width: 2031,
      height: 559,
    },
  },
  {
    id: 9,
    name: "Streaver",
    website: "https://www.streaver.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/streaver-1.webp",
      mimeType: "image/webp",
      filesize: 5406,
      width: 798,
      height: 175,
    },
  },
  {
    id: 8,
    name: "Cedarcode",
    website: "https://www.cedarcode.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/cedarcode-1.webp",
      mimeType: "image/webp",
      filesize: 4708,
      width: 1080,
      height: 164,
    },
  },
  {
    id: 7,
    name: "Estudio Hahn",
    website: "https://estudiohahn.com/home",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/estudiohans-1.webp",
      mimeType: "image/webp",
      filesize: 40982,
      width: 1500,
      height: 769,
    },
  },
  {
    id: 6,
    name: "Holberton Uruguay",
    website: "https://holbertonschool.uy/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/holbertonuruguay.webp",
      mimeType: "image/webp",
      filesize: 8486,
      width: 1360,
      height: 432,
    },
  },
  {
    id: 4,
    name: "WyeWorks",
    website: "https://www.wyeworks.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/wyeworks.webp",
      mimeType: "image/webp",
      filesize: 23536,
      width: 3031,
      height: 590,
    },
  },
  {
    id: 3,
    name: "Xmartlabs",
    website: "https://xmartlabs.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/xmartlabs.webp",
      mimeType: "image/webp",
      filesize: 1202,
      width: 196,
      height: 55,
    },
  },
  {
    id: 2,
    name: "Qubika",
    website: "https://qubika.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/Qubika.svg",
      mimeType: "image/svg+xml",
      filesize: 2239,
      width: 720,
      height: 198,
    },
  },
  {
    id: 500,
    name: "Mimiquate2",
    website: "https://www.mimiquate.com/",
    logo: {
      url: "https://www.owu.uy/api/admin/media/file/mimiquate-1.webp",
      mimeType: "image/webp",
      filesize: 20490,
      width: 2000,
      height: 1395,
    },
  },
]);

function chunkArray(arr: SponsorProps[], chunkSize: number): SponsorProps[][] {
  const result = [];

  for (let i = 0; i < arr.length; i += chunkSize) {
    const fractionSponsors = arr.slice(i, i + chunkSize);
    const fractionSponsors2 = fractionSponsors.map((sponsor) => ({ ...sponsor, id: sponsor.id + 2000 }));
    const fractionSponsors3 = fractionSponsors.map((sponsor) => ({ ...sponsor, id: sponsor.id + 3000 }));

    result.push([...fractionSponsors, ...fractionSponsors2, ...fractionSponsors3]);
  }

  return result;
}

export function Sponsors() {
  const slidesChunks = chunkArray(sponsorsList, Math.ceil(sponsorsList.length / 4));

  const rowWidth = 1200;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#18181b",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        fontFamily: '"Inter", sans-serif',
        padding: "90px",
      }}
    >
      <Sequence name="Noise Background">
        <BackgroundCircleNoise circleRadius={2.5} maxOffset={20} speed={0.01} />
      </Sequence>
      <div className="flex h-full w-full flex-col items-center justify-center gap-8">
        <span>
          <h1 className="font-inter mb-[60px] text-center text-[100px] font-bold tracking-[-2px] text-[#FFD700]">
            Sponsors
          </h1>
          <p className="mt-2 text-center text-[50px] font-[400] text-white">
            Nuestros aliados y patrocinadores que hacen este evento posible
          </p>
        </span>

        {slidesChunks.map((chunk, index) => (
          <div key={index} className="w-full overflow-hidden">
            <motion.div
              animate={{
                x: index % 2 === 0 ? [-rowWidth, 0] : [rowWidth, 0], // Move based on direction
              }}
              className="flex items-center gap-8"
              transition={{
                ease: "linear",
                duration: 20,
                repeat: Infinity,
                repeatType: "mirror", // Repeats animation and reverses direction
              }}
            >
              {chunk.map(({ id, name, logo }) => (
                <Sponsor key={id} image={logo.url} isEven={index % 2 === 0} name={name} />
              ))}
            </motion.div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
