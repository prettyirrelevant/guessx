import Link from "next/link";
import Image from "next/image";
import { ChevronLeft } from "lucide-react";

import styles from "./credits.module.css";

export const metadata = { title: "Credits — guessX" };

export default function CreditsPage() {
  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        <ChevronLeft size={16} />
        back
      </Link>
      <h1>credits</h1>
      <div className={styles.list}>
        <section>
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            <Image src="/tmdb-logo.svg" alt="The Movie Database (TMDB)" width={489} height={35} />
          </a>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </section>
        <section>
          <h2>Simple Icons</h2>
          <p>
            Brand icons are supplied by{" "}
            <a href="https://simpleicons.org" target="_blank" rel="noreferrer">
              Simple Icons
            </a>
            . Brand names and logos remain trademarks of their respective owners. Their use does not
            imply endorsement.
          </p>
        </section>
        <section>
          <h2>DiceBear</h2>
          <p>
            Avatars use the Adventurer style by{" "}
            <a href="https://www.instagram.com/lischi_art/" target="_blank" rel="noreferrer">
              Lisa Wischofsky
            </a>
            , remixed by DiceBear and licensed under{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
            .
          </p>
        </section>
        <section>
          <h2>Deezer</h2>
          <p>
            Artist metadata and 30-second track previews are supplied by{" "}
            <a href="https://www.deezer.com" target="_blank" rel="noreferrer">
              Deezer
            </a>
            . Deezer does not endorse or certify guessX.
          </p>
        </section>
        <section>
          <h2>Flags</h2>
          <p>
            Flag images are served by{" "}
            <a href="https://flagpedia.net" target="_blank" rel="noreferrer">
              Flagpedia
            </a>
            ’s FlagCDN service. Country metadata is bundled with guessX.
          </p>
        </section>
      </div>
    </main>
  );
}
