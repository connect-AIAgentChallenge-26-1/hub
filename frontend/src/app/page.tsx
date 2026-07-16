import { ProductHome } from "@/features/product/components/home";
import { ProductShell } from "@/features/product/components/product-shell";

export default function HomePage() {
  return <ProductShell><ProductHome /></ProductShell>;
}
