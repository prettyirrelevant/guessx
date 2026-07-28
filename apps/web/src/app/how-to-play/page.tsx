import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { HOW_TO_PLAY_RULES } from "@/lib/how-to-play";

import styles from "./how-to-play.module.css";

export const metadata = { title: "How to play — guessX" };

export default function HowToPlayPage() {
  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        <ChevronLeft size={16} />
        back
      </Link>
      <h1>how to play</h1>
      <div className={styles.list}>
        {HOW_TO_PLAY_RULES.map((rule) => (
          <section key={rule.title}>
            <h2>{rule.title}</h2>
            <p>{rule.description}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
