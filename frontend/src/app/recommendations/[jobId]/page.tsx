import { RecommendationResult } from "@/features/product/components/recommendation-result";
import { PageContainer, ProductShell } from "@/features/product/components/product-shell";

export default async function ResultPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <ProductShell><PageContainer><RecommendationResult jobId={jobId} /></PageContainer></ProductShell>;
}
