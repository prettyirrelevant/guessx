import * as Haptics from "expo-haptics";

function run(effect: () => Promise<void>) {
  if (process.env.EXPO_OS !== "ios" && process.env.EXPO_OS !== "android") return;
  void effect().catch(() => {});
}

export const haptics = {
  selection: () => run(Haptics.selectionAsync),
  impact: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
