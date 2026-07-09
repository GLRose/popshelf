import { CardButton, ReviewImageCard } from '@/components/admin/ReviewImageCard';
import type { ReviewImage } from '@/lib/adminModeration';

interface Props {
  item: ReviewImage;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  busy: boolean;
}

export function PendingImageCard({ item, onApprove, onReject, busy }: Props) {
  return (
    <ReviewImageCard item={item}>
      <CardButton
        icon="close"
        label="Reject"
        onPress={() => onReject(item.id)}
        disabled={busy}
        danger
      />
      <CardButton
        icon="checkmark"
        label="Approve"
        onPress={() => onApprove(item.id)}
        disabled={busy}
        primary
      />
    </ReviewImageCard>
  );
}
