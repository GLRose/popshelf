import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { CardButton, ReviewImageCard } from '@/components/admin/ReviewImageCard';
import { T } from '@/constants/appTheme';
import type { ReviewImage } from '@/lib/adminModeration';

interface Props {
  item: ReviewImage;
  onRevoke: (id: string) => void;
  busy: boolean;
}

/**
 * A live image, with the only way to take one down. Revoking destroys the row
 * and the bytes, and every device that cached the image drops it on its next
 * launch - so it asks first. Confirmation is inline rather than an Alert
 * because react-native-web's Alert doesn't render, and this screen is mostly
 * used on web.
 */
export function ApprovedImageCard({ item, onRevoke, busy }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <ReviewImageCard item={item}>
        <CardButton
          icon="trash-outline"
          label="Remove"
          onPress={() => setConfirming(true)}
          disabled={busy}
          danger
        />
      </ReviewImageCard>
    );
  }

  return (
    <ReviewImageCard item={item}>
      <Text style={styles.confirm}>Remove this image for everyone?</Text>
      <CardButton
        icon="arrow-undo-outline"
        label="Cancel"
        onPress={() => setConfirming(false)}
        disabled={busy}
      />
      <CardButton
        icon="trash"
        label="Remove"
        onPress={() => onRevoke(item.id)}
        disabled={busy}
        solidDanger
      />
    </ReviewImageCard>
  );
}

const styles = StyleSheet.create({
  confirm: { width: '100%', fontSize: 12, fontWeight: '700', color: T.danger, lineHeight: 17 },
});
