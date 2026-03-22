"use client";

import Image from "next/image";
import { AVATAR_SEEDS, getAvatarUrl } from "@/lib/session";
import styles from "./avatar-picker.module.css";

export function AvatarPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (seed: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {AVATAR_SEEDS.map((seed) => (
          <button
            key={seed}
            className={`${styles.avatar} ${seed === selected ? styles.selected : ""}`}
            onClick={() => onSelect(seed)}
            type="button"
            aria-label={`select ${seed} avatar`}
          >
            <Image
              src={getAvatarUrl(seed)}
              alt={seed}
              width={32}
              height={32}
              unoptimized
            />
          </button>
        ))}
      </div>
    </div>
  );
}
