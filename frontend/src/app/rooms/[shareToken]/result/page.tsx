import { RoomResult } from "@/features/product/components/room-result";
import { PageContainer, ProductShell } from "@/features/product/components/product-shell";

export default async function RoomResultPage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  return <ProductShell><PageContainer><RoomResult shareToken={shareToken} /></PageContainer></ProductShell>;
}
