import { RoomView } from "@/features/product/components/room";
import { PageContainer, ProductShell } from "@/features/product/components/product-shell";

export default async function RoomPage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  return <ProductShell><PageContainer><RoomView shareToken={shareToken} /></PageContainer></ProductShell>;
}
