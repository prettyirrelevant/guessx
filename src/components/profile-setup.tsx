"use client";

import { useState } from "react";
import { AvatarPicker } from "@/components/avatar-picker";
import styles from "./profile-setup.module.css";

export function ProfileSetup({
  displayName,
  avatar,
  onSave,
  onAvatarChange,
  submitLabel = "save profile",
}: {
  displayName: string;
  avatar: string;
  onSave: (name: string, avatar: string) => void;
  onAvatarChange: (seed: string) => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState(displayName);
  const [selectedAvatar, setSelectedAvatar] = useState(avatar);

  const hasName = name.trim().length > 0;
  const hasAvatar = selectedAvatar.length > 0;
  const canSave = hasName && hasAvatar;

  const handleAvatarChange = (seed: string) => {
    setSelectedAvatar(seed);
    onAvatarChange(seed);
  };

  const handleSave = () => {
    if (canSave) onSave(name.trim(), selectedAvatar);
  };

  return (
    <div className={styles.card}>
      <div className={styles.label}>set up your profile</div>
      <input
        className={styles.nameInput}
        placeholder="your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
      />
      <div className={styles.avatarSection}>
        <div className={styles.avatarLabel}>pick your avatar</div>
        <AvatarPicker selected={selectedAvatar} onSelect={handleAvatarChange} />
      </div>
      <button
        className={styles.saveBtn}
        disabled={!canSave}
        onClick={handleSave}
      >
{submitLabel}
      </button>
    </div>
  );
}
