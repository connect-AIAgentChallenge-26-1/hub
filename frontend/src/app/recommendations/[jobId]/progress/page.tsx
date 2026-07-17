import { RecommendationProgress } from "@/features/product/components/recommendation-progress";
import { PageContainer, ProductShell } from "@/features/product/components/product-shell";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ sourceJobId?: string }>;
}) {
  const { jobId } = await params;
  const { sourceJobId } = await searchParams;
  const safeSourceJobId = sourceJobId && UUID_PATTERN.test(sourceJobId)
    ? sourceJobId
    : undefined;
  return <ProductShell><PageContainer narrow><RecommendationProgress jobId={jobId} sourceJobId={safeSourceJobId} /></PageContainer></ProductShell>;
}
