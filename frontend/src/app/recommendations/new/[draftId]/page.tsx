import { DraftReview } from "@/features/product/components/draft-review";
import { PageContainer, ProductShell } from "@/features/product/components/product-shell";

export default async function DraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return <ProductShell><PageContainer narrow><DraftReview draftId={draftId} /></PageContainer></ProductShell>;
}
