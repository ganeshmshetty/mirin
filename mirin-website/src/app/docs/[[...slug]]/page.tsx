import { DocContent, getDocs } from "@/lib/docs";

export async function generateStaticParams() {
  return (await getDocs()).map(({ slug }) => ({ slug }));
}

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <DocContent slug={slug} />;
}
