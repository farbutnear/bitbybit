import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '../../components/Mascot';
import { Button, Card } from '../../components/ui';
import { api } from '../../lib/api';
import { colors, fonts, space, type } from '../../lib/theme';
import { useUser } from '../../lib/UserContext';

/** "in 3 hours", "in 2 days": when the next card comes due. */
function fromNow(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins < 60) return 'within the hour';
  if (mins < 60 * 24) {
    const h = Math.round(mins / 60);
    return `in ${h} hour${h === 1 ? '' : 's'}`;
  }
  const d = Math.round(mins / (60 * 24));
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

/** Spaced repetition: the cards you've learned that are due to come back today. */
export default function Review() {
  const { userId, user, refresh } = useUser();
  const [nextDue, setNextDue] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
      if (userId) {
        api
          .reviewQueue(userId)
          .then((q) => setNextDue(q.next_due))
          .catch(() => {});
      }
    }, [userId, refresh]),
  );

  if (!user) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const due = user.due_count;
  const learned = user.learned_count;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={type.title}>Review</Text>

        <View style={styles.hero}>
          <Mascot mood={due > 0 ? 'idle' : 'happy'} size={150} />
          {due > 0 ? (
            <>
              <Text style={styles.count}>{due}</Text>
              <Text style={type.heading}>card{due === 1 ? '' : 's'} due today</Text>
              <Text style={[type.small, styles.sub]}>These are about to slip. A minute now saves relearning them later.</Text>
            </>
          ) : learned > 0 ? (
            <>
              <Text style={[type.title, { textAlign: 'center' }]}>All caught up</Text>
              <Text style={[type.small, styles.sub]}>
                {nextDue ? `Your next card comes back ${fromNow(nextDue)}.` : 'Nothing is waiting.'}
              </Text>
            </>
          ) : (
            <>
              <Text style={[type.title, { textAlign: 'center' }]}>Nothing to review yet</Text>
              <Text style={[type.small, styles.sub]}>Finish a lesson and its cards will start coming back here.</Text>
            </>
          )}
        </View>

        {due > 0 ? (
          <Button title="Start review" onPress={() => router.push({ pathname: '/lesson', params: { mode: 'review' } })} />
        ) : learned > 0 ? (
          <Button
            title="Practise anyway"
            variant="secondary"
            onPress={() => router.push({ pathname: '/lesson', params: { mode: 'review', practice: '1' } })}
          />
        ) : (
          <Button title="Go to lessons" onPress={() => router.navigate('/')} />
        )}

        <Card style={{ gap: space(2) }}>
          <Text style={type.heading}>How review works</Text>
          <Text style={type.small}>
            Every card you learn comes back just before you’d forget it. Get it right and the gap grows: a day, then a
            week, then months. Miss it and it returns sooner.
          </Text>
          <Text style={[type.small, { color: colors.text }]}>
            {learned} card{learned === 1 ? '' : 's'} in your memory so far.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(5), gap: space(5), paddingBottom: space(10) },
  hero: { alignItems: 'center', gap: space(1), paddingVertical: space(3) },
  count: { fontFamily: fonts.displayBold, fontSize: 72, lineHeight: 78, color: colors.gold },
  sub: { textAlign: 'center', fontSize: 16, lineHeight: 23, maxWidth: 320, marginTop: space(1) },
});
