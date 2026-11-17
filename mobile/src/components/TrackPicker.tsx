import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Track } from '../lib/api';
import { colors, fonts, radius, space } from '../lib/theme';
import { Icon, trackIcon } from './Icon';

/** Multi-select list of tracks. Tracks without lessons yet are shown but can't be picked. */
export function TrackPicker({
  tracks,
  selected,
  onToggle,
}: {
  tracks: Track[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={{ gap: space(3) }}>
      {tracks.map((t) => {
        const on = selected.includes(t.id);
        return (
          <Pressable
            key={t.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: !t.available }}
            accessibilityLabel={t.title}
            disabled={!t.available}
            onPress={() => onToggle(t.id)}
            style={({ pressed }) => [
              styles.tile,
              on && styles.tileOn,
              !t.available && styles.tileOff,
              pressed && { borderBottomWidth: 2, marginTop: 3 },
            ]}
          >
            <View style={[styles.icon, on && { backgroundColor: colors.pink }]}>
              <Icon name={trackIcon(t.icon)} size={24} color={on ? colors.pinkInk : colors.muted} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, !t.available && { color: colors.muted }]}>{t.title}</Text>
              <Text style={styles.blurb}>{t.blurb}</Text>
              {t.lessons_done > 0 ? (
                <Text style={styles.progress}>
                  {t.lessons_done} of {t.lessons_total} lessons done
                </Text>
              ) : null}
            </View>
            {t.available ? (
              <View style={[styles.check, on && { backgroundColor: colors.pink, borderColor: colors.pink }]}>
                {on ? <Icon name="check" size={16} color={colors.pinkInk} strokeWidth={3} /> : null}
              </View>
            ) : (
              <Text style={styles.soon}>Coming next</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: colors.border,
    borderBottomColor: '#2F0D24',
    borderRadius: radius.md,
    padding: space(3),
  },
  tileOn: { borderColor: colors.pink, borderBottomColor: colors.pinkDark, backgroundColor: '#4A1638' },
  tileOff: { opacity: 0.6, borderBottomWidth: 2 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.cardRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  blurb: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.muted },
  progress: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.pink, marginTop: 2 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soon: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.faint },
});
