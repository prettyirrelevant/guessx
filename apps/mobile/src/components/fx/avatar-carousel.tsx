import { StyleSheet } from "react-native-unistyles";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";
import { useRef, useState } from "react";

import { colors, radius } from "@/theme";
import { haptics } from "@/lib/haptics";
import { Avatar } from "@/components/ui";

const ITEM = 60;
const GAP = 18;
const INTERVAL = ITEM + GAP;
const AVATAR = ITEM - 8;

// Plain style (lives on an animated node — can't be Unistyles).
const RING = {
  position: "absolute" as const,
  top: -5,
  left: -5,
  right: -5,
  bottom: -5,
  borderRadius: radius.lg,
  borderWidth: 2,
  borderColor: colors.accent,
};

// A snap picker: the centered avatar is the selected one, framed by a ring that
// scales with it. Scrolling ticks a selection haptic on each new center.
export function AvatarCarousel({
  seeds,
  selected,
  onSelect,
}: {
  seeds: readonly string[];
  selected: string;
  onSelect: (seed: string) => void;
}) {
  const listRef = useRef<Animated.FlatList<string>>(null);
  const scrollX = useSharedValue(0);
  const [width, setWidth] = useState(0);
  const lastIndex = useRef(Math.max(0, seeds.indexOf(selected)));

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const commit = (offsetX: number) => {
    const index = Math.max(0, Math.min(seeds.length - 1, Math.round(offsetX / INTERVAL)));
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      haptics.selection();
      onSelect(seeds[index]);
    }
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const sidePad = width > 0 ? (width - ITEM) / 2 : 0;
  const initialIndex = Math.max(0, seeds.indexOf(selected));

  return (
    <View onLayout={onLayout} style={styles.wrap}>
      {width > 0 ? (
        <Animated.FlatList
          ref={listRef}
          contentContainerStyle={{ paddingHorizontal: sidePad }}
          data={seeds as string[]}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ index, length: INTERVAL, offset: INTERVAL * index })}
          horizontal
          initialScrollIndex={initialIndex}
          keyExtractor={(seed) => seed}
          onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) =>
            commit(event.nativeEvent.contentOffset.x)
          }
          onScroll={scrollHandler}
          renderItem={({ item, index }) => (
            <CarouselItem
              index={index}
              onPress={() => {
                haptics.selection();
                listRef.current?.scrollToOffset({ offset: index * INTERVAL, animated: true });
                lastIndex.current = index;
                onSelect(item);
              }}
              scrollX={scrollX}
              seed={item}
            />
          )}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          snapToInterval={INTERVAL}
        />
      ) : null}
    </View>
  );
}

function CarouselItem({
  seed,
  index,
  scrollX,
  onPress,
}: {
  seed: string;
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
}) {
  const scaleStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value - index * INTERVAL);
    const scale = interpolate(distance, [0, INTERVAL], [1.18, 0.82], "clamp");
    const opacity = interpolate(distance, [0, INTERVAL], [1, 0.45], "clamp");
    return { transform: [{ scale }], opacity };
  });

  const ringStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value - index * INTERVAL);
    return { opacity: interpolate(distance, [0, INTERVAL * 0.5], [1, 0], "clamp") };
  });

  return (
    <Pressable onPress={onPress} style={styles.item}>
      <Animated.View style={scaleStyle}>
        <View>
          <Avatar seed={seed} size={AVATAR} style={styles.avatar} />
          <Animated.View pointerEvents="none" style={[RING, ringStyle]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    height: 92,
    justifyContent: "center",
  },
  item: {
    width: INTERVAL,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
  },
}));
