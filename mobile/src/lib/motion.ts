import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** True when the phone asks for reduced motion. Looping and decorative animation should stop. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/**
 * A value that runs 0 -> 1 on repeat, on the native thread. `delay` offsets the first lap,
 * so several loops with the same duration can run out of phase.
 */
export function useLoop(duration: number, delay = 0, enabled = true): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!enabled) {
      v.setValue(0);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })),
    ]);
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay, enabled]);
  return v;
}

/** 0 -> 1 once, after `delay`. For entrances. */
export function useEnter(delay = 0, duration = 380): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [v, delay, duration]);
  return v;
}
