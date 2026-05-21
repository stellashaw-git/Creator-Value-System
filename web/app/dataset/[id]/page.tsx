import { redirect } from "next/navigation";

export default async function DatasetIdRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/saved/${id}`);
}
