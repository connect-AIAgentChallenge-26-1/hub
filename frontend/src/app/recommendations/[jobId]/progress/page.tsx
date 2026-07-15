import { RecommendationProgress } from "@/features/product/components/recommendation-progress";
import { PageContainer, ProductShell } from "@/features/product/components/product-shell";

export default async function ProgressPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <ProductShell><PageContainer narrow><RecommendationProgress jobId={jobId} /></PageContainer></ProductShell>;
}
