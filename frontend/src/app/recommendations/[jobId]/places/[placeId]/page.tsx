import { PlaceDetail } from "@/features/product/components/place-detail";
import { PageContainer, ProductShell } from "@/features/product/components/product-shell";

export default async function PlacePage({ params }: { params: Promise<{ jobId: string; placeId: string }> }) {
  const { jobId, placeId } = await params;
  return <ProductShell><PageContainer narrow><PlaceDetail jobId={jobId} placeId={placeId} /></PageContainer></ProductShell>;
}
